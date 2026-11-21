import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import {
  asignar,
  cambiarEstado,
  condicionDe,
  crearEmpresa,
  crearOrden,
  crearPlanConCosto,
  movimientos,
  type CostoDelPlan,
  type EmpresaPorcentual,
} from "./_fixtures/cobro-porcentual";
import { revertida } from "./_fixtures/planes";

// SLT-126 (design §5.1; R5, R11) — la regla vigente sin valor propio, sobre la base migrada entera:
// plan porcentual > plan fijo > global > 0.00 «sin_configurar». Cada rama con una empresa nueva, en una
// transacción del dueño que se revierte; el cargo lo escribe el trigger de alta.
//
// R11: la lectura del cobro vigente sale de la misma `cobro_plataforma_tarifa_de` que el cargo. El listado
// de Plataforma > Empresas la llama directamente (`EmpresasPlataformaRepository`), y «Mi plan» y el
// detalle del superadmin la leen por `plan_de_la_empresa`. Aquí se afirma que las dos lecturas crudas dan
// la fuente del cargo y que ninguna empresa de la base devuelve `empresa`.
//
// El valor global es una fila para toda la base: se fija bajo el lock de SL-40 y se deja como estaba.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const GLOBAL = "50.00";

let base: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

interface Lectura {
  /** Lo que devuelve `cobro_plataforma_tarifa_de` (el listado de Empresas la llama así). */
  tarifa: { monto: string | null; fuente: string; porcentaje: string | null; minimo: string | null };
  /** El `costo_vigente` de `plan_de_la_empresa`, leído como la empresa; `null` si no tiene plan. */
  planDeLaEmpresa: unknown;
  movimientos: { tipo: string; fuente: string; monto: string }[];
  condicion: { porcentaje: string; minimo: string | null } | null;
}

/** La empresa con el plan pedido (o sin plan), su orden de 100.000 y las dos lecturas del costo vigente. */
async function crearYLeer(tx: TxDeTest, costo: CostoDelPlan | "sin plan"): Promise<Lectura> {
  const e: EmpresaPorcentual = await crearEmpresa(tx);
  if (costo !== "sin plan") await asignar(tx, e, await crearPlanConCosto(tx, costo));

  const orden = await crearOrden(tx, e, { montoCobrar: "100000" });
  const [tarifa] = await tx.$queryRawUnsafe<Lectura["tarifa"][]>(
    `SELECT "monto"::text AS monto, "fuente"::text AS fuente, "porcentaje"::text AS porcentaje, "minimo"::text AS minimo
       FROM cobro_plataforma_tarifa_de($1)`,
    e.id,
  );
  const movs = (await movimientos(tx, orden)).map(({ tipo, fuente, monto }) => ({ tipo, fuente, monto }));
  const condicion = await condicionDe(tx, orden);

  await comoApp(tx, e.id);
  const [fila] = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, e.id);
  const crudo = typeof fila.plan === "string" ? JSON.parse(fila.plan) : fila.plan;
  const planDeLaEmpresa = crudo === null ? null : (crudo as { costo_vigente: unknown }).costo_vigente;
  return { tarifa, planDeLaEmpresa, movimientos: movs, condicion };
}

