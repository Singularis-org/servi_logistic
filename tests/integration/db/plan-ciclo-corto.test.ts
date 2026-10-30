import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { inicioDelCicloEnCurso, inicioDelSiguienteCiclo } from "@/lib/planes/ciclo";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { CASOS_CICLO_CORTO } from "./_fixtures/ciclo-corto";

// SLT-58 (design §11.3, R34, R35) — `plan_inicio_ciclo_en_curso` en Postgres, con la MISMA tabla que la
// gemela TS (`tests/unit/utils/ciclo-plan.test.ts`). Los triggers, el cupo y «Mi plan» usan la función
// SQL; la pantalla usa la TS para «Se reinicia». Por cada fila se comprueba además que la base cambia
// de ciclo justo en el «siguiente» de TS: en ese instante da el «siguiente» y un milisegundo antes, el
// ciclo en curso.
//
// Solo lee: la función es IMMUTABLE y no toca tablas. Los `TIMESTAMP` sin zona se pasan como texto
// sin `Z` para que la zona de la sesión no los mueva.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const sinZona = (iso: string) => iso.replace("T", " ").replace("Z", "");
const sinZonaONulo = (iso: string | null) => (iso === null ? null : sinZona(iso));

describeSiHayBase("SLT-58 — plan_inicio_ciclo_en_curso en Postgres (R34, R35)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  async function enCursoEnLaBase(cortoDesde: string | null, ancla: string, ahora: string): Promise<string> {
    const filas = await base.$queryRawUnsafe<{ inicio: string }[]>(
      `SELECT to_char(plan_inicio_ciclo_en_curso($1::timestamp, $2::timestamp, $3::timestamp),
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS inicio`,
      sinZonaONulo(cortoDesde),
      sinZona(ancla),
      sinZona(ahora),
    );
    return filas[0].inicio;
  }

  it("control: la función existe y es IMMUTABLE (los triggers la llaman en cada alta)", async () => {
    const filas = await base.$queryRawUnsafe<{ volatilidad: string }[]>(
      `SELECT p.provolatile::text AS volatilidad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'plan_inicio_ciclo_en_curso' AND n.nspname = 'public'`,
    );
    expect(filas).toEqual([{ volatilidad: "i" }]);
  });

  it.each(CASOS_CICLO_CORTO)("$caso", async ({ ancla, cortoDesde, ahora, enCurso, siguiente }) => {
    // R35: la base y la gemela TS dan el mismo ciclo en curso.
    const enLaBase = await enCursoEnLaBase(cortoDesde, ancla, ahora);
    expect(enLaBase).toBe(enCurso);
    const cortoTs = cortoDesde === null ? null : new Date(cortoDesde);
    expect(inicioDelCicloEnCurso(new Date(ancla), cortoTs, new Date(ahora)).toISOString()).toBe(enLaBase);

    // R35: el «siguiente» de TS es el instante en que la base cambia de ciclo.
    const siguienteTs = inicioDelSiguienteCiclo(new Date(ancla), new Date(ahora)).toISOString();
    expect(siguienteTs).toBe(siguiente);
    expect(await enCursoEnLaBase(cortoDesde, ancla, siguienteTs)).toBe(siguienteTs);
    const unMsAntes = new Date(new Date(siguienteTs).getTime() - 1).toISOString();
    expect(await enCursoEnLaBase(cortoDesde, ancla, unMsAntes)).toBe(enCurso);
  });

  it("R34: el ciclo corto va del instante de la asignación a las 00:00 de la fecha elegida, y desde ahí es mensual en ese día", async () => {
    const asignada = "2026-10-29T15:00:00.000Z";
    const elegida = "2026-11-05T06:00:00.000Z";
    expect(await enCursoEnLaBase(asignada, elegida, "2026-11-05T05:59:59.999Z")).toBe(asignada);
    expect(await enCursoEnLaBase(asignada, elegida, elegida)).toBe(elegida);
    // Elegida el 5: del 5 al 4.
    expect(await enCursoEnLaBase(asignada, elegida, "2026-12-05T05:59:59.999Z")).toBe(elegida);
    expect(await enCursoEnLaBase(asignada, elegida, "2026-12-05T06:00:00.000Z")).toBe("2026-12-05T06:00:00.000Z");
  });
});
