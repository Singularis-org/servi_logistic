import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EfectoElegido } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import type { Nivel } from "@/lib/planes/niveles";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, TipoCobro } from "@/lib/types/planes";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrdenes, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { cero } from "./_fixtures/periodo-calendario";
import { entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-215 · T6 (design §2.4, §3.4; R16, R31–R34) — el recálculo del nivel en los dos puntos de entrada de
// `PlanesRepository` REAL: `recibirCambio` (una empresa recibe la edición programada del plan) y `aplicarEnTx` (por
// `asignar`: primera asignación, cambio de plan y cambio de solo tipo). Cada caso en una transacción del dueño que se
// revierte; el repositorio abre las suyas como SAVEPOINT.
//
// El reloj va por parámetro: el del servicio (crear y programar, el 28 de octubre), el «ahora» de `asignar` y de
// `recibirCambio`, el `ocurrido_at` de cada cargo y el `p_ahora` del cierre. Los meses son los de la plataforma
// (−06:00): octubre va de `cero("2026-10-01")` a `cero("2026-11-01")`, excluido.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const ACTOR = randomUUID();
const SUPERADMIN: Actor = { usuarioId: ACTOR, rol: "superadmin", organizacionId: null };
/** 28 de octubre de 2026, 06:00 en la plataforma: cuando se crean y se programan los planes. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
/** F de las ediciones: la quincenal la recibe el 16 de noviembre y la mensual el 1 de diciembre. */
const PROGRAMADA = "2026-11-16";

const OCT = cero("2026-10-01");
const NOV = cero("2026-11-01");
const NOV16 = cero("2026-11-16");
const DIC = cero("2026-12-01");

/** Un instante `minutos` después de las 00:00 de la plataforma del día `fecha`. */
const a = (fecha: string, minutos = 0) => new Date(new Date(cero(fecha)).getTime() + minutos * 60_000).toISOString();

const pct = (meta: number, porcentaje: string): Nivel => ({ meta, descuento: { tipo: "porcentaje", porcentaje } });
const monto = (meta: number, m: string): Nivel => ({ meta, descuento: { tipo: "monto", monto: m } });

/** Los niveles de antes (una meta de 20) y los nuevos (10 y 14). */
const ANTES = [pct(20, "5")];
const NUEVOS = [pct(10, "5"), monto(14, "100")];

let base: PrismaClient;

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

const servicio = (tx: TxDeTest) => new PlanesService(planesEnTx(tx), () => AHORA);

async function crearPlanConNiveles(tx: TxDeTest, niveles: Nivel[]): Promise<string> {
  await fijarEmpresa(tx, "");
  const r = await servicio(tx).crear(SUPERADMIN, entradaAsignable({ niveles }));
  if (r.estado !== "ok") throw new Error(`crear: ${JSON.stringify(r)}`);
  return r.planId;
}

/** La edición que manda el formulario a partir del plan leído, con `cambio` encima, que rige en `PROGRAMADA`. */
async function programar(tx: TxDeTest, planId: string, cambio: Record<string, unknown>): Promise<void> {
  const plan = (await planesEnTx(tx).plan(planId)) as PlanDTO;
  await fijarEmpresa(tx, "");
  const { id, nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = plan;
  const r = await servicio(tx).editar(SUPERADMIN, {
    planId: id,
    nombre,
    topes,
    modulos,
    precio,
    costoPorOrden,
    costoPorOrdenPorcentual,
    vigenteDesde: PROGRAMADA,
    ...cambio,
  } as Parameters<PlanesService["editar"]>[1]);
  if (r.estado !== "ok") throw new Error(`programar: ${JSON.stringify(r)}`);
}

const efecto = (clase: EfectoElegido["clase"], fecha: string): EfectoElegido => ({
  clase,
  fecha,
  desde: inicioDelDiaPlataforma(fecha),
  elegida: true,
});

/** «Asignar» del superadmin por el repositorio real; con `desde` ≤ `ahora` se aplica en el acto. */
async function asignar(
  tx: TxDeTest,
  organizacionId: string,
  planId: string,
  clase: EfectoElegido["clase"],
  fecha: string,
  tipo: TipoCobro,
  ahora: string,
): Promise<void> {
  await fijarEmpresa(tx, "");
  const r = await planesEnTx(tx).asignar(organizacionId, planId, ACTOR, efecto(clase, fecha), tipo, new Date(ahora));
  if (r.estado !== "ok" || r.pendiente) throw new Error(`asignar: ${JSON.stringify(r)}`);
}

/** Una empresa nueva en `planId` desde el 1 de octubre (primera asignación). */
async function empresaEnPlan(tx: TxDeTest, planId: string, tipo: TipoCobro): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  await asignar(tx, e.id, planId, "inicio", "2026-10-01", tipo, AHORA.toISOString());
  return e;
}

/** `n` órdenes nuevas de la empresa, cada una con UN cargo en `en` (el del alta, con el reloj real, se borra). */
async function ordenesConCargo(tx: TxDeTest, e: EmpresaPorcentual, n: number, en: string): Promise<void> {
  await fijarEmpresa(tx, e.id);
  const ids = await crearOrdenes(tx, e, Array.from({ length: n }, () => ({})));
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = ANY($1::text[])`, ids);
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     SELECT 'slt215-' || gen_random_uuid()::text, $2, o, 1, 'cargo', 'plan', 100.00, $3::timestamp FROM unnest($1::text[]) AS o`,
    ids,
    e.id,
    en,
  );
  await fijarEmpresa(tx, "");
}

