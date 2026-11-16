import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» · R631 — GUARDIA: LAS CIFRAS
 * DE PRESENTACION DEL CIERRE NO ENTRAN EN UN SERVICIO QUE MUEVE DINERO.
 *
 * Desde SLT-169, «Se le paga hoy a la tienda» (`pagoTienda`) resta TODO lo facturado, flete por
 * rechazo incluido. Es solo presentacion: el libro de la tienda ya debita ese flete al aprobar
 * (`WalletTiendaFeedService`, por `derivarIngresoOrden`). Si un servicio que escribe dinero leyera
 * `pagoTienda`, `cifrasDelCierre` o `partesPorTienda`, el flete por rechazo se cobraria DOS veces.
 *
 * Por eso ningun archivo de `lib/services/` que escribe en el libro de la tienda, en la caja o en
 * las liquidaciones puede:
 *  - importar `cifras-cierre` ni `cifras-cierre-bodega` (por alias, por ruta relativa, estatico,
 *    dinamico o con `require`), ni
 *  - nombrar en su codigo (fuera de comentarios) `pagoTiendaEmpresa`, `ganaLaTienda` ni
 *    `partesPorTienda`, que son las derivaciones de presentacion de `ingreso-empresa.ts`.
 *
 * `derivarIngresoOrden`, `paraLaCentral` y demas funciones de `ingreso-empresa.ts` siguen
 * permitidas: son las que el libro usa hoy y esta ficha no las cambia.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const SERVICIOS = path.join(RAIZ, "lib", "services");

/** Servicios que escriben dinero, por nombre exacto. */
const POR_NOMBRE = new Set([
  "LiquidacionService.ts",
  "CobroTiendaService.ts",
  "RechazoTiendaCobroService.ts",
  "RechazoTiendaService.ts",
  "CierreBodegaService.ts",
]);

/** Y todos los feeds del libro (`Wallet*FeedService`) y de la caja (`Caja*FeedService`). */
const POR_PATRON = [/^Wallet\w*FeedService\.ts$/, /^Caja\w*FeedService\.ts$/];

const MODULOS_PROHIBIDOS = ["cifras-cierre", "cifras-cierre-bodega"] as const;
const NOMBRES_PROHIBIDOS = ["pagoTiendaEmpresa", "ganaLaTienda", "partesPorTienda"] as const;

function esServicioDeDinero(nombre: string): boolean {
  return POR_NOMBRE.has(nombre) || POR_PATRON.some((re) => re.test(nombre));
}

/** Quita comentarios de bloque y de linea (lo bastante fino para estos archivos, sin parser). */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Lo que un texto de codigo importa o nombra de lo prohibido. Vacio = limpio. */
function infracciones(texto: string): string[] {
  const codigo = sinComentarios(texto);
  const salida: string[] = [];
  // Especificadores de modulo: `from "…"`, `import("…")`, `require("…")`, `import "…"`.
  const especificadores = [
    ...codigo.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'`]([^"'`]+)["'`]/g),
  ].map((m) => m[1]);
  for (const esp of especificadores) {
    const ultimo = esp.split("/").pop() ?? "";
    const base = ultimo.replace(/\.(ts|tsx|js|mjs)$/, "");
    if ((MODULOS_PROHIBIDOS as readonly string[]).includes(base)) salida.push(`importa ${esp}`);
  }
  for (const nombre of NOMBRES_PROHIBIDOS) {
    if (new RegExp(`\\b${nombre}\\b`).test(codigo)) salida.push(`nombra ${nombre}`);
  }
  return salida;
}

function serviciosDeDinero(): string[] {
  return readdirSync(SERVICIOS)
    .filter(esServicioDeDinero)
    .sort();
}

