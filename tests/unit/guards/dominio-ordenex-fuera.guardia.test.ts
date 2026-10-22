import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";
import { NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";
import { EXCEPCIONES_DOMINIO, lineasConDominio, type ExcepcionDominio } from "./_dominio-heredado";

export { EXCEPCIONES_DOMINIO, lineasConDominio, type ExcepcionDominio };

// SL-14 (R9-R11, D6) — el dominio de la marca anterior no vive en ningun archivo versionado.
//
// servi_logistic no hereda ese dominio: su dominio publico sale de variables de entorno, no de un
// literal. Esta guardia recorre todo lo versionado (`git ls-files`, mas `.env.example`) salvo
// `progress/`, que es el estado del arnes y no la app, y falla nombrando archivo y linea donde aparezca.
//
// Las excepciones son TODAS temporales: cada una nombra la ficha que la retira. Cuando esa ficha
// limpia su parte, la entrada deja de tener el dominio y la guardia sale en rojo pidiendo borrarla
// (poda, R10). Con la lista vacia, la limpieza esta cerrada.
//
// El detector y la lista viven en `./_dominio-heredado.ts` (SL-15): asi `recursos-origen-fuera`
// (SL-34) los importa sin nombrar la ruta de esta guardia, que lleva la palabra heredada. El detector
// se compone por partes para que ningun archivo contenga el dominio literal.

const cubre = (e: ExcepcionDominio, ruta: string) =>
  e.ruta.endsWith("/") ? ruta.startsWith(e.ruta) : ruta === e.ruta;

/** Hallazgos `ruta:linea` de los archivos que no estan exceptuados. */
export function hallazgosFueraDeExcepciones(
  conDominio: ReadonlyMap<string, number[]>,
  excepciones: readonly ExcepcionDominio[],
): string[] {
  const hallazgos: string[] = [];
  for (const [ruta, lineas] of conDominio) {
    if (excepciones.some((e) => cubre(e, ruta))) continue;
    for (const l of lineas) hallazgos.push(`${ruta}:${l}`);
  }
  return hallazgos.sort();
}

/** Mensaje de poda de las entradas que ya no cubren ningun archivo con el dominio (R10). */
export function excepcionesSinDominio(
  conDominio: ReadonlyMap<string, number[]>,
  excepciones: readonly ExcepcionDominio[],
): string[] {
  const rutas = [...conDominio.keys()];
  return excepciones
    .filter((e) => !rutas.some((r) => cubre(e, r)))
    .map((e) => `la entrada \`${e.ruta}\` (ficha \`${e.ficha}\`) ya no tiene el dominio: bórrala de la lista`);
}

// Binarios: se excluyen por extension, como en la guardia de barrido de estados heredados.
const EXTENSIONES_BINARIAS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif",
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".xlsx", ".xls", ".docx", ".pdf", ".zip", ".gz", ".mp4", ".mp3", ".wasm",
]);

