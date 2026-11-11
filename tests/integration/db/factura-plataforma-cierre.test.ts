import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { EnqueueOpts, IJobRepository, JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";
import { recurrenciaCierreFacturas, sembrarCierreFacturas } from "@/lib/planes/jobs-factura-plataforma";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import type { TipoCobro } from "@/lib/types/planes";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrden, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
  aplicarMigracionesHasta,
  conectar,
  diferencias,
  ejecutar,
  foto,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, revertida } from "./_fixtures/planes";

// SLT-118 · T6.1 (design §1.1, §2.2, §2.4, §2.5, §4, §6.2, §8; R1–R9, R11, R14, R25–R27) — el cierre de las
// facturas de la plataforma contra Postgres.
//
// Dos bloques:
//   · en la base compartida, cada caso en una transacción que se revierte: empresas con su alta fijada y
//     el reloj por `p_ahora` (`FacturaPlataformaRepository.cerrar`, que llama a `factura_plataforma_cerrar`).
//     Los movimientos se escriben a mano con su `ocurrido_at` (el trigger de la traza escribe la suya): el
//     cargo que el alta de una orden deja con el reloj real se borra antes, para que la fecha del CI no
//     cuente en ninguna factura;
//   · en una base PROPIA (`slt118_iv_<rand>`), la migración de verdad: la siembra (R26, P15), dos cierres
//     a la vez desde dos conexiones (R11; en la compartida las filas no se ven entre conexiones) y la ida y
//     vuelta con su negativa (R27). Allí el «ahora» es el de la base (`now()`), porque la siembra lo usa.
//
// Las horas son las de la plataforma (−06:00): las 00:00 del día D son `cero(D)`, las 06:00 en UTC.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const MINUTO_MS = 60_000;

/** `iso` + `minutos` (o − con negativo), en ISO. */
const mas = (iso: string, minutos: number) => new Date(new Date(iso).getTime() + minutos * MINUTO_MS).toISOString();

/** La corrida de las 00:10 de la plataforma del día `fecha` (margen de cierre de 5 minutos ya pasado). */
const corrida = (fecha: string) => mas(cero(fecha), 10);

let base: PrismaClient;

/* -------------------------------------------------------------------------- */
/* Lectura de las facturas                                                     */
/* -------------------------------------------------------------------------- */

interface Factura {
  numero: number | null;
  estado: string;
  desde: string;
  hasta: string | null;
  periodicidad: string;
  plan_id: string | null;
  plan_nombre: string | null;
  tipo_cobro: string | null;
  cargos: string | null;
  reversos: string | null;
  movimientos: number | null;
  total_ordenes: string | null;
  cuota_plan_id: string | null;
  cuota_plan_nombre: string | null;
  cuota_tipo_cobro: string | null;
  cuota_desde: string | null;
  cuota_hasta: string | null;
  precio_mensual: string | null;
  cuota: string | null;
  dias_cobrados: number | null;
  dias_periodo: number | null;
  primera_cuota_desde: string | null;
  primera_cuota: string | null;
  total: string | null;
  cerrada_at: string | null;
}

const COLUMNAS_LEIDAS = `"numero", "estado", to_char("desde_at", ${ISO}) AS desde, to_char("hasta_at", ${ISO}) AS hasta,
  "periodicidad", "plan_id", "plan_nombre", "tipo_cobro", "cargos"::text AS cargos, "reversos"::text AS reversos,
  "movimientos", "total_ordenes"::text AS total_ordenes, "cuota_plan_id", "cuota_plan_nombre", "cuota_tipo_cobro",
  to_char("cuota_desde_at", ${ISO}) AS cuota_desde, to_char("cuota_hasta_at", ${ISO}) AS cuota_hasta,
  "precio_mensual"::text AS precio_mensual, "cuota"::text AS cuota, "dias_cobrados", "dias_periodo",
  to_char("primera_cuota_desde_at", ${ISO}) AS primera_cuota_desde, "primera_cuota"::text AS primera_cuota,
  "total"::text AS total, to_char("cerrada_at", ${ISO}) AS cerrada_at`;

/** Las facturas de una empresa, en el orden de sus intervalos, leídas como dueño. */
async function facturas(tx: TxDeTest, organizacionId: string): Promise<Factura[]> {
  return tx.$queryRawUnsafe<Factura[]>(
    `SELECT ${COLUMNAS_LEIDAS} FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "desde_at"`,
    organizacionId,
  );
}

