import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EnqueueOpts, IJobRepository, JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";
import { recurrenciaMoraDiaria, sembrarMoraDiaria } from "@/lib/planes/jobs-mora";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { revertida } from "./_fixtures/planes";

// SLT-121 · T3.2 (design §4.1; R7, R9) — la siembra de `mora_diaria` contra Postgres real, contando filas: sembrar en
// cada despliegue y el re-agendado de la recurrencia caen en la MISMA `dedupe_key` (`mora_diaria:<AAAA-MM-DD>`), así
// que el `ON CONFLICT DO NOTHING` de la cola deja UNA fila por día. Lo exige la guardia
// `jobs-recurrentes-con-siembra` (ficha 313, frente 4). En una transacción del dueño que se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function contarJobs(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "jobs" WHERE "tipo" = 'mora_diaria'`;
  return f.n;
}

describeSiHayBase("SLT-121 — la siembra de `mora_diaria` es idempotente", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R7, R9: la siembra (sembrarMoraDiaria) y su re-agendado dejan UNA fila por día, a las 06:30 UTC (contarJobs)", async () => {
    const r = await revertida(base, async (tx) => {
      // El trabajo es de plataforma: nace sin empresa (DEFAULT de `jobs`).
      await fijarEmpresa(tx, "");
      const real = new JobRepository(base);
      const repo = {
        enqueue: (tipo, payload, opts?: EnqueueOpts) => real.enqueue(tipo, payload, opts, tx as unknown as JobTxClient),
      } as IJobRepository;
      const antes = await contarJobs(tx);
      const primera = await sembrarMoraDiaria(repo, new Date("2026-12-01T01:00:00.000Z"));
      const segunda = await sembrarMoraDiaria(repo, new Date("2026-12-01T05:00:00.000Z"));
      const { runAfter, dedupeKey } = recurrenciaMoraDiaria.siguiente(new Date("2026-12-01T06:29:00.000Z"), []);
      const reencolada = await repo.enqueue("mora_diaria", {}, { runAfter, dedupeKey });
      return { antes, despues: await contarJobs(tx), primera, segunda, reencolada };
    });
    expect(r.primera?.dedupeKey).toBe("mora_diaria:2026-12-01");
    expect(r.primera?.runAfter.toISOString()).toBe("2026-12-01T06:30:00.000Z");
    expect(r.segunda).toBeNull();
    expect(r.reencolada).toBeNull();
    expect(r.despues).toBe(r.antes + 1);
  });
});
