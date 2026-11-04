import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-44 (T4.6; R12; design §3, §10) — LAS LECTURAS DE ESTA FEATURE NO LEEN `nodo_geografico_id`.
//
// LA REGLA: el nodo de una asignacion de zona o de una marca especial se lee de su `distrito_id` (el
// nodo tiene el mismo id que el distrito). Ninguna lectura de SLT-44 nombra la columna nueva de
// `orden`, `zona_distrito` ni `distrito_zona_especial`, ni como campo de Prisma (`nodoGeograficoId`)
// ni como columna SQL (`nodo_geografico_id`). Decision cerrada «¿De donde se lee el lugar…?».
//
// QUE SE PIERDE SI ESTO NO EXISTE. El deploy pasaria a depender de que haya corrido el backfill de
// SLT-43: con la columna en NULL, la zona y la marca de cada distrito saldrian vacias, y la carga
// masiva y la cotizacion rechazarian filas o tarifarian sin el pacto especial. Lo mide ademas, en
// base propia y con la columna en NULL, `tests/integration/db/geo-lecturas-sin-backfill.test.ts`.
//
// Se mide sobre el codigo sin comentarios: un comentario que explica la regla no es una lectura.

const RAIZ = path.resolve(__dirname, "../../..");

/** Los archivos enteros de las lecturas de SLT-44 (design §3, §5). */
const ARCHIVOS = [
  "lib/repositories/CatalogoGeograficoRepository.ts",
  "lib/repositories/GeoRepository.ts",
  "lib/repositories/CoberturaRepository.ts",
  "lib/repositories/_shared/zona-especial.ts",
];

/** De `OrdenRepository` solo el bloque de las lecturas de SLT-44; el resto es de SLT-65. */
const ORDEN_REPOSITORY = "lib/repositories/OrdenRepository.ts";
const DESDE = "async findAllProvincias(";
const HASTA = "async findDistritoParaCorreccion(";

/**
 * SLT-65 (T7.2; R19; design §14) — las lecturas de SLT-65 (design §2.1, filas 1–7) viven en estos
 * archivos, y se barren ENTEROS: `OrdenRepository` deja de mirarse solo en el bloque de SLT-44.
 * `_shared/sin-transaccion-anidada.ts` no entra: no lee ninguna tabla (envuelve el cliente).
 */
const ARCHIVOS_SLT65 = [
  ORDEN_REPOSITORY,
  "lib/repositories/CierreDiaRepository.ts",
  "lib/repositories/ZonaRepository.ts",
  "lib/repositories/_shared/lugar-orden.ts",
];

/** Una marca por archivo de SLT-65 que prueba que el barrido lee la lectura de verdad. */
const LECTURAS_SLT65: Record<string, string[]> = {
  [ORDEN_REPOSITORY]: [
    "marcasDeOrdenes(",
    "async findBaseCobroDevolucion(",
    "async findParaCorreccion(",
    "async contarSinEntregarPorNodoGeografico(",
  ],
  "lib/repositories/CierreDiaRepository.ts": ["export async function leerDescriptivosDeOrdenes(", "deLaEmpresa()"],
  "lib/repositories/ZonaRepository.ts": ["export async function planificarReconciliacion(", "deLaEmpresa()"],
  "lib/repositories/_shared/lugar-orden.ts": ["export function lugarDeLaOrden(", "export function whereLugarEn("],
};

/** Cada mencion de la columna nueva en el texto, tal como esta escrita. */
export function mencionesDelNodoEn(codigo: string): string[] {
  return [...codigo.matchAll(/\bnodo_?geografico_?id\b/gi)].map((m) => m[0]);
}

/**
 * El bloque de `codigo` desde `desde` hasta el cierre del metodo que empieza en `hasta` (la primera
 * linea `  }` tras el). Lanza si falta una de las dos marcas: un bloque vacio dejaria la guardia
 * verde sin mirar nada.
 */
export function bloqueDeLecturas(codigo: string, desde: string, hasta: string): string {
  const inicio = codigo.indexOf(desde);
  const metodo = codigo.indexOf(hasta, inicio);
  if (inicio < 0 || metodo < 0) throw new Error(`no se encontro el bloque ${desde} … ${hasta}`);
  const fin = codigo.indexOf("\n  }\n", metodo);
  if (fin < 0) throw new Error(`no se encontro el cierre de ${hasta}`);
  return codigo.slice(inicio, fin + 4);
}

function leer(rel: string): string {
  return quitarComentarios(readFileSync(path.join(RAIZ, rel), "utf8"));
}