// ---------------------------------------------------------------------------
// SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos» · R676-R679
// — EL RECORRIDO TRANSITIVO.
//
// Lo de arriba solo mira los especificadores del PROPIO servicio. Un servicio que importa B, que
// importa `cifras-cierre`, se le escapaba (hallazgo H3 del review de SLT-169). Aqui se sigue cada
// import de VALOR, de modulo en modulo, hasta el final. El metodo esta copiado de
// `superficie-de-uso.guardia.test.ts` (resolvedor, especificadores, aristas de simbolo, pila con
// visitados); no se importa porque es un archivo de test y ejecutaria sus `describe`.
//
// Todo recibe un LECTOR (ruta relativa a la raiz → texto, o `null` si no hay archivo), para poder
// correr igual sobre el arbol real y sobre un arbol en memoria (R679).
// ---------------------------------------------------------------------------

/** Ruta POSIX relativa a la raiz del repo → texto del archivo, o `null` si no existe. */
type Lector = (ruta: string) => string | null;

const lectorDelArbol: Lector = (ruta) => {
  const absoluta = path.join(RAIZ, ruta);
  return existsSync(absoluta) && statSync(absoluta).isFile() ? readFileSync(absoluta, "utf8") : null;
};

/** Un arbol en memoria, para la contraprueba. */
function lectorEnMemoria(arbol: Record<string, string>): Lector {
  return (ruta) => (Object.prototype.hasOwnProperty.call(arbol, ruta) ? arbol[ruta] : null);
}

const MODULOS_PROHIBIDOS_RUTA = ["lib/utils/cifras-cierre.ts", "lib/utils/cifras-cierre-bodega.ts"];
const EXTENSIONES = [".ts", ".tsx", ".js", ".jsx", ".mts"] as const;

/** Como `sinComentarios`, pero conserva los saltos de linea: los `archivo:linea` salen exactos. */
function sinComentariosAlineado(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ""))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

type Resolucion = { tipo: "modulo"; ruta: string } | { tipo: "externo" } | { tipo: "no-resuelto" };

/** `@/…` y `./…`/`../…` a un modulo del repo (extension implicita, `index`, `.js`→`.ts`). Un
 *  especificador desnudo (`@prisma/client`, `zod`) es externo y queda fuera del recorrido. */
function resolverEspecificador(leer: Lector, desde: string, especificador: string): Resolucion {
  let base: string;
  if (especificador.startsWith("@/")) base = path.posix.normalize(especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.posix.join(path.posix.dirname(desde), especificador);
  else return { tipo: "externo" };

  const candidatos: string[] = [];
  if (/\.(tsx?|jsx?|mts|json|css)$/i.test(base)) {
    candidatos.push(base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"));
  } else {
    for (const ext of EXTENSIONES) candidatos.push(base + ext);
    for (const ext of EXTENSIONES) candidatos.push(`${base}/index${ext}`);
  }
  for (const candidato of candidatos) if (leer(candidato) !== null) return { tipo: "modulo", ruta: candidato };
  return { tipo: "no-resuelto" };
}

/** Un nombre que un import trae: `origen` es el nombre en el modulo de destino; `local`, el de aqui. */
interface Pieza {
  origen: string;
  local: string;
}

/** Un import de VALOR. `piezas: null` = toma el modulo entero (`* as ns`, `export *`, `import()`,
 *  `require()`); `[]` = no trae nombres (`import "x"`). */
interface ImportDeValor {
  especificador: string;
  linea: number; // 1-based
  piezas: Pieza[] | null;
  reexporta: boolean;
}

/**
 * Los imports de VALOR de un archivo. Cuentan `import … from`, `import "x"`, `import()`,
 * `require()`, `export { … } from` y `export * from` (R676). NO cuentan el `import type` /
 * `export type` clausal ni un `{ … }` con TODOS sus nombres `type`: se borran al compilar y no
 * llevan ningun valor al servicio.
 */
function importsDeValor(texto: string): ImportDeValor[] {
  const codigo = sinComentariosAlineado(texto);
  const lineaDe = (indice: number) => codigo.slice(0, indice).split("\n").length;
  const salida: ImportDeValor[] = [];

  // La clausula solo admite identificadores, llaves, comas, `*` y espacios: no puede cruzar una
  // cadena ni una sentencia, asi que `Array.from("x")` o un `from "…"` suelto no la confunden.
  for (const m of codigo.matchAll(/\b(import|export)\s+([\w$\s{},*]*?)\s*from\s*["']([^"']+)["']/g)) {
    const clausula = m[2].trim();
    if (/^type\b/.test(clausula)) continue;
    const llaves = /\{([^}]*)\}/.exec(clausula);
    const enLlaves = llaves ? llaves[1].split(",").map((p) => p.trim()).filter(Boolean) : [];
    const deValor = enLlaves.filter((p) => !/^type\s/.test(p));
    const fuera = clausula.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim(); // default o `* as ns`
    if (fuera === "" && llaves !== null && deValor.length === 0) continue; // solo tipos
    const comodin = fuera.includes("*");
    const piezas = deValor.map((p) => {
      const [origen, local] = p.split(/\s+as\s+/).map((s) => s.trim());
      return { origen, local: local ?? origen };
    });
    if (fuera !== "" && !comodin) piezas.push({ origen: "default", local: fuera });
    salida.push({
      especificador: m[3],
      linea: lineaDe(m.index),
      piezas: comodin ? null : piezas,
      reexporta: m[1] === "export",
    });
  }
  for (const m of codigo.matchAll(/\bimport\s+["']([^"']+)["']/g))
    salida.push({ especificador: m[1], linea: lineaDe(m.index), piezas: [], reexporta: false });
  for (const m of codigo.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g))
    salida.push({ especificador: m[1], linea: lineaDe(m.index), piezas: null, reexporta: false });
  return salida;
}