/** Cada fila entera en texto: lo que un segundo cierre o un cambio a medias movería. */
async function fotoDeFilas(tx: TxDeTest, organizacionId: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT f::text AS l FROM "factura_plataforma" f WHERE f."organizacion_id" = $1 ORDER BY f."desde_at"`,
    organizacionId,
  );
  return filas.map((f) => f.l);
}

/** Las nueve columnas de la cuota de la emisión: nulas todas o ninguna (CHECK `factura_plataforma_cuota`). */
const SIN_CUOTA = {
  cuota_plan_id: null,
  cuota_plan_nombre: null,
  cuota_tipo_cobro: null,
  cuota_desde: null,
  cuota_hasta: null,
  precio_mensual: null,
  cuota: null,
  dias_cobrados: null,
  dias_periodo: null,
} as const;

const SIN_PRIMERA_CUOTA = { primera_cuota_desde: null, primera_cuota: null } as const;

/* -------------------------------------------------------------------------- */
/* Empresas, planes y movimientos (como dueño)                                 */
/* -------------------------------------------------------------------------- */

interface PlanDeFactura {
  id: string;
  nombre: string;
}

/** Un plan con costo base `mensual` (en el historial «desde siempre»), sus descuentos y su periodicidad. */
async function planConPrecio(
  tx: TxDeTest,
  p: { mensual: string | null; periodicidad?: "quincenal" | "mensual"; descuentos?: Record<string, unknown> },
): Promise<PlanDeFactura> {
  const id = await crearPlan(tx);
  await tx.$executeRawUnsafe(
    `UPDATE "plan" SET "precio_mensual" = $2::numeric, "periodicidad_ordenes" = $3 WHERE "id" = $1`,
    id,
    p.mensual,
    p.periodicidad ?? "quincenal",
  );
  await tx.$executeRawUnsafe(
    `UPDATE "plan_precio_historial" SET "precio_mensual" = $2::numeric, "descuentos" = $3::jsonb WHERE "plan_id" = $1`,
    id,
    p.mensual,
    JSON.stringify(p.descuentos ?? {}),
  );
  const [{ nombre }] = await tx.$queryRawUnsafe<{ nombre: string }[]>(`SELECT "nombre" FROM "plan" WHERE "id" = $1`, id);
  return { id, nombre };
}

/**
 * Una empresa con su alta en `alta` y, si se pide, con el plan y el tipo desde ese instante (sin pasar por la
 * toma del cambio: como la empresa con plan que la migración sembró, su primera factura no lleva marca).
 */
async function empresa(tx: TxDeTest, alta: string, plan?: { id: string; tipo: TipoCobro }): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, e.id, alta);
  if (plan) {
    await tx.$executeRawUnsafe(
      `UPDATE "organizacion" SET "plan_id" = $2, "plan_tipo_cobro" = $3, "plan_ciclo_ancla_at" = $4::timestamp WHERE "id" = $1`,
      e.id,
      plan.id,
      plan.tipo,
      alta,
    );
  }
  return e;
}

/** Una orden de la empresa sin ningún movimiento: el cargo de su alta lleva el reloj real y se borra. */
async function ordenSinCargos(tx: TxDeTest, e: EmpresaPorcentual): Promise<string> {
  const orden = await crearOrden(tx, e);
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, orden);
  return orden;
}

/** Un cargo o un reverso con su instante: el trigger de SLT-85 escribe su traza con `cobrado_at` = ese instante. */
async function movimiento(
  tx: TxDeTest,
  e: EmpresaPorcentual,
  m: { orden: string; secuencia: number; tipo: "cargo" | "reverso"; monto: string; en: string },
): Promise<void> {
  await fijarEmpresa(tx, e.id);
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     VALUES ($1, $2, $3, $4, $5::"cobro_plataforma_tipo", 'plan', $6::numeric, $7::timestamp)`,
    `slt118-${randomUUID()}`,
    e.id,
    m.orden,
    m.secuencia,
    m.tipo,
    m.monto,
    m.en,
  );
}

/** El proceso automático: `FacturaPlataformaRepository.cerrar` en la transacción del caso. */
function cerrar(tx: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(tx).cerrar(organizacionId, new Date(ahora));
}

/** R1: una sola en curso, y cada factura empieza en el `hasta` de la anterior. */
function sinHuecosNiSolapes(lista: Factura[]): void {
  expect(lista.filter((f) => f.estado === "en_curso")).toHaveLength(1);
  expect(lista[lista.length - 1].estado).toBe("en_curso");
  for (let i = 1; i < lista.length; i++) expect(lista[i].desde).toBe(lista[i - 1].hasta);
}