describe("SLT-44 R12 — el detector se prueba a si mismo", () => {
  it("CONTRAPRUEBA (control positivo): la lectura por `distritoId` no es hallazgo", () => {
    expect(mencionesDelNodoEn("tx.zonaDistrito.findMany({ select: { distritoId: true } })")).toEqual([]);
  });

  it("CONTRAPRUEBA: el campo de Prisma y la columna SQL se detectan", () => {
    expect(mencionesDelNodoEn("tx.zonaDistrito.findMany({ select: { nodoGeograficoId: true } })")).toEqual([
      "nodoGeograficoId",
    ]);
    expect(mencionesDelNodoEn("SELECT zd.nodo_geografico_id FROM zona_distrito zd")).toEqual(["nodo_geografico_id"]);
  });

  it("un comentario que nombra la columna no cuenta", () => {
    expect(mencionesDelNodoEn(quitarComentarios("// no `nodo_geografico_id`: el distrito_id\nconst a = 1;"))).toEqual([]);
  });

  it("el bloque de `OrdenRepository` va de la primera lectura al cierre de la ultima, y nada mas", () => {
    const texto = [
      "  async antes() { nodoGeograficoId }",
      "  async findAllProvincias() {",
      "    return 1;",
      "  }",
      "  async findDistritoParaCorreccion(id) {",
      "    return nodoGeograficoId;",
      "  }",
      "  async despues() { nodoGeograficoId }",
      "",
    ].join("\n");
    const bloque = bloqueDeLecturas(texto, DESDE, HASTA);
    expect(bloque.startsWith("async findAllProvincias(")).toBe(true);
    expect(bloque.endsWith("    return nodoGeograficoId;\n  }")).toBe(true);
    expect(mencionesDelNodoEn(bloque)).toEqual(["nodoGeograficoId"]);
    expect(() => bloqueDeLecturas("sin metodos", DESDE, HASTA)).toThrow(/no se encontro/);
  });
});

describe("SLT-44 R12 — las lecturas de la feature no leen la columna nueva", () => {
  it("el barrido lee de verdad (anti-vacuidad)", () => {
    for (const rel of ARCHIVOS) expect(leer(rel).length, rel).toBeGreaterThan(500);
    const bloque = bloqueDeLecturas(leer(ORDEN_REPOSITORY), DESDE, HASTA);
    // Las cuatro lecturas de SLT-44 estan dentro del bloque, y leen el catalogo.
    for (const metodo of ["findAllProvincias", "findCantonesByProvinciaIds", "findDistritosByCantonIds", "findDistritoParaCorreccion"]) {
      expect(bloque).toContain(`async ${metodo}(`);
    }
    expect(bloque).toContain("deLaEmpresa()");
  });

  it("ningun archivo de las lecturas nombra `nodoGeograficoId` ni `nodo_geografico_id`", () => {
    const hallazgos = [
      ...ARCHIVOS.flatMap((rel) => mencionesDelNodoEn(leer(rel)).map((m) => `${rel}: ${m}`)),
      ...mencionesDelNodoEn(bloqueDeLecturas(leer(ORDEN_REPOSITORY), DESDE, HASTA)).map(
        (m) => `${ORDEN_REPOSITORY} (lecturas de SLT-44): ${m}`,
      ),
    ];
    expect(
      hallazgos,
      "el nodo de una asignacion o de una marca se lee de su `distrito_id`: asi la lectura no depende " +
        "del backfill de SLT-43 (R12)",
    ).toEqual([]);
  });
});

describe("SLT-65 R19 — el barrido ampliado se prueba a si mismo", () => {
  it("CONTRAPRUEBA: una mencion FUERA del bloque de SLT-44 la ve el barrido del archivo entero, y no el del bloque", () => {
    const texto = [
      "  async findAllProvincias() {",
      "    return 1;",
      "  }",
      "  async findDistritoParaCorreccion(id) {",
      "    return 2;",
      "  }",
      "  async contarSinEntregarPorNodoGeografico(nivel, id) {",
      "    return tx.orden.count({ where: { nodoGeograficoId: id } });",
      "  }",
      "",
    ].join("\n");
    expect(mencionesDelNodoEn(bloqueDeLecturas(texto, DESDE, HASTA))).toEqual([]);
    expect(mencionesDelNodoEn(texto)).toEqual(["nodoGeograficoId"]);
  });

  it("CONTRAPRUEBA sobre un archivo real: `lugar-orden.ts` nombra la columna en su comentario, y el barrido no lo cuenta", () => {
    const rel = "lib/repositories/_shared/lugar-orden.ts";
    const crudo = readFileSync(path.join(RAIZ, rel), "utf8");
    // Si el comentario dejara de nombrarla, este caso dejaria de probar la exclusion: que lo diga.
    expect(mencionesDelNodoEn(crudo).length, `${rel} ya no nombra la columna en un comentario`).toBeGreaterThan(0);
    expect(mencionesDelNodoEn(leer(rel))).toEqual([]);
  });
});

describe("SLT-65 R19 — las lecturas de SLT-65 no leen la columna nueva (archivos enteros)", () => {
  it("el barrido lee de verdad (anti-vacuidad)", () => {
    for (const rel of ARCHIVOS_SLT65) {
      const codigo = leer(rel);
      expect(codigo.length, rel).toBeGreaterThan(300);
      for (const marca of LECTURAS_SLT65[rel]) expect(codigo, `${rel}: ${marca}`).toContain(marca);
    }
  });

  it("ni `OrdenRepository`, ni `CierreDiaRepository`, ni `ZonaRepository`, ni `lugar-orden` nombran la columna", () => {
    const hallazgos = ARCHIVOS_SLT65.flatMap((rel) => mencionesDelNodoEn(leer(rel)).map((m) => `${rel}: ${m}`));
    expect(
      hallazgos,
      "el lugar de una orden sale de `distrito_id`/`canton_id` y el nodo de una asignacion o de una " +
        "marca de su `distrito_id`: asi la lectura no depende del backfill de SLT-43 (R19)",
    ).toEqual([]);
  });
});
