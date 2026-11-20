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
