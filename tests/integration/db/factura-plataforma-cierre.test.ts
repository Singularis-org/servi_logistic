import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { EnqueueOpts, IJobRepository, JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";
import { recurrenciaCierreFacturas, sembrarCierreFacturas } from "@/lib/planes/jobs-factura-plataforma";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { revertida } from "./_fixtures/planes";

// SLT-118 · T6.1 (design §4.2; R25) — el cierre de las facturas de la plataforma contra Postgres. Todo en una
// transacción que se revierte.
//
// Por ahora solo la siembra del job recurrente `factura_plataforma_cerrar` (la exige la guardia de la ficha
// 313, `jobs-recurrentes-con-siembra.guardia.test.ts`, frente 4): sembrar dos veces en la misma ventana, y el
// re-agendado de la recurrencia, dejan UNA fila. El resto de T6.1 (R1–R9, R11, R14, R26, R27) se añade aquí.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function contarJobs(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "jobs" WHERE "tipo" = 'factura_plataforma_cerrar'`;
  return f.n;
}

describeSiHayBase("SLT-118 — el cierre de las facturas de la plataforma", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R25: la siembra del cierre (sembrarCierreFacturas) y su re-agendado dejan UNA fila por corrida (contarJobs)", async () => {
    const r = await revertida(base, async (tx) => {
      // El job es de plataforma: nace sin empresa (DEFAULT de `jobs`).
      await fijarEmpresa(tx, "");
      const real = new JobRepository(base);
      const repo = {
        enqueue: (tipo, payload, opts?: EnqueueOpts) => real.enqueue(tipo, payload, opts, tx as unknown as JobTxClient),
      } as IJobRepository;
      const antes = await contarJobs(tx);
      const primera = await sembrarCierreFacturas(repo, new Date("2026-11-01T10:01:00.000Z"));
      const segunda = await sembrarCierreFacturas(repo, new Date("2026-11-01T10:09:00.000Z"));
      const { runAfter, dedupeKey } = recurrenciaCierreFacturas.siguiente(new Date("2026-11-01T10:05:00.000Z"), []);
      const reencolada = await repo.enqueue("factura_plataforma_cerrar", {}, { runAfter, dedupeKey });
      return { antes, despues: await contarJobs(tx), primera, segunda, reencolada };
    });
    expect(r.primera?.dedupeKey).toBe("factura_plataforma_cerrar:2026-11-01T10");
    expect(r.primera?.runAfter.toISOString()).toBe("2026-11-01T10:10:00.000Z");
    expect(r.segunda).toBeNull();
    expect(r.reencolada).toBeNull();
    expect(r.despues).toBe(r.antes + 1);
  });
});
