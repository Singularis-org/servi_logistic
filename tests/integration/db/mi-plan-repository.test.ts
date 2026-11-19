import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { esSinPlanConPendiente, type LecturaDeMiPlan, type PlanDeLaEmpresaLeido } from "@/lib/interfaces/repositories/IMiPlanRepository";
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
//
// SLT-86 (R10, R15, R32): el precio vigente con sus descuentos, el precio del período (la fila del
// historial que regía al empezar el período, aquí distinta del vigente) y la entrada. El pendiente de la
// empresa y el caso sin plan con pendiente los mide `plan-de-la-empresa-periodo.test.ts`.
//
// SLT-214 (design §3.4; R18, R23): los beneficios de la versión que corre la empresa, los del plan o los de su
// versión propia (`plan_version_empresa`), con su ícono y en orden.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ANCLA = "2026-10-15T09:30:00.123Z";
const VIGENTE_DESDE = "2099-01-01T06:00:00.000Z";

const PENDIENTE: VersionPlan = {
  nombre: "custom A v2",
  topes: { porRol: { adminTienda: 7 }, apiKeys: null },
  modulos: ["monitoreo", "analitica"],
  precio: { tipo: "sin_precio" }, // D1 (ajuste planes-custom): «negociable» ya no existe.
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
};

let base: PrismaClient;

/** La lectura de una empresa con plan; cualquier otra cosa es un fallo del caso. */
function conPlan(r: LecturaDeMiPlan): PlanDeLaEmpresaLeido {
  if (r === null || esSinPlanConPendiente(r)) throw new Error(`se esperaba una empresa con plan: ${JSON.stringify(r)}`);
  return r;
}

