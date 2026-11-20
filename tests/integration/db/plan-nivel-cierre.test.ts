import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EnqueueOpts, IJobRepository, JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";
import { recurrenciaCierreNiveles, sembrarCierreNiveles } from "@/lib/planes/jobs-niveles";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { NivelesEmpresaRepository } from "@/lib/repositories/NivelesEmpresaRepository";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  etiquetasDeEnum,
  type TxDeTest,
} from "./_postgres-real";
import { crearEmpresa, crearOrdenes, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, revertida } from "./_fixtures/planes";

// SLT-215 · T3 (design §2.1–§2.3; R22–R30) — el cierre mensual de los niveles contra Postgres real, por las
// funciones del dueño de 20261121140100 (`plan_nivel_ordenes_efectivas` y `plan_nivel_cerrar_meses`). Cada caso
// en una transacción del dueño que se revierte, salvo «dos cierres a la vez», que necesita dos conexiones que vean
// lo commiteado: ahí la siembra, la corrida y la limpieza van bajo el lock de la 227.
//
// El reloj va por parámetro: `p_ahora` del cierre y el `ocurrido_at` de cada cargo y reverso, escritos a mano como
// dueño (el cargo del alta de la orden, con el reloj real, se borra). Una cancelación por la API es la fila de
// `orden_historial_estado` con `origen_tipo = 'cancelacion_api'` que escribe `cancelarViaApi` (design §2.1).
//
// Los meses son los de la plataforma (−06:00): el de septiembre de 2026 va de `cero("2026-09-01")` =
// 2026-09-01 06:00 UTC a `cero("2026-10-01")`, excluido.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

let base: PrismaClient;

/* -------------------------------------------------------------------------- */
/* Escritura (como dueño)                                                      */
/* -------------------------------------------------------------------------- */

/** Un plan con estas metas (una por nivel, en orden) y un descuento cualquiera. Sin metas, sin niveles. */
async function planConMetas(tx: TxDeTest, metas: readonly number[]): Promise<string> {
  const planId = await crearPlan(tx);
  for (const [i, meta] of metas.entries()) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "plan_nivel" ("plan_id", "nivel", "meta", "descuento_pct") VALUES ($1, $2, $3, 5)`,
      planId,
      i + 1,
      meta,
    );
  }
  return planId;
}

/**
 * Una empresa que entra en un plan con estas metas en `entrada`, por `plan_nivel_tomar_plan` (la primera
 * asignación, R33): nivel 0, cuenta 0 y el mes de la entrada como el primero que se le cierra.
 */
async function empresaConMetas(tx: TxDeTest, metas: readonly number[], entrada: string): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  const planId = await planConMetas(tx, metas);
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $2, "plan_ciclo_ancla_at" = $3::timestamp WHERE "id" = $1`,
    e.id,
    planId,
    entrada,
  );
  await tx.$executeRawUnsafe(`SELECT plan_nivel_tomar_plan($1, $2::timestamp)`, e.id, entrada);
  return e;
}

/** Un movimiento del cobro de la plataforma de una orden, con su instante. */
async function movimiento(
  tx: TxDeTest,
  e: EmpresaPorcentual,
  orden: string,
  secuencia: number,
  tipo: "cargo" | "reverso",
  en: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     VALUES ($1, $2, $3, $4, $5::"cobro_plataforma_tipo", 'plan', 100.00, $6::timestamp)`,
    `slt215-${randomUUID()}`,
    e.id,
    orden,
    secuencia,
    tipo,
    en,
  );
}

/** `n` órdenes nuevas, cada una con UN cargo (secuencia 1) en `en`. Devuelve sus ids. */
async function ordenesConCargo(tx: TxDeTest, e: EmpresaPorcentual, n: number, en: string): Promise<string[]> {
  if (n === 0) return [];
  const ids = await crearOrdenes(tx, e, Array.from({ length: n }, () => ({})));
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = ANY($1::text[])`, ids);
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     SELECT 'slt215-' || gen_random_uuid()::text, $2, o, 1, 'cargo', 'plan', 100.00, $3::timestamp FROM unnest($1::text[]) AS o`,
    ids,
    e.id,
    en,
  );
  return ids;
}

let devolviendo: string | null = null;

/** La marca de `cancelarViaApi`: la fila del historial de estados con `origen_tipo = 'cancelacion_api'` en `en`. */
async function cancelarPorApi(tx: TxDeTest, e: EmpresaPorcentual, orden: string, en: string): Promise<void> {
  if (devolviendo === null) {
    const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "order_status" WHERE "value" = 'devolviendo_a_tienda'`,
    );
    if (filas.length === 0) throw new Error("falta el estado «devolviendo_a_tienda»: aplica las migraciones");
    devolviendo = filas[0].id;
  }
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden_historial_estado" ("id", "orden_id", "estatus_destino_id", "origen_tipo", "motivo", "created_at", "organizacion_id")
     VALUES ($1, $2, $3, 'cancelacion_api', 'cancelada por tienda', $4::timestamp, $5)`,
    randomUUID(),
    orden,
    devolviendo,
    en,
    e.id,
  );
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

async function efectivas(tx: TxDeTest, org: string, desde: string, hasta: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT plan_nivel_ordenes_efectivas($1, $2::timestamp, $3::timestamp) AS n`,
    org,
    desde,
    hasta,
  );
  return n;
}