/** Universo de la guardia: lo versionado mas `.env.example`, sin `progress/` ni binarios. */
function universo(): string[] {
  const salida = execFileSync("git", ["ls-files", "-z"], {
    cwd: RAIZ_DEL_REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rutas = new Set(salida.split("\0").filter(Boolean));
  rutas.add(".env.example");
  return [...rutas].filter(
    (r) =>
      !r.startsWith("progress/") &&
      !EXTENSIONES_BINARIAS.has(path.extname(r).toLowerCase()) &&
      fs.existsSync(path.join(RAIZ_DEL_REPO, r)),
  );
}

let cache: Map<string, number[]> | null = null;

/** Mapa ruta -> lineas con el dominio, solo de los archivos que lo tienen. */
function archivosConDominio(): Map<string, number[]> {
  if (cache) return cache;
  const mapa = new Map<string, number[]>();
  for (const ruta of universo()) {
    const abs = path.join(RAIZ_DEL_REPO, ruta);
    if (!fs.statSync(abs).isFile()) continue;
    const lineas = lineasConDominio(fs.readFileSync(abs, "utf8"));
    if (lineas.length > 0) mapa.set(ruta, lineas);
  }
  cache = mapa;
  return mapa;
}

describe("SL-14 — el dominio de la marca anterior fuera del repo", () => {
  describe("autocomprobacion del detector (R11)", () => {
    const dominio = NOMBRE_HEREDADO.minusculas + ".co";

    it("marca el dominio con subdominio y mayusculas mezcladas", () => {
      expect(lineasConDominio("x\nver https://App.OrDeNeX" + ".Co/cierres\n")).toEqual([2]);
      expect(lineasConDominio(`https://app.${dominio}`)).toEqual([1]);
    });

    it("marca el dominio dentro de un email", () => {
      expect(lineasConDominio(`mailto:soporte@${dominio}`)).toEqual([1]);
      expect(lineasConDominio(`a\r\nb\r\nsoporte@${dominio.toUpperCase()}>`)).toEqual([3]);
    });

    it("no marca example.com, la regex escrita con su barra ni un identificador que sigue", () => {
      expect(lineasConDominio("https://app.example.com/x")).toEqual([]);
      expect(lineasConDominio(`git grep -n '${NOMBRE_HEREDADO.minusculas}\\.co'`)).toEqual([]);
      expect(lineasConDominio("const x = ingresoEmpresa.comision;")).toEqual([]);
    });
  });

  describe("lista de excepciones (R10)", () => {
    it("toda entrada es temporal: nombra una ficha SL-n distinta de SL-14 y un motivo", () => {
      for (const e of EXCEPCIONES_DOMINIO) {
        expect(e.ficha, e.ruta).toMatch(/^SL-\d+$/);
        expect(e.ficha, e.ruta).not.toBe("SL-14");
        expect(e.motivo.trim(), e.ruta).not.toBe("");
      }
    });

    it("la poda muerde: una entrada sin dominio sale nombrada con su ficha", () => {
      const conDominio = new Map([["docs/api/x.yaml", [3]]]);
      const lista: ExcepcionDominio[] = [
        { ruta: "docs/api/", ficha: "SL-16", motivo: "m" },
        { ruta: "scripts/seed.ts", ficha: "SL-11", motivo: "m" },
      ];
      expect(excepcionesSinDominio(conDominio, lista)).toEqual([
        "la entrada `scripts/seed.ts` (ficha `SL-11`) ya no tiene el dominio: bórrala de la lista",
      ]);
    });

    it("el barrido muerde: un archivo fuera de la lista sale con su linea; un prefijo cubre", () => {
      const conDominio = new Map([
        ["docs/api/x.yaml", [3]],
        ["lib/config/push.ts", [7, 9]],
      ]);
      const lista: ExcepcionDominio[] = [{ ruta: "docs/api/", ficha: "SL-16", motivo: "m" }];
      expect(hallazgosFueraDeExcepciones(conDominio, lista)).toEqual([
        "lib/config/push.ts:7",
        "lib/config/push.ts:9",
      ]);
    });

    it("ninguna entrada sobra: cada una cubre un archivo que aun tiene el dominio", () => {
      const sobran = excepcionesSinDominio(archivosConDominio(), EXCEPCIONES_DOMINIO);
      expect(sobran, sobran.join("\n")).toEqual([]);
    });
  });

  it(".env.example declara el origen publico y VAPID_SUBJECT sin valor, y la da por obligatoria (R8)", () => {
    const ejemplo = fs.readFileSync(path.join(RAIZ_DEL_REPO, ".env.example"), "utf8");
    for (const nombre of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "VAPID_SUBJECT"]) {
      expect(ejemplo, `falta ${nombre}= sin valor en .env.example`).toMatch(
        new RegExp(`^${nombre}=\\r?$`, "m"),
      );
    }
    expect(ejemplo).toMatch(/^#.*VAPID_SUBJECT es OBLIGATORIA para que haya push/m);
  });

  it("ningun archivo versionado fuera de la lista lleva el dominio de la marca anterior (R9)", () => {
    const hallazgos = hallazgosFueraDeExcepciones(archivosConDominio(), EXCEPCIONES_DOMINIO);
    const archivos = new Set(hallazgos.map((h) => h.slice(0, h.lastIndexOf(":"))));
    expect(
      hallazgos,
      `${archivos.size} archivo(s) llevan el dominio de la marca anterior. Sacalo a configuracion o usa ` +
        `example.com:\n${hallazgos.join("\n")}`,
    ).toEqual([]);
  });
});