/* -------------------------------------------------------------------------- */
/* Base compartida                                                             */
/* -------------------------------------------------------------------------- */

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

  it("R4: a las 00:04:59.999 del 16 la factura del 1 al 15 queda fijada pero sin cerrar; a las 00:10, se cierra", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      const antesDelMargen = await cerrar(tx, e.id, "2026-11-16T06:04:59.999Z");
      const enEspera = await facturas(tx, e.id);
      const despues = await cerrar(tx, e.id, corrida("2026-11-16"));
      return { antesDelMargen, enEspera, despues, cerradas: await facturas(tx, e.id) };
    });
    expect(r.antesDelMargen).toBe(0);
    expect(r.enEspera.map((f) => [f.estado, f.numero, f.desde, f.hasta, f.cerrada_at, f.total])).toEqual([
      ["por_cerrar", null, cero("2026-11-01"), cero("2026-11-16"), null, null],
      ["en_curso", null, cero("2026-11-16"), null, null, null],
    ]);
    expect(r.despues).toBe(1);
    expect(r.cerradas[0]).toMatchObject({ estado: "cerrada", numero: 1, cerrada_at: corrida("2026-11-16") });
  });

  it("R1, R2, R3, R5, R9: sin plan factura quincenal, sin cuota, y cada corrida emite la vencida y abre la siguiente", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      const corridas = [
        await cerrar(tx, e.id, corrida("2026-11-16")),
        await cerrar(tx, e.id, corrida("2026-12-01")),
        await cerrar(tx, e.id, corrida("2026-12-16")),
      ];
      return { corridas, lista: await facturas(tx, e.id) };
    });
    expect(r.corridas).toEqual([1, 1, 1]);
    sinHuecosNiSolapes(r.lista);
    // R2: sin plan, quincenal; desde el 16 de noviembre, hasta el 1 de diciembre.
    expect(r.lista.map((f) => [f.numero, f.estado, f.desde, f.hasta, f.periodicidad])).toEqual([
      [1, "cerrada", cero("2026-11-01"), cero("2026-11-16"), "quincenal"],
      [2, "cerrada", cero("2026-11-16"), cero("2026-12-01"), "quincenal"],
      [3, "cerrada", cero("2026-12-01"), cero("2026-12-16"), "quincenal"],
      [null, "en_curso", cero("2026-12-16"), null, "quincenal"],
    ]);
    // R5 «sin plan» y R9: sin cuota ni primera cuota; solo los cargos (ninguno aquí).
    for (const f of r.lista.slice(0, 3)) {
      expect(f).toMatchObject({
        plan_id: null,
        plan_nombre: null,
        tipo_cobro: null,
        cargos: "0.00",
        reversos: "0.00",
        movimientos: 0,
        total_ordenes: "0.00",
        total: "0.00",
        ...SIN_CUOTA,
        ...SIN_PRIMERA_CUOTA,
      });
    }
  });

  it("R9: un plan sin costo base emite sus facturas sin cuota y con los cargos de sus órdenes", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: null });
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "quincenal" });
      const orden = await ordenSinCargos(tx, e);
      await movimiento(tx, e, { orden, secuencia: 1, tipo: "cargo", monto: "300.00", en: "2026-11-20T15:00:00.000Z" });
      await cerrar(tx, e.id, corrida("2026-12-16"));
      return { plan, lista: await facturas(tx, e.id) };
    });
    expect(r.lista.map((f) => [f.numero, f.plan_id, f.total_ordenes, f.cuota, f.primera_cuota, f.total])).toEqual([
      [1, r.plan.id, "0.00", null, null, "0.00"],
      [2, r.plan.id, "300.00", null, null, "300.00"],
      [3, r.plan.id, "0.00", null, null, "0.00"],
      [null, r.plan.id, null, null, null, null],
    ]);
  });

  it("R2, R3, R8: mensual 31 000 con 10 % y órdenes quincenales: 27 900.00 de diciembre en la emitida el 1 y nada el 16", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, {
        mensual: "31000.00",
        descuentos: { mensual: { tipo: "porcentaje", porcentaje: "10" } },
      });
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "mensual" });
      const cerradas = await cerrar(tx, e.id, corrida("2026-12-16"));
      return { plan, cerradas, lista: await facturas(tx, e.id) };
    });
    expect(r.cerradas).toBe(3);
    sinHuecosNiSolapes(r.lista);
    expect(r.lista.map((f) => [f.desde, f.hasta, f.periodicidad, f.tipo_cobro, f.cuota])).toEqual([
      [cero("2026-11-01"), cero("2026-11-16"), "quincenal", "mensual", null],
      [cero("2026-11-16"), cero("2026-12-01"), "quincenal", "mensual", "27900.00"],
      [cero("2026-12-01"), cero("2026-12-16"), "quincenal", "mensual", null],
      [cero("2026-12-16"), null, "quincenal", "mensual", null],
    ]);
    expect(r.lista[1]).toMatchObject({
      cuota_plan_id: r.plan.id,
      cuota_plan_nombre: r.plan.nombre,
      cuota_tipo_cobro: "mensual",
      cuota_desde: cero("2026-12-01"),
      cuota_hasta: cero("2027-01-01"),
      precio_mensual: "31000.00",
      dias_cobrados: 31,
      dias_periodo: 31,
      total: "27900.00",
      ...SIN_PRIMERA_CUOTA,
    });
    expect(r.lista[0]).toMatchObject({ ...SIN_CUOTA, total: "0.00" });
    expect(r.lista[2]).toMatchObject({ ...SIN_CUOTA, total: "0.00" });
  });

  it("R2, R3, R8: anual con órdenes mensuales: la de noviembre acaba el 1 de diciembre y la cuota anual sale solo el 1 de enero", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: "31000.00", periodicidad: "mensual" });
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "anual" });
      const antesDelUno = await cerrar(tx, e.id, corrida("2026-11-16"));
      const cerradas = await cerrar(tx, e.id, corrida("2027-01-01"));
      return { plan, antesDelUno, cerradas, lista: await facturas(tx, e.id) };
    });
    // R3, órdenes mensuales: el 16 no hay corte; la corrida de las 00:10 del 1 emite el mes.
    expect(r.antesDelUno).toBe(0);
    expect(r.cerradas).toBe(2);
    sinHuecosNiSolapes(r.lista);
    expect(r.lista.map((f) => [f.desde, f.hasta, f.periodicidad, f.cuota])).toEqual([
      [cero("2026-11-01"), cero("2026-12-01"), "mensual", null],
      [cero("2026-12-01"), cero("2027-01-01"), "mensual", "372000.00"],
      [cero("2027-01-01"), null, "mensual", null],
    ]);
    expect(r.lista[1]).toMatchObject({
      cuota_tipo_cobro: "anual",
      cuota_desde: cero("2027-01-01"),
      cuota_hasta: cero("2028-01-01"),
      dias_cobrados: 365,
      dias_periodo: 365,
    });
  });

  it("R8: bimestral con órdenes quincenales: la cuota solo en la emitida el 1 de enero (inicio de ene–feb)", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: "31000.00" });
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "bimestral" });
      await cerrar(tx, e.id, corrida("2027-01-01"));
      return facturas(tx, e.id);
    });
    expect(r.map((f) => [f.hasta, f.cuota, f.cuota_desde, f.cuota_hasta, f.dias_cobrados])).toEqual([
      [cero("2026-11-16"), null, null, null, null],
      [cero("2026-12-01"), null, null, null, null],
      [cero("2026-12-16"), null, null, null, null],
      [cero("2027-01-01"), "62000.00", cero("2027-01-01"), cero("2027-03-01"), 59],
      [null, null, null, null, null],
    ]);
  });

  it("R8: quincenal 15 500: cada factura lleva la cuota de la quincena que empieza en su emisión, completa", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: "31000.00" });
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "quincenal" });
      await cerrar(tx, e.id, corrida("2027-01-01"));
      return facturas(tx, e.id);
    });
    expect(r.map((f) => [f.hasta, f.cuota, f.cuota_desde, f.cuota_hasta, f.dias_cobrados, f.dias_periodo])).toEqual([
      [cero("2026-11-16"), "15500.00", cero("2026-11-16"), cero("2026-12-01"), 15, 15],
      [cero("2026-12-01"), "15500.00", cero("2026-12-01"), cero("2026-12-16"), 15, 15],
      [cero("2026-12-16"), "15500.00", cero("2026-12-16"), cero("2027-01-01"), 16, 16],
      [cero("2027-01-01"), "15500.00", cero("2027-01-01"), cero("2027-01-16"), 15, 15],
      [null, null, null, null, null, null],
    ]);
  });

  it("R8: un precio editado con efecto el 20 rige desde la primera cuota cuyo período empieza ese día o después", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: "31000.00" });
      await tx.$executeRawUnsafe(
        `INSERT INTO "plan_precio_historial" ("plan_id", "desde_at", "precio_mensual", "descuentos") VALUES ($1, $2::timestamp, 40000.00, '{}')`,
        plan.id,
        cero("2026-11-20"),
      );
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "quincenal" });
      await cerrar(tx, e.id, corrida("2026-12-16"));
      return facturas(tx, e.id);
    });
    expect(r.map((f) => [f.cuota_desde, f.precio_mensual, f.cuota])).toEqual([
      // La quincena del 16 empezó antes del 20: el precio de antes.
      [cero("2026-11-16"), "31000.00", "15500.00"],
      [cero("2026-12-01"), "40000.00", "20000.00"],
      [cero("2026-12-16"), "40000.00", "20000.00"],
      [null, null, null],
    ]);
  });

  it("R5, R6, R7: cifras de las órdenes por instante, bordes al milisegundo, un reverso en la factura del reverso y la traza que suma igual", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: "31000.00" });
      const e = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "quincenal" });
      const [o1, o2, o3, o4] = [
        await ordenSinCargos(tx, e),
        await ordenSinCargos(tx, e),
        await ordenSinCargos(tx, e),
        await ordenSinCargos(tx, e),
      ];
      await movimiento(tx, e, { orden: o1, secuencia: 1, tipo: "cargo", monto: "100.00", en: "2026-11-14T15:00:00.000Z" });
      await movimiento(tx, e, { orden: o2, secuencia: 1, tipo: "cargo", monto: "250.00", en: "2026-11-03T12:00:00.000Z" });
      // El último milisegundo del 15 (hora de la plataforma) y el primero del 16.
      await movimiento(tx, e, { orden: o3, secuencia: 1, tipo: "cargo", monto: "10.00", en: "2026-11-16T05:59:59.999Z" });
      await movimiento(tx, e, { orden: o4, secuencia: 1, tipo: "cargo", monto: "20.00", en: cero("2026-11-16") });
      await cerrar(tx, e.id, corrida("2026-11-16"));
      const primeraAlCerrar = await fotoDeFilas(tx, e.id);
      // R6: el reverso del cargo del 14 llega el 17.
      await movimiento(tx, e, { orden: o1, secuencia: 2, tipo: "reverso", monto: "100.00", en: "2026-11-17T15:00:00.000Z" });
      await cerrar(tx, e.id, corrida("2026-12-01"));
      const traza = await tx.$queryRawUnsafe<{ numero: number; total: string; traza: string; filas: number }[]>(
        `SELECT f."numero", f."total_ordenes"::text AS total,
                COALESCE(sum(t."valor_cobrado"), 0)::numeric(14,2)::text AS traza, count(t."id")::int AS filas
           FROM "factura_plataforma" f
           LEFT JOIN "cobro_plataforma_traza" t
             ON t."organizacion_id" = f."organizacion_id" AND t."cobrado_at" >= f."desde_at" AND t."cobrado_at" < f."hasta_at"
          WHERE f."organizacion_id" = $1 AND f."estado" = 'cerrada'
          GROUP BY f."id", f."numero", f."total_ordenes" ORDER BY f."numero"`,
        e.id,
      );
      return { plan, primeraAlCerrar, despues: await fotoDeFilas(tx, e.id), lista: await facturas(tx, e.id), traza };
    });
    // R5: todo lo que guarda la factura cerrada.
    expect(r.lista[0]).toEqual({
      numero: 1,
      estado: "cerrada",
      desde: cero("2026-11-01"),
      hasta: cero("2026-11-16"),
      periodicidad: "quincenal",
      plan_id: r.plan.id,
      plan_nombre: r.plan.nombre,
      tipo_cobro: "quincenal",
      cargos: "360.00",
      reversos: "0.00",
      movimientos: 3,
      total_ordenes: "360.00",
      cuota_plan_id: r.plan.id,
      cuota_plan_nombre: r.plan.nombre,
      cuota_tipo_cobro: "quincenal",
      cuota_desde: cero("2026-11-16"),
      cuota_hasta: cero("2026-12-01"),
      precio_mensual: "31000.00",
      cuota: "15500.00",
      dias_cobrados: 15,
      dias_periodo: 15,
      ...SIN_PRIMERA_CUOTA,
      total: "15860.00",
      cerrada_at: corrida("2026-11-16"),
    });
    // R6: el reverso resta en la del 16 al 30 (en positivo en `reversos`) y la del 1 al 15 no cambia.
    expect(r.lista[1]).toMatchObject({
      numero: 2,
      cargos: "20.00",
      reversos: "100.00",
      movimientos: 2,
      total_ordenes: "-80.00",
      cuota: "15500.00",
      total: "15420.00",
    });
    expect(r.despues[0]).toBe(r.primeraAlCerrar[0]);
    // R7: el detalle por orden son las filas de la traza del intervalo, y suman el total de órdenes.
    expect(r.traza).toEqual([
      { numero: 1, total: "360.00", traza: "360.00", filas: 3 },
      { numero: 2, total: "-80.00", traza: "-80.00", filas: 2 },
    ]);
  });

  it("R11: cerrar otra vez, o tras un cierre que falló a medias, no crea otra factura, no cambia la cerrada ni suma dos veces la cuota", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, { mensual: "31000.00" });
      const a = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "quincenal" });
      const primera = await cerrar(tx, a.id, corrida("2026-12-01"));
      const tras = await fotoDeFilas(tx, a.id);
      const otraVez = await cerrar(tx, a.id, corrida("2026-12-01"));
      const mediaHoraDespues = await cerrar(tx, a.id, mas(corrida("2026-12-01"), 30));
      const sumaCuotas = async (org: string) => {
        const [f] = await tx.$queryRawUnsafe<{ s: string }[]>(
          `SELECT COALESCE(sum(COALESCE("cuota", 0) + COALESCE("primera_cuota", 0)), 0)::text AS s
             FROM "factura_plataforma" WHERE "organizacion_id" = $1 AND "estado" = 'cerrada'`,
          org,
        );
        return f.s;
      };

      // Un cierre que se cae a mitad (su transacción se deshace) y su reintento.
      const b = await empresa(tx, cero("2026-11-01"), { id: plan.id, tipo: "quincenal" });
      await tx.$executeRawUnsafe(`SAVEPOINT slt118_fallo`);
      await cerrar(tx, b.id, corrida("2026-12-01"));
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT slt118_fallo`);
      const trasFallo = await facturas(tx, b.id);
      const reintento = await cerrar(tx, b.id, corrida("2026-12-01"));
      return {
        primera,
        otraVez,
        mediaHoraDespues,
        tras,
        despues: await fotoDeFilas(tx, a.id),
        suma: await sumaCuotas(a.id),
        trasFallo,
        reintento,
        listaB: await facturas(tx, b.id),
        sumaB: await sumaCuotas(b.id),
      };
    });
    expect(r.primera).toBe(2);
    expect([r.otraVez, r.mediaHoraDespues]).toEqual([0, 0]);
    expect(r.despues).toEqual(r.tras);
    expect(r.suma).toBe("31000.00");
    expect(r.trasFallo).toEqual([]);
    expect(r.reintento).toBe(2);
    expect(r.listaB.map((f) => [f.numero, f.desde, f.cuota])).toEqual([
      [1, cero("2026-11-01"), "15500.00"],
      [2, cero("2026-11-16"), "15500.00"],
      [null, cero("2026-12-01"), null],
    ]);
    expect(r.sumaB).toBe("31000.00");
  });

  it("R14: el número es correlativo por empresa desde 1, en el orden de los períodos, y la en curso no tiene", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx, cero("2026-11-01"));
      const b = await empresa(tx, cero("2026-11-01"));
      // Intercaladas: el número de una no se lleva el de la otra.
      await cerrar(tx, a.id, corrida("2026-11-16"));
      await cerrar(tx, b.id, corrida("2026-12-01"));
      await cerrar(tx, a.id, corrida("2026-12-16"));
      await cerrar(tx, b.id, corrida("2026-12-16"));
      return { a: await facturas(tx, a.id), b: await facturas(tx, b.id) };
    });
    for (const lista of [r.a, r.b]) {
      expect(lista.map((f) => [f.numero, f.desde])).toEqual([
        [1, cero("2026-11-01")],
        [2, cero("2026-11-16")],
        [3, cero("2026-12-01")],
        [null, cero("2026-12-16")],
      ]);
    }
  });

  it("R26: una empresa dada de alta después tiene su primera factura desde las 00:00 de la plataforma del día de su alta", async () => {
    const r = await revertida(base, async (tx) => {
      // A las 09:00 del 10 y a las 21:00 del 10 (ya el 11 en UTC): las dos, desde las 00:00 del 10.
      const manana = await empresa(tx, "2026-11-10T15:00:00.000Z");
      const noche = await empresa(tx, "2026-11-11T03:00:00.000Z");
      const ahora = "2026-11-12T18:00:00.000Z";
      return {
        cerradas: [await cerrar(tx, manana.id, ahora), await cerrar(tx, noche.id, ahora)],
        manana: await facturas(tx, manana.id),
        noche: await facturas(tx, noche.id),
      };
    });
    expect(r.cerradas).toEqual([0, 0]);
    for (const lista of [r.manana, r.noche]) {
      expect(lista.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad, f.primera_cuota_desde])).toEqual([
        ["en_curso", cero("2026-11-10"), null, "quincenal", null],
      ]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Base propia: la migración de verdad (R26, R11 a la vez, R27)                */
/* -------------------------------------------------------------------------- */

const M = "20261111130100_factura_plataforma";
const BASE = `slt118_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const TIPOS_SEMBRADOS: readonly TipoCobro[] = ["quincenal", "mensual", "bimestral", "anual"];