async function cerrar(tx: Pick<TxDeTest, "$queryRawUnsafe">, org: string, ahora: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT plan_nivel_cerrar_meses($1, $2::timestamp) AS n`,
    org,
    ahora,
  );
  return n;
}

interface Estado {
  nivel: number;
  cuenta: number;
  cerradoHasta: string;
  entrada: string;
}

async function estado(tx: Pick<TxDeTest, "$queryRawUnsafe">, org: string): Promise<Estado> {
  const filas = await tx.$queryRawUnsafe<Estado[]>(
    `SELECT "nivel", "meses_sin_cumplir" AS cuenta, to_char("cerrado_hasta_at", ${ISO}) AS "cerradoHasta",
            to_char("entrada_at", ${ISO}) AS entrada
       FROM "plan_nivel_empresa" WHERE "organizacion_id" = $1`,
    org,
  );
  if (filas.length !== 1) throw new Error(`la empresa ${org} no tiene fila de nivel`);
  return filas[0];
}

/** El historial de la empresa en orden: `motivo nivel_anterior→nivel desde mes órdenes`. */
async function historial(tx: Pick<TxDeTest, "$queryRawUnsafe">, org: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT "motivo" || ' ' || "nivel_anterior" || '→' || "nivel" || ' desde ' || to_char("desde_at", ${ISO})
            || ' mes ' || COALESCE(to_char("mes_inicio_at", ${ISO}), '-') || ' órdenes ' || COALESCE("ordenes_efectivas"::text, '-') AS l
       FROM "plan_nivel_historial" WHERE "organizacion_id" = $1 ORDER BY "desde_at", "created_at"`,
    org,
  );
  return filas.map((f) => f.l);
}

/** Un instante `minutos` después de las 00:00 de la plataforma del día `fecha`. */
const a = (fecha: string, minutos = 0) => new Date(new Date(cero(fecha)).getTime() + minutos * 60_000).toISOString();

const AGO = cero("2026-08-01");
const SEP = cero("2026-09-01");
const OCT = cero("2026-10-01");
const NOV = cero("2026-11-01");

