import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { esSinPlanConPendiente, type LecturaDeMiPlan, type PlanDeLaEmpresaLeido } from "@/lib/interfaces/repositories/IMiPlanRepository";
import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { costoDelPeriodoEnCurso } from "@/lib/planes/cobro";
import { planConConsumo } from "@/lib/planes/consumo";
import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import {
  anular,
  asignar,
  cambiarEstado,
  crearEmpresa,
  crearOrden,
  crearPlanConCosto,
  type EmpresaPorcentual,
} from "./_fixtures/cobro-porcentual";
import { asignarPlan, capturar, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-83 (design §2.3, §4.3; R23, R24, R25) — lo cobrado en el ciclo y las órdenes sin estado final, por
// las tres lecturas: `plan_de_la_empresa` cruda, `MiPlanRepository` («Mi plan») y
// `PlanesRepository.planDeEmpresa` (detalle de empresa del superadmin). Todo como dueño en una
// transacción que se revierte; las condiciones y los movimientos los escribe el trigger.
//
// P1 (opción A): cuentan los cargos y reversos cuyo INSTANTE cae en el ciclo en curso. Para poner un
// movimiento en el ciclo anterior se le cambia `ocurrido_at` como dueño: dentro de una transacción
// `now()` no avanza, así que no hay otra forma de separar dos movimientos en el tiempo.
//
// El ancla va diez días atrás: `ocurrido_at` toma la zona de la sesión (la base local está en
// America/Bogota, Supabase en UTC) y el ciclo se cuenta en UTC; con días de margen el caso no depende de
// esa diferencia de horas (`progress/impl_SLT-83.md > Guardias al cierre de la Tanda A`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** SLT-86 (R26): la lectura de una empresa con plan; sin plan es un fallo del caso. */
function conPlan(r: LecturaDeMiPlan): PlanDeLaEmpresaLeido {
  if (r === null || esSinPlanConPendiente(r)) throw new Error("A tiene plan");
  return r;
}

/** Lleva la fecha de alta de una orden al ciclo anterior (el ancla está a 10 días). */
async function alCicloAnterior(tx: TxDeTest, ordenId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "orden" SET "created_at" = (now() AT TIME ZONE 'UTC') - interval '15 days' WHERE "id" = $1`,
    ordenId,
  );
}

/** Lleva los movimientos de una orden al ciclo anterior. */
async function movimientosAlCicloAnterior(tx: TxDeTest, ordenId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "cobro_plataforma_movimiento" SET "ocurrido_at" = (now() AT TIME ZONE 'UTC') - interval '12 days'
      WHERE "orden_id" = $1`,
    ordenId,
  );
}

async function conteos(tx: TxDeTest) {
  const [f] = await tx.$queryRawUnsafe<{ movimientos: number; wallet: number }[]>(
    `SELECT (SELECT count(*)::int FROM "cobro_plataforma_movimiento") AS movimientos,
            (SELECT count(*)::int FROM "wallet_movimiento") AS wallet`,
  );
  return f;
}

/**
 * La empresa A con el plan al 2 % (mínimo 500) y el ancla a 10 días, y sus órdenes:
 *   · `deAntes`: creada el ciclo anterior, entregada en este con 100.000 → cargo de 2.000 en el ciclo;
 *   · `revertida`: entregada con 10.000 (cargo de 500) en el ciclo anterior, y sacada del estado final en
 *     este → reverso de 500 en el ciclo, y vuelve a estar pendiente;
 *   · `pendiente`: del ciclo, sin estado final;
 *   · `anulada`: del ciclo, sin estado final y anulada → no cuenta;
 *   · `pendienteDeAntes`: del ciclo anterior, sin estado final → no cuenta.
 * Lo cobrado en el ciclo: 2.000 − 500 = 1.500,00; pendientes: 2.
 */
async function escenario(tx: TxDeTest): Promise<EmpresaPorcentual> {
  const a = await crearEmpresa(tx);
  const plan = await crearPlanConCosto(tx, { pct: "2", minimo: "500" });
  await asignar(tx, a, plan);
  await asignarPlan(tx, a.id, plan, "10 days");

  const deAntes = await crearOrden(tx, a, { estado: "en_reparto", montoCobrar: "100000" });
  await alCicloAnterior(tx, deAntes);
  await cambiarEstado(tx, deAntes, "entregado");

  const revertidaId = await crearOrden(tx, a, { montoCobrar: "10000" });
  await cambiarEstado(tx, revertidaId, "entregado");
  await movimientosAlCicloAnterior(tx, revertidaId);
  await cambiarEstado(tx, revertidaId, "en_reparto");

  await crearOrden(tx, a, { montoCobrar: "50000" });
  const anulada = await crearOrden(tx, a, { montoCobrar: "50000" });
  await anular(tx, anulada, true);
  const pendienteDeAntes = await crearOrden(tx, a, { montoCobrar: "50000" });
  await alCicloAnterior(tx, pendienteDeAntes);
  return a;
}

async function planCrudo(tx: TxDeTest, organizacionId: string) {
  const filas = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, organizacionId);
  const crudo = filas[0].plan;
  return (typeof crudo === "string" ? JSON.parse(crudo) : crudo) as Record<string, unknown>;
}

