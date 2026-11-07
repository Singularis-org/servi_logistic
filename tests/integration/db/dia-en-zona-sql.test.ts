// SLT-42 · R22, R23 — el día de agrupación en SQL con `AT TIME ZONE` y la zona como parámetro
// (decisión del humano del 2026-11-06, `progress/features/SLT-42.md > Decisiones`, tras bloque 7).
//
// Ejecuta contra Postgres real los dos fragmentos que agrupan por día: `diaDeCargaEnZona` (lo
// comparten `ConteoCargadasPorDiaRepository` y `CohorteCargaRepository`) y
// `diaDelMovimientoEnZona` (`FinanzasDiarioRepository`). Las filas son sintéticas (`VALUES`), con
// el mismo alias y la misma columna que las consultas reales, y la columna es `timestamp` SIN zona
// con el reloj de pared UTC, como `orden.created_at` y `wallet_movimiento.fecha_movimiento`.
//
// Lo que fija: con una zona distinta de CR y en los días de 23 y 25 horas de Nueva York, el día
// que sale del SQL es el de `fechaCalendario` (`calendario-zona.ts`) para cada instante. Un
// desfase fijo —lo que había antes— falla en los casos marcados.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { diaDeCargaEnZona } from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import { diaDelMovimientoEnZona } from "@/lib/repositories/FinanzasDiarioRepository";
import { fechaCalendario } from "@/lib/utils/calendario-zona";
import { ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const NUEVA_YORK = "America/New_York";

/** El reloj de pared UTC del instante, como lo guarda una columna `timestamp` sin zona. */
function paredUtc(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", "");
}

/** [instante, zona, día esperado, ¿un desfase fijo de invierno lo daría mal?] */
const CASOS: readonly (readonly [string, string, string, boolean])[] = [
  // Nueva York, 2026-03-08: día de 23 horas (00:00 EST = 05:00Z; el siguiente, 00:00 EDT = 04:00Z).
  ["2026-03-08T04:59:59.000Z", NUEVA_YORK, "2026-03-07", false],
  ["2026-03-08T05:00:00.000Z", NUEVA_YORK, "2026-03-08", false],
  ["2026-03-09T03:59:59.000Z", NUEVA_YORK, "2026-03-08", false],
  ["2026-03-09T04:30:00.000Z", NUEVA_YORK, "2026-03-09", true],
  // Nueva York, 2026-11-01: día de 25 horas (00:00 EDT = 04:00Z; el siguiente, 00:00 EST = 05:00Z).
  ["2026-11-01T03:59:59.000Z", NUEVA_YORK, "2026-10-31", false],
  ["2026-11-01T04:00:00.000Z", NUEVA_YORK, "2026-11-01", true],
  ["2026-11-02T04:30:00.000Z", NUEVA_YORK, "2026-11-01", false],
  ["2026-11-02T05:00:00.000Z", NUEVA_YORK, "2026-11-02", false],
  // Costa Rica: el mismo resultado que el desfase fijo de antes (00:00 CR = 06:00Z).
  ["2026-08-17T05:59:59.000Z", ZONA_DE_CR, "2026-08-16", false],
  ["2026-08-17T06:00:00.000Z", ZONA_DE_CR, "2026-08-17", false],
];

let base: PrismaClient;

beforeAll(() => {
  base = crearPrismaDeTest();
});

afterAll(async () => {
  await base?.$disconnect();
});

async function diaDeCargaEnSql(iso: string, zona: string): Promise<string> {
  const filas = await base.$queryRaw<{ dia: string }[]>`
    SELECT ${diaDeCargaEnZona(zona)} AS dia
    FROM (VALUES (${paredUtc(iso)}::timestamp)) AS o("created_at")`;
  return filas[0]!.dia;
}

async function diaDelMovimientoEnSql(iso: string, zona: string): Promise<string> {
  const filas = await base.$queryRaw<{ dia: string }[]>`
    SELECT ${diaDelMovimientoEnZona(zona)} AS dia
    FROM (VALUES (${paredUtc(iso)}::timestamp)) AS m("fecha_movimiento")`;
  return filas[0]!.dia;
}

describe("SLT-42 · R23 — los casos marcados distinguen `AT TIME ZONE` de un desfase fijo", () => {
  it("con el desfase de invierno fijo de Nueva York (-5 h), los casos marcados dan otro día", () => {
    const marcados = CASOS.filter(([, , , marcado]) => marcado);
    expect(marcados.length).toBeGreaterThan(0);
    for (const [iso, , esperado] of marcados) {
      const conDesfaseFijo = new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10);
      expect(conDesfaseFijo, iso).not.toBe(esperado);
    }
  });
});

describeSiHayBase("SLT-42 · R22, R23 — día por zona en SQL (`AT TIME ZONE` parametrizado)", () => {
  it.each(CASOS)("orden.created_at %s en %s → %s", async (iso, zona, esperado) => {
    expect(fechaCalendario(new Date(iso), zona)).toBe(esperado); // el SQL y el servidor coinciden
    expect(await diaDeCargaEnSql(iso, zona)).toBe(esperado);
  });

  it.each(CASOS)("wallet_movimiento.fecha_movimiento %s en %s → %s", async (iso, zona, esperado) => {
    expect(await diaDelMovimientoEnSql(iso, zona)).toBe(esperado);
  });

  it("el día de 25 horas de Nueva York agrupa sus 25 horas en una sola fila", async () => {
    const instantes = ["2026-11-01T04:00:00.000Z", "2026-11-01T12:00:00.000Z", "2026-11-02T04:30:00.000Z"];
    const filas = Prisma.join(instantes.map((iso) => Prisma.sql`(${paredUtc(iso)}::timestamp)`));
    const grupos = await base.$queryRaw<{ dia: string; n: number }[]>`
      SELECT ${diaDeCargaEnZona(NUEVA_YORK)} AS dia, COUNT(*)::int AS n
      FROM (VALUES ${filas}) AS o("created_at")
      GROUP BY 1
      ORDER BY 1`;
    expect(grupos).toEqual([{ dia: "2026-11-01", n: 3 }]);
  });

  it("la zona viaja como parámetro: una zona inexistente la rechaza Postgres, no se interpola", async () => {
    await expect(diaDeCargaEnSql("2026-08-17T06:00:00.000Z", "Zona/Inventada'; --")).rejects.toThrow();
  });
});