/* -------------------------------------------------------------------------- */
/* R22, R23 — órdenes efectivas                                                */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-215 R22, R23 — las órdenes efectivas de un mes", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  // Cada caso, su empresa y UNA orden con cargo el 10 de septiembre; lo que cuenta en septiembre y en octubre.
  const CASOS: { nombre: string; montar: (tx: TxDeTest, e: EmpresaPorcentual, orden: string) => Promise<void>; sep: number; oct: number }[] = [
    { nombre: "con cargo vigente", montar: async () => undefined, sep: 1, oct: 0 },
    {
      nombre: "anulada en el mes (reverso) y no recuperada",
      montar: (tx, e, o) => movimiento(tx, e, o, 2, "reverso", a("2026-09-12")),
      sep: 0,
      oct: 0,
    },
    {
      nombre: "anulada y recuperada en el mes (reverso y cargo nuevo): cuenta una vez",
      montar: async (tx, e, o) => {
        await movimiento(tx, e, o, 2, "reverso", a("2026-09-12"));
        await movimiento(tx, e, o, 3, "cargo", a("2026-09-14"));
      },
      sep: 1,
      oct: 0,
    },
    {
      nombre: "anulada el día 2 del mes siguiente: sigue contando en su mes",
      montar: (tx, e, o) => movimiento(tx, e, o, 2, "reverso", a("2026-10-02")),
      sep: 1,
      oct: 0,
    },
    {
      nombre: "cancelada por la API en el mes: no cuenta aunque conserve su cargo",
      montar: (tx, e, o) => cancelarPorApi(tx, e, o, a("2026-09-20")),
      sep: 0,
      oct: 0,
    },
    {
      nombre: "cancelada por la API el día 2 del mes siguiente: cuenta en su mes y no en el siguiente",
      montar: (tx, e, o) => cancelarPorApi(tx, e, o, a("2026-10-02")),
      sep: 1,
      oct: 0,
    },
  ];

  for (const caso of CASOS) {
    it(`R22: una orden ${caso.nombre}`, async () => {
      const r = await revertida(base, async (tx) => {
        const e = await empresaConMetas(tx, [1], AGO);
        const [orden] = await ordenesConCargo(tx, e, 1, a("2026-09-10"));
        await caso.montar(tx, e, orden);
        const cargos = await tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 AND "tipo" = 'cargo'`,
          orden,
        );
        return { sep: await efectivas(tx, e.id, SEP, OCT), oct: await efectivas(tx, e.id, OCT, NOV), cargos: cargos[0].n };
      });
      expect({ sep: r.sep, oct: r.oct }).toEqual({ sep: caso.sep, oct: caso.oct });
      // La cancelación por la API no deja reverso: el cargo sigue ahí (SL-40 P3), y aun así no cuenta.
      expect(r.cargos).toBeGreaterThanOrEqual(1);
    });
  }

  it("R22: una orden con dos cargos vigentes en el mes cuenta una sola vez", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaConMetas(tx, [1], AGO);
      const [orden] = await ordenesConCargo(tx, e, 1, a("2026-09-10"));
      await movimiento(tx, e, orden, 2, "cargo", a("2026-09-11"));
      return efectivas(tx, e.id, SEP, OCT);
    });
    expect(r).toBe(1);
  });

  it("R22: el ejemplo de la decisión a escala — 152 con cargo vigente y 3 canceladas por la API dan 149, que no llegan a 150", async () => {
    const r = await revertida(base, async (tx) => {
      const corto = await empresaConMetas(tx, [150], SEP);
      const ids = await ordenesConCargo(tx, corto, 152, a("2026-09-10"));
      for (const o of ids.slice(0, 3)) await cancelarPorApi(tx, corto, o, a("2026-09-25"));
      // Control: con 2 canceladas salen 150, que sí llegan.
      const justo = await empresaConMetas(tx, [150], SEP);
      const idsJusto = await ordenesConCargo(tx, justo, 152, a("2026-09-10"));
      for (const o of idsJusto.slice(0, 2)) await cancelarPorApi(tx, justo, o, a("2026-09-25"));
      return {
        corto: { efectivas: await efectivas(tx, corto.id, SEP, OCT), cerrados: await cerrar(tx, corto.id, a("2026-10-01", 20)) },
        justo: { efectivas: await efectivas(tx, justo.id, SEP, OCT), cerrados: await cerrar(tx, justo.id, a("2026-10-01", 20)) },
        nivelCorto: (await estado(tx, corto.id)).nivel,
        nivelJusto: (await estado(tx, justo.id)).nivel,
        historialCorto: await historial(tx, corto.id),
      };
    });
    expect(r.corto).toEqual({ efectivas: 149, cerrados: 1 });
    expect(r.justo).toEqual({ efectivas: 150, cerrados: 1 });
    expect(r.nivelCorto).toBe(0);
    expect(r.nivelJusto).toBe(1);
    expect(r.historialCorto).toEqual([]);
  });

  it("R22 (guardia): toda forma de cancelar del enum `orden_historial_origen_tipo` está en la función de órdenes efectivas", async () => {
    // Si el enum gana un valor que contiene `cancel` (otra vía de cancelar una orden), esta guardia falla hasta que
    // `plan_nivel_ordenes_efectivas` lo descuente también (design §2.1).
    const r = await revertida(base, async (tx) => {
      const valores = await etiquetasDeEnum(tx, "orden_historial_origen_tipo");
      const [{ def }] = await tx.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('public.plan_nivel_ordenes_efectivas(text, timestamp, timestamp)'::regprocedure) AS def`,
      );
      const cancelaciones = valores.filter((v) => v.includes("cancel"));
      return { cancelaciones, sinDescontar: cancelaciones.filter((v) => !def.includes(`'${v}'`)) };
    });
    expect(r.cancelaciones).toEqual(["cancelacion_api"]);
    expect(r.sinDescontar).toEqual([]);
  });

  it("R23: un cargo a las 05:59 UTC del día 1 es del mes anterior; a las 06:00, del nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaConMetas(tx, [1], SEP);
      await ordenesConCargo(tx, e, 1, "2026-10-01T05:59:59.999Z");
      const ultimoMinuto = { sep: await efectivas(tx, e.id, SEP, OCT), oct: await efectivas(tx, e.id, OCT, NOV) };
      const f = await empresaConMetas(tx, [1], SEP);
      await ordenesConCargo(tx, f, 1, "2026-10-01T06:00:00.000Z");
      const primerMinuto = { sep: await efectivas(tx, f.id, SEP, OCT), oct: await efectivas(tx, f.id, OCT, NOV) };
      // El cierre usa la misma definición del mes que el período de facturación (`plan_*_periodo_calendario`).
      const cerrados = await cerrar(tx, e.id, a("2026-10-01", 20));
      const [{ fin }] = await tx.$queryRawUnsafe<{ fin: string }[]>(
        `SELECT to_char(plan_fin_periodo_calendario('mensual', $1::timestamp), ${ISO}) AS fin`,
        SEP,
      );
      return { ultimoMinuto, primerMinuto, cerrados, fin, despues: await estado(tx, e.id), historial: await historial(tx, e.id) };
    });
    expect(r.ultimoMinuto).toEqual({ sep: 1, oct: 0 });
    expect(r.primerMinuto).toEqual({ sep: 0, oct: 1 });
    expect(r.fin).toBe(OCT);
    expect(r.cerrados).toBe(1);
    expect(r.despues).toMatchObject({ nivel: 1, cerradoHasta: OCT });
    expect(r.historial).toEqual([`subida 0→1 desde ${OCT} mes ${SEP} órdenes 1`]);
  });
});

