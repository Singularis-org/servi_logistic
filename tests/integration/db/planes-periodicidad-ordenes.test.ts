import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { periodicidadIncompatible } from "@/lib/planes/mensajes";
import { PlanesService } from "@/lib/services/PlanesService";
import { TIPO_QUINCENAL_CON_ORDENES_MENSUALES, type CrearPlanInput, type PlanDTO, type TipoCobro } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearPlan, entradaAsignable, entradaDePlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-118 · T15.1 (design §1.2, §3.2, §8; R35, R37; P12, P14) — la periodicidad de órdenes del plan contra
// Postgres, con `PlanesService` y `PlanesRepository` REALES (el repositorio abre sus transacciones como SAVEPOINT
// de la del caso, que siempre se revierte). El reloj del servicio es fijo: 10 de noviembre de 2026, 09:00 de la
// plataforma.
//
// R35: crear con y sin ella, editar en el acto y programada (con su rastro y el aplicador de la cola), un plan
// existente queda quincenal, valor inválido. R37: asignar, crear el custom y cambiar el tipo con quincenal en un
// plan de órdenes mensuales; editar a mensual con una empresa quincenal y con un pendiente quincenal; una
// programada que deja de pasar al aplicarse. Cada rechazo se mide «sin escribir nada».

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ACTOR = randomUUID();
const SUPERADMIN: Actor = { usuarioId: ACTOR, rol: "superadmin", organizacionId: null };
/** 10 de noviembre de 2026, 15:00 UTC = 09:00 en la plataforma (−06:00). */
const AHORA = new Date("2026-11-10T15:00:00.000Z");
const PROGRAMADA = "2026-11-20";

let base: PrismaClient;

const servicio = (tx: TxDeTest) => new PlanesService(planesEnTx(tx), () => AHORA);

/** Crea el plan por el servicio; `entrada` pisa lo que haga falta. */
async function crear(tx: TxDeTest, entrada: CrearPlanInput): Promise<string> {
  const r = await servicio(tx).crear(SUPERADMIN, entrada);
  if (r.estado !== "ok") throw new Error(`crear: ${JSON.stringify(r)}`);
  return r.planId;
}

/** La edición completa a partir del plan leído: lo que manda el formulario, con `cambio` encima. */
function edicion(plan: PlanDTO, cambio: Record<string, unknown>, vigenteDesde: string | null = null): Record<string, unknown> {
  return {
    planId: plan.id,
    nombre: plan.nombre,
    topes: plan.topes,
    modulos: plan.modulos,
    precio: plan.precio,
    costoPorOrden: plan.costoPorOrden,
    costoPorOrdenPorcentual: plan.costoPorOrdenPorcentual,
    vigenteDesde,
    ...cambio,
  };
}

async function editar(tx: TxDeTest, planId: string, cambio: Record<string, unknown>, vigenteDesde: string | null = null) {
  const plan = await planesEnTx(tx).plan(planId);
  if (plan === null) throw new Error(`no existe el plan ${planId}`);
  // El superadmin no tiene empresa: los avisos y el trabajo del programado nacen sin ella.
  await fijarEmpresa(tx, "");
  return servicio(tx).editar(SUPERADMIN, edicion(plan, cambio, vigenteDesde));
}

async function columna(tx: TxDeTest, planId: string): Promise<string> {
  return (await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { periodicidadOrdenes: true } })).periodicidadOrdenes;
}

async function rastro(tx: TxDeTest, planId: string) {
  const filas = await tx.planRastro.findMany({ where: { planId }, select: { accion: true, cambios: true } });
  return filas.map((f) => ({ accion: f.accion, cambios: f.cambios as Record<string, unknown> }));
}

/** Una empresa nueva con el plan asignado hoy (primera asignación, en el acto). */
async function empresaCon(tx: TxDeTest, planId: string, tipoCobro: TipoCobro): Promise<string> {
  const { id } = await crearOrganizacion(tx, { nombre: `SLT118 periodicidad ${randomUUID().slice(0, 6)}` });
  const r = await servicio(tx).asignar(SUPERADMIN, { organizacionId: id, planId, tipoCobro });
  if (r.estado !== "ok" || r.cambio !== true) throw new Error(`asignar: ${JSON.stringify(r)}`);
  return id;
}