/** Lo que la foto del fixture no mira y la migración sí cambia: funciones (con el tope), triggers, privilegios, políticas. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
                     || ' ' || COALESCE(p.proacl::text, '-') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.table_privileges
    WHERE table_schema = 'public'`,
  politicas: `SELECT tablename || '.' || policyname AS l FROM pg_policies WHERE schemaname = 'public'`,
};

let db: Conexion;
let admin: Conexion | undefined;
let antesDeM: Foto;
let planMensual = "";
const sembradas: { id: string; tipo: TipoCobro | null; plan: string | null }[] = [];

async function fotoCompleta(): Promise<Foto> {
  const resultado = await foto(db);
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

async function correrYCapturar(texto: string, etiqueta: string): Promise<ErrorDeScript | null> {
  try {
    await ejecutar(db, texto, etiqueta);
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
}

/** Un instante de la base (`now()` en UTC + `intervalo`) como texto de `TIMESTAMP`. */
async function instanteDeLaBase(c: Conexion, intervalo = "0 seconds"): Promise<string> {
  const { rows } = await c.query(
    `SELECT to_char((now() AT TIME ZONE 'UTC') + $1::interval, 'YYYY-MM-DD HH24:MI:SS.MS') AS t`,
    [intervalo],
  );
  return String(rows[0].t);
}