interface Arista {
  destino: string;
  linea: number;
}

/** Un camino de valor de un servicio de dinero a un modulo prohibido. */
interface Camino {
  servicio: string;
  /** El primer modulo que el servicio importa en esta cadena: la clave de la excepcion (R678). */
  primerModulo: string;
  /** `servicio:linea` del import de `primerModulo`. */
  donde: string;
  cadena: string[];
}

interface Barrido {
  caminos: Camino[];
  /** `archivo:linea "especificador"` de cada `@/` o relativo sin archivo (R676). */
  noResueltos: string[];
  /** Todos los modulos que el recorrido leyo (servicios incluidos): la no-vacuidad de R679. */
  leidos: Set<string>;
}

/**
 * Desde cada servicio, un recorrido POR PRIMER MODULO: asi un camino que entra por B no queda
 * tapado porque A ya visito el mismo modulo, y cada par (servicio, primer modulo) se ve entero.
 * Pila + visitados: un ciclo A → B → A termina. Al llegar a un modulo prohibido se anota la cadena
 * y no se sigue por el.
 */
function barrer(leer: Lector, servicios: readonly string[]): Barrido {
  const cache = new Map<string, Arista[]>();
  const noResueltos = new Set<string>();
  const leidos = new Set<string>();

  const aristasDe = (ruta: string): Arista[] => {
    const enCache = cache.get(ruta);
    if (enCache) return enCache;
    leidos.add(ruta);
    const aristas: Arista[] = [];
    for (const imp of importsDeValor(leer(ruta) ?? "")) {
      const r = resolverEspecificador(leer, ruta, imp.especificador);
      if (r.tipo === "modulo") aristas.push({ destino: r.ruta, linea: imp.linea });
      else if (r.tipo === "no-resuelto") noResueltos.add(`${ruta}:${imp.linea} "${imp.especificador}"`);
    }
    cache.set(ruta, aristas);
    return aristas;
  };

  const caminos: Camino[] = [];
  for (const servicio of servicios) {
    const vistosPorPrimero = new Set<string>();
    for (const primera of aristasDe(servicio)) {
      if (vistosPorPrimero.has(primera.destino)) continue;
      vistosPorPrimero.add(primera.destino);
      const padre = new Map<string, string | null>([[primera.destino, null]]);
      const pila = [primera.destino];
      while (pila.length) {
        const actual = pila.pop() as string;
        if (MODULOS_PROHIBIDOS_RUTA.includes(actual)) {
          const cadena: string[] = [];
          for (let x: string | null = actual; x !== null; x = padre.get(x) ?? null) cadena.unshift(x);
          caminos.push({
            servicio,
            primerModulo: primera.destino,
            donde: `${servicio}:${primera.linea}`,
            cadena: [servicio, ...cadena],
          });
          continue;
        }
        for (const v of aristasDe(actual)) {
          if (padre.has(v.destino)) continue;
          padre.set(v.destino, actual);
          pila.push(v.destino);
        }
      }
    }
  }
  return { caminos, noResueltos: [...noResueltos].sort(), leidos };
}

