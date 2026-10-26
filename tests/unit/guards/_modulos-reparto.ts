import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

import {
  CONSUMOS_ENTRE_MODULOS,
  type ConsumoEntreModulos,
  type Destino,
  MODULO_POR_ACTION,
  MODULO_POR_API,
  MODULO_POR_CRON,
  MODULO_POR_RUTA,
  modulosDe,
} from "@/lib/modulos/reparto";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SL-23 (design §8; R3, R15–R17, R21, R30, R33) — detectores de la guardia del reparto de módulos.
 *
 * Viven aparte del `.guardia.test.ts` para que la autocomprobación de cada caso ejerza exactamente el
 * detector que barre el árbol, no una copia. Todo es estático: lee archivos, no abre la base.
 * Las puertas se buscan en el AST (TypeScript ya es dependencia): «primera sentencia» es una
 * propiedad de la estructura, y un regex sobre el texto la confundiría con un comentario o con una
 * llamada en la segunda línea.
 */

export const RAIZ = path.resolve(__dirname, "../../..");

export type Tabla = "ruta" | "action" | "cron" | "api";

export interface PiezasDelDisco {
  ruta: string[];
  action: string[];
  cron: string[];
  api: string[];
}

export const TABLAS: Readonly<Record<Tabla, Readonly<Record<string, Destino>>>> = {
  ruta: MODULO_POR_RUTA,
  action: MODULO_POR_ACTION,
  cron: MODULO_POR_CRON,
  api: MODULO_POR_API,
};

const CARPETA_APP = "app/(app)";
const CARPETA_API = "app/api";
const CARPETA_CRON = "app/api/cron";
const CARPETA_ACTIONS = "lib/actions";

function aBarras(rel: string): string {
  return rel.split(path.sep).join("/");
}

function archivosBajo(raiz: string, carpeta: string, nombre: string): string[] {
  const absoluta = path.join(raiz, carpeta);
  if (!existsSync(absoluta)) return [];
  return readdirSync(absoluta, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name === nombre)
    .map((e) => aBarras(path.relative(absoluta, e.parentPath)))
    .sort();
}

/** `wallet/(grupo)/tiendas` → `/wallet/tiendas`. Los grupos de rutas no forman parte de la URL. */
export function rutaDeCarpeta(carpeta: string): string {
  const segmentos = carpeta.split("/").filter((s) => s !== "" && !/^\(.*\)$/.test(s));
  return "/" + segmentos.join("/");
}

/** Las piezas que existen en el disco, con la misma forma de clave que `reparto.ts`. */
export function piezasDelDisco(raiz: string = RAIZ): PiezasDelDisco {
  const ruta = archivosBajo(raiz, CARPETA_APP, "page.tsx").map(rutaDeCarpeta);
  const accionesAbs = path.join(raiz, CARPETA_ACTIONS);
  const action = existsSync(accionesAbs)
    ? readdirSync(accionesAbs, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".ts") && !/\.(test|spec|d)\.ts$/.test(e.name))
        .map((e) => e.name.replace(/\.ts$/, ""))
        .sort()
    : [];
  const rutasApi = archivosBajo(raiz, CARPETA_API, "route.ts");
  const cron = rutasApi.filter((c) => c.startsWith("cron/")).map((c) => c.slice("cron/".length));
  const api = rutasApi.filter((c) => c !== "cron" && !c.startsWith("cron/"));
  return { ruta, action, cron, api };
}

export interface PiezaAnunciada {
  tabla: Tabla;
  clave: string;
  /** La task de `tasks.md` que crea el archivo. */
  task: string;
}

