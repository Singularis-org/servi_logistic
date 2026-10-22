import { beforeAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";
import { NOMBRE_HEREDADO, PATRON_NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";

// SL-15 (R15, R16, R17, R20) — el nombre heredado no vive en ningun archivo versionado.
//
// Universo: `git ls-files`, salvo `specs/` (los retira SL-27), `docs/` (son de SL-16 y los vigila
// esa ficha) y `progress/` (estado del arnes). Partir de `git ls-files` deja fuera `.worktrees/`,
// `node_modules/` y `.next/`; con `--others --exclude-standard` entra tambien lo nuevo sin
// commitear, para que un port no espere al commit para salir en rojo. Se mira el contenido de cada archivo de texto y su ruta, con el patron
// de `tests/fixtures/nombre-heredado.ts`, que distingue mayusculas.
//
// Toda excepcion es temporal y nombra la ficha que la retira. Una excepcion que ya no cubre ninguna
// aparicion pone la guardia en rojo: la lista solo puede encoger. Las de `retira: "SL-15"` son el
// trinquete de las tandas de esta ficha: cada tanda borra las suyas y al cerrar no queda ninguna.
//
// Este archivo no contiene la palabra: las rutas que la llevan se escriben con `${n}`.

const n = NOMBRE_HEREDADO.minusculas;

/** Una aparicion: en una linea del contenido (desde 1) o en la ruta (`linea: null`). */
export interface Aparicion {
  ruta: string;
  linea: number | null;
  texto: string;
}

/**
 * Alcance de una excepcion:
 * - `archivo`: una ruta exacta; cubre su contenido y su ruta;
 * - `prefijo`: una carpeta (o un prefijo de ruta); cubre contenido y ruta de lo que empiece asi;
 * - `soloRuta`: una ruta exacta; cubre solo la aparicion en la ruta, el contenido se limpia;
 * - `linea`: las lineas de contenido que casan con la regex, opcionalmente solo bajo `en`.
 */
export type Alcance =
  | { archivo: string }
  | { prefijo: string }
  | { soloRuta: string }
  | { linea: RegExp; en?: string };

export interface Excepcion {
  alcance: Alcance;
  motivo: string;
  /** Ficha que la retira (`SL-<n>`). No hay excepciones permanentes. */
  retira: string;
}

/** Apariciones del nombre heredado en la ruta y en el contenido de un archivo. */
export function aparicionesDe(ruta: string, texto: string): Aparicion[] {
  const salida: Aparicion[] = [];
  if (PATRON_NOMBRE_HEREDADO.test(ruta)) salida.push({ ruta, linea: null, texto: ruta });
  // Atajo: casi ningun archivo tiene la palabra; solo se parte en lineas el que la tiene.
  if (!PATRON_NOMBRE_HEREDADO.test(texto)) return salida;
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (PATRON_NOMBRE_HEREDADO.test(linea)) salida.push({ ruta, linea: i + 1, texto: linea });
  });
  return salida;
}

export function cubre(e: Excepcion, a: Aparicion): boolean {
  const al = e.alcance;
  if ("archivo" in al) return a.ruta === al.archivo;
  if ("prefijo" in al) return a.ruta.startsWith(al.prefijo);
  if ("soloRuta" in al) return a.linea === null && a.ruta === al.soloRuta;
  if (a.linea === null) return false;
  if (al.en !== undefined && !a.ruta.startsWith(al.en)) return false;
  return al.linea.test(a.texto);
}

const etiqueta = (a: Aparicion) => (a.linea === null ? `${a.ruta} (ruta)` : `${a.ruta}:${a.linea}`);

/** `ruta:linea` (o `ruta (ruta)`) de cada aparicion que ninguna excepcion cubre. */
export function hallazgos(apariciones: readonly Aparicion[], excepciones: readonly Excepcion[]): string[] {
  return apariciones
    .filter((a) => !excepciones.some((e) => cubre(e, a)))
    .map(etiqueta)
    .sort();
}

const describir = (e: Excepcion) => {
  const al = e.alcance;
  if ("archivo" in al) return `archivo ${al.archivo}`;
  if ("prefijo" in al) return `prefijo ${al.prefijo}`;
  if ("soloRuta" in al) return `ruta ${al.soloRuta}`;
  return `lineas ${al.linea}${al.en ? ` en ${al.en}` : ""}`;
};

/** Excepciones que no cubren ninguna aparicion: hay que borrarlas (R16). */
export function excepcionesSinUso(
  apariciones: readonly Aparicion[],
  excepciones: readonly Excepcion[],
): string[] {
  return excepciones
    .filter((e) => !apariciones.some((a) => cubre(e, a)))
    .map((e) => `la excepcion «${describir(e)}» (retira ${e.retira}) ya no cubre nada: bórrala`);
}

// ─── Excepciones ────────────────────────────────────────────────────────────────────────────────

const SL27_RUTA =
  "la ruta la cita un spec (specs/ no se edita, R18) y es una guardia cuyo sujeto es la herencia; la retira SL-27";