/**
 * R677 — el nombre de ORIGEN de un simbolo, siguiendo `export { a as b } from` y `export * from`
 * hasta el modulo que lo declara. Devuelve TODOS los nombres que toma por el camino: si alguno es
 * prohibido, el simbolo lo es, se llame como se llame aqui.
 */
function nombresDeOrigen(leer: Lector, modulo: string, nombre: string, visitados = new Set<string>()): string[] {
  const clave = `${modulo}#${nombre}`;
  if (visitados.has(clave)) return [nombre];
  visitados.add(clave);
  const imports = importsDeValor(leer(modulo) ?? "").filter((i) => i.reexporta);
  for (const imp of imports) {
    const pieza = imp.piezas?.find((p) => p.local === nombre);
    if (!pieza) continue;
    const r = resolverEspecificador(leer, modulo, imp.especificador);
    if (r.tipo !== "modulo") return [nombre, pieza.origen];
    return [nombre, ...nombresDeOrigen(leer, r.ruta, pieza.origen, visitados)];
  }
  for (const imp of imports.filter((i) => i.piezas === null)) {
    const r = resolverEspecificador(leer, modulo, imp.especificador);
    if (r.tipo !== "modulo") continue;
    const debajo = nombresDeOrigen(leer, r.ruta, nombre, visitados);
    if (debajo.some((n) => (NOMBRES_PROHIBIDOS as readonly string[]).includes(n))) return [nombre, ...debajo];
  }
  return [nombre];
}

/** R677 — los simbolos que un servicio importa cuyo nombre de origen esta prohibido. */
function simbolosProhibidos(leer: Lector, servicio: string): string[] {
  const salida: string[] = [];
  for (const imp of importsDeValor(leer(servicio) ?? "")) {
    const r = resolverEspecificador(leer, servicio, imp.especificador);
    if (r.tipo !== "modulo" || imp.piezas === null) continue;
    for (const pieza of imp.piezas) {
      const nombres = [pieza.local, ...nombresDeOrigen(leer, r.ruta, pieza.origen)];
      const prohibido = nombres.find((n) => (NOMBRES_PROHIBIDOS as readonly string[]).includes(n));
      if (prohibido) {
        salida.push(`${servicio}:${imp.linea} obtiene «${pieza.local}», cuyo origen es «${prohibido}» (${nombres.join(" ← ")})`);
      }
    }
  }
  return salida;
}

/**
 * R678 — LAS UNICAS EXCEPCIONES. Cada una es un par (servicio de dinero, primer modulo que
 * importa), con su `archivo:linea` y su porque. ESTA LISTA SOLO PUEDE ENCOGER: el tope de abajo
 * es el numero de hoy, y la vacia SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de
 * presentacion del cierre». Una entrada sin camino es una entrada muerta y da rojo.
 */
interface Excepcion {
  servicio: string;
  primerModulo: string;
  donde: string;
  porque: string;
}

