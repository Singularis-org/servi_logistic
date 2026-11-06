import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { finDelPeriodoCalendario, inicioDelDiaPlataforma, inicioDelPeriodoCalendario } from "@/lib/planes/ciclo";
import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { MiPlanService } from "@/lib/services/MiPlanService";
import type { MiPlanResult } from "@/lib/types/consumo-plan";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrden, crearPlanConCosto, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { capturar, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-86 · T9 (design §3.3, §6; R7, R26, R27, R28, R32) — lo que la empresa lee de su período por
// `plan_de_la_empresa`, a través de `MiPlanRepository` y `MiPlanService` («Mi plan»), como `servi_app`.
// El reloj es el real de la base: las fechas esperadas salen de «ahora» con las gemelas TS del período
// de calendario, cuya igualdad con la base mide `plan-ciclo-periodo.test.ts` (R6). Todo se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
const MAESTRO: Actor = { usuarioId: randomUUID(), rol: "maestro" };
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const LEJOS = "2025-01-01 06:00:00";

let base: PrismaClient;

/** Una empresa con el plan de costo fijo 100 y 50 000 al mes, con el tipo y la entrada dados. */
async function empresaConPlan(tx: TxDeTest, tipo: string, entrada: string): Promise<{ e: EmpresaPorcentual; plan: string }> {
  const e = await crearEmpresa(tx);
  const plan = await crearPlanConCosto(tx, { fijo: "100" });
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_tipo_cobro" = $2, "plan_ciclo_ancla_at" = $3::timestamp WHERE "id" = $4`,
    plan,
    tipo,
    entrada,
    e.id,
  );
  return { e, plan };
}

/** «Mi plan» como lo pide la app: `servi_app`, en la empresa; vuelve al dueño al terminar. */
async function miPlan(tx: TxDeTest, organizacionId: string, ahora: Date): Promise<MiPlanResult> {
  await comoApp(tx, organizacionId);
  const r = await new MiPlanService(new MiPlanRepository(tx), () => ahora).ver(MAESTRO);
  await tx.$executeRawUnsafe(`SELECT set_config('role', 'none', true)`);
  return r;
}

async function crudo(tx: TxDeTest, organizacionId: string): Promise<Record<string, unknown> | null> {
  await comoApp(tx, organizacionId);
  const [f] = await tx.$queryRawUnsafe<{ p: unknown }[]>(`SELECT plan_de_la_empresa($1) AS p`, organizacionId);
  await tx.$executeRawUnsafe(`SELECT set_config('role', 'none', true)`);
  return (typeof f.p === "string" ? JSON.parse(f.p) : f.p) as Record<string, unknown> | null;
}

/** Lleva el `created_at` de la orden a un instante dado (UTC sin zona, como la app). */
const moverOrden = (tx: TxDeTest, id: string, instante: Date) =>
  tx.$executeRawUnsafe(`UPDATE "orden" SET "created_at" = $2::timestamp WHERE "id" = $1`, id, instante.toISOString().replace("Z", ""));

const ultimoDia = (finExclusivo: Date) => fechaCalendarioCR(new Date(finExclusivo.getTime() - 1));