/** A con un custom (topes, precio con descuento anual, un módulo y un cambio programado); B sin plan. */
async function escenario(tx: TxDeTest, version: unknown = PENDIENTE): Promise<{ A: string; B: string }> {
  const { id: A } = await crearOrganizacion(tx);
  const { id: B } = await crearOrganizacion(tx);
  const plan = await crearPlan(tx, { custom: A, apiKeys: 4, porRol: { admin: 2, adminTienda: 5 } }); // SLT-66 R1: sin tope de maestro
  // SLT-86 (R33): el anual fijo de 499.00 de antes es un descuento anual de 598.80 − 499.00 = 99.80. La fila
  // del historial de `crearPlan` («sin precio» desde siempre) no se toca: el precio del período es esa.
  await tx.plan.update({
    where: { id: plan },
    data: {
      precioMensual: "49.90",
      modulos: { create: [{ modulo: "analitica" }] },
      descuentos: { create: [{ periodo: "anual", monto: "99.80" }] },
    },
  });
  const cambio = await tx.planCambioProgramado.create({
    data: {
      planId: plan,
      vigenteDesde: new Date(VIGENTE_DESDE),
      version: version as object,
      avisosAlProgramar: [],
      actorUsuarioId: randomUUID(),
      actorNombre: "Superadmin SLT58",
    },
  });
  // SLT-128 (R12, R24): la empresa solo ve el pendiente con su recepción sin recibir; aquí, en F.
  await tx.planCambioRecepcion.create({
    data: { cambioId: cambio.id, empresaId: A, recibeAt: new Date(VIGENTE_DESDE) },
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
    const leido = conPlan(r);
    expect(leido.vigente).toEqual({
      nombre: expect.stringMatching(/^sl24 /),
      topes: { porRol: { admin: 2, adminTienda: 5 }, apiKeys: 4 }, // SLT-66 R1
      modulos: ["analitica"],
      beneficios: [], // SLT-214 (R23): el plan no tiene; la lista va siempre.
      precio: { tipo: "monto", mensual: "49.90", descuentos: { anual: { tipo: "monto", monto: "99.80" } } },
      costoPorOrden: null, // SLT-66 R8: el plan lleva costo por orden; aquí, vacío.
      costoPorOrdenPorcentual: null, // SLT-83: campo nuevo de la versión
    });
    expect(leido.entrada.toISOString()).toBe(ANCLA);
    // SLT-86 (R15): el precio del período sale del historial, no del vigente.
    expect(leido.precioDelPeriodo).toEqual({ tipo: "sin_precio" });
    expect(leido.pendiente).toBeNull();
    expect(leido.uso).toEqual({
      ordenes: 0,
      apiKeys: 0,
      porRol: { admin: 0, mensajero: 0, adminTienda: 1, adminSatelite: 0 }, // SLT-66 R5: sin uso de maestro
    });
    expect(leido.cambio).toEqual({ vigenteDesde: new Date(VIGENTE_DESDE), version: PENDIENTE });
    // D6 (ajuste planes-custom): sin haberlo elegido, la empresa queda en el DEFAULT `mensual`.
    expect(leido.tipoCobro).toBe("mensual");
  });

  it("D6 (ajuste planes-custom) — el tipo de cobro de la empresa llega por plan_de_la_empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'anual' WHERE "id" = $1`, e.A);
      await comoApp(tx, e.A);
      return new MiPlanRepository(tx).planDeLaEmpresa();
    });
    expect(conPlan(r).tipoCobro).toBe("anual");
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
      const e = await escenario(tx, { nombre: "rota", topes: { ordenesPorCiclo: 50, porRol: {}, apiKeys: null } });
      await comoApp(tx, e.A);
      return capturar(tx, () => new MiPlanRepository(tx).planDeLaEmpresa());
    });
    expect(String((r as Error).message)).toContain("MiPlanRepository.planDeLaEmpresa: plan_de_la_empresa devolvió una forma inesperada");
  });

  describe("SLT-214 R23, R18 — los beneficios de la versión que corre la empresa", () => {
    const DEL_PLAN = [
      { icono: "soporte", texto: "Soporte 24 h" },
      { icono: "camion", texto: "Envíos prioritarios" },
    ];
    const PROPIOS = [
      { icono: "rayo", texto: "Acceso anticipado" },
      { icono: "soporte", texto: "Soporte 24 h" },
    ];

    /** El escenario con beneficios en el plan de A y, si se pide, una versión propia de A con `version`. */
    async function conBeneficios(tx: TxDeTest, propia?: Record<string, unknown>): Promise<string> {
      const e = await escenario(tx);
      const { planId } = await tx.organizacion.findUniqueOrThrow({ where: { id: e.A }, select: { planId: true } });
      if (planId === null) throw new Error("A sin plan");
      // Al revés a propósito: el orden lo da `posicion`.
      for (let i = DEL_PLAN.length - 1; i >= 0; i--) {
        await tx.planBeneficio.create({ data: { planId, posicion: i, ...DEL_PLAN[i] } });
      }
      if (propia !== undefined) {
        await tx.planVersionEmpresa.create({
          data: { empresaId: e.A, planId, cambioId: randomUUID(), version: propia as object, desdeAt: new Date(ANCLA) },
        });
      }
      return e.A;
    }

    it("R23: sin versión propia, los del plan, con su ícono y en orden", async () => {
      const r = await revertida(base, async (tx) => {
        const A = await conBeneficios(tx);
        await comoApp(tx, A);
        return new MiPlanRepository(tx).planDeLaEmpresa();
      });
      expect(conPlan(r).vigente.beneficios).toEqual(DEL_PLAN);
    });

    it("R23: con una versión propia durante un cambio a medias, los de esa versión", async () => {
      const r = await revertida(base, async (tx) => {
        const A = await conBeneficios(tx, { ...PENDIENTE, beneficios: PROPIOS });
        await comoApp(tx, A);
        return new MiPlanRepository(tx).planDeLaEmpresa();
      });
      expect(conPlan(r).vigente).toMatchObject({ nombre: PENDIENTE.nombre, beneficios: PROPIOS });
    });

    it("R18: una versión propia sin `beneficios` (de antes de la ficha) deja los del plan", async () => {
      const r = await revertida(base, async (tx) => {
        const A = await conBeneficios(tx, { ...PENDIENTE });
        await comoApp(tx, A);
        return new MiPlanRepository(tx).planDeLaEmpresa();
      });
      expect(conPlan(r).vigente).toMatchObject({ nombre: PENDIENTE.nombre, beneficios: DEL_PLAN });
    });

    it("R23: una versión propia con la lista vacía deja la empresa sin beneficios", async () => {
      const r = await revertida(base, async (tx) => {
        const A = await conBeneficios(tx, { ...PENDIENTE, beneficios: [] });
        await comoApp(tx, A);
        return new MiPlanRepository(tx).planDeLaEmpresa();
      });
      expect(conPlan(r).vigente.beneficios).toEqual([]);
    });
  });
});