const EXCEPCIONES: readonly Excepcion[] = [
  {
    servicio: "lib/services/CierreBodegaService.ts",
    primerModulo: "lib/services/cifras-bodega-descarga.ts",
    donde:
      "CierreBodegaService.ts:33 importa cifrasBodegaDescarga (lo llama en :556) → " +
      "cifras-bodega-descarga.ts:13 → cifras-cierre-bodega.ts (llamada en :90)",
    porque:
      "Lectura para el listado y la descarga de cierres de bodega, no el asiento de dinero. " +
      "Decision D2 de SLT-175 (Carlos, 2026-11-16); la quita SLT-176.",
  },
  {
    servicio: "lib/services/CierreBodegaService.ts",
    primerModulo: "lib/services/CierresAdminService.ts",
    donde:
      "CierreBodegaService.ts:40 importa anularEmpresaSiNoCentral → CierresAdminService.ts:87 " +
      "importa cifrasDelCierre (el modulo; anularEmpresaSiNoCentral, :188, no lo llama)",
    porque:
      "Camino de MODULO, no de simbolo: lo que se usa no toca las cifras. Decision D2 de " +
      "SLT-175 (Carlos, 2026-11-16); la quita SLT-176.",
  },
];

/** Tope de `EXCEPCIONES`. Solo puede BAJAR (R678, D2). */
const TOPE_EXCEPCIONES = 2;

/** El veredicto entero de R676-R678 sobre un arbol. Vacio = verde. */
function veredicto(
  leer: Lector,
  servicios: readonly string[],
  excepciones: readonly Excepcion[],
): { errores: string[]; barrido: Barrido } {
  const barrido = barrer(leer, servicios);
  const errores: string[] = barrido.noResueltos.map((n) => `especificador sin archivo: ${n}`);
  const esExcepcion = (c: { servicio: string; primerModulo: string }) =>
    excepciones.some((e) => e.servicio === c.servicio && e.primerModulo === c.primerModulo);
  for (const c of barrido.caminos) {
    if (!esExcepcion(c)) errores.push(`camino a modulo prohibido (${c.donde}): ${c.cadena.join(" → ")}`);
  }
  for (const e of excepciones) {
    const vivo = barrido.caminos.some((c) => c.servicio === e.servicio && c.primerModulo === e.primerModulo);
    if (!vivo) errores.push(`excepcion muerta: (${e.servicio}, ${e.primerModulo}) ya no lleva a ningun modulo prohibido`);
  }
  for (const s of servicios) errores.push(...simbolosProhibidos(leer, s));
  return { errores, barrido };
}