/** La cola da a UNA empresa la edición programada del plan, con su reloj. */
async function recibir(tx: TxDeTest, planId: string, organizacionId: string, ahora: string): Promise<void> {
  const { id: cambioId } = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId }, select: { id: true } });
  await fijarEmpresa(tx, "");
  const r = await planesEnTx(tx).recibirCambio({ planId, cambioId }, organizacionId, new Date(ahora));
  if (r.estado !== "aplicado") throw new Error(`recibirCambio: ${JSON.stringify(r)}`);
}

async function cerrar(tx: TxDeTest, org: string, ahora: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT plan_nivel_cerrar_meses($1, $2::timestamp) AS n`, org, ahora);
  return n;
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

interface Estado {
  nivel: number;
  cuenta: number;
  cerradoHasta: string;
  entrada: string;
}

async function estado(tx: TxDeTest, org: string): Promise<Estado | null> {
  const filas = await tx.$queryRawUnsafe<Estado[]>(
    `SELECT "nivel", "meses_sin_cumplir" AS cuenta, to_char("cerrado_hasta_at", ${ISO}) AS "cerradoHasta",
            to_char("entrada_at", ${ISO}) AS entrada
       FROM "plan_nivel_empresa" WHERE "organizacion_id" = $1`,
    org,
  );
  return filas[0] ?? null;
}

/** El historial de la empresa en orden: `motivo nivel_anterior→nivel desde mes órdenes`. */
async function historial(tx: TxDeTest, org: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT "motivo" || ' ' || "nivel_anterior" || '→' || "nivel" || ' desde ' || to_char("desde_at", ${ISO})
            || ' mes ' || COALESCE(to_char("mes_inicio_at", ${ISO}), '-') || ' órdenes ' || COALESCE("ordenes_efectivas"::text, '-') AS l
       FROM "plan_nivel_historial" WHERE "organizacion_id" = $1 ORDER BY "desde_at", "created_at"`,
    org,
  );
  return filas.map((f) => f.l);
}

async function planesDelHistorial(tx: TxDeTest, org: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ p: string }[]>(
    `SELECT "plan_id" AS p FROM "plan_nivel_historial" WHERE "organizacion_id" = $1 ORDER BY "desde_at", "created_at"`,
    org,
  );
  return filas.map((f) => f.p);
}

