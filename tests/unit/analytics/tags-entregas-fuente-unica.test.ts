import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { TAGS_LECTURAS_ENTREGAS } from "@/lib/analytics/tags-entregas";

// SLT-64 / T3.3 — R17: el botón «Actualizar» y las dos invalidaciones por escritura usan UNA lista.
//
// Las ocho etiquetas se escriben a mano a propósito: ES el contrato. Derivarlas de la constante
// compararía la lista consigo misma y estaría siempre verde.

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const LIB = path.join(REPO_ROOT, "lib");
const REFRESCAR = "lib/actions/analitica-refrescar.ts";

const ETIQUETAS = [
  "conteo-entregas",
  "conteo-por-status",
  "conteo-cargadas-por-dia",
  "conteo-hoy-gestion",
  "conteo-devoluciones",
  "ciclo-vida",
  "conteo-productos",
  "cohorte-carga",
];

// Donde se declara cada etiqueta, y `reparto.ts`, donde esos textos son nombres de archivos de
// acción. Las subclaves SWR de `app/(app)/analitica/` no son etiquetas: el censo solo mira `lib/`.
const PERMITIDOS = new Set([
  "lib/analytics/entregas-conteo.ts",
  "lib/analytics/productos-consulta.ts",
  "lib/modulos/reparto.ts",
]);

function archivosDe(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

function etiquetasEscritas(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  return ETIQUETAS.filter((etiqueta) => new RegExp(`["'\`]${etiqueta}["'\`]`).test(codigo));
}

function leerRefrescar(): string {
  return quitarComentarios(fs.readFileSync(path.join(REPO_ROOT, ...REFRESCAR.split("/")), "utf8"));
}

describe("R17 · `refrescarCacheAnalitica` usa la constante", () => {
  it("la importa de `tags-entregas` y construye su lista con ella", () => {
    const codigo = leerRefrescar();
    expect(codigo).toMatch(
      /import\s+\{\s*TAGS_LECTURAS_ENTREGAS\s*\}\s+from\s+["']@\/lib\/analytics\/tags-entregas["']/,
    );
    expect(codigo).toMatch(/\[\s*\.\.\.TAGS_LECTURAS_ENTREGAS\s*,\s*\.\.\.TAGS_OPERATIVA\s*,?\s*\]/);
  });

  it("no importa ni nombra ninguna `TAG_*` de entregas", () => {
    expect(leerRefrescar().match(/\bTAG_[A-Z_]+\b/g) ?? []).toEqual([]);
  });
});

describe("R17 · la constante", () => {
  it("contiene exactamente las ocho etiquetas", () => {
    expect([...TAGS_LECTURAS_ENTREGAS].sort()).toEqual([...ETIQUETAS].sort());
    expect(TAGS_LECTURAS_ENTREGAS).toHaveLength(8);
  });
});

describe("R17 · ningún archivo de `lib/` escribe las etiquetas a mano", () => {
  it("el censo recorre `lib/` y los archivos permitidos existen", () => {
    const relativos = archivosDe(LIB).map((a) => path.relative(REPO_ROOT, a).replace(/\\/g, "/"));
    expect(relativos.length).toBeGreaterThan(100);
    for (const permitido of PERMITIDOS) expect(relativos).toContain(permitido);
    expect(relativos).toContain("lib/analytics/tags-entregas.ts");
  });

  it("fuera de los permitidos no aparece ningún literal", () => {
    const infractores = archivosDe(LIB).flatMap((archivo) => {
      const relativo = path.relative(REPO_ROOT, archivo).replace(/\\/g, "/");
      if (PERMITIDOS.has(relativo)) return [];
      return etiquetasEscritas(fs.readFileSync(archivo, "utf8")).map((e) => `${relativo}: ${e}`);
    });
    expect(infractores).toEqual([]);
  });

  it("autocomprobación: el detector ve un literal en el código y no en un comentario", () => {
    expect(etiquetasEscritas(`const a = ["ciclo-vida"];`)).toEqual(["ciclo-vida"]);
    expect(etiquetasEscritas(`const a = 'cohorte-carga';`)).toEqual(["cohorte-carga"]);
    expect(etiquetasEscritas(`// "ciclo-vida" solo se explica aquí\nconst a = 1;`)).toEqual([]);
    expect(etiquetasEscritas(`import { x } from "@/lib/actions/ciclo-vida";`)).toEqual([]);
  });
});
