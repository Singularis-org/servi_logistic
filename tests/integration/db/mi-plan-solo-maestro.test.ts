import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { MiPlanService } from "@/lib/services/MiPlanService";
import type { MiPlanResult } from "@/lib/types/consumo-plan";
import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearPlanConCosto } from "./_fixtures/cobro-porcentual";
import { revertida } from "./_fixtures/planes";

// SLT-91 (design §7; R2, R4) — en la misma empresa con plan, y con el repositorio real sobre Postgres como
// `servi_app`, el `admin` recibe `forbidden` y el `maestro` su plan. El `maestro` es el control: sin él, un
// `forbidden` no probaría nada, porque también saldría de una empresa sin datos. Todo se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ADMIN: Actor = { usuarioId: randomUUID(), rol: "admin" };
const MAESTRO: Actor = { usuarioId: randomUUID(), rol: "maestro" };

let base: PrismaClient;

/** Una empresa con plan asignado y un mes de período en curso. */
async function empresaConPlan(tx: TxDeTest): Promise<string> {
  const e = await crearEmpresa(tx);
  const plan = await crearPlanConCosto(tx, { fijo: "100" });
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_tipo_cobro" = 'mensual', "plan_ciclo_ancla_at" = '2025-01-01 06:00:00'::timestamp WHERE "id" = $2`,
    plan,
    e.id,
  );
  return e.id;
}

/** «Mi plan» como lo pide la app: `servi_app`, en la empresa; vuelve al dueño al terminar. */
async function miPlan(tx: TxDeTest, organizacionId: string, actor: Actor): Promise<MiPlanResult> {
  await comoApp(tx, organizacionId);
  const r = await new MiPlanService(new MiPlanRepository(tx)).ver(actor);
  await tx.$executeRawUnsafe(`SELECT set_config('role', 'none', true)`);
  return r;
}

describeSiHayBase("SLT-91 — «Mi plan» solo para el maestro, contra Postgres (R2, R4)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2, R4: en la misma empresa con plan, el admin recibe forbidden y el maestro ve el plan", async () => {
    const { delAdmin, delMaestro } = await revertida(base, async (tx) => {
      const organizacionId = await empresaConPlan(tx);
      return {
        delAdmin: await miPlan(tx, organizacionId, ADMIN),
        delMaestro: await miPlan(tx, organizacionId, MAESTRO),
      };
    });

    expect(delAdmin).toEqual({ estado: "forbidden" });
    expect(delMaestro.estado).toBe("ok");
    if (delMaestro.estado !== "ok") throw new Error("se esperaba el plan del maestro");
    expect(delMaestro.plan).not.toBeNull();
  });
});
