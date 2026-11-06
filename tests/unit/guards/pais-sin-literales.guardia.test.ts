// GUARDIA — SLT-42 · R29: EL SERVIDOR NO ESCRIBE EL PAIS A MANO.
//
// Tras SLT-42 la zona horaria, el prefijo telefonico y los digitos salen del pais de la empresa
// (`IReglasPaisEmpresa`, `calendario-zona.ts`). Volver a escribir `America/Costa_Rica`, un desfase
// fijo de Costa Rica o el `506` en el servidor compila, pasa el lint y da el resultado correcto
// para CR: el fallo solo se ve con una empresa de otro pais. Por eso es un censo del arbol.
//
// Que mira (design §8): `lib/**`, `app/api/**` y las paginas y layouts de servidor de `app/`, sin
// comentarios (`quitarComentarios`: los comentarios nombran los literales a proposito).
// Que busca:
//   - la zona `America/Costa_Rica`;
//   - un desfase fijo de CR: `CR_OFFSET*`, `OFFSET_CR*`, `6 * 60 * 60 * 1000` en una linea que
//     nombra `CR`, o `T06:00:00`;
//   - el prefijo `506` como literal: `"506"`, `'506'`, `+506`, `506${`;
//   - un import de los envoltorios `@/lib/utils/(fecha-cr|hora-cr|separador-dia-cr|telefono-cr|whatsapp-telefono)`.
// Las excepciones (la UI que pasa a SLT-81, los planes que pasan a SLT-86 y SINPE, de SL-22) viven en
// `_pais-sin-literales-excepciones.ts`, con su ficha y su motivo, y la lista solo baja.
//
// Segunda guardia del archivo (decision del humano tras T5.3): `reglasPais` es OPCIONAL en los
// constructores de servicio para no romper sus tests, asi que olvidarlo en un composition root no
// rompe el typecheck: el servicio falla en uso (`zonaDeLaEmpresa`). Aqui se exige que cada
// construccion de produccion de esos servicios pase el argumento y que su archivo construya el
// real con `construirReglasPaisEmpresa`.
//
// La selecciona `pnpm test:guardias` por el nombre del archivo.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { EXCEPCIONES_PAIS_SIN_LITERALES, TOPE_EXCEPCIONES } from "./_pais-sin-literales-excepciones";

const RAIZ = path.resolve(__dirname, "../../..");