describe("SLT-169 R631 — las cifras de presentacion del cierre no entran donde se mueve dinero", () => {
  it("el barrido encuentra los servicios que escriben dinero (no pasa en verde por lista vacia)", () => {
    const archivos = serviciosDeDinero();
    // Los que el spec nombra tienen que existir: si uno se renombra, la guardia lo dice.
    for (const nombre of [
      "WalletTiendaFeedService.ts",
      "WalletFeedService.ts",
      "LiquidacionService.ts",
      "CobroTiendaService.ts",
      "RechazoTiendaCobroService.ts",
      "RechazoTiendaService.ts",
      "CierreBodegaService.ts",
      "CajaPagoTiendaFeedService.ts",
    ]) {
      expect(existsSync(path.join(SERVICIOS, nombre)), nombre).toBe(true);
      expect(archivos).toContain(nombre);
    }
    expect(archivos.filter((a) => a.startsWith("Caja")).length).toBeGreaterThan(3);
  });

  it("ningun servicio que escribe dinero importa cifras-cierre ni nombra pagoTienda*/ganaLaTienda/partesPorTienda", () => {
    const culpables = serviciosDeDinero().flatMap((nombre) =>
      infracciones(readFileSync(path.join(SERVICIOS, nombre), "utf8")).map((i) => `${nombre}: ${i}`),
    );
    expect(culpables).toEqual([]);
  });

  describe("la guardia ve lo que vigila (si no, el verde no prueba nada)", () => {
    it("detecta el import por alias de cifras-cierre (mutacion M6)", () => {
      const texto = 'import { cifrasDelCierre } from "@/lib/utils/cifras-cierre";\n';
      expect(infracciones(texto)).toEqual(["importa @/lib/utils/cifras-cierre"]);
    });

    it("detecta la ruta relativa, el import dinamico y el require de cifras-cierre-bodega", () => {
      expect(infracciones('import { x } from "../utils/cifras-cierre-bodega";')).toHaveLength(1);
      expect(infracciones('const m = await import("@/lib/utils/cifras-cierre-bodega");')).toHaveLength(1);
      expect(infracciones('const m = require("../utils/cifras-cierre.ts");')).toHaveLength(1);
    });

    it("detecta los nombres de presentacion importados de ingreso-empresa", () => {
      const texto = `import {
  derivarIngresoOrden,
  ganaLaTienda,
} from "@/lib/utils/ingreso-empresa";
`;
      expect(infracciones(texto)).toEqual(["nombra ganaLaTienda"]);
      expect(infracciones("const p = pagoTiendaEmpresa(a, b, c);")).toEqual(["nombra pagoTiendaEmpresa"]);
      expect(infracciones("const p = partesPorTienda(gs);")).toEqual(["nombra partesPorTienda"]);
    });

    it("no confunde un comentario ni las funciones permitidas con una infraccion", () => {
      const texto = `// Esto NO lee ganaLaTienda ni cifras-cierre.
/* pagoTiendaEmpresa aparece solo aqui */
import { derivarIngresoOrden, paraLaCentral } from "@/lib/utils/ingreso-empresa";
`;
      expect(infracciones(texto)).toEqual([]);
    });
  });
});