/** La fila de la empresa entera y su historial: lo que un rechazo a medias movería. */
async function fotoDeEmpresa(tx: TxDeTest, organizacionId: string) {
  const [fila] = await tx.$queryRawUnsafe<{ l: string }[]>(`SELECT o::text AS l FROM "organizacion" o WHERE o."id" = $1`, organizacionId);
  return {
    fila: fila.l,
    historial: await tx.historialAccion.count({ where: { organizacionId } }),
    trabajos: await tx.job.count({ where: { organizacionId } }),
  };
}

/** Todo lo que una edición del plan escribe: la fila, el rastro y el programado. */
async function fotoDelPlan(tx: TxDeTest, planId: string) {
  const [fila] = await tx.$queryRawUnsafe<{ l: string }[]>(`SELECT p::text AS l FROM "plan" p WHERE p."id" = $1`, planId);
  return {
    fila: fila.l,
    rastro: await tx.planRastro.count({ where: { planId } }),
    programado: await tx.planCambioProgramado.findUnique({ where: { planId }, select: { id: true, version: true } }),
  };
}

describeSiHayBase("SLT-118 — la periodicidad de órdenes del plan (R35, R37)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  /* --------------------------------- R35 --------------------------------- */

  it("R35: crear sin ella la deja quincenal y con ella la guarda; el rastro de alta la registra", async () => {
    const r = await revertida(base, async (tx) => {
      const sin = await crear(tx, entradaDePlan());
      const con = await crear(tx, entradaDePlan({ periodicidadOrdenes: "mensual" }));
      return {
        columnas: [await columna(tx, sin), await columna(tx, con)],
        dtos: [(await planesEnTx(tx).plan(sin))?.periodicidadOrdenes, (await planesEnTx(tx).plan(con))?.periodicidadOrdenes],
        rastros: [await rastro(tx, sin), await rastro(tx, con)],
      };
    });
    expect(r.columnas).toEqual(["quincenal", "mensual"]);
    // Las lecturas la llenan siempre.
    expect(r.dtos).toEqual(["quincenal", "mensual"]);
    expect(r.rastros.map((filas) => filas.map((f) => [f.accion, f.cambios.periodicidadOrdenes]))).toEqual([
      [["creado", { antes: null, despues: "quincenal" }]],
      [["creado", { antes: null, despues: "mensual" }]],
    ]);
  });

  it("R35: editar en el acto la cambia con su fila de rastro; una edición que no la trae no la cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crear(tx, entradaDePlan());
      const aMensual = await editar(tx, planId, { periodicidadOrdenes: "mensual" });
      const trasEditar = await columna(tx, planId);
      const soloNombre = await editar(tx, planId, { nombre: `otro ${randomUUID().slice(0, 6)}` });
      return { aMensual, trasEditar, soloNombre, final: await columna(tx, planId), rastro: await rastro(tx, planId) };
    });
    expect(r.aMensual).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: null });
    expect(r.trasEditar).toBe("mensual");
    expect(r.soloNombre).toMatchObject({ estado: "ok", cambio: true });
    expect(r.final).toBe("mensual");
    const editados = r.rastro.filter((f) => f.accion === "editado");
    expect(editados).toHaveLength(2);
    expect(editados.map((f) => f.cambios.periodicidadOrdenes)).toContainEqual({ antes: "quincenal", despues: "mensual" });
    // La edición sin ella no deja la clave: no cambió.
    expect(editados.filter((f) => "periodicidadOrdenes" in f.cambios)).toHaveLength(1);
  });

  it("R35: programada, no cambia hasta su fecha; el aplicador de la cola la escribe con su rastro", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crear(tx, entradaDePlan());
      const programada = await editar(tx, planId, { periodicidadOrdenes: "mensual" }, PROGRAMADA);
      const trasProgramar = await columna(tx, planId);
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId }, select: { id: true, version: true } });
      const aplicado = await planesEnTx(tx).aplicarCambioProgramado(
        { planId, cambioId: pendiente.id },
        new Date(inicioDelDiaPlataforma(PROGRAMADA).getTime() + 60_000),
      );
      return { programada, trasProgramar, version: pendiente.version, aplicado, final: await columna(tx, planId), rastro: await rastro(tx, planId) };
    });
    expect(r.programada).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: PROGRAMADA });
    expect(r.trasProgramar).toBe("quincenal");
    expect(r.version).toMatchObject({ periodicidadOrdenes: "mensual" });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.final).toBe("mensual");
    const porAccion = Object.fromEntries(r.rastro.map((f) => [f.accion, f.cambios.periodicidadOrdenes]));
    expect(porAccion.cambio_programado).toEqual({ antes: "quincenal", despues: "mensual" });
    expect(porAccion.cambio_aplicado).toEqual({ antes: "quincenal", despues: "mensual" });
  });

  it("R35, P14: un plan que ya existía (escrito sin la columna) queda quincenal: el DEFAULT de la migración", async () => {
    const r = await revertida(base, async (tx) => {
      // Como un plan de antes de la migración: el INSERT no nombra la columna.
      const planId = await crearPlan(tx);
      const [{ porDefecto }] = await tx.$queryRawUnsafe<{ porDefecto: string | null }[]>(
        `SELECT column_default AS "porDefecto" FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'plan' AND column_name = 'periodicidad_ordenes'`,
      );
      return { columna: await columna(tx, planId), dto: (await planesEnTx(tx).plan(planId))?.periodicidadOrdenes, porDefecto };
    });
    expect(r.columna).toBe("quincenal");
    expect(r.dto).toBe("quincenal");
    expect(r.porDefecto).toContain("'quincenal'");
  });

  it("R35: un valor que no es quincenal ni mensual es validation_error en `periodicidadOrdenes` al crear y al editar; la base lo rechaza (CHECK)", async () => {
    const r = await revertida(base, async (tx) => {
      const nombre = `invalido ${randomUUID().slice(0, 6)}`;
      const alCrear = await servicio(tx).crear(SUPERADMIN, { ...entradaDePlan({ nombre }), periodicidadOrdenes: "semanal" });
      const planId = await crear(tx, entradaDePlan());
      const antes = await fotoDelPlan(tx, planId);
      const alEditar = await editar(tx, planId, { periodicidadOrdenes: "anual" });
      const despues = await fotoDelPlan(tx, planId);
      const punto = `sp_${randomUUID().replace(/-/g, "")}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
      let sqlstate: string | null = null;
      try {
        await tx.$executeRawUnsafe(`UPDATE "plan" SET "periodicidad_ordenes" = 'semanal' WHERE "id" = $1`, planId);
      } catch (e) {
        sqlstate = sqlstateDe(e);
      }
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
      return { alCrear, creados: await tx.plan.count({ where: { nombre } }), alEditar, antes, despues, sqlstate };
    });
    expect(r.alCrear).toMatchObject({ estado: "validation_error" });
    expect(Object.keys((r.alCrear as { fieldErrors: Record<string, string[]> }).fieldErrors)).toEqual(["periodicidadOrdenes"]);
    expect(r.creados).toBe(0);
    expect(r.alEditar).toMatchObject({ estado: "validation_error" });
    expect(Object.keys((r.alEditar as { fieldErrors: Record<string, string[]> }).fieldErrors)).toEqual(["periodicidadOrdenes"]);
    expect(r.despues).toEqual(r.antes);
    expect(r.sqlstate).toBe("23514");
  });

  /* --------------------------------- R37 --------------------------------- */

  it("R37: asignar con tipo quincenal un plan de órdenes mensuales es validation_error en `tipoCobro` y no escribe nada; con mensual se asigna", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crear(tx, entradaAsignable({ periodicidadOrdenes: "mensual" }));
      const { id: org } = await crearOrganizacion(tx, { nombre: `SLT118 R37 ${randomUUID().slice(0, 6)}` });
      const antes = await fotoDeEmpresa(tx, org);
      const quincenal = await servicio(tx).asignar(SUPERADMIN, { organizacionId: org, planId, tipoCobro: "quincenal" });
      const despues = await fotoDeEmpresa(tx, org);
      const mensual = await servicio(tx).asignar(SUPERADMIN, { organizacionId: org, planId, tipoCobro: "mensual" });
      return { quincenal, antes, despues, mensual };
    });
    expect(r.quincenal).toEqual({ estado: "validation_error", fieldErrors: { tipoCobro: [TIPO_QUINCENAL_CON_ORDENES_MENSUALES] } });
    expect(r.despues).toEqual(r.antes);
    expect(r.mensual).toMatchObject({ estado: "ok", cambio: true });
  });

  it("R37: crear el custom con tipo quincenal y órdenes mensuales es validation_error en `tipoCobro` (esquema y repositorio) sin crear nada; un público mensual se crea", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: org } = await crearOrganizacion(tx, { nombre: `SLT118 custom ${randomUUID().slice(0, 6)}` });
      const nombre = `custom ${randomUUID().slice(0, 8)}`;
      const entrada = entradaAsignable({ nombre, visibilidad: "custom", organizacionId: org, tipoCobro: "quincenal", periodicidadOrdenes: "mensual" });
      const antes = await fotoDeEmpresa(tx, org);
      const porServicio = await servicio(tx).crear(SUPERADMIN, entrada);
      // El repositorio lo repite bajo el cerrojo (la otra red, sin pasar por el esquema).
      const porRepositorio = await planesEnTx(tx).crearYAsignar(
        { ...entrada, organizacionId: org },
        ACTOR,
        { efecto: { clase: "inicio", fecha: "2026-11-10", desde: inicioDelDiaPlataforma("2026-11-10"), elegida: false }, tipoCobro: "quincenal" },
        AHORA,
      );
      const despues = await fotoDeEmpresa(tx, org);
      const publico = await servicio(tx).crear(SUPERADMIN, entradaDePlan({ periodicidadOrdenes: "mensual" }));
      return {
        porServicio,
        porRepositorio,
        planes: await tx.plan.count({ where: { nombre } }),
        rastro: await tx.planRastro.count({ where: { planNombre: nombre } }),
        antes,
        despues,
        publico,
      };
    });
    expect(r.porServicio).toEqual({ estado: "validation_error", fieldErrors: { tipoCobro: [TIPO_QUINCENAL_CON_ORDENES_MENSUALES] } });
    expect(r.porRepositorio).toEqual({ estado: "periodicidad_incompatible" });
    expect(r.planes).toBe(0);
    expect(r.rastro).toBe(0);
    expect(r.despues).toEqual(r.antes);
    expect(r.publico).toMatchObject({ estado: "ok", cambio: true });
  });

  it("R37: cambiar el tipo a quincenal con el plan de órdenes mensuales de la empresa es validation_error en `tipoCobro` y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crear(tx, entradaAsignable({ periodicidadOrdenes: "mensual" }));
      const org = await empresaCon(tx, planId, "mensual");
      const antes = await fotoDeEmpresa(tx, org);
      const cambio = await servicio(tx).cambiarTipoCobro(SUPERADMIN, { organizacionId: org, tipoCobro: "quincenal", vigenteDesde: "2026-12-01" });
      return { cambio, antes, despues: await fotoDeEmpresa(tx, org) };
    });
    expect(r.cambio).toEqual({ estado: "validation_error", fieldErrors: { tipoCobro: [TIPO_QUINCENAL_CON_ORDENES_MENSUALES] } });
    expect(r.despues).toEqual(r.antes);
  });

  it("R37: editar a mensual con una empresa quincenal es validation_error en `periodicidadOrdenes`, en el acto y programada, sin escribir nada; con empresas mensuales se guarda", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crear(tx, entradaAsignable());
      await empresaCon(tx, planId, "quincenal");
      await empresaCon(tx, planId, "mensual");
      const antes = await fotoDelPlan(tx, planId);
      const enElActo = await editar(tx, planId, { periodicidadOrdenes: "mensual" });
      const programada = await editar(tx, planId, { periodicidadOrdenes: "mensual" }, PROGRAMADA);
      const despues = await fotoDelPlan(tx, planId);
      // Control: el mismo cambio en un plan cuyas empresas son todas mensuales sí se guarda.
      const otro = await crear(tx, entradaAsignable());
      await empresaCon(tx, otro, "mensual");
      const control = await editar(tx, otro, { periodicidadOrdenes: "mensual" });
      return { enElActo, programada, antes, despues, control, controlColumna: await columna(tx, otro) };
    });
    const error = { estado: "validation_error", fieldErrors: { periodicidadOrdenes: [periodicidadIncompatible(1)] } };
    expect(r.enElActo).toEqual(error);
    expect(r.programada).toEqual(error);
    expect(r.despues).toEqual(r.antes);
    expect(r.antes.programado).toBeNull();
    expect(r.control).toMatchObject({ estado: "ok", cambio: true });
    expect(r.controlColumna).toBe("mensual");
  });

  it("R37: editar a mensual un plan que una empresa tiene como cambio pendiente con tipo quincenal es validation_error en `periodicidadOrdenes` sin escribir nada", async () => {
    const r = await revertida(base, async (tx) => {
      const actual = await crear(tx, entradaAsignable());
      const destino = await crear(tx, entradaAsignable());
      const org = await empresaCon(tx, actual, "mensual");
      // El pendiente hacia `destino` con tipo quincenal (como lo deja `asignar` con fecha futura).
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "plan_cambio_id" = $2, "plan_cambio_plan_id" = $3, "plan_cambio_tipo_cobro" = 'quincenal',
                "plan_cambio_desde_at" = $4::timestamp, "plan_cambio_actor_id" = $5 WHERE "id" = $1`,
        org,
        randomUUID(),
        destino,
        "2026-12-01 06:00:00",
        ACTOR,
      );
      const antes = await fotoDelPlan(tx, destino);
      const enElActo = await editar(tx, destino, { periodicidadOrdenes: "mensual" });
      const programada = await editar(tx, destino, { periodicidadOrdenes: "mensual" }, PROGRAMADA);
      return { enElActo, programada, antes, despues: await fotoDelPlan(tx, destino) };
    });
    const error = { estado: "validation_error", fieldErrors: { periodicidadOrdenes: [periodicidadIncompatible(1)] } };
    expect(r.enElActo).toEqual(error);
    expect(r.programada).toEqual(error);
    expect(r.despues).toEqual(r.antes);
  });

  it("R37: una programada a mensual que ya no pasa al aplicarse (una empresa quincenal asignada después) hace fallar el trabajo sin escribir nada", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crear(tx, entradaAsignable());
      const programada = await editar(tx, planId, { periodicidadOrdenes: "mensual" }, PROGRAMADA);
      // Hasta su fecha el plan sigue quincenal: una empresa quincenal se le puede asignar.
      await empresaCon(tx, planId, "quincenal");
      const antes = await fotoDelPlan(tx, planId);
      const cambioId = antes.programado?.id ?? "";
      let error: unknown = null;
      try {
        await planesEnTx(tx).aplicarCambioProgramado({ planId, cambioId }, new Date(inicioDelDiaPlataforma(PROGRAMADA).getTime() + 60_000));
      } catch (e) {
        error = e;
      }
      return { programada, antes, error, despues: await fotoDelPlan(tx, planId) };
    });
    expect(r.programada).toMatchObject({ estado: "ok", cambio: true });
    expect(r.error).toBeInstanceOf(Error);
    expect(String((r.error as Error).message)).toContain("R37");
    // Ni la columna, ni el rastro, ni el programado (sigue pendiente: el trabajo se reintenta y queda `failed`).
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.programado).not.toBeNull();
  });
});
