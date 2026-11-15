import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import {
  anular,
  asignar,
  cambiarEstado,
  cambiarMonto,
  crearEmpresa,
  crearOrden,
  crearPlanConCosto,
  deuda,
  movimientos,
  type EmpresaPorcentual,
  type MovimientoPorcentual,
} from "./_fixtures/cobro-porcentual";
import { CASOS_PERIODO, cero } from "./_fixtures/periodo-calendario";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-85 (design §2, §6; R1–R16, R27) — la traza de facturación de cada movimiento del cobro de la
// plataforma, contra Postgres.
//
// Quien escribe la traza es el trigger AFTER INSERT sobre `cobro_plataforma_movimiento`; los movimientos
// los escriben los triggers de `orden` (SL-40, SLT-83). Por eso aquí solo se crean empresas, planes y
// órdenes y se cambian sus columnas con SQL a mano, como dueño, en una transacción que se revierte: es lo
// que hacen todas las vías de la app al final (un INSERT o un UPDATE de `orden`). Lo que se mide se lee
// juntando cada movimiento con su traza (LEFT JOIN: un movimiento sin traza sale con la traza vacía).
//
// El valor global (una sola fila para toda la base) se fija a 500,00 bajo el lock de
// `_fixtures/cobro-plataforma-40`, que lo deja como estaba en el `afterAll`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const GLOBAL = "500.00";
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

let base: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

/** Un movimiento con su traza al lado (`id` y el resto `null` si no la tiene). */
interface Fila {
  secuencia: number;
  mov_id: string;
  mov_org: string;
  mov_tipo: string;
  mov_fuente: string;
  mov_monto: string;
  mov_at: string;
  id: string | null;
  movimiento_id: string | null;
  organizacion_id: string | null;
  orden_id: string | null;
  tipo_movimiento: string | null;
  reverso_de: string | null;
  num_guia: number | null;
  monto_cobrar: string | null;
  estado_orden: string | null;
  tipo_cobro: string | null;
  fuente: string | null;
  plan_id: string | null;
  plan_nombre: string | null;
  porcentaje: string | null;
  minimo: string | null;
  valor_fijo: string | null;
  valor_cobrado: string | null;
  cobrado_at: string | null;
  periodo_tipo: string | null;
  periodo_inicio_at: string | null;
  periodo_fin_at: string | null;
  reconstruido: boolean | null;
}

async function trazas(tx: TxDeTest, ordenId: string): Promise<Fila[]> {
  return tx.$queryRawUnsafe<Fila[]>(
    `SELECT m."secuencia", m."id" AS mov_id, m."organizacion_id" AS mov_org, m."tipo"::text AS mov_tipo,
            m."fuente"::text AS mov_fuente, m."monto"::text AS mov_monto, to_char(m."ocurrido_at", ${ISO}) AS mov_at,
            t."id", t."movimiento_id", t."organizacion_id", t."orden_id", t."tipo_movimiento"::text AS tipo_movimiento,
            t."reverso_de", t."num_guia", t."monto_cobrar"::text AS monto_cobrar, t."estado_orden", t."tipo_cobro",
            t."fuente"::text AS fuente, t."plan_id", t."plan_nombre", t."porcentaje"::text AS porcentaje,
            t."minimo"::text AS minimo, t."valor_fijo"::text AS valor_fijo, t."valor_cobrado"::text AS valor_cobrado,
            to_char(t."cobrado_at", ${ISO}) AS cobrado_at, t."periodo_tipo",
            to_char(t."periodo_inicio_at", ${ISO}) AS periodo_inicio_at,
            to_char(t."periodo_fin_at", ${ISO}) AS periodo_fin_at, t."reconstruido"
       FROM "cobro_plataforma_movimiento" m
       LEFT JOIN "cobro_plataforma_traza" t ON t."movimiento_id" = m."id"
      WHERE m."orden_id" = $1
      ORDER BY m."secuencia"`,
    ordenId,
  );
}

/** Lo que liga una traza a su movimiento (R1): misma fila, misma empresa, mismo tipo. */
function ligada(f: Fila): boolean {
  return f.id !== null && f.movimiento_id === f.mov_id && f.organizacion_id === f.mov_org && f.tipo_movimiento === f.mov_tipo;
}