function recorrer(relativo: string, acepta: (rel: string) => boolean, salida: string[] = []): string[] {
  for (const entrada of readdirSync(path.join(RAIZ, relativo), { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const hijo = `${relativo}/${entrada.name}`;
    if (entrada.isDirectory()) recorrer(hijo, acepta, salida);
    else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith(".d.ts") && acepta(hijo)) salida.push(hijo);
  }
  return salida;
}

/** Los archivos de servidor de R29: `lib/**`, `app/api/**` y `page`/`layout` de `app/`. */
function archivosDeServidor(): string[] {
  const lib = recorrer("lib", () => true);
  const app = recorrer("app", (rel) => rel.startsWith("app/api/") || /\/(page|layout)\.tsx?$/.test(rel));
  return [...lib, ...app].sort();
}

const leer = (rel: string): string => readFileSync(path.join(RAIZ, rel), "utf8");

const ENVOLTORIOS_CR = /["']@\/lib\/utils\/(fecha-cr|hora-cr|separador-dia-cr|telefono-cr|whatsapp-telefono)["']/;

/** Los literales del pais que encuentra en `fuente` (con comentarios: se quitan aqui). Vacio = limpio. */
export function literalesDelPais(fuente: string): string[] {
  const hallados = new Set<string>();
  for (const linea of quitarComentarios(fuente).split("\n")) {
    if (linea.includes("America/Costa_Rica")) hallados.add("zona America/Costa_Rica");
    if (/\b(CR_OFFSET|OFFSET_CR)\w*/.test(linea)) hallados.add("desfase fijo CR_OFFSET/OFFSET_CR");
    if (/\b6\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b/.test(linea) && /CR/.test(linea)) hallados.add("desfase fijo de 6 h junto a CR");
    if (linea.includes("T06:00:00")) hallados.add("desfase fijo T06:00:00");
    if (/(["'])506\1|\+506|506\$\{/.test(linea)) hallados.add("prefijo 506");
    if (ENVOLTORIOS_CR.test(linea)) hallados.add("import de un envoltorio *-cr");
  }
  return [...hallados].sort();
}

describe("SLT-42 · R29 — el servidor no escribe el pais a mano", () => {
  const archivos = archivosDeServidor();
  const conLiterales = new Map(
    archivos.map((rel) => [rel, literalesDelPais(leer(rel))] as const).filter(([, l]) => l.length > 0),
  );
  const enLista = new Set(EXCEPCIONES_PAIS_SIN_LITERALES.map((e) => e.archivo));

  it("control positivo: el censo mira cientos de archivos, paginas incluidas, y encuentra las excepciones", () => {
    expect(archivos.length).toBeGreaterThan(500);
    expect(archivos.some((rel) => rel.startsWith("app/api/"))).toBe(true);
    expect(archivos.some((rel) => rel.endsWith("/page.tsx"))).toBe(true);
    expect(conLiterales.size).toBeGreaterThan(0);
  });

  it("ningun archivo de servidor fuera de la lista tiene un literal del pais", () => {
    const fuera = [...conLiterales]
      .filter(([rel]) => !enLista.has(rel))
      .map(([rel, l]) => `${rel}: ${l.join(", ")}`);
    expect(
      fuera,
      "Lee la zona o el prefijo del pais de la empresa (IReglasPaisEmpresa, calendario-zona.ts); no escribas el de CR",
    ).toEqual([]);
  });

  it("la lista solo baja: una excepcion que ya no tiene literales se quita", () => {
    const sobran = [...enLista].filter((rel) => !conLiterales.has(rel));
    expect(sobran, "Ya no hace falta: quitala de EXCEPCIONES_PAIS_SIN_LITERALES y baja el tope").toEqual([]);
  });

  it("la lista no crece respecto de su tope", () => {
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.length).toBeLessThanOrEqual(TOPE_EXCEPCIONES);
  });

  it("cada excepcion trae ficha SLT-81, SLT-86 o SL-22, motivo, un archivo que existe y no se repite; la lista esta ordenada", () => {
    const rutas = EXCEPCIONES_PAIS_SIN_LITERALES.map((e) => e.archivo);
    for (const e of EXCEPCIONES_PAIS_SIN_LITERALES) {
      expect(["SLT-81", "SLT-86", "SL-22"], e.archivo).toContain(e.ficha);
      expect(e.motivo.trim().length, e.archivo).toBeGreaterThan(10);
      expect(archivos, e.archivo).toContain(e.archivo);
    }
    expect(new Set(rutas).size).toBe(rutas.length);
    expect(rutas).toEqual([...rutas].sort());
  });

  describe("autocomprobacion con fuentes inventadas", () => {
    it.each([
      ["la zona", 'const z = "America/Costa_Rica";', "zona America/Costa_Rica"],
      ["CR_OFFSET_MS", "const d = CR_OFFSET_MS;", "desfase fijo CR_OFFSET/OFFSET_CR"],
      ["OFFSET_CR_HORAS", "const h = OFFSET_CR_HORAS;", "desfase fijo CR_OFFSET/OFFSET_CR"],
      ["6 h junto a CR", "const DESFASE_CR = 6 * 60 * 60 * 1000;", "desfase fijo de 6 h junto a CR"],
      ["T06:00:00", "const d = new Date(`${f}T06:00:00.000Z`);", "desfase fijo T06:00:00"],
      ["\"506\"", 'const p = "506";', "prefijo 506"],
      ["'506'", "const p = '506';", "prefijo 506"],
      ["+506", 'const t = "+50688887777";', "prefijo 506"],
      ["506${", "const t = `506${n}`;", "prefijo 506"],
      ["import de fecha-cr", 'import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";', "import de un envoltorio *-cr"],
      ["import de whatsapp-telefono", "import { x } from '@/lib/utils/whatsapp-telefono';", "import de un envoltorio *-cr"],
    ])("%s → falla", (_caso, fuente, esperado) => {
      expect(literalesDelPais(fuente)).toContain(esperado);
    });

    it.each([
      ["en un comentario de linea", "// la zona era America/Costa_Rica y el prefijo +506"],
      ["en un comentario de bloque", "/* `...T06:00:00.000Z` = 00:00 CR; CR_OFFSET_MS */ const a = 1;"],
      ["un numero que contiene 506", "const n = 15060; const m = 1506;"],
      ["6 h sin CR", "const SEIS_HORAS = 6 * 60 * 60 * 1000;"],
      ["el modulo generico", 'import { fechaCalendario } from "@/lib/utils/calendario-zona";'],
      ["fecha-cr-algo no es el envoltorio", 'import { x } from "@/lib/utils/fecha-cr-sql";'],
    ])("%s → no falla", (_caso, fuente) => {
      expect(literalesDelPais(fuente)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Composition roots: `reglasPais` opcional en el constructor, obligatorio en la construccion.
// ---------------------------------------------------------------------------------------------

/** Un servicio (o fabrica) que recibe `reglasPais` OPCIONAL en la posicion `indice`. */
interface ReceptorDeReglas {
  nombre: string;
  archivo: string;
  indice: number;
  tipo: "clase" | "funcion";
}

/**
 * Funciones con `reglasPais` opcional que NO necesitan el argumento: si no llega, delegan en una
 * que construye el real. Ruta, nombre y motivo; la guardia comprueba que siguen existiendo.
 */
const DELEGAN_EN_EL_REAL: readonly { archivo: string; nombre: string; motivo: string }[] = [
  {
    archivo: "lib/actions/_shared/zona-del-borde.ts",
    nombre: "zonaDelBordeConActor",
    motivo: "con actor llama a `zonaDelBorde`, que sin `reglasPais` construye el real",
  },
];

function parsear(rel: string, fuente = leer(rel)): ts.SourceFile {
  return ts.createSourceFile(rel, fuente, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function indiceDeReglasOpcional(parametros: ts.NodeArray<ts.ParameterDeclaration>): number {
  return parametros.findIndex(
    (p) => ts.isIdentifier(p.name) && p.name.text === "reglasPais" && (p.questionToken !== undefined || p.initializer !== undefined),
  );
}

function llamaAlReal(nodo: ts.Node): boolean {
  let encontrado = false;
  const visitar = (n: ts.Node): void => {
    if (encontrado) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "construirReglasPaisEmpresa") {
      encontrado = true;
      return;
    }
    ts.forEachChild(n, visitar);
  };
  visitar(nodo);
  return encontrado;
}

/** Clases con `reglasPais?` en el constructor y funciones exportadas con `reglasPais?` posicional sin el real por defecto. */
export function receptoresDeReglas(rel: string, sf: ts.SourceFile): ReceptorDeReglas[] {
  const out: ReceptorDeReglas[] = [];
  for (const sentencia of sf.statements) {
    if (ts.isClassDeclaration(sentencia) && sentencia.name) {
      const ctor = sentencia.members.find(ts.isConstructorDeclaration);
      const indice = ctor ? indiceDeReglasOpcional(ctor.parameters) : -1;
      if (indice >= 0) out.push({ nombre: sentencia.name.text, archivo: rel, indice, tipo: "clase" });
    }
    const exportada = ts.canHaveModifiers(sentencia) && ts.getModifiers(sentencia)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exportada && ts.isFunctionDeclaration(sentencia) && sentencia.name && sentencia.body) {
      const indice = indiceDeReglasOpcional(sentencia.parameters);
      if (indice >= 0 && !llamaAlReal(sentencia.body)) {
        out.push({ nombre: sentencia.name.text, archivo: rel, indice, tipo: "funcion" });
      }
    }
  }
  return out;
}

/** Construcciones de un receptor en `sf` que no pasan las reglas del pais. Vacio = bien. */
export function construccionesSinReglas(sf: ts.SourceFile, receptores: readonly ReceptorDeReglas[]): string[] {
  const porNombre = new Map(receptores.map((r) => [r.nombre, r] as const));
  const archivoConReal = llamaAlReal(sf);
  const problemas: string[] = [];
  const visitar = (n: ts.Node): void => {
    let receptor: ReceptorDeReglas | undefined;
    let args: ts.NodeArray<ts.Expression> | undefined;
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
      const r = porNombre.get(n.expression.text);
      if (r?.tipo === "clase") [receptor, args] = [r, n.arguments];
    } else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const r = porNombre.get(n.expression.text);
      if (r?.tipo === "funcion") [receptor, args] = [r, n.arguments];
    }
    if (receptor) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      const donde = `${sf.fileName}:${line + 1} ${receptor.nombre}`;
      const arg = args?.[receptor.indice];
      if (arg === undefined) problemas.push(`${donde}: no pasa \`reglasPais\` (argumento ${receptor.indice + 1})`);
      else if (ts.isIdentifier(arg) && arg.text === "undefined") problemas.push(`${donde}: pasa \`undefined\` como \`reglasPais\``);
      else if (!archivoConReal) problemas.push(`${donde}: su archivo no construye el real con \`construirReglasPaisEmpresa\``);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return problemas;
}

describe("SLT-42 · composition roots: cada servicio con `reglasPais?` recibe `construirReglasPaisEmpresa`", () => {
  const produccion = [...recorrer("lib", () => true), ...recorrer("app", () => true), ...recorrer("scripts", () => true)];
  const fuentes = new Map(produccion.map((rel) => [rel, leer(rel)] as const));
  const conReglas = [...fuentes].filter(([, f]) => f.includes("reglasPais"));
  const exentas = new Set(DELEGAN_EN_EL_REAL.map((d) => d.nombre));
  const receptores = conReglas
    .filter(([rel]) => rel.startsWith("lib/"))
    .flatMap(([rel, f]) => receptoresDeReglas(rel, parsear(rel, f)))
    .filter((r) => !exentas.has(r.nombre));
  const nombres = receptores.map((r) => r.nombre);

  it("control positivo: encuentra los servicios con `reglasPais?` y las fabricas de los handlers diarios", () => {
    expect(receptores.filter((r) => r.tipo === "clase").length).toBeGreaterThan(40);
    expect(nombres).toEqual(expect.arrayContaining(["OrdenService", "WalletService", "UsuarioService", "RastreoPublicoService"]));
    expect(nombres).toEqual(expect.arrayContaining(["crearLiberarReprogramadasHandler", "crearAnaliticaRollupDiarioHandler"]));
  });

  it("los nombres no se repiten (la guardia empareja construcciones por nombre)", () => {
    expect(nombres.filter((n, i) => nombres.indexOf(n) !== i)).toEqual([]);
  });

  it("cada construccion de produccion pasa las reglas y su archivo construye el real", () => {
    const candidatos = [...fuentes].filter(([, f]) => nombres.some((n) => f.includes(n)));
    const problemas = candidatos.flatMap(([rel, f]) => construccionesSinReglas(parsear(rel, f), receptores));
    expect(problemas, "Pasa `construirReglasPaisEmpresa(prisma)` en el composition root").toEqual([]);
  });

  it("las funciones que delegan en el real siguen existiendo y siguen delegando", () => {
    for (const d of DELEGAN_EN_EL_REAL) {
      const fuente = leer(d.archivo);
      expect(fuente, d.archivo).toContain(`export function ${d.nombre}(`);
      expect(fuente, d.archivo).toMatch(/construirReglasPaisEmpresa\(/);
    }
  });

  describe("autocomprobacion con fuentes inventadas", () => {
    const servicio = parsear(
      "lib/services/X.ts",
      "export class XService { constructor(private readonly repo: R, private readonly reglasPais?: P) {} }\n" +
        "export function crearXHandler(s: S, now = () => new Date(), reglasPais?: P) { return s; }\n" +
        "export function conReal(reglasPais?: P) { return reglasPais ?? construirReglasPaisEmpresa(); }\n",
    );
    const rs = receptoresDeReglas("lib/services/X.ts", servicio);

    it("detecta la clase y la fabrica, y deja fuera la que construye el real por defecto", () => {
      expect(rs.map((r) => `${r.tipo}:${r.nombre}:${r.indice}`)).toEqual(["clase:XService:1", "funcion:crearXHandler:2"]);
    });

    it.each([
      ["sin el argumento", "const s = new XService(repo); construirReglasPaisEmpresa(prisma);", /no pasa/],
      ["con undefined", "const s = new XService(repo, undefined); construirReglasPaisEmpresa(prisma);", /undefined/],
      ["con un doble y sin el real en el archivo", "const s = new XService(repo, reglasFijas);", /no construye el real/],
      ["la fabrica sin el argumento", "crearXHandler(s, now); construirReglasPaisEmpresa(prisma);", /no pasa/],
      ["el real solo en un comentario", "// construirReglasPaisEmpresa(prisma)\nconst s = new XService(repo, otras);", /no construye el real/],
    ])("%s → falla", (_caso, fuente, motivo) => {
      const problemas = construccionesSinReglas(parsear("app/x.ts", fuente), rs);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toMatch(motivo);
    });

    it.each([
      ["el real en linea", "const s = new XService(repo, construirReglasPaisEmpresa(prisma));"],
      ["el real en una variable", "const reglas = construirReglasPaisEmpresa(prisma); const s = new XService(repo, reglas);"],
      ["deps o el real", "new XService(repo, deps.reglasPais ?? construirReglasPaisEmpresa(prisma));"],
    ])("%s → pasa", (_caso, fuente) => {
      expect(construccionesSinReglas(parsear("app/x.ts", fuente), rs)).toEqual([]);
    });
  });
});
