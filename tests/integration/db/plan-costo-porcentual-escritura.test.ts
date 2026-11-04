import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CostoPorOrdenPorcentual, CrearPlanInput } from "@/lib/types/planes";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { capturar, crearPlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-83 (design §2.1; R1, R2) — el costo por orden porcentual del plan contra Postgres.
//
// T1: los tres CHECK de 20261104150000 rechazan con 23514 lo que llega por SQL a mano (porcentaje fuera
// de rango, mínimo negativo, mínimo sin porcentaje, fijo y porcentual a la vez), y dejan entrar las tres
// formas válidas (vacío, fijo, porcentual con y sin mínimo). Cada caso corre en un SAVEPOINT dentro de
// una transacción que se revierte.
//
// T8 (design §4.2; R1, R2, R4): la escritura por `PlanesService` y `PlanesRepository` REALES. Crear,
// editar de inmediato y programar guardan el modo con la versión; `plan_rastro` deja antes y después en
// forma canónica; una edición sin cambio real no escribe; aplicar el programado deja las columnas; y lo
// que el esquema rechaza no llega a la base.

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

/* -------------------------------------------------------------------------- */
/* T8 — la escritura por el servicio y el rastro (R1, R2, R4)                  */
/* -------------------------------------------------------------------------- */

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-31 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-31T12:00:00.000Z");
/** 2026-12-01 a las 00:00 de la plataforma (−06:00), más un minuto: ya rige. */
const YA_RIGE = new Date("2026-12-01T06:01:00.000Z");

type Modo = { costoPorOrden: string | null; costoPorOrdenPorcentual: CostoPorOrdenPorcentual | null };

function entrada(modo: Modo): CrearPlanInput {
  return {
    nombre: `slt83 ${randomUUID().slice(0, 8)}`,
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "50000", anual: null },
    ...modo,
  };
}

