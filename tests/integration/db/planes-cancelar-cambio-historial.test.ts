import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaDeEfectoPorDefecto } from "@/lib/planes/ciclo";
import { PlanesService } from "@/lib/services/PlanesService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, RegistroCaido, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { entradaAsignable, planesEnTx, revertida, superadminEnTx } from "./_fixtures/planes";
import { tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-86 · T8b (design §5.3; R19, R21, R26) — cancelar un cambio de empresa pendiente deja historial. Lo
// pidió el humano el 2026-11-05, tras T9, y sustituye a «cancelar no deja historial».
//
// Contra Postgres, con `PlanesService` y `PlanesRepository` REALES: el repositorio abre su transacción como
// SAVEPOINT de la del caso, y la del caso SIEMPRE se revierte. Los tres caminos que cancelan un pendiente
// («Cancelar cambio», la petición igual a lo vigente y el archivado) dejan la misma fila
// `plan_cambio_empresa_cancelado`: quién, cuándo y cuál era el cambio (plan, tipo y fecha de efecto).
//
// LOCKS: el de superadmin (SL-32) desde el `beforeAll`, para que la fila lleve un actor que resuelve; el de
// la 227 lo toma cada `revertida`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const dia = (dias: number) => fechaCalendarioCR(new Date(Date.now() + dias * UN_DIA_MS));
// SLT-118 (R30, R31): la fecha de un cambio a una empresa con plan se lleva al inicio del período siguiente del
// tipo de referencia. Las filas de cancelación llevan la fecha real; estas ya son un inicio y se respetan.
const PROXIMO_MES = fechaDeEfectoPorDefecto("mensual", new Date());
const PROXIMO_ANIO = fechaDeEfectoPorDefecto("anual", new Date());

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

interface Caso {
  actor: Actor;
  servicio: PlanesService;
  /** Crea un plan asignable y devuelve su id y su nombre. */
  plan: () => Promise<{ id: string; nombre: string }>;
  empresa: () => Promise<string>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const id = await superadminEnTx(tx);
  const actor: Actor = { usuarioId: id, rol: "superadmin", organizacionId: null };
  const servicio = new PlanesService(planesEnTx(tx));
  return {
    actor,
    servicio,
    plan: async () => {
      const entrada = entradaAsignable({ topes: { porRol: {}, apiKeys: null }, modulos: [] });
      const r = await servicio.crear(actor, entrada);
      if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
      return { id: r.planId, nombre: entrada.nombre };
    },
    empresa: async () => (await crearOrganizacion(tx)).id,
  };
}

/** Las filas de cancelación de la empresa, con lo que importa de cada una. */
async function cancelaciones(tx: TxDeTest, organizacionId: string) {
  return tx.historialAccion.findMany({
    where: { organizacionId, accion: "plan_cambio_empresa_cancelado" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      accion: true,
      entidadTipo: true,
      entidadId: true,
      entidadEtiqueta: true,
      valorAnterior: true,
      valorNuevo: true,
      actorUsuarioId: true,
      actorNombre: true,
      organizacionId: true,
    },
  });
}

async function pendiente(tx: TxDeTest, organizacionId: string) {
  return (await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { planCambioId: true } })).planCambioId;
}