/* -------------------------------------------------------------------------- */
/* R31, R16 — recibir un cambio de niveles                                     */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-215 R31, R16 — una empresa recibe un cambio de los niveles", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R31: primero cierra el mes pendiente con las metas de antes y después recalcula con las nuevas; historial «cambio_niveles» desde la recepción", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlanConNiveles(tx, ANTES);
      const e = await empresaEnPlan(tx, planId, "quincenal");
      await ordenesConCargo(tx, e, 12, a("2026-10-10"));
      await programar(tx, planId, { niveles: NUEVOS });
      const antes = await estado(tx, e.id);
      await recibir(tx, planId, e.id, a(PROGRAMADA, 1));
      return { antes, despues: await estado(tx, e.id), historial: await historial(tx, e.id) };
    });
    // Control: octubre seguía pendiente al recibir.
    expect(r.antes).toEqual({ nivel: 0, cuenta: 0, cerradoHasta: OCT, entrada: OCT });
    // Octubre se cerró (cerrado hasta noviembre) con la meta de antes (12 < 20: sin subida). Con las nuevas habría
    // dejado una «subida» 0→1 desde el 1 de noviembre.
    expect(r.despues).toEqual({ nivel: 1, cuenta: 0, cerradoHasta: NOV, entrada: OCT });
    expect(r.historial).toEqual([`cambio_niveles 0→1 desde ${NOV16} mes ${OCT} órdenes 12`]);
  });

  it("R16: con el cambio a medias, A, que lo recibió, cierra con las metas nuevas y B, que no, con las de antes", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlanConNiveles(tx, ANTES);
      const A = await empresaEnPlan(tx, planId, "quincenal");
      const B = await empresaEnPlan(tx, planId, "mensual");
      for (const e of [A, B]) {
        await ordenesConCargo(tx, e, 12, a("2026-10-10"));
        await ordenesConCargo(tx, e, 15, a("2026-11-20"));
      }
      await programar(tx, planId, { niveles: NUEVOS });
      // A lo recibe el 16 de noviembre; B, mensual, el 1 de diciembre, después del cierre de las 00:20.
      await recibir(tx, planId, A.id, a(PROGRAMADA, 1));
      const cerrados = { A: await cerrar(tx, A.id, a("2026-12-01", 20)), B: await cerrar(tx, B.id, a("2026-12-01", 20)) };
      const alCerrar = {
        A: { estado: await estado(tx, A.id), historial: await historial(tx, A.id) },
        B: { estado: await estado(tx, B.id), historial: await historial(tx, B.id) },
      };
      await recibir(tx, planId, B.id, a("2026-12-01", 30));
      return { cerrados, alCerrar, B: { estado: await estado(tx, B.id), historial: await historial(tx, B.id) } };
    });
    expect(r.cerrados).toEqual({ A: 1, B: 2 });
    // A: noviembre con 10 y 14 → sube al 2 desde el 1 de diciembre.
    expect(r.alCerrar.A.estado).toEqual({ nivel: 2, cuenta: 0, cerradoHasta: DIC, entrada: OCT });
    expect(r.alCerrar.A.historial).toEqual([
      `cambio_niveles 0→1 desde ${NOV16} mes ${OCT} órdenes 12`,
      `subida 1→2 desde ${DIC} mes ${NOV} órdenes 15`,
    ]);
    // B: octubre y noviembre con la meta de antes (20) → sigue en el 0, sin historial.
    expect(r.alCerrar.B).toEqual({ estado: { nivel: 0, cuenta: 0, cerradoHasta: DIC, entrada: OCT }, historial: [] });
    // Cuando B lo recibe, se recalcula con noviembre (ya cerrado) y las metas nuevas.
    expect(r.B.estado).toEqual({ nivel: 2, cuenta: 0, cerradoHasta: DIC, entrada: OCT });
    expect(r.B.historial).toEqual([`cambio_niveles 0→2 desde ${DIC} mes ${NOV} órdenes 15`]);
  });
});

