import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { JobRepository } from "@/lib/repositories/JobRepository";

// SLT-74 — `JobRepository.findPendienteByDedupeKey`, la lectura del aviso de recogida insuficiente.
// Prisma va mockeado (patron de tests/integration/repositories: la suite no levanta Postgres). Aqui
// se afirma la FORMA del SQL; el aislamiento real contra Postgres (RLS + filtro) esta en
// `tests/integration/db/job-primera-recogida-sql-real.test.ts`.

const CLAVE = "ruta-opt:primera-recogida:m-1:2026-07-20";
const RUN_AFTER = new Date("2026-07-20T12:05:00.000Z");

function fila(): Record<string, unknown> {
  return {
    id: "j-1",
    tipo: "optimizacion_ruta",
    payload: { mensajeroId: "m-1", origen: "recogida_parcial" },
    estado: "pending",
    intentos: 0,
    max_intentos: 3,
    run_after: RUN_AFTER,
    locked_at: null,
    last_error: null,
    dedupe_key: CLAVE,
    created_at: RUN_AFTER,
    updated_at: RUN_AFTER,
    organizacion_id: "emp-1",
  };
}

function prismaQueDevuelve(filas: Record<string, unknown>[]) {
  const $queryRaw = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>(
    async () => filas,
  );
  return { prisma: { $queryRaw } as unknown as PrismaClient, $queryRaw };
}

describe("SLT-74 — findPendienteByDedupeKey", () => {
  it("el SQL busca por igualdad de clave, solo `pending` y filtrado por la empresa en curso", async () => {
    const { prisma, $queryRaw } = prismaQueDevuelve([]);
    await new JobRepository(prisma).findPendienteByDedupeKey(CLAVE);

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = $queryRaw.mock.calls[0];
    const sql = (strings as unknown as string[]).join(" ");
    expect(sql).toMatch(/FROM "jobs"/);
    expect(sql).toMatch(/"dedupe_key" = /);
    expect(values).toEqual([CLAVE]); // la clave va parametrizada, nunca concatenada
    expect(sql).toMatch(/"estado" = 'pending'/);
    // El mismo predicado que la RLS `jobs_por_empresa`: sin empresa fijada no ve nada.
    expect(sql).toMatch(
      /"organizacion_id" = NULLIF\(current_setting\('app\.organizacion_id', true\), ''\)/,
    );
    expect(sql).not.toMatch(/LIKE/);
  });

  it("devuelve el job como DTO, con su `runAfter`", async () => {
    const { prisma } = prismaQueDevuelve([fila()]);
    const job = await new JobRepository(prisma).findPendienteByDedupeKey(CLAVE);
    expect(job).toMatchObject({ id: "j-1", estado: "pending", runAfter: RUN_AFTER, dedupeKey: CLAVE });
  });

  it("sin fila -> null", async () => {
    const { prisma } = prismaQueDevuelve([]);
    expect(await new JobRepository(prisma).findPendienteByDedupeKey(CLAVE)).toBeNull();
  });
});