export const EXCEPCIONES_DE_OTRAS_FICHAS: readonly Excepcion[] = [
  // SL-16 (T8) retiro las de los disenos (design-notificaciones/, design-whatsapp/, .design-work/,
  // DESIGN.md) y las de contexto-457/458/460/461: ya no cubrian nada.
  // SL-16 (T4, T7b) retiro la de openapi-406 (su dominio ya es example.com) y la parte de la coleccion
  // de Postman de la de abajo (ya vive en su ruta nueva). Lo que queda nombra un unico archivo de docs/
  // con la palabra, el de la historia del origen, que renombra o retira SL-27 con esa historia.
  {
    // Lineas de tests que nombran `docs/limpieza-<palabra>.md`.
    alcance: { linea: new RegExp(`docs/limpieza-${n}\\.md`), en: "tests/" },
    motivo: "nombra docs/limpieza-….md, la historia del origen (excepcion de historia de SL-16); la retira SL-27",
    retira: "SL-27",
  },
  {
    alcance: { soloRuta: `tests/unit/utils/ingreso-${n}.test.ts` },
    motivo: "la citan specs/240-…/tasks.md y specs/274-…/tasks.md (design §3, P4); el contenido sí se limpia",
    retira: "SL-27",
  },
  { alcance: { soloRuta: `tests/unit/guards/dominio-${n}-fuera.guardia.test.ts` }, motivo: SL27_RUTA, retira: "SL-27" },
  { alcance: { soloRuta: `tests/unit/guards/fuera-datos-${n}.guardia.test.ts` }, motivo: SL27_RUTA, retira: "SL-27" },
  { alcance: { soloRuta: `tests/unit/guards/sin-integrador-de-${n}.guardia.test.ts` }, motivo: SL27_RUTA, retira: "SL-27" },
  // SL-16 (T7b, R23) retiro la del `Bearer` de `evidenciasUrl`: openapi-spec.ts, el YAML y
  // openapi-webhook-contrato ya dicen `svl_`.
];

/**
 * Trinquete de las tandas (design §7): las de `retira: "SL-15"` se borraron tanda a tanda; al cerrar
 * SL-15 solo quedan las de fichas todavia no integradas (R16).
 */
export const EXCEPCIONES: readonly Excepcion[] = EXCEPCIONES_DE_OTRAS_FICHAS;

// ─── Lectura del arbol ──────────────────────────────────────────────────────────────────────────

const FUERA = ["specs/", "docs/", "progress/"];

/** Rutas versionadas (o nuevas sin ignorar) que existen en disco, sin `specs/`, `docs/` ni `progress/`. */
export function universo(): string[] {
  const salida = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: RAIZ_DEL_REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return salida
    .split("\0")
    .filter((r) => r.length > 0 && !FUERA.some((f) => r.startsWith(f)))
    // `ls-files` lista tambien lo borrado del arbol y aun no commiteado.
    .filter((r) => fs.existsSync(path.join(RAIZ_DEL_REPO, r)));
}

/** Contenido de texto, o `null` si es binario (un `\0` en los primeros 8 KB, como `git grep -I`). */
function textoDe(ruta: string): string | null {
  const abs = path.join(RAIZ_DEL_REPO, ruta);
  if (!fs.statSync(abs).isFile()) return null;
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString("utf8");
}

let cache: { rutas: string[]; apariciones: Aparicion[] } | null = null;

/** Plazo del `beforeAll` que hace el barrido; holgado para la carga del gate y de CI. */
const BARRIDO_TIMEOUT_MS = 180_000;

function arbol() {
  if (cache) return cache;
  const rutas = universo();
  const apariciones: Aparicion[] = [];
  for (const ruta of rutas) {
    const texto = textoDe(ruta);
    apariciones.push(...aparicionesDe(ruta, texto ?? ""));
  }
  cache = { rutas, apariciones };
  return cache;
}

// ─── Casos ──────────────────────────────────────────────────────────────────────────────────────

