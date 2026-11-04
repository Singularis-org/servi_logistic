import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import type { VersionPlan } from "@/lib/types/planes";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-58 · T3 (design §3.1) — `MiPlanRepository` contra el SQL REAL de `plan_de_la_empresa`, como
// `servi_app` (`comoApp`). Lo que el unit test del servicio no ve: que el `jsonb` real pasa el esquema
// zod y se mapea bien — `'Admin Tienda'` a `adminTienda` en topes y uso, los importes como texto, el
// `TIMESTAMP` sin zona como instante UTC, la versión pendiente validada — y que la empresa sale del
// contexto (R9), no de un argumento. Todo en una transacción que siempre se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ANCLA = "2026-10-15T09:30:00.123Z";
const VIGENTE_DESDE = "2099-01-01T06:00:00.000Z";

const PENDIENTE: VersionPlan = {
  nombre: "custom A v2",
  topes: { ordenesPorCiclo: 50, porRol: { adminTienda: 7 }, apiKeys: null },
  modulos: ["monitoreo", "analitica"],
  precio: { tipo: "negociable" },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
};

let base: PrismaClient;

/** A con un custom (topes, precio con anual fijo, un módulo y un cambio programado); B sin plan. */
async function escenario(tx: TxDeTest, version: unknown = PENDIENTE): Promise<{ A: string; B: string }> {
  const { id: A } = await crearOrganizacion(tx);
  const { id: B } = await crearOrganizacion(tx);
  const plan = await crearPlan(tx, { custom: A, ordenes: 1000, apiKeys: 4, porRol: { admin: 2, adminTienda: 5 } }); // SLT-66 R1: sin tope de maestro
  await tx.plan.update({
    where: { id: plan },
    data: { precioMensual: "49.90", precioAnual: "499.00", modulos: { create: [{ modulo: "analitica" }] } },
  });
  await tx.planCambioProgramado.create({
    data: {
      planId: plan,
      vigenteDesde: new Date(VIGENTE_DESDE),
      version: version as object,
      avisosAlProgramar: [],
      actorUsuarioId: randomUUID(),
      actorNombre: "Superadmin SLT58",
    },
  });
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = $2::timestamp WHERE "id" = $3`,
    plan,
    ANCLA.replace("Z", ""),
    A,
  );
  await fijarEmpresa(tx, A);
  await crearUsuarioDePrueba(tx, "adminTienda");
  await crearUsuarioDePrueba(tx, "maestro");
  return { A, B };
}

describeSiHayBase("SLT-58 — MiPlanRepository: el plan de la empresa del contexto (R1, R2, R6, R7, R9)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1, R2, R7 — mapea el jsonb real: topes y uso con adminTienda, precio como texto, ancla UTC y la versión pendiente", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await comoApp(tx, e.A);
      return new MiPlanRepository(tx).planDeLaEmpresa();
    });
    expect(r).not.toBeNull();
    const leido = r as NonNullable<typeof r>;
    expect(leido.vigente).toEqual({
      nombre: expect.stringMatching(/^sl24 /),
      topes: { ordenesPorCiclo: 1000, porRol: { admin: 2, adminTienda: 5 }, apiKeys: 4 }, // SLT-66 R1
      modulos: ["analitica"],
      precio: { tipo: "monto", mensual: "49.90", anual: { tipo: "fijo", monto: "499.00" } },
      costoPorOrden: null, // SLT-66 R8: el plan lleva costo por orden; aquí, vacío.
    });
    expect(leido.ancla.toISOString()).toBe(ANCLA);
    expect(leido.uso).toEqual({
      ordenes: 0,
      apiKeys: 0,
      porRol: { admin: 0, mensajero: 0, adminTienda: 1, adminSatelite: 0 }, // SLT-66 R5: sin uso de maestro
    });
    expect(leido.cambio).toEqual({ vigenteDesde: new Date(VIGENTE_DESDE), version: PENDIENTE });
  });

  it("R6 — una empresa sin plan da null", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await comoApp(tx, e.B);
      return new MiPlanRepository(tx).planDeLaEmpresa();
    });
    expect(r).toBeNull();
  });

  it("R9 — sin empresa en el contexto la base lo rechaza con 42501", async () => {
    const r = await revertida(base, async (tx) => {
      await escenario(tx);
      await comoApp(tx, "");
      return capturar(tx, () => new MiPlanRepository(tx).planDeLaEmpresa());
    });
    expect(sqlstateDe(r)).toBe("42501");
  });

  it("borde: una versión pendiente que no pasa versionPlanSchema no se pinta, se rechaza con contexto", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx, { nombre: "rota", topeOrdenesCiclo: 50 });
      await comoApp(tx, e.A);
      return capturar(tx, () => new MiPlanRepository(tx).planDeLaEmpresa());
    });
    expect(String((r as Error).message)).toContain("MiPlanRepository.planDeLaEmpresa: plan_de_la_empresa devolvió una forma inesperada");
  });
});