describeSiHayBase("SLT-126 R5, R11 — la regla vigente: plan porcentual > plan fijo > global > sin configurar", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    tarifaGlobal = await tomarTarifaGlobal();
    await tarifaGlobal.fijar(GLOBAL);
  }, 60_000);

  afterAll(async () => {
    await tarifaGlobal?.soltar();
    await base?.$disconnect();
  });

  it("R5, R11: plan porcentual — congela sus condiciones sin cargo al crear, y la lectura dice «plan» porcentual", async () => {
    const r = await revertida(base, (tx) => crearYLeer(tx, { pct: "2", minimo: "500" }));
    expect(r.condicion).toEqual({ porcentaje: "2.00", minimo: "500.00" });
    expect(r.movimientos).toEqual([]);
    const esperado = { monto: null, fuente: "plan", porcentaje: "2.00", minimo: "500.00" };
    expect(r.tarifa).toEqual(esperado);
    expect(r.planDeLaEmpresa).toEqual(esperado);
  });

  it("R5: plan porcentual — al entregarse la orden se carga como SLT-83 con fuente «plan»", async () => {
    const movs = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      await asignar(tx, e, await crearPlanConCosto(tx, { pct: "2", minimo: "500" }));
      const orden = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, orden, "entregado");
      return movimientos(tx, orden);
    });
    expect(movs.map(({ tipo, fuente, monto }) => ({ tipo, fuente, monto }))).toEqual([
      { tipo: "cargo", fuente: "plan", monto: "2000.00" },
    ]);
  });

  it("R5, R11: plan fijo — carga su importe con fuente «plan», y la lectura dice lo mismo", async () => {
    const r = await revertida(base, (tx) => crearYLeer(tx, { fijo: "100" }));
    expect(r.condicion).toBeNull();
    expect(r.movimientos).toEqual([{ tipo: "cargo", fuente: "plan", monto: "100.00" }]);
    const esperado = { monto: "100.00", fuente: "plan", porcentaje: null, minimo: null };
    expect(r.tarifa).toEqual(esperado);
    expect(r.planDeLaEmpresa).toEqual(esperado);
  });

  it("R5, R11: plan sin costo por orden — carga el global con fuente «global», y la lectura dice lo mismo", async () => {
    const r = await revertida(base, (tx) => crearYLeer(tx, {}));
    expect(r.movimientos).toEqual([{ tipo: "cargo", fuente: "global", monto: GLOBAL }]);
    const esperado = { monto: GLOBAL, fuente: "global", porcentaje: null, minimo: null };
    expect(r.tarifa).toEqual(esperado);
    expect(r.planDeLaEmpresa).toEqual(esperado);
  });

  it("R5, R11: sin plan — carga el global con fuente «global», y la lectura dice lo mismo", async () => {
    const r = await revertida(base, (tx) => crearYLeer(tx, "sin plan"));
    expect(r.movimientos).toEqual([{ tipo: "cargo", fuente: "global", monto: GLOBAL }]);
    expect(r.tarifa).toEqual({ monto: GLOBAL, fuente: "global", porcentaje: null, minimo: null });
    // Sin plan ni cambio pendiente, «Mi plan» no tiene costeo que leer (SLT-86 R26).
    expect(r.planDeLaEmpresa).toBeNull();
  });

  it("R5, R11: sin global — sin plan o con plan sin costo, carga 0.00 «sin_configurar», y la lectura dice lo mismo", async () => {
    await tarifaGlobal?.fijar(null);
    try {
      const esperado = { monto: "0.00", fuente: "sin_configurar", porcentaje: null, minimo: null };
      const sinPlan = await revertida(base, (tx) => crearYLeer(tx, "sin plan"));
      expect(sinPlan.movimientos).toEqual([{ tipo: "cargo", fuente: "sin_configurar", monto: "0.00" }]);
      expect(sinPlan.tarifa).toEqual(esperado);

      const planSinCosto = await revertida(base, (tx) => crearYLeer(tx, {}));
      expect(planSinCosto.movimientos).toEqual([{ tipo: "cargo", fuente: "sin_configurar", monto: "0.00" }]);
      expect(planSinCosto.tarifa).toEqual(esperado);
      expect(planSinCosto.planDeLaEmpresa).toEqual(esperado);
    } finally {
      await tarifaGlobal?.fijar(GLOBAL);
    }
  });

  it("R11: ninguna empresa de la base lee la fuente «empresa» como cobro vigente", async () => {
    const filas = await revertida(base, async (tx) => {
      // Una empresa de cada rama, para que el barrido mire algo aunque la base venga vacía (CI).
      for (const costo of [{ pct: "2", minimo: "500" }, { fijo: "100" }, {}] as CostoDelPlan[]) {
        await asignar(tx, await crearEmpresa(tx), await crearPlanConCosto(tx, costo));
      }
      await crearEmpresa(tx);
      return tx.$queryRawUnsafe<{ total: number; empresa: number }[]>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE t."fuente" = 'empresa')::int AS empresa
           FROM "organizacion" o CROSS JOIN LATERAL cobro_plataforma_tarifa_de(o."id") t`,
      );
    });
    expect(filas[0].total).toBeGreaterThanOrEqual(4);
    expect(filas[0].empresa).toBe(0);
  });
});
