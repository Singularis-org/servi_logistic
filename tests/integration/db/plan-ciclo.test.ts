import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { inicioDelCiclo } from "@/lib/planes/ciclo";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { CASOS_CICLO } from "./_fixtures/planes";

// SL-24 (design §3, R20) — `plan_inicio_ciclo` en Postgres, con la MISMA tabla que la gemela TS
// (`tests/unit/utils/ciclo-plan.test.ts`). Los triggers usan la función SQL; si las dos se separan,
// los textos dirían un ciclo distinto del que cuenta la base.
//
// Solo lee: la función es IMMUTABLE y no toca tablas. Los `TIMESTAMP` sin zona se pasan como texto
// sin `Z` para que la zona de la sesión no los mueva.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const sinZona = (iso: string) => iso.replace("T", " ").replace("Z", "");

describeSiHayBase("SL-24 — plan_inicio_ciclo en Postgres (R20)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("control: la función existe y es IMMUTABLE (los triggers la llaman en cada alta)", async () => {
    const filas = await base.$queryRawUnsafe<{ volatilidad: string }[]>(
      `SELECT p.provolatile::text AS volatilidad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'plan_inicio_ciclo' AND n.nspname = 'public'`,
    );
    expect(filas).toEqual([{ volatilidad: "i" }]);
  });

  it.each(CASOS_CICLO)("$caso", async ({ ancla, ahora, inicio }) => {
    const filas = await base.$queryRawUnsafe<{ inicio: string }[]>(
      `SELECT to_char(plan_inicio_ciclo($1::timestamp, $2::timestamp), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS inicio`,
      sinZona(ancla),
      sinZona(ahora),
    );
    expect(filas[0].inicio).toBe(inicio);
    // La gemela TS da lo mismo con la misma fila.
    expect(inicioDelCiclo(new Date(ancla), new Date(ahora)).toISOString()).toBe(filas[0].inicio);
  });
});