/** Diferencias entre el disco y el reparto, una línea por pieza, con su tabla. */
export function diferenciasDeReparto(
  disco: PiezasDelDisco,
  tablas: Readonly<Record<Tabla, Readonly<Record<string, Destino>>>> = TABLAS,
  anunciadas: readonly PiezaAnunciada[] = [],
): { sinEntrada: string[]; sinArchivo: string[] } {
  const sinEntrada: string[] = [];
  const sinArchivo: string[] = [];
  for (const tabla of Object.keys(tablas) as Tabla[]) {
    const enDisco = new Set(disco[tabla]);
    const enTabla = tablas[tabla];
    for (const pieza of disco[tabla]) if (!Object.hasOwn(enTabla, pieza)) sinEntrada.push(`${tabla} ${pieza}`);
    for (const pieza of Object.keys(enTabla)) {
      if (enDisco.has(pieza)) continue;
      if (anunciadas.some((a) => a.tabla === tabla && a.clave === pieza)) continue;
      sinArchivo.push(`${tabla} ${pieza}`);
    }
  }
  return { sinEntrada, sinArchivo };
}

/** Las entradas con dos módulos (§3.7), como `tabla clave`. */
export function piezasCompartidas(
  tablas: Readonly<Record<Tabla, Readonly<Record<string, Destino>>>> = TABLAS,
): Record<string, readonly string[]> {
  const salida: Record<string, readonly string[]> = {};
  for (const tabla of Object.keys(tablas) as Tabla[]) {
    for (const [pieza, destino] of Object.entries(tablas[tabla])) {
      if (typeof destino !== "string") salida[`${tabla} ${pieza}`] = destino;
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// AST

function arbol(fuente: string, archivo = "x.tsx"): ts.SourceFile {
  return ts.createSourceFile(
    archivo,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function tieneModificador(nodo: ts.Node, tipo: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(nodo) && (ts.getModifiers(nodo) ?? []).some((m) => m.kind === tipo);
}

type CuerpoDeFuncion = ts.Block | undefined;

function cuerpoDe(nodo: ts.Node | undefined): CuerpoDeFuncion {
  if (!nodo) return undefined;
  if (ts.isFunctionDeclaration(nodo) || ts.isFunctionExpression(nodo) || ts.isArrowFunction(nodo)) {
    return nodo.body && ts.isBlock(nodo.body) ? nodo.body : undefined;
  }
  return undefined;
}

/**
 * Las claves de `await <puerta>("a", "b")` si `sentencia` es exactamente eso; `null` si no. Un
 * argumento que no es literal cuenta como `?`: la guardia no puede saber qué módulo exige.
 */
export function clavesDePuerta(sentencia: ts.Statement | undefined, puerta: string): string[] | null {
  if (!sentencia || !ts.isExpressionStatement(sentencia)) return null;
  const e = sentencia.expression;
  if (!ts.isAwaitExpression(e) || !ts.isCallExpression(e.expression)) return null;
  const llamada = e.expression;
  if (!ts.isIdentifier(llamada.expression) || llamada.expression.text !== puerta) return null;
  return llamada.arguments.map((a) => (ts.isStringLiteralLike(a) ? a.text : "?"));
}

function funcionPorNombre(sf: ts.SourceFile, nombre: string): ts.Node | undefined {
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name?.text === nombre) return s;
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === nombre) return d.initializer;
      }
    }
  }
  return undefined;
}

/** El componente que exporta por defecto una página: `export default function` o `export default X`. */
function componenteDePagina(sf: ts.SourceFile): ts.Node | undefined {
  for (const s of sf.statements) {
    if (
      ts.isFunctionDeclaration(s) &&
      tieneModificador(s, ts.SyntaxKind.ExportKeyword) &&
      tieneModificador(s, ts.SyntaxKind.DefaultKeyword)
    ) {
      return s;
    }
    if (ts.isExportAssignment(s) && !s.isExportEquals) {
      if (ts.isIdentifier(s.expression)) return funcionPorNombre(sf, s.expression.text);
      return s.expression;
    }
  }
  return undefined;
}

/**
 * Caso (b): las claves de `exigirModuloEnRuta` si es la PRIMERA sentencia del componente de la
 * página; `null` si no lo es o si no hay componente.
 */
export function puertaDePagina(fuente: string): string[] | null {
  const cuerpo = cuerpoDe(componenteDePagina(arbol(fuente)));
  return clavesDePuerta(cuerpo?.statements[0], "exigirModuloEnRuta");
}