async function inicioDelCorteEnCurso(): Promise<string> {
  const { rows } = await db.query(`SELECT to_char(plan_inicio_periodo_calendario('quincenal', now() AT TIME ZONE 'UTC'), ${ISO}) AS t`);
  return String(rows[0].t);
}

async function sembrarEmpresa(tipo: TipoCobro | null, plan: string | null): Promise<void> {
  const id = randomUUID();
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [id, `SLT118 IV ${sufijo}`, `slt118-iv-${sufijo}`]);
  if (plan !== null) {
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $2, "plan_tipo_cobro" = $3,
              "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '400 days' WHERE "id" = $1`,
      [id, plan, tipo],
    );
  }
  sembradas.push({ id, tipo, plan });
}

describeSiHayBase("SLT-118 — la migración: siembra, cierres a la vez y vuelta atrás (R11, R26, R27)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    // Un plan de 31 000 al mes con su precio «desde siempre» en el historial; antes de la migración no hay
    // periodicidad de órdenes (la migración la añade en quincenal, P14).
    planMensual = randomUUID();
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual") VALUES ($1, $2, 'publico', 31000)`, [
      planMensual,
      `SLT118 IV ${planMensual.slice(0, 8)}`,
    ]);
    await db.query(
      `INSERT INTO "plan_precio_historial" ("plan_id", "desde_at", "precio_mensual", "descuentos") VALUES ($1, '-infinity', 31000, '{}')`,
      [planMensual],
    );
    await sembrarEmpresa(null, null);
    for (const tipo of TIPOS_SEMBRADOS) await sembrarEmpresa(tipo, planMensual);

    antesDeM = await fotoCompleta();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R26: la migración deja a cada empresa UNA factura en curso desde el corte en curso, con su plan y sin marca", async () => {
    const antes = await inicioDelCorteEnCurso();
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    const despues = await inicioDelCorteEnCurso();
    const { rows } = await db.query(
      `SELECT "organizacion_id", "estado", to_char("desde_at", ${ISO}) AS desde, "hasta_at", "periodicidad", "plan_id",
              "tipo_cobro", "primera_cuota_desde_at", "numero"
         FROM "factura_plataforma" ORDER BY "organizacion_id"`,
    );
    expect(rows).toHaveLength(sembradas.length);
    for (const s of sembradas) {
      const f = rows.find((x) => x.organizacion_id === s.id);
      expect(f).toMatchObject({
        estado: "en_curso",
        hasta_at: null,
        periodicidad: "quincenal",
        plan_id: s.plan,
        tipo_cobro: s.tipo,
        primera_cuota_desde_at: null,
        numero: null,
      });
      // El inicio del corte quincenal en curso al migrar (con un margen por si la migración cruzó una medianoche).
      expect([antes, despues]).toContain(f?.desde);
    }
    // P14: los planes que ya existían quedan con órdenes quincenales.
    const { rows: planes } = await db.query(`SELECT "periodicidad_ordenes" FROM "plan" WHERE "id" = $1`, [planMensual]);
    expect(planes).toEqual([{ periodicidad_ordenes: "quincenal" }]);
  });

  it("R26 (P15), R11: el período de cobro en curso cuenta como pagado; dos cierres a la vez desde dos conexiones facturan una sola vez", async () => {
    const otra = await conectar(urlDe(BASE));
    try {
      const ahora = await instanteDeLaBase(db, "400 days");
      const cierre = `SELECT factura_plataforma_cerrar($1, $2::timestamp) AS n`;
      const porEmpresa: Record<string, number[]> = {};
      for (const s of sembradas) {
        const [a, b] = await Promise.all([db.query(cierre, [s.id, ahora]), otra.query(cierre, [s.id, ahora])]);
        porEmpresa[s.id] = [Number(a.rows[0].n), Number(b.rows[0].n)].sort((x, y) => x - y);
      }
      for (const s of sembradas) {
        const { rows } = await db.query(
          `SELECT count(*)::int AS cerradas, count(DISTINCT "desde_at")::int AS intervalos, min("numero") AS primero,
                  max("numero") AS ultimo, count(DISTINCT "numero")::int AS numeros,
                  count("cuota")::int AS con_cuota, count("primera_cuota_desde_at")::int AS con_marca,
                  to_char(min("cuota_desde_at"), ${ISO}) AS primera_cuota_desde,
                  to_char(plan_fin_periodo_calendario(COALESCE($2, 'quincenal'), now() AT TIME ZONE 'UTC'), ${ISO}) AS fin_del_en_curso
             FROM "factura_plataforma" WHERE "organizacion_id" = $1 AND "estado" = 'cerrada'`,
          [s.id, s.tipo],
        );
        const f = rows[0];
        // R11: una de las dos corridas cerró todo y la otra nada; números 1..n sin huecos ni repetidos.
        expect(porEmpresa[s.id][0]).toBe(0);
        expect(porEmpresa[s.id][1]).toBe(f.cerradas);
        expect(f.cerradas).toBeGreaterThanOrEqual(24);
        expect([f.intervalos, f.numeros, f.primero, f.ultimo]).toEqual([f.cerradas, f.cerradas, 1, f.cerradas]);
        // R26: ninguna primera cuota (la sembrada no es una primera asignación).
        expect(f.con_marca).toBe(0);
        if (s.plan === null) {
          expect(f.con_cuota).toBe(0);
        } else {
          // P15: la primera cuota es la del primer período de cobro que empieza DESPUÉS del despliegue.
          expect(f.primera_cuota_desde).toBe(f.fin_del_en_curso);
          expect(f.con_cuota).toBeGreaterThanOrEqual(1);
        }
      }
    } finally {
      await otra.end();
    }
  }, 120_000);

  it("R27: con una factura cerrada con cuota, el down se niega sin tocar nada", async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "factura_plataforma" WHERE "estado" = 'cerrada' AND "cuota" IS NOT NULL`);
    expect(rows[0].n).toBeGreaterThan(0);
    const con = await fotoCompleta();
    const negado = await correrYCapturar(sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(negado?.sqlstate).toBe("P0001");
    expect(negado?.message).toMatch(/SLT-118 down: hay facturas cerradas con cuota o primera cuota/);
    expect(diferencias(await fotoCompleta(), con)).toEqual([]);
  });

  it("R27: con solo una primera cuota cerrada, el down también se niega sin tocar nada", async () => {
    // Fuera las cerradas con cuota (el dueño borra; nadie las cambia). Queda la empresa sin plan.
    await db.query(`DELETE FROM "factura_plataforma" WHERE "estado" = 'cerrada' AND "cuota" IS NOT NULL`);
    const sinPlan = sembradas.find((s) => s.plan === null)?.id as string;
    // Primera asignación mensual el día después del corte en curso (R28): fija la en curso con la marca y
    // se emite con la primera cuota prorrateada y sin cuota de la emisión (no es un 1 de mes).
    const { rows: corte } = await db.query(
      `SELECT to_char("desde_at" + interval '1 day', 'YYYY-MM-DD HH24:MI:SS.MS') AS e FROM "factura_plataforma"
        WHERE "organizacion_id" = $1 AND "estado" = 'en_curso'`,
      [sinPlan],
    );
    const efecto = String(corte[0].e);
    await db.query(`SELECT factura_plataforma_tomar_cambio($1, $2::timestamp, $3, 'mensual')`, [sinPlan, efecto, planMensual]);
    await db.query(`SELECT factura_plataforma_cerrar($1, $2::timestamp + interval '10 minutes')`, [sinPlan, efecto]);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "factura_plataforma"
        WHERE "estado" = 'cerrada' AND ("cuota" IS NOT NULL OR "primera_cuota" IS NOT NULL)`,
    );
    const { rows: soloPrimera } = await db.query(
      `SELECT "cuota", "primera_cuota" IS NOT NULL AS primera FROM "factura_plataforma"
        WHERE "organizacion_id" = $1 AND "hasta_at" = $2::timestamp`,
      [sinPlan, efecto],
    );
    expect(rows[0].n).toBe(1);
    expect(soloPrimera).toEqual([{ cuota: null, primera: true }]);

    const con = await fotoCompleta();
    const negado = await correrYCapturar(sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(negado?.sqlstate).toBe("P0001");
    expect(negado?.message).toMatch(/SLT-118 down: hay facturas cerradas con cuota o primera cuota/);
    expect(diferencias(await fotoCompleta(), con)).toEqual([]);
  });

  it("R27: sin cuotas cerradas, el down deja la base como estaba (sin tabla, sin periodicidad y con el tope de SL-45) y se puede volver a subir", async () => {
    await db.query(`DELETE FROM "factura_plataforma" WHERE "primera_cuota" IS NOT NULL`);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "factura_plataforma" WHERE "estado" = 'cerrada'`);
    // Quedan cerradas solo con órdenes: no impiden bajar.
    expect(rows[0].n).toBeGreaterThan(0);

    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    // Esquema, funciones (el tope del pago incluido), triggers, privilegios, políticas y filas: los de antes.
    expect(diferencias(await fotoCompleta(), antesDeM)).toEqual([]);

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    const { rows: enCurso } = await db.query(
      `SELECT count(*)::int AS n, count(DISTINCT "organizacion_id")::int AS empresas FROM "factura_plataforma" WHERE "estado" = 'en_curso'`,
    );
    expect(enCurso[0]).toEqual({ n: sembradas.length, empresas: sembradas.length });
  });
});