describeSiHayBase("SLT-86 — cancelar un cambio de empresa deja historial (R19, R21, R26)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });

  afterAll(async () => {
    try {
      await soltarSuperadmin();
    } finally {
      await base?.$disconnect();
    }
  });

  it("R19, R26: «Cancelar cambio» deja UNA fila con quien cancela, el plan del pendiente y «fecha · tipo» del cambio; el detalle de empresa la lee como `cambio_cancelado`", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, nuevo] = [await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: actual.id, tipoCobro: "mensual", inicioCiclo: dia(0) });
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: nuevo.id, tipoCobro: "quincenal", vigenteDesde: PROXIMO_MES });
      const cancelar = await c.servicio.cancelarCambioEmpresa(c.actor, { organizacionId: org });
      const vista = await c.servicio.planDeEmpresa(c.actor, { organizacionId: org });
      return { actual, nuevo, org, cancelar, filas: await cancelaciones(tx, org), pendiente: await pendiente(tx, org), vista, actor: c.actor };
    });
    expect(r.cancelar).toEqual({ estado: "ok" });
    expect(r.pendiente).toBeNull();
    expect(r.filas).toEqual([
      {
        accion: "plan_cambio_empresa_cancelado",
        entidadTipo: "plan",
        entidadId: r.nuevo.id,
        entidadEtiqueta: `Plan «${r.nuevo.nombre}»`,
        valorAnterior: null,
        valorNuevo: `${PROXIMO_MES} · quincenal`,
        actorUsuarioId: r.actor.usuarioId,
        actorNombre: expect.any(String),
        organizacionId: r.org,
      },
    ]);
    expect(r.filas[0].actorNombre).not.toBe("");
    // La lectura que pinta T11: la cancelación arriba (la más reciente) y la asignación debajo.
    if (r.vista.estado !== "ok") throw new Error(`planDeEmpresa: ${r.vista.estado}`);
    expect(r.vista.vista.asignaciones.map(({ tipo, planNombre, tipoCobro, tipoCobroAnterior, desde }) => ({ tipo, planNombre, tipoCobro, tipoCobroAnterior, desde }))).toEqual([
      { tipo: "cambio_cancelado", planNombre: `Plan «${r.nuevo.nombre}»`, tipoCobro: "quincenal", tipoCobroAnterior: null, desde: PROXIMO_MES },
      { tipo: "asignacion", planNombre: `Plan «${r.actual.nombre}»`, tipoCobro: "mensual", tipoCobroAnterior: null, desde: dia(0) },
    ]);
  });

  it("R19: cancelar una primera asignación pendiente (empresa sin plan) también deja su fila, y la empresa sigue sin plan", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const org = await c.empresa();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: plan.id, tipoCobro: "anual", inicioCiclo: dia(4) });
      const cancelar = await c.servicio.cancelarCambioEmpresa(c.actor, { organizacionId: org });
      const empresa = await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planId: true, planCambioId: true } });
      return { plan, cancelar, empresa, filas: await cancelaciones(tx, org) };
    });
    expect(r.cancelar).toEqual({ estado: "ok" });
    expect(r.empresa).toEqual({ planId: null, planCambioId: null });
    expect(r.filas.map((f) => [f.entidadId, f.valorNuevo])).toEqual([[r.plan.id, `${dia(4)} · anual`]]);
  });

  it("R19: sin pendiente no escribe nada; reemplazar un pendiente por otro tampoco deja fila de cancelación", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos, tres] = [await c.plan(), await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: uno.id, tipoCobro: "mensual", inicioCiclo: dia(0) });
      const sinPendiente = await c.servicio.cancelarCambioEmpresa(c.actor, { organizacionId: org });
      const trasNada = await cancelaciones(tx, org);
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: dos.id, tipoCobro: "anual", vigenteDesde: dia(5) });
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: tres.id, tipoCobro: "bimestral", vigenteDesde: dia(7) });
      return { sinPendiente, trasNada, trasReemplazo: await cancelaciones(tx, org), pendiente: await pendiente(tx, org) };
    });
    expect(r.sinPendiente).toEqual({ estado: "sin_cambio_programado" });
    expect(r.trasNada).toEqual([]);
    expect(r.trasReemplazo).toEqual([]);
    expect(r.pendiente).not.toBeNull();
  });

  it("R19: pedir lo vigente con un pendiente lo cancela con su fila, firmada por quien lo pide (no por quien lo programó); pedirlo otra vez, ya sin pendiente, no escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const actual = await c.plan();
      const org = await c.empresa();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: actual.id, tipoCobro: "mensual", inicioCiclo: dia(0) });
      await c.servicio.cambiarTipoCobro(c.actor, { organizacionId: org, tipoCobro: "anual", vigenteDesde: PROXIMO_ANIO });
      // La base admite un solo superadmin (SL-32): el pendiente pasa a firmarlo otro usuario, para que la
      // fila distinga a quien lo programó de quien lo cancela.
      await fijarEmpresa(tx, org);
      const programo = (await crearUsuarioDePrueba(tx, "admin")).id;
      await fijarEmpresa(tx, "");
      await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_cambio_actor_id" = $1 WHERE "id" = $2`, programo, org);
      const identico = await c.servicio.asignar(c.actor, { organizacionId: org, planId: actual.id, tipoCobro: "mensual", vigenteDesde: dia(3) });
      const otraVez = await c.servicio.asignar(c.actor, { organizacionId: org, planId: actual.id, tipoCobro: "mensual", vigenteDesde: dia(3) });
      return { actual, identico, otraVez, programo, actor: c.actor, filas: await cancelaciones(tx, org), pendiente: await pendiente(tx, org) };
    });
    expect(r.identico).toEqual({ estado: "ok", planId: r.actual.id, cambio: true, avisos: [], vigenteDesde: null });
    expect(r.otraVez).toMatchObject({ estado: "ok", cambio: false });
    expect(r.pendiente).toBeNull();
    // El pendiente era un cambio de solo el tipo: su plan es el vigente.
    expect(r.filas.map((f) => ({ entidadId: f.entidadId, valorNuevo: f.valorNuevo, actor: f.actorUsuarioId }))).toEqual([
      { entidadId: r.actual.id, valorNuevo: `${PROXIMO_ANIO} · anual`, actor: r.actor.usuarioId },
    ]);
    expect(r.actor.usuarioId).not.toBe(r.programo);
  });

  it("R21: archivar cancela los pendientes hacia el plan con una fila por empresa, firmada por quien archiva; el pendiente hacia otro plan no deja fila", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, archivable, otro] = [await c.plan(), await c.plan(), await c.plan()];
      const [conPlan, sinPlan, aOtro] = [await c.empresa(), await c.empresa(), await c.empresa()];
      await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: actual.id, tipoCobro: "mensual", inicioCiclo: dia(0) });
      await c.servicio.asignar(c.actor, { organizacionId: aOtro, planId: actual.id, tipoCobro: "mensual", inicioCiclo: dia(0) });
      await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: archivable.id, tipoCobro: "anual", vigenteDesde: PROXIMO_ANIO });
      await c.servicio.asignar(c.actor, { organizacionId: sinPlan, planId: archivable.id, tipoCobro: "quincenal", inicioCiclo: dia(8) });
      await c.servicio.asignar(c.actor, { organizacionId: aOtro, planId: otro.id, tipoCobro: "anual", vigenteDesde: dia(8) });
      const archivar = await c.servicio.archivar(c.actor, { planId: archivable.id });
      return {
        archivable,
        archivar,
        actor: c.actor,
        conPlan: await cancelaciones(tx, conPlan),
        sinPlan: await cancelaciones(tx, sinPlan),
        aOtro: await cancelaciones(tx, aOtro),
      };
    });
    expect(r.archivar).toMatchObject({ estado: "ok", cambio: true });
    const forma = (filas: typeof r.conPlan) => filas.map((f) => ({ entidadId: f.entidadId, valorNuevo: f.valorNuevo, actor: f.actorUsuarioId }));
    expect(forma(r.conPlan)).toEqual([{ entidadId: r.archivable.id, valorNuevo: `${PROXIMO_ANIO} · anual`, actor: r.actor.usuarioId }]);
    expect(forma(r.sinPlan)).toEqual([{ entidadId: r.archivable.id, valorNuevo: `${dia(8)} · quincenal`, actor: r.actor.usuarioId }]);
    expect(r.aOtro).toEqual([]);
  });

  it("R19 (misma transacción): si la fila del historial no se puede escribir, el pendiente NO se cancela", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, nuevo] = [await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: actual.id, tipoCobro: "mensual", inicioCiclo: dia(0) });
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: nuevo.id, tipoCobro: "quincenal", vigenteDesde: dia(6) });
      const antes = await pendiente(tx, org);
      const roto = new PlanesService(planesEnTx(tx, "historial"));
      const error = await roto.cancelarCambioEmpresa(c.actor, { organizacionId: org }).catch((e: unknown) => e);
      const tras = await pendiente(tx, org);
      // Control: con el registro sano, la misma cancelación sí se hace.
      const sano = await c.servicio.cancelarCambioEmpresa(c.actor, { organizacionId: org });
      return { antes, error, tras, sano, filas: await cancelaciones(tx, org) };
    });
    expect(r.error).toBeInstanceOf(RegistroCaido);
    expect(r.antes).not.toBeNull();
    expect(r.tras).toBe(r.antes);
    expect(r.sano).toEqual({ estado: "ok" });
    expect(r.filas).toHaveLength(1);
  });
});