describeSiHayBase("SLT-83 R23, R24 — lo cobrado en el ciclo y las órdenes sin estado final", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R24: plan_de_la_empresa cuenta por la fecha del movimiento y las pendientes del ciclo", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await escenario(tx);
      await comoApp(tx, a.id);
      return planCrudo(tx, a.id);
    });
    expect(r.cobro_ciclo).toEqual({ cobrado: "1500.00", pendientes: 2 });
    expect(r.costo_vigente).toEqual({ monto: null, fuente: "plan", porcentaje: "2.00", minimo: "500.00" });
    expect(r.costo_por_orden_pct).toBe("2.00");
    expect(r.costo_por_orden_minimo).toBe("500.00");
  });

  it("R24: lo cobrado puede ser negativo (un reverso del ciclo de un cargo anterior) y sale con signo", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await crearEmpresa(tx);
      const plan = await crearPlanConCosto(tx, { pct: "2", minimo: null });
      await asignar(tx, a, plan);
      await asignarPlan(tx, a.id, plan, "10 days");
      const o = await crearOrden(tx, a, { montoCobrar: "12345" });
      await cambiarEstado(tx, o, "entregado");
      await movimientosAlCicloAnterior(tx, o);
      await cambiarEstado(tx, o, "en_reparto");
      await comoApp(tx, a.id);
      return { crudo: await planCrudo(tx, a.id), leido: await new MiPlanRepository(tx).planDeLaEmpresa() };
    });
    expect(r.crudo.cobro_ciclo).toEqual({ cobrado: "-246.90", pendientes: 1 });
    expect(conPlan(r.leido).cobroCiclo).toEqual({ cobrado: "-246.90", pendientes: 1 });
  });

  it("R23, R24: «Mi plan» (MiPlanRepository) lee el modo, lo cobrado y las pendientes, y arma el total base + cobrado", async () => {
    const AHORA = new Date();
    const r = await revertida(base, async (tx) => {
      const a = await escenario(tx);
      await comoApp(tx, a.id);
      return conPlan(await new MiPlanRepository(tx).planDeLaEmpresa());
    });
    expect(r.vigente.costoPorOrden).toBeNull();
    expect(r.vigente.costoPorOrdenPorcentual).toEqual({ porcentaje: "2.00", minimo: "500.00" });
    expect(r.costoVigente).toEqual({ modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" });
    expect(r.cobroCiclo).toEqual({ cobrado: "1500.00", pendientes: 2 });
    // SLT-86 (R28): la base es el costo del período en curso o de su tramo (la entrada va diez días atrás:
    // según el día del mes es tramo o período completo); el total, base + lo cobrado en el período.
    const costoBase = costoDelPeriodoEnCurso({ tipo: "monto", mensual: "50000.00", descuentos: {} }, "mensual", r.entrada, AHORA) as string;
    expect(planConConsumo(r, AHORA).costeo).toEqual({
      modo: "porcentual",
      base: { tipo: "monto", periodo: costoBase },
      porcentaje: "2.00",
      minimo: "500.00",
      cobrado: "1500.00",
      pendientes: 2,
      total: aTexto(aCentimos(costoBase) + aCentimos("1500.00")),
      sinCostoConcreto: false,
    });
  });

  it("R23, R24: el detalle de empresa del superadmin (PlanesRepository.planDeEmpresa) lee lo mismo", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await escenario(tx);
      return planesEnTx(tx).planDeEmpresa(a.id);
    });
    expect(r?.plan?.costoVigente).toEqual({ modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" });
    expect(r?.plan?.cobroCiclo).toEqual({ cobrado: "1500.00", pendientes: 2 });
    expect(r?.plan?.vigente.costoPorOrdenPorcentual).toEqual({ porcentaje: "2.00", minimo: "500.00" });
  });

  it("R24: una empresa con plan fijo lee su costo fijo y lo cobrado en el ciclo, sin pendientes porcentuales", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await crearEmpresa(tx);
      const plan = await crearPlanConCosto(tx, { fijo: "100" });
      await asignar(tx, a, plan);
      await asignarPlan(tx, a.id, plan, "10 days");
      await crearOrden(tx, a, { montoCobrar: "50000" });
      await comoApp(tx, a.id);
      return conPlan(await new MiPlanRepository(tx).planDeLaEmpresa());
    });
    expect(r.costoVigente).toEqual({ modo: "fijo", monto: "100.00", fuente: "plan" });
    expect(r.cobroCiclo).toEqual({ cobrado: "100.00", pendientes: 0 });
  });
});

describeSiHayBase("SLT-83 R25 — leer el costeo no escribe y solo lee la empresa propia", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R25: «Mi plan» y el detalle de empresa no escriben movimientos ni wallet", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await escenario(tx);
      const antes = await conteos(tx);
      await planesEnTx(tx).planDeEmpresa(a.id);
      await comoApp(tx, a.id);
      await new MiPlanRepository(tx).planDeLaEmpresa();
      await planCrudo(tx, a.id);
      await tx.$executeRawUnsafe(`SELECT set_config('role', 'none', true)`);
      return { antes, despues: await conteos(tx) };
    });
    expect(r.despues).toEqual(r.antes);
  });

  it("R25: pedir el de otra empresa da 42501, y plan_cobro_del_ciclo está cerrada a servi_app", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await escenario(tx);
      const { id: b } = await crearOrganizacion(tx);
      await comoApp(tx, b);
      const otra = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT plan_de_la_empresa($1)`, a.id));
      await comoApp(tx, a.id);
      const ciclo = await capturar(tx, () =>
        tx.$queryRawUnsafe(`SELECT * FROM plan_cobro_del_ciclo($1, (now() AT TIME ZONE 'UTC')::timestamp)`, a.id),
      );
      const propia = await capturar(tx, () => planCrudo(tx, a.id));
      return { otra, ciclo, propia };
    });
    expect(sqlstateDe(r.otra)).toBe("42501");
    expect(sqlstateDe(r.ciclo)).toBe("42501");
    expect(r.propia).toBeNull();
  });
});