/** Anula la orden con un `deleted_at` concreto: el reverso lleva ese instante como `ocurrido_at`. */
async function anularEn(tx: TxDeTest, ordenId: string, instante: string): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE orden SET deleted_at = $2::timestamp WHERE id = $1`, ordenId, instante);
}

async function fijarGuia(tx: TxDeTest, ordenId: string, guia: number): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE orden SET num_guia = $2 WHERE id = $1`, ordenId, guia);
}

/** Una guía alta y al azar: `num_guia` es único en toda la base. */
const guiaAlAzar = () => 900_000_000 + Math.floor(Math.random() * 90_000_000);

async function nombreDelPlan(tx: TxDeTest, planId: string): Promise<string> {
  const [{ nombre }] = await tx.$queryRawUnsafe<{ nombre: string }[]>(`SELECT "nombre" FROM "plan" WHERE "id" = $1`, planId);
  return nombre;
}

/** Empresa con un plan de costo fijo por orden (100,00 salvo que se pida otro). */
async function empresaFija(tx: TxDeTest, fijo = "100"): Promise<{ e: EmpresaPorcentual; plan: string }> {
  const e = await crearEmpresa(tx);
  const plan = await crearPlanConCosto(tx, { fijo });
  await asignar(tx, e, plan);
  return { e, plan };
}

/** Empresa con un plan porcentual (2,5 % y mínimo 500 salvo que se pida otro). */
async function empresaPorcentual(tx: TxDeTest, pct = "2.5", minimo: string | null = "500"): Promise<{ e: EmpresaPorcentual; plan: string }> {
  const e = await crearEmpresa(tx);
  const plan = await crearPlanConCosto(tx, { pct, minimo });
  await asignar(tx, e, plan);
  return { e, plan };
}

/**
 * Todos los caminos que hoy escriben movimientos (R2), en dos empresas nuevas: una de plan fijo y otra de
 * plan porcentual. Devuelve las empresas y una orden por camino.
 */
async function todosLosCaminos(tx: TxDeTest): Promise<{ empresas: string[]; ordenes: Record<string, string> }> {
  const { e: F } = await empresaFija(tx);
  const { e: P } = await empresaPorcentual(tx);
  const o: Record<string, string> = {};
  o.altaFija = await crearOrden(tx, F);
  o.naceAnulada = await crearOrden(tx, F, { anulada: true });
  o.anulada = await crearOrden(tx, F);
  await anular(tx, o.anulada, true);
  o.recuperada = await crearOrden(tx, F);
  await anular(tx, o.recuperada, true);
  await anular(tx, o.recuperada, false);
  o.porcentualFinal = await crearOrden(tx, P, { montoCobrar: "100000" });
  await cambiarEstado(tx, o.porcentualFinal, "entregado");
  o.porcentualSale = await crearOrden(tx, P, { montoCobrar: "40000" });
  await cambiarEstado(tx, o.porcentualSale, "entregado");
  await cambiarEstado(tx, o.porcentualSale, "en_reparto");
  o.porcentualAnuladaRecuperada = await crearOrden(tx, P, { montoCobrar: "10000" });
  await cambiarEstado(tx, o.porcentualAnuladaRecuperada, "devuelta_a_tienda");
  await anular(tx, o.porcentualAnuladaRecuperada, true);
  await anular(tx, o.porcentualAnuladaRecuperada, false);
  return { empresas: [F.id, P.id], ordenes: o };
}