/* -------------------------------------------------------------------------- */
/* R24–R28 — el cierre de un mes                                               */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-215 R24–R28 — el cierre de un mes", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R24: entrada el día 15 — solo cuentan las órdenes de después, contra la meta completa", async () => {
    const entrada = "2026-09-15T18:00:00.000Z";
    const r = await revertida(base, async (tx) => {
      // 2 antes y 2 después, meta 3: contando todo (4) o prorrateando la meta (~1,6) subiría; no sube.
      const e = await empresaConMetas(tx, [3], entrada);
      await ordenesConCargo(tx, e, 2, a("2026-09-05"));
      await ordenesConCargo(tx, e, 2, a("2026-09-20"));
      // 2 antes y 3 después: llega con las de después.
      const f = await empresaConMetas(tx, [3], entrada);
      await ordenesConCargo(tx, f, 2, a("2026-09-05"));
      await ordenesConCargo(tx, f, 3, a("2026-09-20"));
      const antes = await estado(tx, e.id);
      return {
        antes,
        cerrados: [await cerrar(tx, e.id, a("2026-10-01", 20)), await cerrar(tx, f.id, a("2026-10-01", 20))],
        e: { estado: await estado(tx, e.id), historial: await historial(tx, e.id) },
        f: { estado: await estado(tx, f.id), historial: await historial(tx, f.id) },
      };
    });
    // La entrada de la primera asignación (R33): el mes de la entrada es el primero que se cierra.
    expect(r.antes).toEqual({ nivel: 0, cuenta: 0, cerradoHasta: SEP, entrada });
    expect(r.cerrados).toEqual([1, 1]);
    expect(r.e).toEqual({ estado: { nivel: 0, cuenta: 0, cerradoHasta: OCT, entrada }, historial: [] });
    expect(r.f.estado).toMatchObject({ nivel: 1, cuenta: 0, cerradoHasta: OCT });
    expect(r.f.historial).toEqual([`subida 0→1 desde ${OCT} mes ${SEP} órdenes 3`]);
  });

  it("R25: del nivel 0 al 2 directo, con inicio en las 00:00 del día 1 siguiente y la cuenta a 0", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaConMetas(tx, [1, 2, 5], SEP);
      await ordenesConCargo(tx, e, 3, a("2026-09-10"));
      const cerrados = await cerrar(tx, e.id, a("2026-10-01", 20));
      return { cerrados, estado: await estado(tx, e.id), historial: await historial(tx, e.id) };
    });
    expect(r.cerrados).toBe(1);
    expect(r.estado).toMatchObject({ nivel: 2, cuenta: 0, cerradoHasta: OCT });
    expect(r.historial).toEqual([`subida 0→2 desde ${OCT} mes ${SEP} órdenes 3`]);
  });

  it("R26, R27: un mes sin cumplir no baja; dos seguidos bajan 1; uno que cumple en medio reinicia la cuenta", async () => {
    // Metas 2 y 4. Junio sube al 2 (4 órdenes); julio no cumple el 2 (2); agosto tampoco (1) → baja al 1 desde
    // septiembre. Septiembre no cumple el 1 (0); octubre sí (2) y reinicia; noviembre no (0): sigue en el 1.
    const MESES: [string, number][] = [
      ["2026-06", 4],
      ["2026-07", 2],
      ["2026-08", 1],
      ["2026-09", 0],
      ["2026-10", 2],
      ["2026-11", 0],
    ];
    const r = await revertida(base, async (tx) => {
      const e = await empresaConMetas(tx, [2, 4], cero("2026-06-01"));
      const tras: Record<string, [number, number]> = {};
      for (const [mes, n] of MESES) {
        await ordenesConCargo(tx, e, n, a(`${mes}-10`));
        const siguiente = new Date(`${mes}-01T12:00:00.000Z`);
        siguiente.setUTCMonth(siguiente.getUTCMonth() + 1);
        const corrida = a(siguiente.toISOString().slice(0, 10), 20);
        if ((await cerrar(tx, e.id, corrida)) !== 1) throw new Error(`${mes}: no cerró un mes`);
        const s = await estado(tx, e.id);
        tras[mes] = [s.nivel, s.cuenta];
      }
      return { tras, historial: await historial(tx, e.id) };
    });
    expect(r.tras).toEqual({
      "2026-06": [2, 0], // R25: sube directo
      "2026-07": [2, 1], // R26: un mes sin cumplir no baja
      "2026-08": [1, 0], // R26: el segundo seguido baja 1 y pone la cuenta a 0
      "2026-09": [1, 1],
      "2026-10": [1, 0], // R27: cumple el nivel actual sin llegar al siguiente: reinicia
      "2026-11": [1, 1], // R27: después del reinicio, un mes sin cumplir no baja
    });
    expect(r.historial).toEqual([
      `subida 0→2 desde ${cero("2026-07-01")} mes ${cero("2026-06-01")} órdenes 4`,
      `bajada 2→1 desde ${cero("2026-09-01")} mes ${cero("2026-08-01")} órdenes 1`,
    ]);
  });

  it("R28: en el nivel 0 no se baja; un plan sin niveles deja a la empresa en el 0 y no escribe historial", async () => {
    const r = await revertida(base, async (tx) => {
      const enCero = await empresaConMetas(tx, [5], cero("2026-07-01"));
      const sinNiveles = await empresaConMetas(tx, [], cero("2026-07-01"));
      await ordenesConCargo(tx, sinNiveles, 10, a("2026-08-10"));
      const cerrados = [await cerrar(tx, enCero.id, a("2026-10-01", 20)), await cerrar(tx, sinNiveles.id, a("2026-10-01", 20))];
      return {
        cerrados,
        enCero: { estado: await estado(tx, enCero.id), historial: await historial(tx, enCero.id) },
        sinNiveles: {
          estado: await estado(tx, sinNiveles.id),
          historial: await historial(tx, sinNiveles.id),
          efectivasAgosto: await efectivas(tx, sinNiveles.id, AGO, SEP),
        },
      };
    });
    expect(r.cerrados).toEqual([3, 3]);
    expect(r.enCero).toEqual({ estado: expect.objectContaining({ nivel: 0, cuenta: 0, cerradoHasta: OCT }), historial: [] });
    expect(r.sinNiveles).toEqual({
      estado: expect.objectContaining({ nivel: 0, cuenta: 0, cerradoHasta: OCT }),
      historial: [],
      efectivasAgosto: 10,
    });
  });

  it("R28: una empresa sin fila de nivel (sin plan) no se cierra", async () => {
    const r = await revertida(base, async (tx) => {
      const { id } = await crearOrganizacion(tx);
      return {
        cerrados: await cerrar(tx, id, a("2026-10-01", 20)),
        filas: await tx.planNivelEmpresa.count({ where: { organizacionId: id } }),
        historial: await historial(tx, id),
      };
    });
    expect(r).toEqual({ cerrados: 0, filas: 0, historial: [] });
  });
});