async function preparar(tx: TxDeTest, modo: Modo) {
  await fijarEmpresa(tx, "");
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const e = entrada(modo);
  const creado = await servicio.crear(SUPERADMIN, e);
  if (creado.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(creado)}`);
  const { visibilidad: _v, organizacionId: _o, ...version } = e;
  void _v;
  void _o;
  const editar = (cambio: Partial<Modo>, vigenteDesde: string | null = null) =>
    servicio.editar(SUPERADMIN, { planId: creado.planId, ...version, ...cambio, vigenteDesde });
  return { planId: creado.planId, servicio, editar };
}

/** Las dos claves del rastro que mira esta ficha, en el orden en que se escribieron. */
async function rastro(tx: TxDeTest, planId: string) {
  const filas = await tx.planRastro.findMany({
    where: { planId },
    select: { accion: true, cambios: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return filas.map((f) => {
    const c = f.cambios as Record<string, unknown>;
    return { accion: f.accion, costoPorOrden: c.costoPorOrden, costoPorOrdenPorcentual: c.costoPorOrdenPorcentual };
  });
}

const PORCENTUAL: Modo = { costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" } };

describeSiHayBase("SLT-83 R1, R2, R4 — el modo porcentual se guarda con la versión del plan", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R4: crear un plan porcentual lo guarda en las columnas, el DTO y el rastro de alta, con dos decimales", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, PORCENTUAL);
      const sinMinimo = await preparar(tx, {
        costoPorOrden: null,
        costoPorOrdenPorcentual: { porcentaje: "2.35", minimo: null },
      });
      return {
        columnas: await leer(tx, p.planId),
        dto: (await planesEnTx(tx).plan(p.planId))?.costoPorOrdenPorcentual,
        rastro: await rastro(tx, p.planId),
        columnasSinMinimo: await leer(tx, sinMinimo.planId),
      };
    });
    expect(r.columnas).toEqual({ fijo: null, pct: "2.00", minimo: "500.00" });
    expect(r.dto).toEqual({ porcentaje: "2.00", minimo: "500.00" });
    expect(r.rastro).toEqual([
      {
        accion: "creado",
        costoPorOrden: { antes: null, despues: null },
        costoPorOrdenPorcentual: { antes: null, despues: { porcentaje: "2.00", minimo: "500.00" } },
      },
    ]);
    expect(r.columnasSinMinimo).toEqual({ fijo: null, pct: "2.35", minimo: null });
  });

  it("R4: editar de inmediato pasa de fijo a porcentual y de vuelta, con antes y después en el rastro", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { costoPorOrden: "100", costoPorOrdenPorcentual: null });
      const aPorcentual = await p.editar(PORCENTUAL);
      const enPorcentual = await leer(tx, p.planId);
      const otroPorcentaje = await p.editar({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "5", minimo: null } });
      const enOtro = await leer(tx, p.planId);
      const aFijo = await p.editar({ costoPorOrden: "80", costoPorOrdenPorcentual: null });
      return {
        aPorcentual,
        enPorcentual,
        otroPorcentaje,
        enOtro,
        aFijo,
        final: await leer(tx, p.planId),
        rastro: await rastro(tx, p.planId),
      };
    });
    expect(r.aPorcentual).toMatchObject({ estado: "ok", cambio: true });
    expect(r.enPorcentual).toEqual({ fijo: null, pct: "2.00", minimo: "500.00" });
    expect(r.otroPorcentaje).toMatchObject({ estado: "ok", cambio: true });
    expect(r.enOtro).toEqual({ fijo: null, pct: "5.00", minimo: null });
    expect(r.aFijo).toMatchObject({ estado: "ok", cambio: true });
    expect(r.final).toEqual({ fijo: "80.00", pct: null, minimo: null });
    expect(r.rastro.slice(1)).toEqual([
      {
        accion: "editado",
        costoPorOrden: { antes: "100.00", despues: null },
        costoPorOrdenPorcentual: { antes: null, despues: { porcentaje: "2.00", minimo: "500.00" } },
      },
      {
        accion: "editado",
        costoPorOrden: undefined,
        costoPorOrdenPorcentual: {
          antes: { porcentaje: "2.00", minimo: "500.00" },
          despues: { porcentaje: "5.00", minimo: null },
        },
      },
      {
        accion: "editado",
        costoPorOrden: { antes: null, despues: "80.00" },
        costoPorOrdenPorcentual: { antes: { porcentaje: "5.00", minimo: null }, despues: null },
      },
    ]);
  });

  it("R4: una edición sin cambio real («2» = «2.00», «500» = «500.00») no escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {
        costoPorOrden: null,
        costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: "500.00" },
      });
      const editado = await p.editar(PORCENTUAL);
      return { editado, rastro: await rastro(tx, p.planId) };
    });
    expect(r.editado).toMatchObject({ estado: "ok", cambio: false });
    expect(r.rastro.map((f) => f.accion)).toEqual(["creado"]);
  });

  it("R4: programarlo no toca las columnas; aplicar el programado las deja con el modo nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { costoPorOrden: "100", costoPorOrdenPorcentual: null });
      const programado = await p.editar(PORCENTUAL, "2026-12-01");
      const enEspera = await leer(tx, p.planId);
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({
        where: { planId: p.planId },
        select: { id: true, version: true },
      });
      const aplicado = await planesEnTx(tx).aplicarCambioProgramado(
        { planId: p.planId, cambioId: pendiente.id },
        YA_RIGE,
      );
      return {
        programado,
        enEspera,
        version: pendiente.version,
        aplicado,
        final: await leer(tx, p.planId),
        rastro: await rastro(tx, p.planId),
      };
    });
    expect(r.programado).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2026-12-01" });
    expect(r.enEspera).toEqual({ fijo: "100.00", pct: null, minimo: null });
    expect(r.version).toMatchObject({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" } });
    expect(r.aplicado).toMatchObject({ estado: "aplicado" });
    expect(r.final).toEqual({ fijo: null, pct: "2.00", minimo: "500.00" });
    const aplicada = r.rastro.find((f) => f.accion === "cambio_aplicado");
    expect(aplicada?.costoPorOrden).toEqual({ antes: "100.00", despues: null });
    expect(aplicada?.costoPorOrdenPorcentual).toEqual({ antes: null, despues: { porcentaje: "2.00", minimo: "500.00" } });
  });

  it("R1, R2: fijo y porcentual a la vez, o un porcentaje o mínimo fuera de rango, no escriben nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { costoPorOrden: "100", costoPorOrdenPorcentual: null });
      const ambos = await p.editar({ costoPorOrden: "100", costoPorOrdenPorcentual: { porcentaje: "2", minimo: null } });
      const pctMalo = await p.editar({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "100.01", minimo: null } });
      const minimoMalo = await p.editar({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "-1" } });
      const conAmbos = entrada({ costoPorOrden: "100", costoPorOrdenPorcentual: { porcentaje: "2", minimo: null } });
      const creaAmbos = await p.servicio.crear(SUPERADMIN, conAmbos);
      const planes = await tx.plan.count({ where: { nombre: conAmbos.nombre } });
      return { ambos, pctMalo, minimoMalo, creaAmbos, planes, final: await leer(tx, p.planId), rastro: await rastro(tx, p.planId) };
    });
    expect(r.ambos).toMatchObject({ estado: "validation_error", fieldErrors: { costoPorOrdenPorcentual: expect.any(Array) } });
    expect(r.pctMalo).toMatchObject({
      estado: "validation_error",
      fieldErrors: { "costoPorOrdenPorcentual.porcentaje": expect.any(Array) },
    });
    expect(r.minimoMalo).toMatchObject({
      estado: "validation_error",
      fieldErrors: { "costoPorOrdenPorcentual.minimo": expect.any(Array) },
    });
    expect(r.creaAmbos).toMatchObject({ estado: "validation_error" });
    // El alta rechazada no dejó ningún plan.
    expect(r.planes).toBe(0);
    expect(r.final).toEqual({ fijo: "100.00", pct: null, minimo: null });
    expect(r.rastro.map((f) => f.accion)).toEqual(["creado"]);
  });
});