describe("SL-15 — sin el nombre heredado (R15, R16, R17, R20)", () => {
  // El barrido recorre todo el arbol (unos segundos sola, mucho mas bajo la carga del gate): se hace
  // aqui, con su propio plazo, y ningun caso carga con el dentro del testTimeout por defecto.
  beforeAll(() => {
    arbol();
  }, BARRIDO_TIMEOUT_MS);

  describe("autocomprobacion sobre texto sintetico (design §7)", () => {
    const capital = NOMBRE_HEREDADO.capital;

    it("no salta con OrdenExistente, ordenExacta ni ordenExigido", () => {
      expect(aparicionesDe("a.ts", "const OrdenExistente = ordenExacta && ordenExigido;")).toEqual([]);
    });

    it("salta con la palabra seguida de « le paga», nombrando archivo y linea", () => {
      const ap = aparicionesDe("lib/x.ts", `uno\n${capital} le paga a una tienda`);
      expect(hallazgos(ap, [])).toEqual(["lib/x.ts:2"]);
    });

    it("salta con el prefijo de llave y con las formas en minusculas y mayusculas", () => {
      expect(hallazgos(aparicionesDe("a.ts", `"${NOMBRE_HEREDADO.prefijoLlave}abc"`), [])).toEqual(["a.ts:1"]);
      expect(hallazgos(aparicionesDe("a.ts", `x\r\n${n}:clave\r\n${n.toUpperCase()}_X`), [])).toEqual([
        "a.ts:2",
        "a.ts:3",
      ]);
    });

    it("salta con la palabra en la ruta aunque el contenido este limpio", () => {
      expect(hallazgos(aparicionesDe(`lib/ingreso-${n}.ts`, "limpio"), [])).toEqual([`lib/ingreso-${n}.ts (ruta)`]);
    });

    it("no salta con el dominio heredado mientras su excepcion de linea esta vigente", () => {
      const sl14: Excepcion = { alcance: { linea: new RegExp(`${n}\\.co`) }, motivo: "dominio", retira: "SL-14" };
      const ap = aparicionesDe("lib/x.ts", `const u = "https://${n}.co/x";`);
      expect(ap).toHaveLength(1);
      expect(hallazgos(ap, [sl14])).toEqual([]);
      expect(excepcionesSinUso(ap, [sl14])).toEqual([]);
    });

    it("una excepcion sin apariciones salta, con su ficha", () => {
      const ap = aparicionesDe("lib/x.ts", `${capital}`);
      const muerta: Excepcion = { alcance: { archivo: "lib/y.ts" }, motivo: "m", retira: "SL-99" };
      expect(excepcionesSinUso(ap, [muerta])).toEqual([
        "la excepcion «archivo lib/y.ts» (retira SL-99) ya no cubre nada: bórrala",
      ]);
    });

    it("soloRuta cubre la ruta y no el contenido; prefijo cubre los dos", () => {
      const ruta = `tests/a-${n}.test.ts`;
      const ap = aparicionesDe(ruta, `// ${capital}`);
      expect(hallazgos(ap, [{ alcance: { soloRuta: ruta }, motivo: "m", retira: "SL-27" }])).toEqual([`${ruta}:1`]);
      expect(hallazgos(ap, [{ alcance: { prefijo: "tests/" }, motivo: "m", retira: "SL-16" }])).toEqual([]);
    });

    it("una excepcion de linea con `en` no cubre fuera de su carpeta", () => {
      const e: Excepcion = { alcance: { linea: /docs\//, en: "tests/" }, motivo: "m", retira: "SL-16" };
      const ap = aparicionesDe("lib/x.ts", `// docs/${n}.md`);
      expect(hallazgos(ap, [e])).toEqual(["lib/x.ts:1"]);
    });
  });

  describe("lista de excepciones (R16)", () => {
    it("toda excepcion es temporal: nombra una ficha SL-<n> y un motivo", () => {
      for (const e of EXCEPCIONES) {
        expect(e.retira, describir(e)).toMatch(/^SL-\d+$/);
        expect(e.motivo.trim(), describir(e)).not.toBe("");
      }
    });

    it("solo quedan excepciones de fichas no integradas: ninguna la retira SL-15", () => {
      const deSl15 = EXCEPCIONES.filter((e) => e.retira === "SL-15").map(describir);
      expect(deSl15).toEqual([]);
    });

    it("ninguna excepcion sobra: cada una cubre al menos una aparicion del arbol", () => {
      const sobran = excepcionesSinUso(arbol().apariciones, EXCEPCIONES);
      expect(sobran, sobran.join("\n")).toEqual([]);
    });
  });

  it("R17: el patron vive en el fixture y el fixture no contiene la palabra literal", () => {
    const texto = fs.readFileSync(path.join(RAIZ_DEL_REPO, "tests/fixtures/nombre-heredado.ts"), "utf8");
    expect(aparicionesDe("tests/fixtures/nombre-heredado.ts", texto)).toEqual([]);
  });

  it("la lectura del arbol no esta vacia: incluye produccion y tests, y excluye specs/, docs/ y progress/", () => {
    const { rutas } = arbol();
    expect(rutas.length).toBeGreaterThan(1000);
    expect(rutas).toContain("lib/config/marca.ts");
    expect(rutas).toContain("tests/unit/guards/sin-nombre-heredado.guardia.test.ts");
    expect(rutas.some((r) => FUERA.some((f) => r.startsWith(f)))).toBe(false);
  });

  it("R15: ningun archivo versionado fuera de las excepciones lleva el nombre heredado", () => {
    const encontrados = hallazgos(arbol().apariciones, EXCEPCIONES);
    const archivos = new Set(encontrados.map((h) => h.replace(/ \(ruta\)$|:\d+$/, "")));
    expect(
      encontrados,
      `${archivos.size} archivo(s) llevan el nombre heredado. La plataforma es MARCA.nombre y la ` +
        `empresa usuaria es EMPRESA (lib/config/marca.ts):\n${encontrados.join("\n")}`,
    ).toEqual([]);
  });
});
