import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, it, expect } from "vitest";

import { NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";

import { aparicionesDeTerminos, formaDeTermino, MAX_PALABRAS, sha256, SLUG_SL13, type Termino } from "./_terminos-por-hash";

/**
 * SL-13 (R1, R2, R3, R4, R15) — GUARDIA: los nombres del integrador heredado y de sus clientes
 * reales no estan en el repositorio y no vuelven a entrar (por ejemplo, con un port desde el producto de origen).
 *
 * Regla: `docs/limpieza-ordenex.md` regla 2 y `docs/plan-saas.md` decision 6 (lo heredado
 * desaparece del todo). Diseno: `specs/SL-13-fuera-nuform/design.md > D1`.
 *
 * - El universo es lo versionado mas lo no versionado que no esta ignorado
 *   (`git ls-files --cached --others --exclude-standard`), sin `specs/` (se retiran en SL-27) y sin
 *   binarios (un `\0` en los primeros 8 KB, el criterio de `git grep -I`). `specs/` lo recorre la
 *   guardia de SL-34 (`recursos-origen-fuera.guardia.test.ts`, R23).
 * - Los terminos se vetan por el SHA-256 de su forma (SL-34 R23, `_terminos-por-hash.ts`): este archivo
 *   no los contiene en claro, y por eso ya no es una excepcion. «Ecuador» y «distribuidora» sueltas no
 *   se vetan: el plan exige varios paises (`docs/plan-saas.md` decision 2) y «distribuidora» es un tipo
 *   de comercio corriente.
 */

const RAIZ = path.resolve(__dirname, "../../..");

/** Esta guardia, relativa a la raiz y con `/`. */
const ESTE_ARCHIVO = `tests/unit/guards/sin-integrador-de-${NOMBRE_HEREDADO.minusculas}.guardia.test.ts`;

const REGLA =
  "Regla: docs/limpieza-ordenex.md regla 2; docs/plan-saas.md decision 6 (lo heredado desaparece del todo).";

/**
 * R1: los diez terminos que se retiran, sin distinguir mayusculas, como `{ largo, sha256 }` de su forma
 * (sus palabras en minusculas unidas por un espacio). Son los mismos hashes de las clases `integrador`,
 * `cliente` y `direccion` de la guardia de SL-34, en el mismo orden.
 */
const TERMINOS_PROHIBIDOS: readonly Termino[] = [
  { largo: 6, sha256: "26ffdcf74e73f8e53160b62427987a586355d483f2d86a0f72119bacf7881b6a" },
  { largo: 6, sha256: "408715b18503d683a3eced8ee0d2a836271ac91fd1d1d7c3a2bdb3ee2a429c82" },
  { largo: 8, sha256: "ac80294d55e1228e09171dd04d4fb9c1836794e5b56c8c4a62f21dc5cc949c24" },
  { largo: 19, palabras: 2, sha256: "fcc48dd18dabd6124c73b83b8be01b49d0c317b7d8381b18e695a2f51f06247e" },
  { largo: 21, palabras: 2, sha256: "2f60c566890c9b002e62e768b982429d27cedd0853c1df7e209e7abf2a316775" },
  { largo: 23, palabras: 3, sha256: "39455adb5fe351a5fb907bc49bfda697d9d7c03ab90fd8b031e009d2816a4654" },
  { largo: 21, palabras: 2, sha256: "66eea3aac6422664be86a414f6d94f169c2437cea9e7634c6218872fade61e14" },
  { largo: 13, palabras: 2, sha256: "9ee806d9d0e2fb7ddf447ab253faa2e18431e8e4e8bc2505d4a7420dfb842b33" },
  { largo: 11, palabras: 2, sha256: "676f27e908c441bb160505620548f957fd57b0a60c66833eafe462151b173ca7" },
  { largo: 11, palabras: 2, sha256: "fbe2626111ce4fff603d260c88339ddab56b96549de7a2f272011046ecd61440" },
];

/** R2: la unica excepcion, con su motivo. */
interface Excepcion {
  /** Tokens `[a-z0-9_-]+` enteros que se permiten, como `{ largo, sha256 }`. */
  cadena: readonly Termino[];
  motivo: string;
}

const EXCEPCIONES: readonly Excepcion[] = [
  {
    cadena: SLUG_SL13,
    motivo:
      "Slug de la ficha SL-13 en el board: aparece en la rama, en la ruta del spec y en progress/. Vive mientras exista la ficha.",
  },
];

const CADENAS_PERMITIDAS = EXCEPCIONES.flatMap((e) => e.cadena);

/**
 * Deteccion pura de R1: cada termino como n-grama de palabras (tambien pegado al principio o al final
 * de otra palabra), sin las apariciones dentro de una cadena permitida. `linea` empieza en 1;
 * `termino` es el indice en la lista, nunca el valor.
 */
export function apariciones(
  texto: string,
  terminos: readonly Termino[],
  permitidas: readonly Termino[],
): { linea: number; termino: number }[] {
  return aparicionesDeTerminos(texto, terminos, permitidas)
    .filter((a) => a.exceptuada === -1)
    .map(({ linea, termino }) => ({ linea, termino }));
}

/** Universo de R1, rutas relativas con `/`, sin `specs/`. */
function universo(): string[] {
  const salida = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return salida
    .split("\0")
    .filter((r) => r.length > 0)
    .filter((r) => !r.startsWith("specs/"))
    // `--cached` lista tambien lo borrado del arbol y aun no commiteado.
    .filter((r) => existsSync(path.join(RAIZ, r)));
}

/** Contenido de texto, o `null` si es binario (un `\0` en los primeros 8 KB). */
function textoDe(ruta: string): string | null {
  const buf = readFileSync(path.join(RAIZ, ruta));
  if (buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString("utf8");
}

/** Una pasada por el universo, ruta y contenido, compartida por R1 y la poda de R2. */
let cache: { rutas: number; hallazgos: string[]; archivos: Set<string>; permitidasVistas: boolean } | null = null;
/** Plazo del `beforeAll` que hace el barrido; holgado para la carga del gate y de CI. */
const BARRIDO_TIMEOUT_MS = 120_000;

function barrido() {
  if (cache) return cache;
  const rutas = universo();
  const hallazgos: string[] = [];
  const archivos = new Set<string>();
  let permitidasVistas = false;
  for (const ruta of rutas) {
    const texto = textoDe(ruta);
    for (const [donde, contenido] of [["ruta", ruta], ["texto", texto]] as const) {
      if (contenido === null) continue;
      for (const a of aparicionesDeTerminos(contenido, TERMINOS_PROHIBIDOS, CADENAS_PERMITIDAS)) {
        if (a.exceptuada !== -1) {
          permitidasVistas = true;
          continue;
        }
        hallazgos.push(donde === "ruta" ? `${ruta} [ruta] (termino #${a.termino})` : `${ruta}:${a.linea} (termino #${a.termino})`);
        archivos.add(ruta);
      }
    }
  }
  cache = { rutas: rutas.length, hallazgos, archivos, permitidasVistas };
  return cache;
}

/** Texto de los comentarios (`//` y `/* *\/`) de un fuente. */
function comentariosDe(codigo: string): string {
  return (codigo.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) ?? []).join("\n");
}

describe("SL-13 — sin el integrador heredado ni sus clientes (R1, R2, R3, R4, R15)", () => {
  // El barrido recorre todo el arbol (~10 s sola, mas bajo la carga del gate): se hace aqui,
  // con su propio plazo, y ningun caso carga con el dentro del testTimeout por defecto.
  beforeAll(() => {
    barrido();
  }, BARRIDO_TIMEOUT_MS);

  it("R3: la deteccion marca los terminos en cualquier forma y no marca lo permitido (terminos inventados)", () => {
    const termino = (valor: string): Termino => {
      const forma = formaDeTermino(valor);
      return { largo: forma.length, sha256: sha256(forma), palabras: forma.split(" ").length };
    };
    const inventados = [termino("zqintegra"), termino("Zqalfa Zqbeta")];
    const slugInventado = ["fuera-zqintegra", "sl-13-fuera-zqintegra"].map((t) => ({ largo: t.length, sha256: sha256(t) }));

    const marcados = [
      "u-Zqintegra",
      "ZQINTEGRAtest",
      "picking-zqintegra-2026",
      "t-ZQINTEGRA",
      "Zqalfa  Zqbeta",
      "(Zqalfa ~ Zqbeta)",
      "Zqalfa. Zqbeta",
    ];
    for (const t of marcados) {
      expect(apariciones(t, inventados, slugInventado), t).toHaveLength(1);
    }

    const limpios = [
      "un texto limpio sin nombres de clientes",
      "feature/SL-13-fuera-zqintegra",
      "Zqalfa mayorista",
      "Zqbeta",
      "Zqalfa\nZqbeta",
    ];
    for (const t of limpios) {
      expect(apariciones(t, inventados, slugInventado), t).toEqual([]);
    }

    // El numero de linea sale del texto, no del termino.
    expect(apariciones("a\nb\nZqintegra", inventados, [])).toEqual([{ linea: 3, termino: 0 }]);
  });

  it("R1: los diez terminos son hashes validos y distintos, sin ningun valor en claro", () => {
    expect(TERMINOS_PROHIBIDOS).toHaveLength(10);
    for (const t of TERMINOS_PROHIBIDOS) {
      expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(t.largo).toBeGreaterThan(0);
      expect(t.palabras ?? 1).toBeLessThanOrEqual(MAX_PALABRAS);
    }
    expect(new Set(TERMINOS_PROHIBIDOS.map((t) => t.sha256)).size).toBe(TERMINOS_PROHIBIDOS.length);
    const propio = readFileSync(path.join(RAIZ, ESTE_ARCHIVO), "utf8");
    expect(apariciones(propio, TERMINOS_PROHIBIDOS, CADENAS_PERMITIDAS)).toEqual([]);
  });

  it("R2: exactamente una excepcion, el slug de la ficha, con motivo", () => {
    expect(EXCEPCIONES).toHaveLength(1);
    expect(CADENAS_PERMITIDAS).toEqual(SLUG_SL13);
    for (const e of EXCEPCIONES) expect(e.motivo.trim().length).toBeGreaterThan(0);
  });

  it("R2: poda — la excepcion sigue haciendo falta", () => {
    const { permitidasVistas } = barrido();
    expect(
      permitidasVistas,
      "Excepciones que ya no hacen falta; quitalas de EXCEPCIONES:\ncadena permitida (el slug): no aparece en ningun archivo del universo",
    ).toBe(true);
  });

  it("R1: ningun archivo fuera de specs/ contiene ni nombra un termino prohibido", () => {
    const { rutas, hallazgos, archivos } = barrido();
    // Control de no-vacuidad: un universo vacio daria verde sin mirar nada.
    expect(rutas).toBeGreaterThan(100);

    expect(
      hallazgos,
      `${archivos.size} archivo(s) con nombres del integrador o de sus clientes:\n${hallazgos.join("\n")}\n${REGLA}`,
    ).toEqual([]);
  });

  it("R4: los comentarios de ProductosTabla.tsx no citan Distribuidora ni Ecuador", () => {
    const ruta = "app/(app)/analitica/_components/entregas/ProductosTabla.tsx";
    const comentarios = comentariosDe(readFileSync(path.join(RAIZ, ruta), "utf8"));
    // Control de no-vacuidad: el archivo tiene comentarios que mirar.
    expect(comentarios.length).toBeGreaterThan(0);
    const citas = comentarios.split("\n").filter((l) => /distribuidora|ecuador/i.test(l));
    expect(citas, `${ruta}: comentarios que citan datos reales:\n${citas.join("\n")}\n${REGLA}`).toEqual([]);
  });

  it("R15: los mapas no llevan coordenadas literales y RutaMapaInner lee la configuracion del pais", () => {
    const dir = "app/(app)/mis-asignaciones/_components";
    const coordenada = /-?\d{1,3}\.\d{3,}/;
    for (const nombre of ["RutaMapaInner.tsx", "UbicacionMapaInner.tsx"]) {
      const ruta = `${dir}/${nombre}`;
      const lineas = readFileSync(path.join(RAIZ, ruta), "utf8").split(/\r?\n/);
      const conCoordenada = lineas.flatMap((l, i) => (coordenada.test(l) ? [`${ruta}:${i + 1}: ${l.trim()}`] : []));
      expect(conCoordenada, `Coordenadas literales; el centro sale de lib/config/pais.ts:\n${conCoordenada.join("\n")}`).toEqual(
        [],
      );
    }
    const ruta = readFileSync(path.join(RAIZ, `${dir}/RutaMapaInner.tsx`), "utf8");
    expect(ruta, "RutaMapaInner.tsx debe importar @/lib/config/pais").toMatch(
      /from\s+["']@\/lib\/config\/pais["']/,
    );
  });
});