/** Las funciones exportadas de un archivo de actions, con su cuerpo. */
function funcionesExportadas(sf: ts.SourceFile): { nombre: string; cuerpo: CuerpoDeFuncion }[] {
  const salida: { nombre: string; cuerpo: CuerpoDeFuncion }[] = [];
  for (const s of sf.statements) {
    if (!tieneModificador(s, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(s) && s.name) salida.push({ nombre: s.name.text, cuerpo: cuerpoDe(s) });
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          salida.push({ nombre: d.name.text, cuerpo: cuerpoDe(init) });
        }
      }
    }
  }
  return salida;
}

/** El cuerpo del callback de un `withErrorHandler(async () => { … })` que aparezca en `sentencia`. */
function cuerpoDeWithErrorHandler(sentencia: ts.Statement): CuerpoDeFuncion {
  let hallado: CuerpoDeFuncion;
  const visitar = (n: ts.Node): void => {
    if (hallado) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "withErrorHandler" &&
      n.arguments.length > 0
    ) {
      hallado = cuerpoDe(n.arguments[0]);
      return;
    }
    // No se baja a funciones anidadas: un `withErrorHandler` dentro de un callback no envuelve el cuerpo.
    if (ts.isFunctionLike(n)) return;
    ts.forEachChild(n, visitar);
  };
  ts.forEachChild(sentencia, visitar);
  return hallado;
}

/**
 * Caso (c): las funciones exportadas cuya primera sentencia no es `await exigirModuloActivo(<claves>)`
 * —directa, o la primera dentro del `withErrorHandler` que abre el cuerpo—. Cada una va con el motivo.
 */
export function funcionesSinPuerta(fuente: string, claves: readonly string[], archivo = "x.ts"): string[] {
  const esperado = JSON.stringify(claves);
  const fallos: string[] = [];
  for (const { nombre, cuerpo } of funcionesExportadas(arbol(fuente, archivo))) {
    const primera = cuerpo?.statements[0];
    let encontradas = clavesDePuerta(primera, "exigirModuloActivo");
    if (!encontradas && primera) {
      const envuelto = cuerpoDeWithErrorHandler(primera);
      encontradas = clavesDePuerta(envuelto?.statements[0], "exigirModuloActivo");
    }
    if (!encontradas) fallos.push(`${nombre}: sin exigirModuloActivo(${claves.join(", ")}) como primera sentencia`);
    else if (JSON.stringify(encontradas) !== esperado) {
      fallos.push(`${nombre}: exige (${encontradas.join(", ")}) y le toca (${claves.join(", ")})`);
    }
  }
  return fallos;
}

/**
 * Caso (d): por cada llamada a `paraCadaEmpresa`, el `modulo` de sus opciones: la clave literal,
 * `null` si no lo pasa, o `"?"` si las opciones no son un objeto literal que se pueda leer.
 */
