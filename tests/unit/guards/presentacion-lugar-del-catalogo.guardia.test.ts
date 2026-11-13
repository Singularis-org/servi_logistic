import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-125 (T2.3; R16; design §4.2, §13) — LAS LECTURAS DE PRESENTACION NOMBRAN EL LUGAR CON EL CATALOGO.
//
// LA REGLA: los archivos de las lecturas de design §4.2 no seleccionan las relaciones de Prisma
// `provincia`, `canton` ni `distrito` (las tablas viejas) para nombrar un lugar, ni leen su `.nombre`.
// Seleccionan las FK de la orden y nombran con la ruta del catalogo del pais de la empresa
// (`rutaDelLugar`), cargado una vez por repositorio y peticion.
//
// QUE SE PIERDE SI ESTO NO EXISTE. Una lectura que vuelva a la relacion seguiria dando los mismos nombres
// en Costa Rica mientras las tablas viejas y los nodos coincidan (R17), y ningun test de CR lo veria. Pero
// en un pais con otros niveles nombraria con tablas que no lo describen, y SLT-48 (que retira las tablas)
// romperia esa superficie. Esta guardia lo dice antes.
//
// Se mide sobre el codigo sin comentarios: un comentario que explica la regla no es una lectura.

const RAIZ = path.resolve(__dirname, "../../..");

/** Los archivos de las lecturas de design §4.2, enteros. */
const ARCHIVOS = [
  "lib/repositories/OrdenRepository.ts",
  "lib/repositories/GestionOrdenRepository.ts",
  "lib/repositories/CierreDiaRepository.ts",
  "lib/repositories/OrdenEnvioReader.ts",
  "lib/repositories/OrdenGeocodeRepository.ts",
  "lib/repositories/InformeTransitoRepository.ts",
  "lib/repositories/CoberturaRepository.ts",
];

/**
 * Anti-vacuidad: una marca por archivo que prueba que el barrido lee la lectura de verdad y que esa
 * lectura nombra con el catalogo.
 */
const LECTURAS: Record<string, string[]> = {
  "lib/repositories/OrdenRepository.ts": [
    "const WITH_ESTATUS_Y_TIENDA",
    "const WITH_ETIQUETA",
    "async findNovedadesByTienda(",
    "rutaDelLugar(",
  ],
  "lib/repositories/GestionOrdenRepository.ts": ["const WITH_ASIGNACION", "rutaDelLugar("],
  "lib/repositories/CierreDiaRepository.ts": ["export const WITH_DETALLE", "rutaDelLugar("],
  "lib/repositories/OrdenEnvioReader.ts": ["async findParaEnvio(", "rutaDelLugar("],
  "lib/repositories/OrdenGeocodeRepository.ts": ["async findParaGeocodificar(", "rutaDelLugar("],
  "lib/repositories/InformeTransitoRepository.ts": ["deLaEmpresa()", "rutaDelLugar("],
  "lib/repositories/CoberturaRepository.ts": ["async listDistritos(", "deLaEmpresa()"],
};

const RELACION = "(?:provincia|canton|distrito)";

/**
 * Cada lectura de una relacion de lugar en el texto: en un `select`/`include` (`provincia: { select`,
 * `canton: true`) o leyendo su nombre (`.distrito?.nombre`, `.provincia.nombre`).
 */
export function lecturasDeRelacionEn(codigo: string): string[] {
  const enSelect = new RegExp(`\\b${RELACION}\\s*:\\s*(?:\\{\\s*select\\b|true\\b)`, "g");
  const nombre = new RegExp(`\\.${RELACION}\\??\\.nombre\\b`, "g");
  return [...codigo.matchAll(enSelect), ...codigo.matchAll(nombre)].map((m) => m[0].replace(/\s+/g, " "));
}

function leer(rel: string): string {
  return quitarComentarios(readFileSync(path.join(RAIZ, rel), "utf8"));
}

describe("SLT-125 R16 — el detector se prueba a si mismo", () => {
  it("CONTRAPRUEBA: el `select` y el `include` de una relacion de lugar, y la lectura de su nombre, se detectan", () => {
    expect(lecturasDeRelacionEn("select: { provincia: { select: { nombre: true } } }")).toEqual(["provincia: { select"]);
    expect(lecturasDeRelacionEn("include: { canton: true, zona: true }")).toEqual(["canton: true"]);
    expect(lecturasDeRelacionEn("distritoNombre: row.distrito?.nombre ?? null")).toEqual([".distrito?.nombre"]);
    expect(lecturasDeRelacionEn("provinciaNombre: row.orden.provincia.nombre")).toEqual([".provincia.nombre"]);
  });

  it("CONTRAPRUEBA (control positivo): las FK, los nombres de la ruta y un objeto construido no son hallazgo", () => {
    expect(lecturasDeRelacionEn("select: { provinciaId: true, cantonId: true, distritoId: true }")).toEqual([]);
    expect(lecturasDeRelacionEn("...nombresDeLaRuta(rutaDelLugar(catalogo, row))")).toEqual([]);
    // La fila de cobertura construye `provincia: { nombre, activo }` desde el catalogo: no lee la relacion.
    expect(lecturasDeRelacionEn("provincia: { nombre: provincia.nombre, activo: provincia.activo }")).toEqual([]);
    expect(lecturasDeRelacionEn("provincia: niveles.provincia ? { id: niveles.provincia.id } : null")).toEqual([]);
  });

  it("un comentario que nombra la relacion no cuenta", () => {
    expect(lecturasDeRelacionEn(quitarComentarios("// antes: provincia: { select: { nombre: true } }\nconst a = 1;"))).toEqual(
      [],
    );
  });
});

describe("SLT-125 R16 — las lecturas de presentacion no nombran con las tablas viejas", () => {
  it("el barrido lee de verdad (anti-vacuidad)", () => {
    for (const rel of ARCHIVOS) {
      const codigo = leer(rel);
      expect(codigo.length, rel).toBeGreaterThan(500);
      for (const marca of LECTURAS[rel] ?? []) expect(codigo, `${rel} sin «${marca}»`).toContain(marca);
    }
  });

  it("ningun archivo de design §4.2 selecciona `provincia`, `canton` ni `distrito` para nombrar", () => {
    const hallazgos = ARCHIVOS.flatMap((rel) => lecturasDeRelacionEn(leer(rel)).map((m) => `${rel}: ${m}`));
    expect(
      hallazgos,
      "los nombres de lugar salen de la ruta del catalogo de la empresa (`rutaDelLugar`), no de las " +
        "relaciones a las tablas viejas (R16; design §4.2)",
    ).toEqual([]);
  });
});