describeSiHayBase("SLT-85 — la traza de facturación de los cobros por orden (Postgres, R1–R16, R27)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    tarifaGlobal = await tomarTarifaGlobal();
    await tarifaGlobal.fijar(GLOBAL);
  }, 60_000);

  afterAll(async () => {
    await tarifaGlobal?.soltar();
    await base?.$disconnect();
  });

  /* --------------------------------- R1 ---------------------------------- */

  it("R1 — cada movimiento tiene exactamente una traza y ninguna traza queda sin movimiento", async () => {
    const r = await revertida(base, async (tx) => {
      const { ordenes } = await todosLosCaminos(tx);
      const ids = Object.values(ordenes);
      const [porOrden] = await tx.$queryRawUnsafe<{ movs: number; trazas: number; distintas: number; sueltas: number }[]>(
        `SELECT (SELECT count(*)::int FROM "cobro_plataforma_movimiento" WHERE "orden_id" = ANY($1::text[])) AS movs,
                (SELECT count(*)::int FROM "cobro_plataforma_traza" WHERE "orden_id" = ANY($1::text[])) AS trazas,
                (SELECT count(DISTINCT "movimiento_id")::int FROM "cobro_plataforma_traza" WHERE "orden_id" = ANY($1::text[])) AS distintas,
                (SELECT count(*)::int FROM "cobro_plataforma_traza" t WHERE t."orden_id" = ANY($1::text[])
                    AND NOT EXISTS (SELECT 1 FROM "cobro_plataforma_movimiento" m
                                     WHERE m."id" = t."movimiento_id" AND m."orden_id" = t."orden_id")) AS sueltas`,
        ids,
      );
      // En toda la base, no solo en las órdenes del caso.
      const [enLaBase] = await tx.$queryRawUnsafe<{ sin_traza: number; sin_movimiento: number }[]>(
        `SELECT (SELECT count(*)::int FROM "cobro_plataforma_movimiento" m
                  WHERE NOT EXISTS (SELECT 1 FROM "cobro_plataforma_traza" t WHERE t."movimiento_id" = m."id")) AS sin_traza,
                (SELECT count(*)::int FROM "cobro_plataforma_traza" t
                  WHERE NOT EXISTS (SELECT 1 FROM "cobro_plataforma_movimiento" m WHERE m."id" = t."movimiento_id")) AS sin_movimiento`,
      );
      const filas = (await Promise.all(ids.map((id) => trazas(tx, id)))).flat();
      return { porOrden, enLaBase, todasLigadas: filas.every(ligada), n: filas.length };
    });
    // Control de no vacuidad: los siete caminos dejan 14 movimientos.
    expect(r.n).toBe(14);
    expect(r.porOrden).toEqual({ movs: 14, trazas: 14, distintas: 14, sueltas: 0 });
    expect(r.todasLigadas).toBe(true);
    expect(r.enLaBase).toEqual({ sin_traza: 0, sin_movimiento: 0 });
  });

  /* --------------------------------- R2 ---------------------------------- */

  it("R2 — alta de una orden de cobro fijo: el cargo tiene su traza", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      return trazas(tx, await crearOrden(tx, e));
    });
    expect(filas.map((f) => [f.mov_tipo, ligada(f)])).toEqual([["cargo", true]]);
  });

  it("R2 — alta de una orden que nace anulada: el cargo y el reverso tienen su traza", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      return trazas(tx, await crearOrden(tx, e, { anulada: true }));
    });
    expect(filas.map((f) => [f.mov_tipo, ligada(f)])).toEqual([
      ["cargo", true],
      ["reverso", true],
    ]);
  });

  it("R2 — anulación de una orden fija: el reverso tiene su traza", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e);
      await anular(tx, o, true);
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.mov_tipo, ligada(f)])).toEqual([
      ["cargo", true],
      ["reverso", true],
    ]);
  });

  it("R2 — recuperación de una orden fija: el cargo nuevo tiene su traza", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e);
      await anular(tx, o, true);
      await anular(tx, o, false);
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.mov_tipo, ligada(f)])).toEqual([
      ["cargo", true],
      ["reverso", true],
      ["cargo", true],
    ]);
  });

  it("R2 — orden porcentual que entra en un estado final: el cargo de la conciliación tiene su traza", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const o = await crearOrden(tx, e, { montoCobrar: "100000" });
      const alAlta = await trazas(tx, o);
      await cambiarEstado(tx, o, "entregado");
      return { alAlta, alFinal: await trazas(tx, o) };
    });
    // Control: la porcentual no tiene movimiento al alta, así que tampoco traza.
    expect(r.alAlta).toEqual([]);
    expect(r.alFinal.map((f) => [f.mov_tipo, ligada(f)])).toEqual([["cargo", true]]);
  });

  it("R2 — orden porcentual que sale del estado final: el reverso de la conciliación tiene su traza", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const o = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, o, "entregado");
      await cambiarEstado(tx, o, "en_reparto");
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.mov_tipo, ligada(f)])).toEqual([
      ["cargo", true],
      ["reverso", true],
    ]);
  });

  it("R2 — orden porcentual anulada y recuperada en un estado final: reverso y cargo nuevo con su traza", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const o = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, o, "incidente");
      await anular(tx, o, true);
      await anular(tx, o, false);
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.mov_tipo, ligada(f)])).toEqual([
      ["cargo", true],
      ["reverso", true],
      ["cargo", true],
    ]);
  });

  /* --------------------------------- R3 ---------------------------------- */

  it("R3 — si la transacción se deshace no queda ni el movimiento ni la traza", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e, { anulada: true });
      return { o, dentro: await trazas(tx, o) };
    });
    // Control: dentro de la transacción estaban los dos movimientos con su traza.
    expect(r.dentro.filter(ligada)).toHaveLength(2);
    const [fuera] = await base.$queryRawUnsafe<{ movs: number; trazas: number }[]>(
      `SELECT (SELECT count(*)::int FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1) AS movs,
              (SELECT count(*)::int FROM "cobro_plataforma_traza" WHERE "orden_id" = $1) AS trazas`,
      r.o,
    );
    expect(fuera).toEqual({ movs: 0, trazas: 0 });
  });

  it("R3 — si la traza no se puede escribir, el movimiento no se registra", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const previa = await crearOrden(tx, e);
      // Ninguna fila nueva pasa este CHECK; NOT VALID no mira las que ya hay. Se va con el rollback.
      await tx.$executeRawUnsafe(
        `ALTER TABLE "cobro_plataforma_traza" ADD CONSTRAINT "slt85_test_traza_imposible" CHECK (false) NOT VALID`,
      );
      const alAnular = await capturar(tx, () => anular(tx, previa, true));
      const alCrear = await capturar(tx, () => crearOrden(tx, e));
      const [cuentas] = await tx.$queryRawUnsafe<{ movs: number; ordenes: number; anulada: boolean }[]>(
        `SELECT (SELECT count(*)::int FROM "cobro_plataforma_movimiento" WHERE "organizacion_id" = $1) AS movs,
                (SELECT count(*)::int FROM "orden" WHERE "organizacion_id" = $1) AS ordenes,
                (SELECT "deleted_at" IS NOT NULL FROM "orden" WHERE "id" = $2) AS anulada`,
        e.id,
        previa,
      );
      return { alAnular: alAnular && sqlstateDe(alAnular), alCrear: alCrear && sqlstateDe(alCrear), cuentas };
    });
    expect(r.alAnular).toBe("23514");
    expect(r.alCrear).toBe("23514");
    // Solo queda el cargo de la orden previa: ni el reverso, ni la orden nueva ni su cargo.
    expect(r.cuentas).toEqual({ movs: 1, ordenes: 1, anulada: false });
  });

  /* --------------------------------- R4 ---------------------------------- */

  it("R4 — los movimientos y la deuda son los mismos con y sin traza", async () => {
    type Resultado = { movs: Record<string, MovimientoPorcentual[]>; deudas: string[]; trazas: number };
    const correr = async (tx: TxDeTest): Promise<Resultado> => {
      const { empresas, ordenes } = await todosLosCaminos(tx);
      const movs: Record<string, MovimientoPorcentual[]> = {};
      for (const [k, id] of Object.entries(ordenes)) movs[k] = await movimientos(tx, id);
      const deudas = await Promise.all(empresas.map((id) => deuda(tx, id)));
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "cobro_plataforma_traza" WHERE "orden_id" = ANY($1::text[])`,
        Object.values(ordenes),
      );
      return { movs, deudas, trazas: n };
    };
    const r = await revertida(base, async (tx) => {
      const con = await correr(tx);
      await tx.$executeRawUnsafe(`ALTER TABLE "cobro_plataforma_movimiento" DISABLE TRIGGER "cobro_plataforma_traza_al_registrar"`);
      const sin = await correr(tx);
      return { con, sin };
    });
    // Control: con el trigger hay traza; sin él, ninguna.
    expect(r.con.trazas).toBe(14);
    expect(r.sin.trazas).toBe(0);
    expect(r.con.movs).toEqual(r.sin.movs);
    expect(r.con.deudas).toEqual(r.sin.deudas);
    expect(r.con.deudas).toEqual(["200.00", "3000.00"]);
  });

  /* ------------------------------ R5 y R6 -------------------------------- */

  it("R5 — copia guía, monto_cobrar y código de estado del instante; guía vacía si no tiene", async () => {
    const guia = guiaAlAzar();
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e, { montoCobrar: "25000" });
      await fijarGuia(tx, o, guia);
      await cambiarMonto(tx, o, "30000");
      await cambiarEstado(tx, o, "en_reparto");
      await anular(tx, o, true);
      return trazas(tx, o);
    });
    expect(filas.map((f) => ({ tipo: f.tipo_movimiento, guia: f.num_guia, monto: f.monto_cobrar, estado: f.estado_orden }))).toEqual([
      { tipo: "cargo", guia: null, monto: "25000.00", estado: "en_preparacion" },
      { tipo: "reverso", guia, monto: "30000.00", estado: "en_reparto" },
    ]);
  });

  it("R5 — una orden sin monto_cobrar deja el monto vacío", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      return trazas(tx, await crearOrden(tx, e, { montoCobrar: null }));
    });
    expect(filas.map((f) => [f.num_guia, f.monto_cobrar, f.estado_orden])).toEqual([[null, null, "en_preparacion"]]);
  });

  it("R6 — cambiar guía, monto o estado después no cambia la traza ya escrita", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e, { montoCobrar: "25000" });
      await fijarGuia(tx, o, guiaAlAzar());
      await anular(tx, o, true);
      const antes = await trazas(tx, o);
      await fijarGuia(tx, o, guiaAlAzar());
      await cambiarMonto(tx, o, "99000");
      await cambiarEstado(tx, o, "en_reparto");
      await anular(tx, o, false);
      return { antes, despues: await trazas(tx, o) };
    });
    expect(r.antes).toHaveLength(2);
    // Las dos filas de antes, idénticas columna a columna; la nueva lleva lo de ahora.
    expect(r.despues.slice(0, 2)).toEqual(r.antes);
    expect(r.despues[2]).toMatchObject({ tipo_movimiento: "cargo", monto_cobrar: "99000.00", estado_orden: "en_reparto" });
    expect(r.despues[2].num_guia).not.toBe(r.antes[1].num_guia);
  });

  /* ------------------------------ R7 a R9 -------------------------------- */

  it("R7 — orden porcentual: tipo porcentual, % y mínimo congelados, sin valor fijo", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx, "2.5", "500");
      const o = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, o, "entregado");
      await cambiarEstado(tx, o, "en_reparto");
      const { e: sinMinimo } = await empresaPorcentual(tx, "3", null);
      const o2 = await crearOrden(tx, sinMinimo, { montoCobrar: "10000" });
      await cambiarEstado(tx, o2, "entregado");
      return { conMinimo: await trazas(tx, o), sinMinimo: await trazas(tx, o2) };
    });
    const regla = (f: Fila) => [f.tipo_movimiento, f.tipo_cobro, f.porcentaje, f.minimo, f.valor_fijo, f.valor_cobrado];
    expect(r.conMinimo.map(regla)).toEqual([
      ["cargo", "porcentual", "2.50", "500.00", null, "2500.00"],
      ["reverso", "porcentual", "2.50", "500.00", null, "-2500.00"],
    ]);
    expect(r.sinMinimo.map(regla)).toEqual([["cargo", "porcentual", "3.00", null, null, "300.00"]]);
  });

  it("R8 — orden fija: tipo fijo, valor fijo = importe, sin % ni mínimo", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx, "100");
      const o = await crearOrden(tx, e);
      await anular(tx, o, true);
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.tipo_movimiento, f.tipo_cobro, f.valor_fijo, f.mov_monto, f.porcentaje, f.minimo])).toEqual([
      ["cargo", "fijo", "100.00", "100.00", null, null],
      ["reverso", "fijo", "100.00", "100.00", null, null],
    ]);
  });

  // SLT-126: sin valor propio, ninguna orden nueva lleva fuente `empresa`; las históricas, en migracion-slt126-ida-y-vuelta.
  it("R9 — la fuente es la del movimiento: plan, global y sin_configurar (con 0,00)", async () => {
    const r = await revertida(base, async (tx) => {
      const { e: conPlan } = await empresaFija(tx, "100");
      const sinPlanGlobal = await crearEmpresa(tx);
      const sinPlanSinGlobal = await crearEmpresa(tx);
      const plan = await trazas(tx, await crearOrden(tx, conPlan));
      const global = await trazas(tx, await crearOrden(tx, sinPlanGlobal));
      let sinConfigurar: Fila[];
      await tarifaGlobal!.fijar(null);
      try {
        sinConfigurar = await trazas(tx, await crearOrden(tx, sinPlanSinGlobal));
      } finally {
        await tarifaGlobal!.fijar(GLOBAL);
      }
      return { plan, global, sinConfigurar };
    });
    const regla = (f: Fila) => [f.mov_fuente, f.fuente, f.tipo_cobro, f.valor_fijo, f.valor_cobrado];
    expect(r.plan.map(regla)).toEqual([["plan", "plan", "fijo", "100.00", "100.00"]]);
    expect(r.global.map(regla)).toEqual([["global", "global", "fijo", "500.00", "500.00"]]);
    expect(r.sinConfigurar.map(regla)).toEqual([["sin_configurar", "sin_configurar", "fijo", "0.00", "0.00"]]);
  });

  /* --------------------------------- R10 --------------------------------- */

  it("R10 — copia el plan del instante; sin plan, vacío", async () => {
    const r = await revertida(base, async (tx) => {
      const { e, plan } = await empresaFija(tx);
      const conPlan = await trazas(tx, await crearOrden(tx, e));
      const sinPlan = await trazas(tx, await crearOrden(tx, await crearEmpresa(tx)));
      return { plan, nombre: await nombreDelPlan(tx, plan), conPlan, sinPlan };
    });
    expect(r.conPlan.map((f) => [f.fuente, f.plan_id, f.plan_nombre])).toEqual([["plan", r.plan, r.nombre]]);
    expect(r.sinPlan.map((f) => [f.fuente, f.plan_id, f.plan_nombre])).toEqual([["global", null, null]]);
  });

  it("R10 — tras cambiar de plan, la fila nueva lleva el nuevo y la vieja no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const { e, plan: viejo } = await empresaFija(tx);
      const o = await crearOrden(tx, e);
      const antes = await trazas(tx, o);
      const nuevo = await crearPlanConCosto(tx, { fijo: "150" });
      await asignar(tx, e, nuevo);
      await anular(tx, o, true);
      return {
        viejo: [viejo, await nombreDelPlan(tx, viejo)],
        nuevo: [nuevo, await nombreDelPlan(tx, nuevo)],
        antes,
        despues: await trazas(tx, o),
      };
    });
    expect(r.despues[0]).toEqual(r.antes[0]);
    expect(r.despues.map((f) => [f.tipo_movimiento, f.plan_id, f.plan_nombre])).toEqual([
      ["cargo", ...r.viejo],
      ["reverso", ...r.nuevo],
    ]);
    // El reverso copia el importe del cargo que anula, no la tarifa del plan nuevo.
    expect(r.despues[1].valor_cobrado).toBe("-100.00");
  });

  /* ----------------------------- R11 a R13 ------------------------------- */

  it("R11 — cargo positivo, reverso negativo, mismo valor absoluto exacto que el movimiento", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx, "80.55");
      const o = await crearOrden(tx, e);
      await anular(tx, o, true);
      await anular(tx, o, false);
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.tipo_movimiento, f.mov_monto, f.valor_cobrado])).toEqual([
      ["cargo", "80.55", "80.55"],
      ["reverso", "80.55", "-80.55"],
      ["cargo", "80.55", "80.55"],
    ]);
  });

  it("R12 — fecha de cobro = ocurrido_at, también en el reverso con deleted_at", async () => {
    const instante = "2026-03-15T17:45:12.345Z";
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e);
      await anularEn(tx, o, instante);
      await anular(tx, o, false);
      return trazas(tx, o);
    });
    expect(filas).toHaveLength(3);
    expect(filas.every((f) => f.cobrado_at !== null && f.cobrado_at === f.mov_at)).toBe(true);
    expect(filas[1].cobrado_at).toBe(instante);
  });

  it("R13 — el reverso apunta a la traza del cargo que anula; el cargo no apunta a nada", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e);
      await anular(tx, o, true);
      await anular(tx, o, false);
      await anular(tx, o, true);
      return trazas(tx, o);
    });
    expect(filas.map((f) => f.tipo_movimiento)).toEqual(["cargo", "reverso", "cargo", "reverso"]);
    expect(filas.map((f) => f.reverso_de)).toEqual([null, filas[0].id, null, filas[2].id]);
  });

  /* ------------------------------ R14 y R15 ------------------------------ */

  it("R14 — el período de calendario de la fecha de cobro, para los cuatro tipos (tabla de SLT-86)", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      const o = await crearOrden(tx, e);
      const fallos: unknown[] = [];
      let vistos = 0;
      for (const caso of CASOS_PERIODO) {
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_tipo_cobro" = $2 WHERE "id" = $1`, e.id, caso.tipo);
        await anularEn(tx, o, caso.ahora);
        const reverso = (await trazas(tx, o)).at(-1) as Fila;
        await anular(tx, o, false);
        vistos += 1;
        const real = { tipo: reverso.periodo_tipo, cobrado: reverso.cobrado_at, inicio: reverso.periodo_inicio_at, fin: reverso.periodo_fin_at };
        const esperado = { tipo: caso.tipo, cobrado: caso.ahora, inicio: caso.inicio ?? real.inicio, fin: caso.fin };
        if (reverso.tipo_movimiento !== "reverso" || JSON.stringify(real) !== JSON.stringify(esperado)) {
          fallos.push({ caso: caso.caso, real, esperado });
        }
      }
      return { fallos, vistos };
    });
    expect(r.vistos).toBe(CASOS_PERIODO.length);
    expect(r.fallos).toEqual([]);
  });

  it("R14 — con una entrada a mitad de período, el inicio es el del calendario y no el de la entrada", async () => {
    const filas = await revertida(base, async (tx) => {
      const { e } = await empresaFija(tx);
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "plan_tipo_cobro" = 'quincenal', "plan_ciclo_ancla_at" = $2::timestamp WHERE "id" = $1`,
        e.id,
        cero("2026-11-10"),
      );
      const o = await crearOrden(tx, e);
      await anularEn(tx, o, "2026-11-12T15:00:00.000Z");
      return trazas(tx, o);
    });
    expect(filas.at(-1)).toMatchObject({
      tipo_movimiento: "reverso",
      periodo_tipo: "quincenal",
      periodo_inicio_at: cero("2026-11-01"),
      periodo_fin_at: cero("2026-11-16"),
    });
  });

  it("R15 — empresa sin plan: período vacío", async () => {
    const filas = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      const o = await crearOrden(tx, e);
      await anular(tx, o, true);
      return trazas(tx, o);
    });
    expect(filas.map((f) => [f.plan_id, f.periodo_tipo, f.periodo_inicio_at, f.periodo_fin_at])).toEqual([
      [null, null, null, null],
      [null, null, null, null],
    ]);
  });

  /* --------------------------------- R16 --------------------------------- */

  it("R16 — las filas en vivo salen con reconstruido = false", async () => {
    const filas = await revertida(base, async (tx) => {
      const { ordenes } = await todosLosCaminos(tx);
      return (await Promise.all(Object.values(ordenes).map((id) => trazas(tx, id)))).flat();
    });
    expect(filas).toHaveLength(14);
    expect(filas.map((f) => f.reconstruido)).toEqual(Array(14).fill(false));
  });

  /* --------------------------------- R27 --------------------------------- */

  it("R27 — la tabla tiene exactamente las columnas esperadas, importes numeric(12,2), porcentaje numeric(5,2), sin impuesto ni moneda", async () => {
    const columnas = await base.$queryRawUnsafe<{ c: string }[]>(
      `SELECT concat_ws(' ', column_name, udt_name, is_nullable, numeric_precision, numeric_scale,
                        character_maximum_length, datetime_precision) AS c
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cobro_plataforma_traza'
        ORDER BY ordinal_position`,
    );
    expect(columnas.map((x) => x.c)).toEqual([
      "id text NO",
      "organizacion_id text NO",
      "orden_id text NO",
      "movimiento_id text NO",
      "tipo_movimiento cobro_plataforma_tipo NO",
      "reverso_de text YES",
      "num_guia int4 YES 32 0",
      "monto_cobrar numeric YES 12 2",
      "estado_orden text YES",
      "tipo_cobro text NO",
      "fuente cobro_plataforma_fuente NO",
      "plan_id text YES",
      "plan_nombre varchar YES 80",
      "porcentaje numeric YES 5 2",
      "minimo numeric YES 12 2",
      "valor_fijo numeric YES 12 2",
      "valor_cobrado numeric NO 12 2",
      "cobrado_at timestamp NO 3",
      "periodo_tipo text YES",
      "periodo_inicio_at timestamp YES 3",
      "periodo_fin_at timestamp YES 3",
      "reconstruido bool NO",
      "created_at timestamp NO 3",
    ]);
    expect(columnas.filter((x) => /iva|impuesto|moneda|currency|tax/i.test(x.c))).toEqual([]);
  });
});