describe("SLT-175 R676-R679 — R631 tambien por imports indirectos", () => {
  const serviciosReales = () => serviciosDeDinero().map((n) => `lib/services/${n}`);

  describe("sobre el arbol real", () => {
    it("ningun camino de valor llega a cifras-cierre fuera de las excepciones, sin excepciones muertas ni especificadores perdidos (R676-R678)", () => {
      expect(veredicto(lectorDelArbol, serviciosReales(), EXCEPCIONES).errores).toEqual([]);
    });

    it("el barrido no es vacuo: sigue aristas y llega a ingreso-empresa (R679)", () => {
      const servicios = serviciosReales();
      const { barrido } = veredicto(lectorDelArbol, servicios, EXCEPCIONES);
      expect(barrido.leidos.size).toBeGreaterThan(servicios.length);
      // `WalletTiendaFeedService.ts:9` importa `derivarIngresoOrden` de aqui.
      expect(barrido.leidos.has("lib/utils/ingreso-empresa.ts")).toBe(true);
      // Las dos excepciones de hoy tienen su camino, y es este:
      expect(barrido.caminos.map((c) => `${c.donde} ${c.cadena.join(" → ")}`).sort()).toEqual([
        "lib/services/CierreBodegaService.ts:33 lib/services/CierreBodegaService.ts → lib/services/cifras-bodega-descarga.ts → lib/utils/cifras-cierre-bodega.ts",
        "lib/services/CierreBodegaService.ts:40 lib/services/CierreBodegaService.ts → lib/services/CierresAdminService.ts → lib/utils/cifras-cierre.ts",
      ]);
    });

    it("la lista de excepciones solo encoge (R678, D2): tope 2, la vacia SLT-176", () => {
      expect(EXCEPCIONES.length).toBeLessThanOrEqual(TOPE_EXCEPCIONES);
      expect(TOPE_EXCEPCIONES).toBeLessThanOrEqual(2);
      for (const e of EXCEPCIONES) {
        expect(e.donde, e.primerModulo).toMatch(/\.ts:\d+/);
        expect(e.porque, e.primerModulo).toMatch(/SLT-176/);
      }
    });

    it("quitar una excepcion da rojo nombrando su cadena (R678)", () => {
      const { errores } = veredicto(lectorDelArbol, serviciosReales(), EXCEPCIONES.slice(1));
      expect(errores).toEqual([
        "camino a modulo prohibido (lib/services/CierreBodegaService.ts:33): lib/services/CierreBodegaService.ts → lib/services/cifras-bodega-descarga.ts → lib/utils/cifras-cierre-bodega.ts",
      ]);
    });
  });

  describe("contraprueba en memoria (R679)", () => {
    const A = "lib/services/A.ts";
    const CIFRAS = "export function cifrasDelCierre() { return 1; }\nexport type CifrasCierre = { a: 1 };\n";
    const INGRESO =
      "export function partesPorTienda() { return []; }\nexport function derivarIngresoOrden() { return 0; }\n";
    const arbol = (extra: Record<string, string>) =>
      lectorEnMemoria({
        "lib/utils/cifras-cierre.ts": CIFRAS,
        "lib/utils/cifras-cierre-bodega.ts": 'import { cifrasDelCierre } from "./cifras-cierre";\n',
        "lib/utils/ingreso-empresa.ts": INGRESO,
        ...extra,
      });
    const errores = (extra: Record<string, string>, excepciones: readonly Excepcion[] = []) =>
      veredicto(arbol(extra), [A], excepciones).errores;

    it("(a) A → B → cifras-cierre, todo estatico, da rojo con la cadena entera", () => {
      expect(
        errores({
          [A]: 'import { b } from "./B";\n',
          "lib/services/B.ts":
            'import { cifrasDelCierre } from "@/lib/utils/cifras-cierre";\nexport const b = cifrasDelCierre;\n',
        }),
      ).toEqual([
        "camino a modulo prohibido (lib/services/A.ts:1): lib/services/A.ts → lib/services/B.ts → lib/utils/cifras-cierre.ts",
      ]);
      // Tambien por `import()`, `require()` e `import "x"` en el eslabon intermedio.
      for (const intermedio of [
        'export const f = () => import("../utils/cifras-cierre-bodega");\n',
        'const m = require("@/lib/utils/cifras-cierre");\n',
        'import "@/lib/utils/cifras-cierre";\n',
      ]) {
        expect(
          errores({ [A]: 'import { f } from "./B";\n', "lib/services/B.ts": intermedio }),
          intermedio,
        ).toHaveLength(1);
      }
    });

    it("(b) un B que re-exporta cifras-cierre (export * o export { } from relativo) da rojo", () => {
      for (const b of [
        'export * from "@/lib/utils/cifras-cierre";\n',
        'export { cifrasDelCierre } from "../utils/cifras-cierre";\n',
      ]) {
        expect(
          errores({ [A]: 'import { cifrasDelCierre as c } from "./B";\n', "lib/services/B.ts": b }),
          b,
        ).toEqual([
          "camino a modulo prohibido (lib/services/A.ts:1): lib/services/A.ts → lib/services/B.ts → lib/utils/cifras-cierre.ts",
        ]);
      }
    });

    it("(c) un re-export renombrado de partesPorTienda da rojo aunque A lo llame de otro modo (R677)", () => {
      const a = 'import { reparto } from "./B";\nexport const x = reparto;\n';
      // La guardia directa de SLT-169 no lo ve: A no nombra `partesPorTienda`.
      expect(infracciones(a)).toEqual([]);
      expect(
        errores({
          [A]: a,
          "lib/services/B.ts": 'export { partesPorTienda as reparto } from "@/lib/utils/ingreso-empresa";\n',
        }),
      ).toEqual([
        "lib/services/A.ts:1 obtiene «reparto», cuyo origen es «partesPorTienda» (reparto ← reparto ← partesPorTienda)",
      ]);
      // Y a traves de un `export *` intermedio.
      expect(
        errores({
          [A]: a,
          "lib/services/B.ts": 'export * from "./C";\n',
          "lib/services/C.ts": 'export { partesPorTienda as reparto } from "@/lib/utils/ingreso-empresa";\n',
        }),
      ).toHaveLength(1);
      // Control: lo permitido de ingreso-empresa no da rojo, aunque se renombre.
      expect(
        errores({ [A]: 'import { derivarIngresoOrden as d } from "@/lib/utils/ingreso-empresa";\n' }),
      ).toEqual([]);
    });

    it("(d) un import de TIPO de cifras-cierre en la cadena no da rojo", () => {
      for (const b of [
        'import type { CifrasCierre } from "@/lib/utils/cifras-cierre";\n',
        'import { type CifrasCierre } from "@/lib/utils/cifras-cierre";\n',
        'export type { CifrasCierre } from "@/lib/utils/cifras-cierre";\n',
        '// import { cifrasDelCierre } from "@/lib/utils/cifras-cierre";\n',
      ]) {
        expect(errores({ [A]: 'import { b } from "./B";\n', "lib/services/B.ts": b }), b).toEqual([]);
      }
    });

    it("(e) un ciclo A → B → A termina (y sigue viendo lo que cuelga del ciclo)", () => {
      expect(
        errores({ [A]: 'import { b } from "./B";\n', "lib/services/B.ts": 'import { a } from "./A";\n' }),
      ).toEqual([]);
      expect(
        errores({
          [A]: 'import { b } from "./B";\n',
          "lib/services/B.ts": 'import { a } from "./A";\nimport { c } from "./C";\n',
          "lib/services/C.ts":
            'import { b } from "./B";\nimport { cifrasDelCierre } from "@/lib/utils/cifras-cierre";\n',
        }),
      ).toEqual([
        "camino a modulo prohibido (lib/services/A.ts:1): lib/services/A.ts → lib/services/B.ts → lib/services/C.ts → lib/utils/cifras-cierre.ts",
      ]);
    });

    it("(f) un especificador @/ o relativo sin archivo da rojo nombrandolo", () => {
      expect(
        errores({
          [A]: 'import { b } from "./B";\n',
          "lib/services/B.ts": '\nimport { z } from "@/lib/utils/no-existe";\n',
        }),
      ).toEqual(['especificador sin archivo: lib/services/B.ts:2 "@/lib/utils/no-existe"']);
      expect(errores({ [A]: 'import { z } from "./no-existe";\n' })).toEqual([
        'especificador sin archivo: lib/services/A.ts:1 "./no-existe"',
      ]);
      // Un paquete externo no es un especificador perdido.
      expect(errores({ [A]: 'import { z } from "zod";\n' })).toEqual([]);
    });

    it("(g) una excepcion sin camino da rojo (entrada muerta); con camino, la cadena se acepta", () => {
      const ex: Excepcion = { servicio: A, primerModulo: "lib/services/B.ts", donde: "A.ts:1", porque: "prueba" };
      expect(errores({ [A]: 'import { z } from "zod";\n' }, [ex])).toEqual([
        "excepcion muerta: (lib/services/A.ts, lib/services/B.ts) ya no lleva a ningun modulo prohibido",
      ]);
      const conCamino = {
        [A]: 'import { b } from "./B";\n',
        "lib/services/B.ts": 'import { cifrasDelCierre } from "@/lib/utils/cifras-cierre";\n',
      };
      expect(errores(conCamino, [ex])).toEqual([]);
      // La excepcion es por PAR: un camino nuevo por otro primer modulo sigue dando rojo.
      expect(
        errores(
          {
            ...conCamino,
            [A]: 'import { b } from "./B";\nimport { d } from "./D";\n',
            "lib/services/D.ts": 'export * from "@/lib/utils/cifras-cierre-bodega";\n',
          },
          [ex],
        ),
      ).toEqual([
        "camino a modulo prohibido (lib/services/A.ts:2): lib/services/A.ts → lib/services/D.ts → lib/utils/cifras-cierre-bodega.ts",
      ]);
    });
  });
});