export function modulosPasadosAParaCadaEmpresa(fuente: string): (string | null)[] {
  const salida: (string | null)[] = [];
  const visitar = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "paraCadaEmpresa") {
      const opciones = n.arguments[1];
      if (!opciones) salida.push(null);
      else if (!ts.isObjectLiteralExpression(opciones)) salida.push("?");
      else {
        const prop = opciones.properties.find(
          (p) => p.name && ts.isIdentifier(p.name) && p.name.text === "modulo",
        );
        if (!prop) salida.push(null);
        else if (ts.isPropertyAssignment(prop) && ts.isStringLiteralLike(prop.initializer)) {
          salida.push(prop.initializer.text);
        } else salida.push("?");
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(arbol(fuente, "route.ts"));
  return salida;
}

/** Qué le falta a un cron según su clase: de un módulo, o de cálculo continuo (§3.8). */
export function problemaDeCron(llamadas: readonly (string | null)[], clave: string, continuo: boolean): string | null {
  if (continuo) {
    return llamadas.some((m) => m !== null) ? "es de cálculo continuo y pasa `modulo` a paraCadaEmpresa" : null;
  }
  if (llamadas.length === 0) return `no llama a paraCadaEmpresa con { modulo: "${clave}" }`;
  const malas = llamadas.filter((m) => m !== clave);
  return malas.length ? `llama a paraCadaEmpresa sin { modulo: "${clave}" }` : null;
}

// ---------------------------------------------------------------------------------------------
// Caso (e): imports cruzados de actions, directos o a través de `components/` y `hooks/` (§3.9)

const ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
// `import type` / `export type … from` no ejecutan nada: un tipo de una action no la consume.
const SOLO_TIPOS = /\b(?:import|export)\s+type\s+[^;]*?\bfrom\s*["'][^"']+["']/g;
const ACTION = /^lib\/actions\/([a-z0-9][a-z0-9-]*)(?:\.ts)?$/;
/** Por dónde se siguen los imports desde una ruta: los componentes y hooks compartidos. */
const CARPETAS_TRANSITIVAS = ["components/", "hooks/"] as const;
const EXTENSIONES_RESOLUBLES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

/** Los especificadores de los imports de valor de un fuente (sin comentarios ni imports de tipo). */
export function especificadores(fuente: string): string[] {
  const codigo = quitarComentarios(fuente).replace(SOLO_TIPOS, "");
  return [...new Set([...codigo.matchAll(ESPECIFICADOR)].map((m) => m[1]))];
}

/** Los archivos de `lib/actions/` que importa un fuente (sin comentarios ni imports de tipo). */
export function actionsImportadas(fuente: string): string[] {
  return especificadores(fuente).flatMap((e) => {
    const m = /^@\/lib\/actions\/([a-z0-9][a-z0-9-]*)$/.exec(e);
    return m ? [m[1]] : [];
  });
}

function prefijoMasLargo(rel: string, carpetas: readonly [string, Destino][]): Destino | undefined {
  let mejor: [string, Destino] | undefined;
  for (const par of carpetas) {
    const [carpeta] = par;
    if (rel === carpeta || rel.startsWith(carpeta + "/")) {
      if (!mejor || carpeta.length > mejor[0].length) mejor = par;
    }
  }
  return mejor?.[1];
}

/** El módulo de un archivo de `app/`: el de la ruta, cron o endpoint más cercano que lo contiene. */
export function destinoDeArchivoDeApp(rel: string): Destino {
  if (rel.startsWith(CARPETA_APP + "/")) {
    const carpetas = Object.entries(MODULO_POR_RUTA).map(
      ([ruta, d]) => [ruta === "/" ? CARPETA_APP : CARPETA_APP + ruta, d] as [string, Destino],
    );
    return prefijoMasLargo(rel, carpetas) ?? "nucleo";
  }
  if (rel.startsWith(CARPETA_CRON + "/")) {
    const carpetas = Object.entries(MODULO_POR_CRON).map(([c, d]) => [`${CARPETA_CRON}/${c}`, d] as [string, Destino]);
    return prefijoMasLargo(rel, carpetas) ?? "nucleo";
  }
  if (rel.startsWith(CARPETA_API + "/")) {
    const carpetas = Object.entries(MODULO_POR_API).map(([c, d]) => [`${CARPETA_API}/${c}`, d] as [string, Destino]);
    return prefijoMasLargo(rel, carpetas) ?? "nucleo";
  }
  return "nucleo";
}

function cubre(quien: Destino, loQueExige: Destino): boolean {
  const tiene = new Set(modulosDe(quien));
  return modulosDe(loQueExige).every((m) => tiene.has(m));
}

/** Una action alcanzada y el camino de archivos que lleva a ella (sin el de partida). */
interface Alcance {
  action: string;
  camino: readonly string[];
}

/**
 * El grafo de imports de un árbol, para el caso (e). Desde un archivo de `app/` sigue los imports que
 * entran en `components/**` o `hooks/**` y recoge las actions que alcanza, con el camino. Memoriza
 * por archivo: los componentes compartidos se recorren una vez para todas las rutas.
 */
export class GrafoDeConsumos {
  private readonly memo = new Map<string, readonly Alcance[]>();

  constructor(
    private readonly raiz: string = RAIZ,
    private readonly consumos: readonly ConsumoEntreModulos[] = CONSUMOS_ENTRE_MODULOS,
  ) {}

  private resolver(desde: string, especificador: string): string | null {
    let base: string;
    if (especificador.startsWith("@/")) base = especificador.slice(2);
    else if (especificador.startsWith(".")) base = path.posix.join(path.posix.dirname(desde), especificador);
    else return null;
    if (ACTION.test(base)) return base.replace(/\.ts$/, "");
    for (const ext of EXTENSIONES_RESOLUBLES) {
      const c = base + ext;
      if (/\.tsx?$/.test(c) && existsSync(path.join(this.raiz, c))) return c;
    }
    return null;
  }

  /** Las actions que alcanza `rel`: las que importa y las de los componentes y hooks que importa. */
  private alcances(rel: string, enCurso: Set<string>): readonly Alcance[] {
    const guardado = this.memo.get(rel);
    if (guardado) return guardado;
    if (enCurso.has(rel)) return []; // ciclo: lo que alcanza ya lo cuenta quien lo abrió
    enCurso.add(rel);
    const salida: Alcance[] = [];
    for (const e of especificadores(leer(rel, this.raiz))) {
      const destino = this.resolver(rel, e);
      if (!destino) continue;
      const m = ACTION.exec(destino);
      if (m) salida.push({ action: m[1], camino: [] });
      else if (CARPETAS_TRANSITIVAS.some((c) => destino.startsWith(c))) {
        for (const a of this.alcances(destino, enCurso)) salida.push({ action: a.action, camino: [destino, ...a.camino] });
      }
    }
    enCurso.delete(rel);
    this.memo.set(rel, salida);
    return salida;
  }

  /**
   * Los cruces sin declarar desde un archivo de `app/`: una action de un módulo que su ruta no cubre,
   * alcanzada sin pasar por una pieza de `CONSUMOS_ENTRE_MODULOS` que la cubra. Una action del núcleo
   * nunca es cruce. Cada fallo nombra la cadena `archivo → componente → action`.
   */
  cruces(rel: string): string[] {
    const propio = destinoDeArchivoDeApp(rel);
    const fallos = new Set<string>();
    for (const { action, camino } of this.alcances(rel, new Set())) {
      const destino = MODULO_POR_ACTION[action];
      if (destino === undefined) continue; // sin clasificar: lo dice el caso (a)
      if (cubre(propio, destino)) continue;
      const declarada = [rel, ...camino].some((f) =>
        this.consumos.some((c) => c.pieza === f && cubre(c.modulo, destino)),
      );
      if (declarada) continue;
      fallos.add(
        [rel, ...camino, `lib/actions/${action}`].join(" → ") + ` (${modulosDe(destino).join(" + ")})`,
      );
    }
    return [...fallos];
  }
}

// ---------------------------------------------------------------------------------------------
// Caso (f)

export function llamaAItemsVisibles(fuente: string): boolean {
  return /\bitemsVisibles\s*\(/.test(quitarComentarios(fuente));
}

// ---------------------------------------------------------------------------------------------
// Árbol

const EXTENSIONES = new Set([".ts", ".tsx"]);

/** Archivos de código de `app/` (sin tests), con ruta desde la raíz. */
export function archivosDeApp(raiz: string = RAIZ): string[] {
  const absoluta = path.join(raiz, "app");
  if (!existsSync(absoluta)) return [];
  return readdirSync(absoluta, { withFileTypes: true, recursive: true })
    .filter(
      (e) =>
        e.isFile() &&
        EXTENSIONES.has(path.extname(e.name)) &&
        !/\.(test|spec)\.tsx?$/.test(e.name) &&
        !e.name.endsWith(".d.ts"),
    )
    .map((e) => aBarras(path.relative(raiz, path.join(e.parentPath, e.name))))
    .sort();
}

export function leer(rel: string, raiz: string = RAIZ): string {
  return readFileSync(path.join(raiz, rel), "utf8");
}

export function archivoDeRuta(ruta: string): string {
  return `${CARPETA_APP}${ruta === "/" ? "" : ruta}/page.tsx`;
}

export function archivoDeAction(nombre: string): string {
  return `${CARPETA_ACTIONS}/${nombre}.ts`;
}

export function archivoDeCron(nombre: string): string {
  return `${CARPETA_CRON}/${nombre}/route.ts`;
}
