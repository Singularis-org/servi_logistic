import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { normalizeName } from "@/lib/utils/normalize";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SLT-43 (T2.1, R10; design §2.2) — `geo_normalizar_nombre` (SQL) da lo mismo que `normalizeName`
// (TS). El nombre normalizado de un nodo lo pone la base, y la app compara con el suyo: si difieren,
// el único de hermanos (R9) y las comprobaciones previas de la migración (R14) no dicen lo mismo que
// la pantalla de geografía de SL-20.
//
// `normalize()` y `lower()` dependen del motor y de la configuración regional: por eso se compara
// sobre TODOS los nombres de la geografía de la base, no sobre una muestra, además de una lista de
// casos con tildes, ñ, ü, mayúsculas y espacios.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const CASOS = [
  "San José",
  "  Pérez   Zeledón ",
  "GUANACASTE",
  "Ñuñoa",
  "PEÑAS BLANCAS",
  "Pingüino",
  "Güácimo",
  "ÁÉÍÓÚ àèìòù âêîôû ç",
  "Água", // la tilde ya separada (NFD de entrada)
  "\tTab\nNueva línea ", // tabulador, salto y espacio duro
  "　ideográfico　",
  "Ya normalizado",
  "",
];

let base: PrismaClient;

async function enLaBase(nombres: readonly string[]): Promise<{ x: string; g: string }[]> {
  return base.$queryRawUnsafe<{ x: string; g: string }[]>(
    `SELECT x, geo_normalizar_nombre(x) AS g FROM unnest($1::text[]) WITH ORDINALITY AS u(x, o) ORDER BY o`,
    nombres,
  );
}

describeSiHayBase("SLT-43 R10 — geo_normalizar_nombre = normalizeName", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("es IMMUTABLE: puede respaldar el único de hermanos", async () => {
    const [f] = await base.$queryRawUnsafe<{ volatilidad: string }[]>(
      `SELECT provolatile::text AS volatilidad FROM pg_proc WHERE proname = 'geo_normalizar_nombre'`,
    );
    expect(f?.volatilidad).toBe("i");
  });

  it("igual en cada nombre de provincia, cantón y distrito de la base", async () => {
    const filas = await base.$queryRawUnsafe<{ nombre: string }[]>(
      `SELECT nombre FROM provincia UNION ALL SELECT nombre FROM canton UNION ALL SELECT nombre FROM distrito`,
    );
    // Sin geografía el caso no prueba nada: la base de test trae la de Costa Rica (20260713005000).
    expect(filas.length).toBeGreaterThan(500);
    const resultado = await enLaBase(filas.map((f) => f.nombre));
    const distintos = resultado.filter((f) => f.g !== normalizeName(f.x));
    expect(distintos).toEqual([]);
  });

  it("igual en la lista de casos con tildes, ñ, ü, mayúsculas y espacios", async () => {
    const resultado = await enLaBase(CASOS);
    expect(resultado.map((f) => f.g)).toEqual(CASOS.map(normalizeName));
    // Literal, para que el caso no pase si las dos cambiaran a la vez.
    expect(resultado[1]?.g).toBe("perez zeledon");
    expect(resultado[4]?.g).toBe("penas blancas");
  });

  it("con NULL devuelve NULL (STRICT): el NOT NULL de la columna decide, no la función", async () => {
    const [f] = await base.$queryRawUnsafe<{ g: string | null }[]>(`SELECT geo_normalizar_nombre(NULL) AS g`);
    expect(f?.g).toBeNull();
  });
});