/* -------------------------------------------------------------------------- */
/* R32, R33 — cambio de plan y primera asignación                              */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-215 R32, R33 — tomar un plan", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R32: cambio de plan → cierra con el de antes, recalcula con el mes anterior entero y las metas del nuevo, y la entrada pasa a la fecha de efecto", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await crearPlanConNiveles(tx, ANTES);
      const nuevo = await crearPlanConNiveles(tx, NUEVOS);
      const e = await empresaEnPlan(tx, antes, "quincenal");
      await ordenesConCargo(tx, e, 12, a("2026-10-10"));
      await ordenesConCargo(tx, e, 3, a("2026-11-05"));
      await asignar(tx, e.id, nuevo, "cambio", PROGRAMADA, "quincenal", "2026-11-16T15:00:00.000Z");
      const alCambiar = { estado: await estado(tx, e.id), historial: await historial(tx, e.id), planes: await planesDelHistorial(tx, e.id) };
      // Noviembre: 3 antes de la entrada y 11 después. Solo cuentan las 11 (R24): 14 la habrían subido al 2.
      await ordenesConCargo(tx, e, 11, a("2026-11-20"));
      await cerrar(tx, e.id, a("2026-12-01", 20));
      return { nuevo, alCambiar, diciembre: { estado: await estado(tx, e.id), historial: await historial(tx, e.id) } };
    });
    // Octubre se cerró con el plan de antes (12 < 20, sin subida) y el recálculo cuenta octubre entero con 10 y 14.
    expect(r.alCambiar.estado).toEqual({ nivel: 1, cuenta: 0, cerradoHasta: NOV, entrada: NOV16 });
    expect(r.alCambiar.historial).toEqual([`cambio_plan 0→1 desde ${NOV16} mes ${OCT} órdenes 12`]);
    expect(r.alCambiar.planes).toEqual([r.nuevo]);
    expect(r.diciembre.estado).toEqual({ nivel: 1, cuenta: 0, cerradoHasta: DIC, entrada: NOV16 });
    expect(r.diciembre.historial).toEqual(r.alCambiar.historial);
  });

  it("R32: si entra con la versión de un cambio a medias del plan nuevo, recalcula con los niveles de esa versión", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await crearPlanConNiveles(tx, ANTES);
      const nuevo = await crearPlanConNiveles(tx, NUEVOS);
      // El plan nuevo tiene una edición que rige el 16 de noviembre con una sola meta de 13.
      await programar(tx, nuevo, { niveles: [pct(13, "5")] });
      const e = await empresaEnPlan(tx, antes, "quincenal");
      await ordenesConCargo(tx, e, 12, a("2026-10-10"));
      await asignar(tx, e.id, nuevo, "cambio", PROGRAMADA, "quincenal", "2026-11-16T15:00:00.000Z");
      const [{ version }] = await tx.$queryRawUnsafe<{ version: boolean }[]>(
        `SELECT EXISTS (SELECT 1 FROM "plan_version_empresa" WHERE "empresa_id" = $1 AND "plan_id" = $2) AS version`,
        e.id,
        nuevo,
      );
      return { version, estado: await estado(tx, e.id), historial: await historial(tx, e.id) };
    });
    // Control: entró con la versión del cambio. 12 < 13: nivel 0 (con los del plan, 10 y 14, habría sido el 1).
    expect(r.version).toBe(true);
    expect(r.estado).toEqual({ nivel: 0, cuenta: 0, cerradoHasta: NOV, entrada: NOV16 });
    expect(r.historial).toEqual([`cambio_plan 0→0 desde ${NOV16} mes ${OCT} órdenes 12`]);
  });

  it("R33: la primera asignación deja el nivel 0, la cuenta a 0 y la entrada en la fecha de efecto, sin historial, aunque el mes anterior cumpla", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlanConNiveles(tx, NUEVOS);
      const e = await crearEmpresa(tx);
      await ordenesConCargo(tx, e, 30, a("2026-10-10"));
      await fijarEmpresa(tx, "");
      const sinPlan = await estado(tx, e.id);
      await asignar(tx, e.id, plan, "inicio", PROGRAMADA, "quincenal", "2026-11-16T15:00:00.000Z");
      return { sinPlan, estado: await estado(tx, e.id), historial: await historial(tx, e.id) };
    });
    expect(r.sinPlan).toBeNull();
    // El mes de la entrada (noviembre) es el primero que se le cierra.
    expect(r.estado).toEqual({ nivel: 0, cuenta: 0, cerradoHasta: NOV, entrada: NOV16 });
    expect(r.historial).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* R34 — lo que no toca el nivel                                               */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-215 R34 — lo que no toca el nivel", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  /** Un estado que no es el de partida: nivel 1, un mes sin cumplir, y octubre aún pendiente. */
  async function conEstado(tx: TxDeTest, org: string): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE "plan_nivel_empresa" SET "nivel" = 1, "meses_sin_cumplir" = 1 WHERE "organizacion_id" = $1`,
      org,
    );
  }

  const QUIETO: Estado = { nivel: 1, cuenta: 1, cerradoHasta: OCT, entrada: OCT };

  it("R34: cambiar solo el tipo de cobro no toca nivel, cuenta, entrada ni meses pendientes", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlanConNiveles(tx, NUEVOS);
      const e = await empresaEnPlan(tx, plan, "quincenal");
      await ordenesConCargo(tx, e, 12, a("2026-10-10"));
      await conEstado(tx, e.id);
      await asignar(tx, e.id, plan, "cambio", "2026-11-01", "mensual", "2026-11-16T15:00:00.000Z");
      const [{ tipo }] = await tx.$queryRawUnsafe<{ tipo: string }[]>(
        `SELECT "plan_tipo_cobro" AS tipo FROM "organizacion" WHERE "id" = $1`,
        e.id,
      );
      return { tipo, estado: await estado(tx, e.id), historial: await historial(tx, e.id) };
    });
    expect(r.tipo).toBe("mensual");
    expect(r.estado).toEqual(QUIETO);
    expect(r.historial).toEqual([]);
  });

  // Los mismos niveles con otra escritura («5» y «5.00»), o una versión sin la clave `niveles` (R18).
  const CASOS: { nombre: string; cambio: Record<string, unknown> }[] = [
    { nombre: "los mismos niveles escritos de otra forma", cambio: { costoPorOrden: "90.00", niveles: [pct(10, "5.00"), monto(14, "100.0")] } },
    { nombre: "una versión sin niveles", cambio: { costoPorOrden: "90.00" } },
  ];

  for (const caso of CASOS) {
    it(`R34: recibir un cambio que no toca los niveles (${caso.nombre}) no toca nivel, cuenta, entrada ni meses pendientes`, async () => {
      const r = await revertida(base, async (tx) => {
        const plan = await crearPlanConNiveles(tx, NUEVOS);
        const e = await empresaEnPlan(tx, plan, "quincenal");
        await ordenesConCargo(tx, e, 12, a("2026-10-10"));
        await conEstado(tx, e.id);
        await programar(tx, plan, caso.cambio);
        await recibir(tx, plan, e.id, a(PROGRAMADA, 1));
        // Era la única empresa del plan y F ya pasó: la recepción promueve la versión al plan.
        const costo = (await planesEnTx(tx).plan(plan))?.costoPorOrden;
        return { costo, estado: await estado(tx, e.id), historial: await historial(tx, e.id) };
      });
      // Control: la recepción se aplicó (el plan, ya promovido, lleva el costo nuevo).
      expect(r.costo).toBe("90.00");
      expect(r.estado).toEqual(QUIETO);
      expect(r.historial).toEqual([]);
    });
  }
});
