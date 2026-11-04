import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-64 / T4.6 — R12, R13: en producción nadie inyecta `deps.cache`, así que lo que invalida de
// verdad es la rama por defecto. Un `toContain` sobre el archivo entero estaría verde con solo el
// import, por eso se mide cada eslabón: la acción PASA `deps.cache` a su invalidación, y esa
// invalidación CONSTRUYE el puerto de producción cuando no le llega ninguno.

const REPO_ROOT = path.join(__dirname, "..", "..", "..");

const ACCIONES = [
  { archivo: "lib/actions/cierre-dia.ts", accion: "deshacerGestion" },
  { archivo: "lib/actions/cierres-admin.ts", accion: "corregirResultadoGestion" },
] as const;

function codigoDe(archivo: string): string {
  return quitarComentarios(fs.readFileSync(path.join(REPO_ROOT, ...archivo.split("/")), "utf8"));
}

/** El cuerpo de una función de primer nivel: de su firma al primer `}` en la columna 0. */
function cuerpoDe(codigo: string, firma: RegExp): string {
  const lineas = codigo.split(/\r?\n/);
  const inicio = lineas.findIndex((linea) => firma.test(linea));
  if (inicio === -1) return "";
  const fin = lineas.findIndex((linea, i) => i > inicio && linea.startsWith("}"));
  return lineas.slice(inicio, fin + 1).join("\n");
}

describe.each(ACCIONES)("R12, R13 · cableado de `$accion`", ({ archivo, accion }) => {
  const codigo = codigoDe(archivo);
  const delaAccion = cuerpoDe(codigo, new RegExp(`^export async function ${accion}\\(`));
  const invalidacion = cuerpoDe(codigo, /^async function invalidarLecturasDeEntregas\(/);

  it("los dos cuerpos existen (si no, el guardia estaría verde por vacío)", () => {
    expect(delaAccion).toContain(accion);
    expect(invalidacion).toContain("invalidarLecturasDeEntregas");
  });

  it("importa el puerto de producción", () => {
    expect(codigo).toMatch(
      /import\s+\{\s*crearAnaliticaCacheDeNext\s*\}\s+from\s+["']@\/lib\/cache\/next-analitica-cache["']/,
    );
  });

  it("la acción pasa `deps.cache` a la invalidación, y solo tras un `ok`", () => {
    expect(delaAccion).toMatch(
      /if\s*\(\s*r\.status\s*===\s*"ok"\s*\)\s*await\s+invalidarLecturasDeEntregas\(\s*deps\.cache\s*\)/,
    );
  });

  it("la rama por defecto construye el puerto de producción", () => {
    expect(invalidacion).toMatch(/\bcache\s*\?\?\s*crearAnaliticaCacheDeNext\(\s*\)/);
  });

  it("no usa la caché nula", () => {
    expect(codigo).not.toMatch(/\bcacheNula\b/);
  });

  it("invalida con la constante y el origen del dominio, no con una lista propia", () => {
    expect(invalidacion).toMatch(/\.invalidar\(\s*"correccion_gestion"\s*,\s*TAGS_LECTURAS_ENTREGAS\s*\)/);
  });
});

describe("autocomprobación: el detector muerde", () => {
  it("`cuerpoDe` corta en el cierre de la función y no devuelve el resto del archivo", () => {
    const codigo = "export async function a() {\n  uno();\n}\n\nfunction b() {\n  dos();\n}\n";
    expect(cuerpoDe(codigo, /^export async function a\(/)).not.toContain("dos");
    expect(cuerpoDe(codigo, /^function c\(/)).toBe("");
  });
});
