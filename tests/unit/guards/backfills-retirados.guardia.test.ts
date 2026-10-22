import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * SL-12 · R1, R2, R3, R4, R11 — GUARDIA: LOS TRES BACKFILLS HEREDADOS NO VUELVEN.
 *
 * La ficha SL-12 retiró tres scripts que vinieron del producto de origen (fichas 125, 173 y 400) junto con
 * los tests cuyo único sujeto eran ellos. Ninguna migración ni ningún job los necesitaba.
 *
 * La vía realista por la que volverían es un port desde el producto de origen (`git apply` de un diff): el
 * script, un test que lo importa o un comentario que lo cita. Esta guardia vigila SOLO estos tres
 * nombres. No prohíbe `scripts/backfill-*` en general: un backfill propio de servi_logistic se
 * escribe sin tocarla.
 *
 * Las tres rutas se declaran aquí y en ningún otro sitio. Por eso esta guardia se excluye a sí
 * misma del barrido.
 */

const RAIZ = path.resolve(__dirname, "../../..");

/** Los tres scripts retirados, sin extensión: así el detector ve también el import `@/scripts/…`. */
const SCRIPTS_RETIRADOS = [
  "scripts/backfill-analitica",
  "scripts/backfill-caja-tesoreria",
  "scripts/backfill-marcador-config-geocode",
] as const;

/** Carpetas de código donde ningún archivo puede citar los scripts (R3, R4). */
const CARPETAS_DE_CODIGO = [
  "app",
  "lib",
  "components",
  "hooks",
  "providers",
  "scripts",
  "tests",
  "e2e",
] as const;

const ESTA_GUARDIA = "tests/unit/guards/backfills-retirados.guardia.test.ts";

const EXTENSIONES_BINARIAS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf"]);

const AVISO =
  "La ficha SL-12 retiró estos backfills heredados (ninguna migración los necesitaba). " +
  "Si llegan con un port desde el producto de origen, quítalos del diff antes de aplicarlo.";

/** Devuelve los scripts retirados que el texto cita, en código o en comentario. */
function citasDeScriptsRetirados(texto: string): string[] {
  return SCRIPTS_RETIRADOS.filter((ruta) => texto.includes(ruta));
}

/** Rutas relativas (con `/`) de todos los archivos bajo `carpeta`, recursivo. */
function archivosBajo(carpeta: string): string[] {
  const absoluta = path.join(RAIZ, carpeta);
  if (!existsSync(absoluta)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(absoluta, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    const ruta = path.relative(RAIZ, path.join(entrada.parentPath, entrada.name));
    salida.push(ruta.split(path.sep).join("/"));
  }
  return salida;
}

/** Cada archivo legible que cita un script retirado, con los scripts que cita. */
function culpablesEn(archivos: string[]): string[] {
  const culpables: string[] = [];
  for (const archivo of archivos) {
    if (archivo === ESTA_GUARDIA) continue;
    if (EXTENSIONES_BINARIAS.has(path.extname(archivo).toLowerCase())) continue;
    const citas = citasDeScriptsRetirados(readFileSync(path.join(RAIZ, archivo), "utf8"));
    if (citas.length > 0) culpables.push(`${archivo} -> ${citas.join(", ")}`);
  }
  return culpables;
}

const ARCHIVOS_DE_CODIGO = CARPETAS_DE_CODIGO.flatMap(archivosBajo);
const ARCHIVOS_DE_MIGRACIONES = archivosBajo("db/migrations");

describe("SL-12 — autocomprobación del detector", () => {
  it("marca un import con alias y un comentario con la ruta, y no marca otro backfill", () => {
    expect(
      citasDeScriptsRetirados('import { ejecutarBackfillCli } from "@/scripts/backfill-analitica";'),
    ).toEqual(["scripts/backfill-analitica"]);
    expect(
      citasDeScriptsRetirados("// patron de `scripts/backfill-marcador-config-geocode.ts`, R17"),
    ).toEqual(["scripts/backfill-marcador-config-geocode"]);
    expect(citasDeScriptsRetirados("scripts/backfill-caja-tesoreria.ts")).toEqual([
      "scripts/backfill-caja-tesoreria",
    ]);
    expect(citasDeScriptsRetirados("node ./node_modules/tsx/dist/cli.mjs scripts/backfill-otro.ts")).toEqual(
      [],
    );
  });

  it("CONTROL DE NO-VACUIDAD: el barrido ve más de 100 archivos de código y más de 10 migraciones", () => {
    // Sin esto, una raíz mal resuelta o un recorrido vacío dejaría los casos 2 y 3 en verde sin
    // haber leído nada.
    expect(ARCHIVOS_DE_CODIGO.length).toBeGreaterThan(100);
    const carpetasDeMigracion = new Set(
      ARCHIVOS_DE_MIGRACIONES.map((archivo) => archivo.split("/").slice(0, 3).join("/")),
    );
    expect(carpetasDeMigracion.size).toBeGreaterThan(10);
    expect(ARCHIVOS_DE_CODIGO).toContain(ESTA_GUARDIA);
  });
});

describe("SL-12 — los backfills heredados siguen retirados", () => {
  it("caso 1 (R1, R11): ninguno de los tres scripts existe", () => {
    const presentes = SCRIPTS_RETIRADOS.map((ruta) => `${ruta}.ts`).filter((ruta) =>
      existsSync(path.join(RAIZ, ruta)),
    );
    expect(presentes, `${AVISO}\nVolvieron: ${presentes.join(", ")}`).toEqual([]);
  });

  it("caso 2 (R3, R4, R11): ningún archivo de código importa ni cita los scripts", () => {
    const culpables = culpablesEn(ARCHIVOS_DE_CODIGO);
    expect(culpables, `${AVISO}\nLos citan:\n${culpables.join("\n")}`).toEqual([]);
  });

  it("caso 3 (R2): ninguna migración cita los scripts", () => {
    const culpables = culpablesEn(ARCHIVOS_DE_MIGRACIONES);
    expect(culpables, `${AVISO}\nLos citan:\n${culpables.join("\n")}`).toEqual([]);
  });
});
