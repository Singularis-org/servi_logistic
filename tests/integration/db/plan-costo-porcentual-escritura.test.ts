import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { capturar, crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-83 (design §2.1; R1, R2) — el costo por orden porcentual del plan contra Postgres.
//
// T1: los tres CHECK de 20261104150000 rechazan con 23514 lo que llega por SQL a mano (porcentaje fuera
// de rango, mínimo negativo, mínimo sin porcentaje, fijo y porcentual a la vez), y dejan entrar las tres
// formas válidas (vacío, fijo, porcentual con y sin mínimo). Cada caso corre en un SAVEPOINT dentro de
// una transacción que se revierte.
//
// T8 completa este archivo con la escritura por `PlanesService`/`PlanesRepository` y el rastro (R4).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Costo {
  fijo?: string | null;
  pct?: string | null;
  minimo?: string | null;
}

/** Escribe el costo por SQL a mano, como lo haría alguien saltándose el servicio. */
function fijarCosto(tx: TxDeTest, planId: string, c: Costo) {
  return tx.$executeRawUnsafe(
    `UPDATE "plan"
        SET "costo_por_orden" = $2::numeric,
            "costo_por_orden_pct" = $3::numeric,
            "costo_por_orden_minimo" = $4::numeric
      WHERE "id" = $1`,
    planId,
    c.fijo ?? null,
    c.pct ?? null,
    c.minimo ?? null,
  );
}

/** El SQLSTATE y el CHECK que rechazó, o `null` si entró. */
async function intentar(tx: TxDeTest, planId: string, c: Costo): Promise<{ sqlstate: string; check: string | null } | null> {
  const e = await capturar(tx, () => fijarCosto(tx, planId, c));
  if (e === null) return null;
  const check = /plan_costo_por_orden_[a-z_]+/.exec(String((e as { message?: string }).message ?? ""))?.[0] ?? null;
  return { sqlstate: sqlstateDe(e), check };
}

async function leer(tx: TxDeTest, planId: string) {
  const p = await tx.plan.findUniqueOrThrow({
    where: { id: planId },
    select: { costoPorOrden: true, costoPorOrdenPct: true, costoPorOrdenMinimo: true },
  });
  return {
    fijo: p.costoPorOrden?.toFixed(2) ?? null,
    pct: p.costoPorOrdenPct?.toFixed(2) ?? null,
    minimo: p.costoPorOrdenMinimo?.toFixed(2) ?? null,
  };
}

describeSiHayBase("SLT-83 R1, R2 — los CHECK del costo por orden porcentual", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: un plan nuevo nace sin porcentaje ni mínimo (columnas NULL)", async () => {
    const r = await revertida(base, async (tx) => leer(tx, await crearPlan(tx)));
    expect(r).toEqual({ fijo: null, pct: null, minimo: null });
  });

  it("R1: la base rechaza con 23514 un plan fijo y porcentual a la vez", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      const ambos = await intentar(tx, plan, { fijo: "100", pct: "5" });
      const ambosConMinimo = await intentar(tx, plan, { fijo: "0", pct: "5", minimo: "10" });
      return { ambos, ambosConMinimo, despues: await leer(tx, plan) };
    });
    expect(r.ambos).toEqual({ sqlstate: "23514", check: "plan_costo_por_orden_un_modo" });
    expect(r.ambosConMinimo?.sqlstate).toBe("23514");
    expect(r.despues).toEqual({ fijo: null, pct: null, minimo: null });
  });

  it("R1: las tres formas válidas entran (vacío, fijo, porcentual con y sin mínimo)", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      const vacio = await intentar(tx, plan, {});
      const leidoVacio = await leer(tx, plan);
      const fijo = await intentar(tx, plan, { fijo: "150" });
      const leidoFijo = await leer(tx, plan);
      const pct = await intentar(tx, plan, { pct: "2.5" });
      const leidoPct = await leer(tx, plan);
      const pctMin = await intentar(tx, plan, { pct: "2.5", minimo: "1500" });
      const leidoPctMin = await leer(tx, plan);
      return { vacio, leidoVacio, fijo, leidoFijo, pct, leidoPct, pctMin, leidoPctMin };
    });
    expect([r.vacio, r.fijo, r.pct, r.pctMin]).toEqual([null, null, null, null]);
    expect(r.leidoVacio).toEqual({ fijo: null, pct: null, minimo: null });
    expect(r.leidoFijo).toEqual({ fijo: "150.00", pct: null, minimo: null });
    expect(r.leidoPct).toEqual({ fijo: null, pct: "2.50", minimo: null });
    expect(r.leidoPctMin).toEqual({ fijo: null, pct: "2.50", minimo: "1500.00" });
  });

  it.each([
    ["0", "23514"],
    ["-1", "23514"],
    ["100.01", "23514"],
  ])("R2: la base rechaza con 23514 el porcentaje %s (fuera de (0, 100])", async (pct, sqlstate) => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      return { error: await intentar(tx, plan, { pct }), despues: await leer(tx, plan) };
    });
    expect(r.error).toEqual({ sqlstate, check: "plan_costo_por_orden_pct_check" });
    expect(r.despues.pct).toBeNull();
  });

  it.each([["0.01"], ["100"], ["100.00"]])("R2: el porcentaje %s está dentro del rango y entra", async (pct) => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      return { error: await intentar(tx, plan, { pct }), despues: await leer(tx, plan) };
    });
    expect(r.error).toBeNull();
    expect(r.despues.pct).toBe(Number(pct).toFixed(2));
  });

  it("R2: la base rechaza con 23514 un mínimo negativo; el mínimo 0 entra", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      const negativo = await intentar(tx, plan, { pct: "5", minimo: "-0.01" });
      const cero = await intentar(tx, plan, { pct: "5", minimo: "0" });
      return { negativo, cero, despues: await leer(tx, plan) };
    });
    expect(r.negativo).toEqual({ sqlstate: "23514", check: "plan_costo_por_orden_minimo_check" });
    expect(r.cero).toBeNull();
    expect(r.despues).toEqual({ fijo: null, pct: "5.00", minimo: "0.00" });
  });

  it("R2: la base rechaza con 23514 un mínimo sin porcentaje, también junto a un costo fijo", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      const solo = await intentar(tx, plan, { minimo: "10" });
      const conFijo = await intentar(tx, plan, { fijo: "100", minimo: "10" });
      return { solo, conFijo, despues: await leer(tx, plan) };
    });
    expect(r.solo).toEqual({ sqlstate: "23514", check: "plan_costo_por_orden_minimo_check" });
    expect(r.conFijo).toEqual({ sqlstate: "23514", check: "plan_costo_por_orden_minimo_check" });
    expect(r.despues).toEqual({ fijo: null, pct: null, minimo: null });
  });
});