describeSiHayBase("SLT-86 — plan_de_la_empresa y «Mi plan» con el período de calendario (R7, R26, R27, R28, R32)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R7, R27: quincenal que entra hoy — el período en curso va de la entrada al fin de la quincena; solo cuentan las órdenes desde la entrada", async () => {
    const ahora = new Date();
    const hoy = fechaCalendarioCR(ahora);
    const entrada = inicioDelDiaPlataforma(hoy);
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaConPlan(tx, "quincenal", `${hoy} 06:00:00`);
      const antes = await crearOrden(tx, e);
      await moverOrden(tx, antes, new Date(entrada.getTime() - 1));
      await crearOrden(tx, e);
      return { mi: await miPlan(tx, e.id, ahora), json: await crudo(tx, e.id) };
    });
    const fin = finDelPeriodoCalendario("quincenal", ahora);
    const esTramo = entrada.getTime() > inicioDelPeriodoCalendario("quincenal", ahora).getTime();
    if (r.mi.estado !== "ok" || r.mi.plan === null) throw new Error("se esperaba un plan");
    expect(r.mi.plan.cobro.periodo).toEqual({ desde: hoy, hasta: ultimoDia(fin), esTramo });
    expect(r.mi.plan.cobro.siguienteCobro).toBe(fechaCalendarioCR(fin));
    expect(r.mi.plan.reinicio.fecha).toBe(fechaCalendarioCR(fin));
    // R7: la de un milisegundo antes de la entrada no cuenta; la de ahora sí.
    expect(r.mi.plan.ordenesDelPeriodo).toBe(1);
    expect(r.json?.ciclo_inicio).toBe(entrada.toISOString().replace("Z", "").replace(".000", ""));
    expect(r.json?.ciclo_fin).toBe(fin.toISOString().replace("Z", "").replace(".000", ""));
  });

  it("R7: con período de calendario completo, la orden del período anterior no cuenta y el conteo empieza en 0 al cambiar de período", async () => {
    const ahora = new Date();
    const inicio = inicioDelPeriodoCalendario("mensual", ahora);
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaConPlan(tx, "mensual", LEJOS);
      const anterior = await crearOrden(tx, e);
      await moverOrden(tx, anterior, new Date(inicio.getTime() - 1));
      const sinOrdenes = await miPlan(tx, e.id, ahora);
      const enElBorde = await crearOrden(tx, e);
      await moverOrden(tx, enElBorde, inicio);
      return { sinOrdenes, conUna: await miPlan(tx, e.id, ahora) };
    });
    if (r.sinOrdenes.estado !== "ok" || r.sinOrdenes.plan === null) throw new Error("se esperaba un plan");
    if (r.conUna.estado !== "ok" || r.conUna.plan === null) throw new Error("se esperaba un plan");
    expect(r.sinOrdenes.plan.ordenesDelPeriodo).toBe(0);
    expect(r.conUna.plan.ordenesDelPeriodo).toBe(1);
    expect(r.conUna.plan.cobro.periodo).toEqual({ desde: fechaCalendarioCR(inicio), hasta: ultimoDia(finDelPeriodoCalendario("mensual", ahora)), esTramo: false });
  });

  it("R28: en modo fijo, el total es el costo del período más las órdenes del período por el costo por orden", async () => {
    const ahora = new Date();
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaConPlan(tx, "mensual", LEJOS);
      await crearOrden(tx, e);
      await crearOrden(tx, e);
      return miPlan(tx, e.id, ahora);
    });
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");
    expect(r.plan.cobro.costo).toBe("50000.00");
    expect(r.plan.costeo).toMatchObject({
      modo: "fijo",
      base: { tipo: "monto", periodo: "50000.00" },
      costoPorOrden: "100.00",
      ordenes: 2,
      subtotalOrdenes: "200.00",
      total: "50200.00",
    });
  });

  it("R26, R27, R32: el pendiente de la empresa llega sin actor; el siguiente cobro es su fecha", async () => {
    const ahora = new Date();
    const futura = fechaCalendarioCR(new Date(ahora.getTime() + 10 * UN_DIA_MS));
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaConPlan(tx, "mensual", LEJOS);
      const otro = await crearPlanConCosto(tx, { fijo: "100" });
      await tx.$executeRawUnsafe(`UPDATE "plan" SET "nombre" = 'Plan que entra' WHERE "id" = $1`, otro);
      const efecto = { clase: "cambio", fecha: futura, desde: inicioDelDiaPlataforma(futura), elegida: true } as const;
      await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', '', true)`);
      const res = await planesEnTx(tx).asignar(e.id, otro, SUPERADMIN.usuarioId, efecto, "bimestral", ahora);
      return { res, json: await crudo(tx, e.id), mi: await miPlan(tx, e.id, ahora) };
    });
    expect(r.res).toMatchObject({ estado: "ok", pendiente: true });
    expect(r.json?.cambio_empresa).toEqual({
      plan_nombre: "Plan que entra",
      tipo_cobro: "bimestral",
      desde: inicioDelDiaPlataforma(futura).toISOString().replace("Z", "").replace(".000", ""),
    });
    expect(JSON.stringify(r.json)).not.toContain(SUPERADMIN.usuarioId);
    expect(JSON.stringify(r.json)).not.toContain("actor");
    if (r.mi.estado !== "ok" || r.mi.plan === null) throw new Error("se esperaba un plan");
    const pendiente = { planNombre: "Plan que entra", tipo: "bimestral", desde: futura };
    expect(r.mi.plan.cobro.pendiente).toEqual(pendiente);
    expect(r.mi.plan.cobro.siguienteCobro).toBe(futura);
    expect(r.mi.pendienteSinPlan).toBeNull();
  });

  it("R26 sin plan: «Mi plan» recibe plan null y la primera asignación pendiente, sin actor", async () => {
    const ahora = new Date();
    const futura = fechaCalendarioCR(new Date(ahora.getTime() + 7 * UN_DIA_MS));
    const r = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      const plan = await crearPlanConCosto(tx, { fijo: "100" });
      await tx.$executeRawUnsafe(`UPDATE "plan" SET "nombre" = 'Plan nuevo' WHERE "id" = $1`, plan);
      const efecto = { clase: "inicio", fecha: futura, desde: inicioDelDiaPlataforma(futura), elegida: true } as const;
      await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', '', true)`);
      await planesEnTx(tx).asignar(e.id, plan, SUPERADMIN.usuarioId, efecto, "quincenal", ahora);
      return { mi: await miPlan(tx, e.id, ahora), detalle: await planesEnTx(tx).planDeEmpresa(e.id) };
    });
    const pendiente = { planNombre: "Plan nuevo", tipo: "quincenal", desde: futura };
    expect(r.mi).toEqual({ estado: "ok", plan: null, pendienteSinPlan: pendiente });
    // El detalle de empresa del superadmin lee lo mismo (para «Sin límites» y «Cancelar cambio»).
    expect(r.detalle?.plan).toBeNull();
    expect(r.detalle?.pendienteSinPlan).toEqual(pendiente);
  });

  it("R32: pedir la lectura de otra empresa falla con 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const { e: a } = await empresaConPlan(tx, "mensual", LEJOS);
      const { e: b } = await empresaConPlan(tx, "anual", LEJOS);
      await comoApp(tx, a.id);
      return capturar(tx, () => tx.$queryRawUnsafe(`SELECT plan_de_la_empresa($1)`, b.id));
    });
    expect(sqlstateDe(r)).toBe("42501");
  });
});