/* -------------------------------------------------------------------------- */
/* R29 — meses pendientes, repetir, tarde y a la vez                           */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-215 R29 — el cierre de los meses pendientes", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R29: tres meses pendientes se cierran en orden, y correrlo otra vez no cambia nada", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaConMetas(tx, [1, 2, 3], cero("2026-07-01"));
      await ordenesConCargo(tx, e, 1, a("2026-07-10"));
      await ordenesConCargo(tx, e, 2, a("2026-08-10"));
      await ordenesConCargo(tx, e, 3, a("2026-09-10"));
      const primera = await cerrar(tx, e.id, a("2026-10-02", 20));
      const tras = { estado: await estado(tx, e.id), historial: await historial(tx, e.id) };
      const segunda = await cerrar(tx, e.id, a("2026-10-02", 20));
      const otroDia = await cerrar(tx, e.id, a("2026-10-20", 20));
      return { primera, segunda, otroDia, tras, despues: { estado: await estado(tx, e.id), historial: await historial(tx, e.id) } };
    });
    expect(r.primera).toBe(3);
    expect(r.tras.estado).toMatchObject({ nivel: 3, cuenta: 0, cerradoHasta: OCT });
    expect(r.tras.historial).toEqual([
      `subida 0→1 desde ${AGO} mes ${cero("2026-07-01")} órdenes 1`,
      `subida 1→2 desde ${SEP} mes ${AGO} órdenes 2`,
      `subida 2→3 desde ${OCT} mes ${SEP} órdenes 3`,
    ]);
    expect([r.segunda, r.otroDia]).toEqual([0, 0]);
    expect(r.despues).toEqual(r.tras);
  });

  it("R29: cerrar el día 5 da el mismo resultado y el mismo inicio (día 1) que cerrar el día 1, aunque entre medias haya anulaciones y cancelaciones", async () => {
    const r = await revertida(base, async (tx) => {
      const montar = async () => {
        const e = await empresaConMetas(tx, [2, 4], SEP);
        const ids = await ordenesConCargo(tx, e, 4, a("2026-09-10"));
        return { e, ids };
      };
      const aTiempo = await montar();
      const tarde = await montar();
      const cerradosATiempo = await cerrar(tx, aTiempo.e.id, a("2026-10-01", 20));
      // Lo que pasa después del fin del mes (una anulación y una cancelación de órdenes de septiembre) no lo cambia.
      await movimiento(tx, tarde.e, tarde.ids[0], 2, "reverso", a("2026-10-02"));
      await cancelarPorApi(tx, tarde.e, tarde.ids[1], a("2026-10-03"));
      const cerradosTarde = await cerrar(tx, tarde.e.id, a("2026-10-05", 20));
      const sinEntrada = (s: Estado) => ({ nivel: s.nivel, cuenta: s.cuenta, cerradoHasta: s.cerradoHasta });
      return {
        cerrados: [cerradosATiempo, cerradosTarde],
        aTiempo: { estado: sinEntrada(await estado(tx, aTiempo.e.id)), historial: await historial(tx, aTiempo.e.id) },
        tarde: { estado: sinEntrada(await estado(tx, tarde.e.id)), historial: await historial(tx, tarde.e.id) },
      };
    });
    expect(r.cerrados).toEqual([1, 1]);
    expect(r.aTiempo.historial).toEqual([`subida 0→2 desde ${OCT} mes ${SEP} órdenes 4`]);
    expect(r.tarde).toEqual(r.aTiempo);
  });

  it("R29: dos cierres a la vez de la misma empresa (dos conexiones) cierran el mes una sola vez", async () => {
    const [c1, c2, sujeta] = [crearPrismaDeTest(), crearPrismaDeTest(), crearPrismaDeTest()];
    let org: string | null = null;
    let planId: string | null = null;
    try {
      const r = await bajoLockDeEscrituraReal(async () => {
        // Commiteado: una empresa en el nivel 1 con un mes ya sin cumplir; septiembre, sin órdenes, la baja al 0.
        planId = await planConMetas(base as unknown as TxDeTest, [1]);
        org = (await crearOrganizacion(base)).id;
        await base.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_id" = $2, "plan_ciclo_ancla_at" = $3::timestamp WHERE "id" = $1`, org, planId, AGO);
        await base.$executeRawUnsafe(
          `INSERT INTO "plan_nivel_empresa" ("organizacion_id", "nivel", "meses_sin_cumplir", "entrada_at", "cerrado_hasta_at")
           VALUES ($1, 1, 1, $2::timestamp, $3::timestamp)`,
          org,
          AGO,
          SEP,
        );
        const id = org;
        // Una tercera conexión toma la empresa en FOR UPDATE; los dos cierres arrancan y la esperan.
        const fila = await sostener(sujeta, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM "organizacion" WHERE "id" = $1 FOR UPDATE`, id));
        const deUno = cerrar(c1, id, a("2026-10-01", 20));
        const deOtro = cerrar(c2, id, a("2026-10-01", 20));
        try {
          await esperarBloqueados(base, fila.pid, 2);
        } finally {
          fila.soltar();
          await fila.fin;
        }
        return {
          cerrados: (await Promise.all([deUno, deOtro])).sort((x, y) => x - y),
          estado: await estado(base, id),
          historial: await historial(base, id),
        };
      });
      expect(r.cerrados).toEqual([0, 1]);
      expect(r.estado).toMatchObject({ nivel: 0, cuenta: 0, cerradoHasta: OCT });
      expect(r.historial).toEqual([`bajada 1→0 desde ${OCT} mes ${SEP} órdenes 0`]);
    } finally {
      const [id, plan] = [org, planId];
      await bajoLockDeEscrituraReal(async () => {
        // CASCADE: el nivel y el historial se van con la empresa; los niveles y el precio, con el plan.
        if (id !== null) await base.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = $1`, id);
        if (plan !== null) await base.$executeRawUnsafe(`DELETE FROM "plan" WHERE "id" = $1`, plan);
      });
      await Promise.all([c1.$disconnect(), c2.$disconnect(), sujeta.$disconnect()]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* T7 — el repositorio y la siembra del trabajo diario                        */
/* -------------------------------------------------------------------------- */

async function contarJobs(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "jobs" WHERE "tipo" = 'plan_niveles_cerrar'`;
  return f.n;
}

describeSiHayBase("SLT-215 R29, R30 — NivelesEmpresaRepository (lo que usa el trabajo diario)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R29: lista las empresas con algún mes terminado sin cerrar, cierra cada una por la función y después ya no las lista", async () => {
    const r = await revertida(base, async (tx) => {
      const repo = new NivelesEmpresaRepository(tx);
      const conAgosto = await empresaConMetas(tx, [2], AGO);
      const conSeptiembre = await empresaConMetas(tx, [2], SEP);
      await ordenesConCargo(tx, conSeptiembre, 2, a("2026-09-10"));
      const nuestras = (ids: string[]) => ids.filter((id) => id === conAgosto.id || id === conSeptiembre.id);
      const el2 = a("2026-10-02", 20);
      const antes = nuestras(await repo.empresasConMesPendiente(new Date(el2)));
      // El 20 de septiembre solo la de agosto tiene un mes terminado (agosto); la de septiembre, aún no.
      const el20 = nuestras(await repo.empresasConMesPendiente(new Date(a("2026-09-20"))));
      const cerrados = [await repo.cerrarMeses(conAgosto.id, new Date(el2)), await repo.cerrarMeses(conSeptiembre.id, new Date(el2))];
      const otraVez = await repo.cerrarMeses(conSeptiembre.id, new Date(el2));
      return {
        ids: { agosto: conAgosto.id, septiembre: conSeptiembre.id },
        antes,
        el20,
        cerrados,
        otraVez,
        despues: nuestras(await repo.empresasConMesPendiente(new Date(el2))),
        historial: await historial(tx, conSeptiembre.id),
      };
    });
    expect([...r.antes].sort()).toEqual([r.ids.agosto, r.ids.septiembre].sort());
    expect(r.el20).toEqual([r.ids.agosto]);
    // Agosto y septiembre para una; septiembre para la otra. Repetir no cierra nada.
    expect(r.cerrados).toEqual([2, 1]);
    expect(r.otraVez).toBe(0);
    expect(r.despues).toEqual([]);
    expect(r.historial).toEqual([`subida 0→1 desde ${OCT} mes ${SEP} órdenes 2`]);
  });

  it("R29: la siembra del cierre (sembrarCierreNiveles) y su re-agendado dejan UNA fila por día (contarJobs)", async () => {
    const r = await revertida(base, async (tx) => {
      // El trabajo es de plataforma: nace sin empresa (DEFAULT de `jobs`).
      await fijarEmpresa(tx, "");
      const real = new JobRepository(base);
      const repo = {
        enqueue: (tipo, payload, opts?: EnqueueOpts) => real.enqueue(tipo, payload, opts, tx as unknown as JobTxClient),
      } as IJobRepository;
      const antes = await contarJobs(tx);
      const primera = await sembrarCierreNiveles(repo, new Date("2026-12-01T01:00:00.000Z"));
      const segunda = await sembrarCierreNiveles(repo, new Date("2026-12-01T05:00:00.000Z"));
      const { runAfter, dedupeKey } = recurrenciaCierreNiveles.siguiente(new Date("2026-12-01T06:19:00.000Z"), []);
      const reencolada = await repo.enqueue("plan_niveles_cerrar", {}, { runAfter, dedupeKey });
      return { antes, despues: await contarJobs(tx), primera, segunda, reencolada };
    });
    expect(r.primera?.dedupeKey).toBe("plan_niveles_cerrar:2026-12-01");
    expect(r.primera?.runAfter.toISOString()).toBe("2026-12-01T06:20:00.000Z");
    expect(r.segunda).toBeNull();
    expect(r.reencolada).toBeNull();
    expect(r.despues).toBe(r.antes + 1);
  });

  it("R29: un día en que ninguna empresa tiene meses pendientes, la lista sale vacía", async () => {
    const r = await revertida(base, async (tx) => {
      await empresaConMetas(tx, [2], SEP);
      return new NivelesEmpresaRepository(tx).empresasConMesPendiente(new Date("2020-01-15T12:00:00.000Z"));
    });
    expect(r).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Concurrencia forzada (como en `plan-borrador-confirmar.test.ts`)           */
/* -------------------------------------------------------------------------- */

async function sostener(cliente: PrismaClient, tomar: (tx: TxDeTest) => Promise<unknown>) {
  let soltar: () => void = () => undefined;
  const suelta = new Promise<void>((r) => {
    soltar = r;
  });
  let listo: (pid: number) => void = () => undefined;
  const pid = new Promise<number>((r) => {
    listo = r;
  });
  const fin = cliente.$transaction(
    async (tx) => {
      const [{ p }] = await tx.$queryRawUnsafe<{ p: number }[]>(`SELECT pg_backend_pid() AS p`);
      await tomar(tx);
      listo(p);
      await suelta;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  return { pid: await pid, soltar, fin };
}

/** `n` backends bloqueados por `pid`, directa o indirectamente. Falla a los 4 s. */
async function esperarBloqueados(c: PrismaClient, pid: number, n: number): Promise<void> {
  const limite = Date.now() + 4_000;
  for (;;) {
    const [{ k }] = await c.$queryRawUnsafe<{ k: number }[]>(
      `WITH RECURSIVE espera(pid) AS (
         SELECT a.pid FROM pg_stat_activity a WHERE $1 = ANY(pg_blocking_pids(a.pid))
         UNION
         SELECT a.pid FROM pg_stat_activity a JOIN espera e ON e.pid = ANY(pg_blocking_pids(a.pid))
       )
       SELECT count(*)::int AS k FROM espera`,
      pid,
    );
    if (k >= n) return;
    if (Date.now() > limite) throw new Error(`solo ${k} de ${n} cierres esperan a ${pid}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
