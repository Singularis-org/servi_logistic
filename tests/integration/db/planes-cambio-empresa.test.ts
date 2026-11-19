import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { EfectoElegido } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { cobroDelPlan, montoDelPeriodo } from "@/lib/planes/cobro";
import { dedupeCambioEmpresa } from "@/lib/repositories/PlanesRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, PrecioPlan, TipoCobro, TopesPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaAsignable, planesEnTx, revertida, sqlstateDe, superadminEnTx } from "./_fixtures/planes";
import { tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-86 · T8 (design §5.1–§5.3; R1, R2, R14, R16–R21) — los cambios de empresa con fecha de efecto contra
// Postgres, con `PlanesService` y `PlanesRepository` REALES. El repositorio abre su transacción como
// SAVEPOINT de la del caso, y la del caso SIEMPRE se revierte.
//
// Dos relojes:
//   · los casos que pasan por el servicio usan su reloj real y fechas relativas a «hoy» de la plataforma
//     (dentro de los rangos de SLT-58 R30 y de R16);
//   · los que necesitan un día concreto (R17: «el 10») llaman al repositorio con un `ahora` explícito y
//     fechas fijas. El repositorio no lee el reloj de la base para decidir si la fecha ya rige: lo decide
//     el `ahora` que recibe, el mismo que el trabajo le pasa al aplicar.
//
// SLT-118 (R30–R34; P7, P9, P10): la fecha de efecto de un `"cambio"` se lleva al inicio del período siguiente
// del tipo de referencia (el más largo entre el vigente y el nuevo), salvo que ya lo sea; la primera asignación
// no se lleva. Los casos que dependen de «hoy» usan un servicio con reloj fijo (`servicioEn`): con el reloj
// real, «hoy» solo se aplica en el acto si cae en un inicio de período.
//
// LOCKS: el de superadmin (SL-32) desde el `beforeAll`, para que el historial lleve un actor que resuelve
// (R20: «con el actor que lo programó»); el de la 227 lo toma cada `revertida`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const UNA_HORA_MS = 60 * 60 * 1000;

/** La fecha de la plataforma de hoy ± `dias`. */
const dia = (dias: number) => fechaCalendarioCR(new Date(Date.now() + dias * UN_DIA_MS));

function efecto(clase: EfectoElegido["clase"], fecha: string): EfectoElegido {
  return { clase, fecha, desde: inicioDelDiaPlataforma(fecha), elegida: true };
}

const MENSUAL_31000: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: {} };

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

interface Caso {
  tx: TxDeTest;
  actor: Actor;
  servicio: PlanesService;
  /** SLT-118: un servicio con el reloj fijo en `ahora`. */
  servicioEn: (ahora: Date) => PlanesService;
  plan: (p?: { topes?: Partial<TopesPlan>; modulos?: CrearPlanInput["modulos"]; precio?: PrecioPlan }) => Promise<string>;
  empresa: () => Promise<string>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const id = await superadminEnTx(tx);
  const actor: Actor = { usuarioId: id, rol: "superadmin", organizacionId: null };
  const servicio = new PlanesService(planesEnTx(tx));
  return {
    tx,
    actor,
    servicio,
    servicioEn: (ahora) => new PlanesService(planesEnTx(tx), () => ahora),
    plan: async (p = {}) => {
      const r = await servicio.crear(
        actor,
        entradaAsignable({
          topes: { porRol: {}, apiKeys: null, ...p.topes },
          modulos: p.modulos ?? [],
          ...(p.precio === undefined ? {} : { precio: p.precio }),
        }),
      );
      if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
      return r.planId;
    },
    empresa: async () => (await crearOrganizacion(tx)).id,
  };
}

async function estado(tx: TxDeTest, organizacionId: string) {
  return {
    empresa: await tx.organizacion.findUniqueOrThrow({
      where: { id: organizacionId },
      select: {
        planId: true,
        planTipoCobro: true,
        planCicloAnclaAt: true,
        planCambioId: true,
        planCambioPlanId: true,
        planCambioTipoCobro: true,
        planCambioDesdeAt: true,
        planCambioActorId: true,
      },
    }),
    modulos: (await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } }))
      .map((m) => m.modulo)
      .sort(),
    historial: (
      await tx.historialAccion.findMany({
        where: { organizacionId, accion: { in: ["plan_asignado", "plan_tipo_cobro_cambiado"] } },
        select: { accion: true, entidadId: true, valorAnterior: true, valorNuevo: true, actorUsuarioId: true },
      })
    )
      .map((h) => JSON.stringify(h))
      .sort(),
  };
}

/** Los trabajos `plan_aplicar_cambio_empresa` de la empresa, con lo que el drenador mira. */
async function trabajos(tx: TxDeTest, organizacionId: string) {
  return tx.$queryRawUnsafe<{ payload: { cambioId: string }; run_after: Date; dedupe_key: string; organizacion_id: string }[]>(
    `SELECT "payload", "run_after", "dedupe_key", "organizacion_id" FROM "jobs"
      WHERE "tipo" = 'plan_aplicar_cambio_empresa' AND "organizacion_id" = $1 ORDER BY "created_at", "id"`,
    organizacionId,
  );
}

/** Aplica el pendiente que la empresa tenga ahora, como lo haría su trabajo, con el reloj dado. */
async function aplicar(tx: TxDeTest, organizacionId: string, ahora: Date) {
  const { planCambioId } = await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { planCambioId: true } });
  if (planCambioId === null) throw new Error("la empresa no tiene pendiente");
  return planesEnTx(tx).aplicarCambioDeEmpresa({ organizacionId, cambioId: planCambioId }, ahora);
}

/** Crea `n` usuarios `adminTienda` en la empresa; el error tal cual si un alta lo rechaza. */
async function tiendas(tx: TxDeTest, organizacionId: string, n: number): Promise<unknown> {
  await fijarEmpresa(tx, organizacionId);
  return capturar(tx, async () => {
    for (let i = 0; i < n; i++) await crearUsuarioDePrueba(tx, "adminTienda");
  });
}

/** Asigna el primer plan por el repositorio, con fecha y reloj fijos. */
async function primerPlan(tx: TxDeTest, actor: Actor, org: string, planId: string, fecha: string, tipo: TipoCobro) {
  const r = await planesEnTx(tx).asignar(org, planId, actor.usuarioId, efecto("inicio", fecha), tipo, new Date(`${fecha}T12:00:00.000Z`));
  if (r.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(r)}`);
}

describeSiHayBase("SLT-86 — cambios de empresa con fecha de efecto (R1, R2, R14, R16–R21)", () => {
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

  it("R1: un tipo fuera de los cuatro es validation_error en tipoCobro sin escribir; por SQL a mano, 23514 (también en el pendiente)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const org = await c.empresa();
      const antes = await estado(tx, org);
      const asignar = await c.servicio.asignar(c.actor, { organizacionId: org, planId: plan, tipoCobro: "semanal", inicioCiclo: dia(0) });
      const sinTipo = await c.servicio.asignar(c.actor, { organizacionId: org, planId: plan, inicioCiclo: dia(0) });
      const despues = await estado(tx, org);
      const columna = await capturar(tx, () =>
        tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'semanal' WHERE "id" = $1`, org),
      );
      const pendiente = await capturar(tx, () =>
        tx.$executeRawUnsafe(
          `UPDATE "organizacion" SET "plan_cambio_id" = 'x', "plan_cambio_plan_id" = $2, "plan_cambio_tipo_cobro" = 'semanal',
                  "plan_cambio_desde_at" = now(), "plan_cambio_actor_id" = 'x' WHERE "id" = $1`,
          org,
          plan,
        ),
      );
      return { asignar, sinTipo, antes, despues, columna: sqlstateDe(columna), pendiente: sqlstateDe(pendiente) };
    });
    for (const x of [r.asignar, r.sinTipo]) {
      expect(x.estado).toBe("validation_error");
      if (x.estado === "validation_error") expect(Object.keys(x.fieldErrors)).toEqual(["tipoCobro"]);
    }
    expect(r.despues).toEqual(r.antes);
    expect(r.columna).toBe("23514");
    expect(r.pendiente).toBe("23514");
  });

  it("R2: primera asignación quincenal con fecha pasada y de hoy → entra a las 00:00 de esa fecha, sin pendiente, y la fecha va al historial", async () => {
    const [pasada, hoy] = [dia(-10), dia(0)];
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const [a, b] = [await c.empresa(), await c.empresa()];
      const res = [
        await c.servicio.asignar(c.actor, { organizacionId: a, planId: plan, tipoCobro: "quincenal", inicioCiclo: pasada }),
        await c.servicio.asignar(c.actor, { organizacionId: b, planId: plan, tipoCobro: "quincenal", inicioCiclo: hoy }),
      ];
      return { res, plan, a: await estado(tx, a), b: await estado(tx, b), jobs: [...(await trabajos(tx, a)), ...(await trabajos(tx, b))], actor: c.actor };
    });
    for (const x of r.res) expect(x).toEqual({ estado: "ok", planId: r.plan, cambio: true, avisos: [], vigenteDesde: null });
    for (const [e, fecha] of [
      [r.a, pasada],
      [r.b, hoy],
    ] as const) {
      expect(e.empresa).toMatchObject({ planId: r.plan, planTipoCobro: "quincenal", planCambioId: null });
      // R2: también «hoy» entra a las 00:00, no en el instante de la asignación (sustituye a SLT-58 R32).
      expect(e.empresa.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(fecha).toISOString());
      expect(e.historial).toEqual([
        JSON.stringify({ accion: "plan_asignado", entidadId: r.plan, valorAnterior: null, valorNuevo: `${fecha} · quincenal`, actorUsuarioId: r.actor.usuarioId }),
      ]);
    }
    expect(r.jobs).toEqual([]);
  });

  it("R2, R20: primera asignación con fecha futura → pendiente sin plan; hasta su fecha, sin topes y con sus módulos; al aplicarse, entran plan, módulos, topes y tramo", async () => {
    const futura = dia(5);
    const desde = inicioDelDiaPlataforma(futura);
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ topes: { porRol: { adminTienda: 1 } }, modulos: ["monitoreo"] });
      const org = await c.empresa();
      const antes = await estado(tx, org);
      const res = await c.servicio.asignar(c.actor, { organizacionId: org, planId: plan, tipoCobro: "quincenal", inicioCiclo: futura });
      const pendiente = await estado(tx, org);
      const jobs = await trabajos(tx, org);
      // Hasta la fecha la empresa sigue sin plan: sin límites (SLT-58 R6).
      const sinTope = await tiendas(tx, org, 3);
      const antesDeLaFecha = await aplicar(tx, org, new Date(desde.getTime() - 1));
      const aplicado = await aplicar(tx, org, new Date(desde.getTime() + UNA_HORA_MS));
      const despues = await estado(tx, org);
      const conTope = await tiendas(tx, org, 1);
      return { res, plan, org, antes, pendiente, jobs, sinTope, antesDeLaFecha, aplicado, despues, conTope, actor: c.actor };
    });
    expect(r.res).toEqual({ estado: "ok", planId: r.plan, cambio: true, avisos: [], vigenteDesde: futura });
    expect(r.pendiente.empresa).toMatchObject({
      planId: null,
      planCicloAnclaAt: null,
      planCambioPlanId: r.plan,
      planCambioTipoCobro: "quincenal",
      planCambioActorId: r.actor.usuarioId,
    });
    expect(r.pendiente.empresa.planCambioDesdeAt?.toISOString()).toBe(desde.toISOString());
    expect(r.pendiente.modulos).toEqual(r.antes.modulos);
    expect(r.pendiente.historial).toEqual(r.antes.historial);
    // El trabajo, en la misma transacción: CON la empresa, a sus 00:00 y con la clave de ESE pendiente.
    const cambioId = r.pendiente.empresa.planCambioId as string;
    expect(r.jobs).toEqual([
      { payload: { cambioId }, run_after: desde, dedupe_key: dedupeCambioEmpresa(cambioId), organizacion_id: r.org },
    ]);
    expect(r.sinTope).toBeNull();
    expect(r.antesDeLaFecha).toEqual({ estado: "aun_no_rige" });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.despues.empresa).toMatchObject({ planId: r.plan, planTipoCobro: "quincenal", planCambioId: null, planCambioPlanId: null });
    expect(r.despues.empresa.planCicloAnclaAt?.toISOString()).toBe(desde.toISOString());
    expect(r.despues.modulos).toEqual(["monitoreo"]);
    expect(r.despues.historial).toEqual([
      JSON.stringify({ accion: "plan_asignado", entidadId: r.plan, valorAnterior: null, valorNuevo: `${futura} · quincenal`, actorUsuarioId: r.actor.usuarioId }),
    ]);
    // Desde la fecha rige el tope de usuarios del plan (SLT-58 R36: ya lo pasa, así que la siguiente alta no entra).
    expect(sqlstateDe(r.conTope)).toBe("SL024");
  });

  it("R17, R20, R30: mensual → quincenal elegido el 10 de octubre → rige el 1 de noviembre (tipo de referencia mensual); antes rige lo viejo; al aplicar, quincenas de calendario sin tramo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const viejo = await c.plan({ modulos: ["analitica"] });
      const nuevo = await c.plan({ modulos: ["monitoreo"], precio: MENSUAL_31000 });
      const org = await c.empresa();
      await primerPlan(tx, c.actor, org, viejo, "2026-10-01", "mensual");
      const antes = await estado(tx, org);
      const res = await planesEnTx(tx).asignar(
        org,
        nuevo,
        c.actor.usuarioId,
        efecto("cambio", "2026-10-10"),
        "quincenal",
        new Date("2026-10-05T12:00:00.000Z"),
      );
      const pendiente = await estado(tx, org);
      const jobs = await trabajos(tx, org);
      // SLT-118 (R30): el 10 ya no rige; el pendiente espera al 1 de noviembre.
      const el10 = await aplicar(tx, org, new Date("2026-10-10T07:00:00.000Z"));
      const temprano = await aplicar(tx, org, new Date("2026-11-01T05:59:59.999Z"));
      const trasTemprano = await estado(tx, org);
      const aplicado = await aplicar(tx, org, new Date("2026-11-01T07:00:00.000Z"));
      const despues = await estado(tx, org);
      const segunda = await planesEnTx(tx).aplicarCambioDeEmpresa(
        { organizacionId: org, cambioId: pendiente.empresa.planCambioId as string },
        new Date("2026-11-01T08:00:00.000Z"),
      );
      const base10 = await tx.$queryRawUnsafe<{ inicio: Date; fin: Date }[]>(
        `SELECT plan_inicio_ciclo_de("plan_ciclo_ancla_at", "plan_tipo_cobro", '2026-11-10 18:00'::timestamp) AS "inicio",
                plan_fin_periodo_calendario("plan_tipo_cobro", '2026-11-10 18:00'::timestamp) AS "fin"
           FROM "organizacion" WHERE "id" = $1`,
        org,
      );
      const base20 = await tx.$queryRawUnsafe<{ inicio: Date; fin: Date }[]>(
        `SELECT plan_inicio_ciclo_de("plan_ciclo_ancla_at", "plan_tipo_cobro", '2026-11-20 18:00'::timestamp) AS "inicio",
                plan_fin_periodo_calendario("plan_tipo_cobro", '2026-11-20 18:00'::timestamp) AS "fin"
           FROM "organizacion" WHERE "id" = $1`,
        org,
      );
      return { viejo, nuevo, antes, res, pendiente, jobs, el10, temprano, trasTemprano, aplicado, despues, segunda, base10, base20, actor: c.actor };
    });
    expect(r.res).toEqual({ estado: "ok", cambio: true, avisos: [], pendiente: true, vigenteDesde: "2026-11-01" });
    // R30: el pendiente y su trabajo, con la fecha real.
    expect(r.pendiente.empresa.planCambioDesdeAt?.toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(r.jobs.map((j) => j.run_after.toISOString())).toEqual(["2026-11-01T06:00:00.000Z"]);
    // R17: hasta las 00:00 del 1 de noviembre rige exactamente lo de antes.
    expect({ ...r.pendiente.empresa, planCambioId: null, planCambioPlanId: null, planCambioTipoCobro: null, planCambioDesdeAt: null, planCambioActorId: null }).toEqual(r.antes.empresa);
    expect(r.pendiente.modulos).toEqual(["analitica"]);
    expect(r.pendiente.historial).toEqual(r.antes.historial);
    expect(r.el10).toEqual({ estado: "aun_no_rige" });
    expect(r.temprano).toEqual({ estado: "aun_no_rige" });
    expect(r.trasTemprano).toEqual(r.pendiente);
    // R17, R20: desde las 00:00 del 1, plan, tipo, módulos y entrada nuevos, y la fila con quien lo programó.
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.segunda).toEqual({ estado: "sin_pendiente" });
    expect(r.despues.empresa).toEqual({
      planId: r.nuevo,
      planTipoCobro: "quincenal",
      planCicloAnclaAt: new Date("2026-11-01T06:00:00.000Z"),
      planCambioId: null,
      planCambioPlanId: null,
      planCambioTipoCobro: null,
      planCambioDesdeAt: null,
      planCambioActorId: null,
    });
    expect(r.despues.modulos).toEqual(["monitoreo"]);
    expect(r.despues.historial).toEqual(
      [
        ...r.antes.historial,
        JSON.stringify({ accion: "plan_asignado", entidadId: r.nuevo, valorAnterior: null, valorNuevo: "2026-11-01 · quincenal", actorUsuarioId: r.actor.usuarioId }),
      ].sort(),
    );
    // Sin tramo a mitad de período (SLT-118 modifica SLT-86 R17): quincenas de calendario completas desde el 1.
    const entrada = r.despues.empresa.planCicloAnclaAt as Date;
    expect(r.base10[0]).toEqual({ inicio: new Date("2026-11-01T06:00:00.000Z"), fin: new Date("2026-11-16T06:00:00.000Z") });
    const primera = cobroDelPlan(MENSUAL_31000, "quincenal", entrada, new Date("2026-11-10T18:00:00.000Z"), null);
    expect(primera.periodo).toEqual({ desde: "2026-11-01", hasta: "2026-11-15", esTramo: false });
    expect(primera.costo).toBe(montoDelPeriodo(MENSUAL_31000, "quincenal"));
    expect(primera.costo).toBe("15500.00");
    expect(r.base20[0]).toEqual({ inicio: new Date("2026-11-16T06:00:00.000Z"), fin: new Date("2026-12-01T06:00:00.000Z") });
    const quincena = cobroDelPlan(MENSUAL_31000, "quincenal", entrada, new Date("2026-11-20T18:00:00.000Z"), null);
    expect(quincena.periodo).toEqual({ desde: "2026-11-16", hasta: "2026-11-30", esTramo: false });
    expect(quincena.costo).toBe("15500.00");
  });

  it("R18, R30, R31: con «hoy» = 1 de diciembre (inicio de mes) un tope pasado rechaza; con el 5 se guarda para el 1 de enero con aviso y al aplicarse rige SLT-58 R36", async () => {
    // Reloj fijo: «hoy» solo se aplica en el acto si es el primer día de un período (R31).
    const hoy = "2026-12-01";
    const futura = "2026-12-05";
    const real = "2027-01-01";
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const servicio = c.servicioEn(new Date(`${hoy}T18:00:00.000Z`));
      const grande = await c.plan({ topes: { porRol: { adminTienda: 10 } } });
      const chico = await c.plan({ topes: { porRol: { adminTienda: 2 } } });
      const org = await c.empresa();
      await servicio.asignar(c.actor, { organizacionId: org, planId: grande, tipoCobro: "mensual", inicioCiclo: hoy });
      await tiendas(tx, org, 3);
      const antes = await estado(tx, org);
      const enHoy = await servicio.asignar(c.actor, { organizacionId: org, planId: chico, tipoCobro: "mensual", vigenteDesde: hoy });
      const trasHoy = await estado(tx, org);
      const conFecha = await servicio.asignar(c.actor, { organizacionId: org, planId: chico, tipoCobro: "mensual", vigenteDesde: futura });
      const pendiente = await estado(tx, org);
      const temprano = await aplicar(tx, org, new Date(inicioDelDiaPlataforma(futura).getTime() + UNA_HORA_MS));
      const aplicado = await aplicar(tx, org, new Date(inicioDelDiaPlataforma(real).getTime() + UNA_HORA_MS));
      const despues = await estado(tx, org);
      const otra = await tiendas(tx, org, 1);
      return { grande, chico, org, antes, enHoy, trasHoy, conFecha, pendiente, temprano, aplicado, despues, otra };
    });
    expect(r.enHoy).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "adminTienda", usados: 3, maximo: 2 }] });
    expect(r.trasHoy).toEqual(r.antes);
    expect(r.conFecha).toEqual({
      estado: "ok",
      planId: r.chico,
      cambio: true,
      avisos: [{ organizacionId: r.org, empresa: expect.any(String), tope: "adminTienda", usados: 3, maximo: 2 }],
      vigenteDesde: real,
    });
    expect(r.pendiente.empresa).toMatchObject({ planId: r.grande, planCambioPlanId: r.chico });
    expect(r.pendiente.empresa.planCambioDesdeAt?.toISOString()).toBe(inicioDelDiaPlataforma(real).toISOString());
    expect(r.temprano).toEqual({ estado: "aun_no_rige" });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.despues.empresa.planId).toBe(r.chico);
    expect(sqlstateDe(r.otra)).toBe("SL024");
  });

  it("R18, R31: con «hoy» en el inicio de un bimestre y sin topes pasados se aplica en la misma transacción: entrada a las 00:00 de hoy, sin pendiente ni trabajo", async () => {
    // Reloj fijo el 1 de enero: inicio de un período bimestral, el tipo de referencia de mensual → bimestral.
    const hoy = "2027-01-01";
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const servicio = c.servicioEn(new Date(`${hoy}T18:00:00.000Z`));
      const [uno, dos] = [await c.plan(), await c.plan({ modulos: ["ranking"] })];
      const org = await c.empresa();
      await servicio.asignar(c.actor, { organizacionId: org, planId: uno, tipoCobro: "mensual", inicioCiclo: "2026-12-12" });
      const res = await servicio.asignar(c.actor, { organizacionId: org, planId: dos, tipoCobro: "bimestral", vigenteDesde: hoy });
      return { dos, res, despues: await estado(tx, org), jobs: await trabajos(tx, org) };
    });
    expect(r.res).toEqual({ estado: "ok", planId: r.dos, cambio: true, avisos: [], vigenteDesde: null });
    expect(r.despues.empresa).toMatchObject({ planId: r.dos, planTipoCobro: "bimestral", planCambioId: null });
    expect(r.despues.empresa.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(hoy).toISOString());
    expect(r.despues.modulos).toEqual(["ranking"]);
    expect(r.jobs).toEqual([]);
  });

  it("R19: una petición nueva reemplaza el pendiente y el trabajo del viejo no escribe; pedir lo vigente lo cancela sin tocar lo vigente (su fila de cancelación: `planes-cancelar-cambio-historial`); sin pendiente, ok sin cambio", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos, tres] = [await c.plan(), await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: uno, tipoCobro: "mensual", inicioCiclo: dia(0) });
      const vigente = await estado(tx, org);
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: dos, tipoCobro: "anual", vigenteDesde: dia(5) });
      const primero = await estado(tx, org);
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: tres, tipoCobro: "quincenal", vigenteDesde: dia(7) });
      const segundo = await estado(tx, org);
      const viejo = await planesEnTx(tx).aplicarCambioDeEmpresa(
        { organizacionId: org, cambioId: primero.empresa.planCambioId as string },
        new Date(Date.now() + 30 * UN_DIA_MS),
      );
      const trasViejo = await estado(tx, org);
      const identico = await c.servicio.asignar(c.actor, { organizacionId: org, planId: uno, tipoCobro: "mensual", vigenteDesde: dia(3) });
      const cancelado = await estado(tx, org);
      const otraVez = await c.servicio.asignar(c.actor, { organizacionId: org, planId: uno, tipoCobro: "mensual", vigenteDesde: dia(3) });
      const tipoIgual = await c.servicio.cambiarTipoCobro(c.actor, { organizacionId: org, tipoCobro: "mensual", vigenteDesde: dia(3) });
      return { uno, vigente, primero, segundo, viejo, trasViejo, identico, cancelado, otraVez, tipoIgual, final: await estado(tx, org), jobs: await trabajos(tx, org) };
    });
    expect(r.primero.empresa).toMatchObject({ planId: r.uno, planCambioTipoCobro: "anual" });
    expect(r.segundo.empresa).toMatchObject({ planId: r.uno, planCambioTipoCobro: "quincenal" });
    expect(r.segundo.empresa.planCambioId).not.toBe(r.primero.empresa.planCambioId);
    expect(r.viejo).toEqual({ estado: "sin_pendiente" });
    expect(r.trasViejo).toEqual(r.segundo);
    // Un trabajo por pendiente: el del reemplazado sigue en la cola y no encuentra su `cambioId`.
    // Sin depender del orden: los dos nacen en la transacción del caso y comparten `created_at`.
    expect(r.jobs.map((j) => j.payload.cambioId).sort()).toEqual(
      [r.primero.empresa.planCambioId as string, r.segundo.empresa.planCambioId as string].sort(),
    );
    expect(r.identico).toEqual({ estado: "ok", planId: r.uno, cambio: true, avisos: [], vigenteDesde: null });
    expect(r.cancelado).toEqual(r.vigente);
    expect(r.otraVez).toEqual({ estado: "ok", planId: r.uno, cambio: false, avisos: [], vigenteDesde: null });
    expect(r.tipoIgual).toEqual({ estado: "ok", cambio: false, vigenteDesde: null });
    expect(r.final).toEqual(r.vigente);
  });

  it("R16, R20, R30: cambiar solo el tipo (mensual → anual) elegido el 20 de octubre → rige el 1 de enero; al aplicarse, `plan_tipo_cobro_cambiado` (antes → fecha · tipo) con quien lo programó, sin tocar plan ni módulos; el barrido lo ve solo desde su fecha", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ modulos: ["analitica"] });
      const org = await c.empresa();
      await primerPlan(tx, c.actor, org, plan, "2026-10-01", "mensual");
      const antes = await estado(tx, org);
      const res = await planesEnTx(tx).cambiarTipoCobro(org, "anual", efecto("cambio", "2026-10-20"), c.actor.usuarioId, new Date("2026-10-02T12:00:00.000Z"));
      const repo = planesEnTx(tx);
      const el20 = (await repo.cambiosDeEmpresaVencidos(new Date("2026-10-20T06:00:00.000Z"))).filter((v) => v.organizacionId === org);
      const vencidosAntes = (await repo.cambiosDeEmpresaVencidos(new Date("2027-01-01T05:59:59.999Z"))).filter((v) => v.organizacionId === org);
      const vencidos = (await repo.cambiosDeEmpresaVencidos(new Date("2027-01-01T06:00:00.000Z"))).filter((v) => v.organizacionId === org);
      const aplicado = await repo.aplicarCambioDeEmpresa(vencidos[0], new Date("2027-01-01T06:00:00.000Z"));
      const vencidosDespues = (await repo.cambiosDeEmpresaVencidos(new Date("2027-01-02T00:00:00.000Z"))).filter((v) => v.organizacionId === org);
      return { plan, antes, res, el20, vencidosAntes, vencidos, aplicado, vencidosDespues, despues: await estado(tx, org), actor: c.actor };
    });
    // R30: el tipo de referencia es el anual (el más largo); el 20 de octubre no es inicio de un año.
    expect(r.res).toEqual({ estado: "ok", cambio: true, pendiente: true, vigenteDesde: "2027-01-01" });
    expect(r.el20).toEqual([]);
    expect(r.vencidosAntes).toEqual([]);
    expect(r.vencidos).toHaveLength(1);
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.vencidosDespues).toEqual([]);
    expect(r.despues.empresa).toMatchObject({ planId: r.plan, planTipoCobro: "anual", planCambioId: null });
    expect(r.despues.empresa.planCicloAnclaAt?.toISOString()).toBe("2027-01-01T06:00:00.000Z");
    expect(r.despues.modulos).toEqual(r.antes.modulos);
    expect(r.despues.historial).toEqual(
      [
        ...r.antes.historial,
        JSON.stringify({ accion: "plan_tipo_cobro_cambiado", entidadId: r.plan, valorAnterior: "mensual", valorNuevo: "2027-01-01 · anual", actorUsuarioId: r.actor.usuarioId }),
      ].sort(),
    );
  });

  it("R16: la fecha de efecto es obligatoria con plan, no se admite sin plan ni fuera de hoy…hoy + 12 meses; nada se escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos] = [await c.plan(), await c.plan()];
      const [conPlan, sinPlan] = [await c.empresa(), await c.empresa()];
      await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: uno, tipoCobro: "mensual", inicioCiclo: dia(0) });
      const antes = [await estado(tx, conPlan), await estado(tx, sinPlan)];
      const res = {
        falta: await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: dos, tipoCobro: "mensual" }),
        pasada: await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: dos, tipoCobro: "mensual", vigenteDesde: dia(-1) }),
        lejos: await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: dos, tipoCobro: "mensual", vigenteDesde: dia(400) }),
        sinPlan: await c.servicio.asignar(c.actor, { organizacionId: sinPlan, planId: dos, tipoCobro: "mensual", vigenteDesde: dia(1) }),
        tipoPasada: await c.servicio.cambiarTipoCobro(c.actor, { organizacionId: conPlan, tipoCobro: "anual", vigenteDesde: dia(-1) }),
        tipoSinFecha: await c.servicio.cambiarTipoCobro(c.actor, { organizacionId: conPlan, tipoCobro: "anual" }),
      };
      return { res, antes, despues: [await estado(tx, conPlan), await estado(tx, sinPlan)] };
    });
    for (const x of Object.values(r.res)) {
      expect(x.estado).toBe("validation_error");
      if (x.estado === "validation_error") expect(Object.keys(x.fieldErrors)).toEqual(["vigenteDesde"]);
    }
    expect(r.despues).toEqual(r.antes);
  });

  it("R19, R26: «Cancelar cambio» limpia el pendiente sin tocar lo vigente (su fila: `planes-cancelar-cambio-historial`) y su trabajo ya no escribe; sin pendiente, sin_cambio_programado; empresa que no existe, not_found", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const org = await c.empresa();
      const antes = await estado(tx, org);
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: plan, tipoCobro: "mensual", inicioCiclo: dia(6) });
      const { empresa } = await estado(tx, org);
      const cancelar = await c.servicio.cancelarCambioEmpresa(c.actor, { organizacionId: org });
      const trasCancelar = await estado(tx, org);
      const trabajo = await planesEnTx(tx).aplicarCambioDeEmpresa(
        { organizacionId: org, cambioId: empresa.planCambioId as string },
        new Date(Date.now() + 30 * UN_DIA_MS),
      );
      return {
        antes,
        cancelar,
        trasCancelar,
        trabajo,
        otraVez: await c.servicio.cancelarCambioEmpresa(c.actor, { organizacionId: org }),
        noExiste: await planesEnTx(tx).cancelarCambioEmpresa("00000000-0000-4000-8000-000000000000", c.actor.usuarioId),
        final: await estado(tx, org),
      };
    });
    expect(r.cancelar).toEqual({ estado: "ok" });
    expect(r.trasCancelar).toEqual(r.antes);
    expect(r.trabajo).toEqual({ estado: "sin_pendiente" });
    expect(r.otraVez).toEqual({ estado: "sin_cambio_programado" });
    expect(r.noExiste).toEqual({ estado: "not_found" });
    expect(r.final).toEqual(r.antes);
  });

  it("R21: archivar un plan cancela en la misma transacción los pendientes hacia él, también una primera asignación; los demás pendientes siguen", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, archivable, otro] = [await c.plan(), await c.plan(), await c.plan()];
      const [conPlan, sinPlan, aOtro] = [await c.empresa(), await c.empresa(), await c.empresa()];
      await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: actual, tipoCobro: "mensual", inicioCiclo: dia(0) });
      await c.servicio.asignar(c.actor, { organizacionId: aOtro, planId: actual, tipoCobro: "mensual", inicioCiclo: dia(0) });
      const vigentes = [await estado(tx, conPlan), await estado(tx, sinPlan)];
      await c.servicio.asignar(c.actor, { organizacionId: conPlan, planId: archivable, tipoCobro: "anual", vigenteDesde: dia(8) });
      await c.servicio.asignar(c.actor, { organizacionId: sinPlan, planId: archivable, tipoCobro: "quincenal", inicioCiclo: dia(8) });
      await c.servicio.asignar(c.actor, { organizacionId: aOtro, planId: otro, tipoCobro: "anual", vigenteDesde: dia(8) });
      const delOtro = await estado(tx, aOtro);
      const archivar = await c.servicio.archivar(c.actor, { planId: archivable });
      return { otro, vigentes, delOtro, archivar, despues: [await estado(tx, conPlan), await estado(tx, sinPlan)], aOtro: await estado(tx, aOtro) };
    });
    expect(r.archivar).toMatchObject({ estado: "ok", cambio: true });
    expect(r.despues).toEqual(r.vigentes);
    expect(r.despues[1].empresa.planId).toBeNull();
    expect(r.aOtro).toEqual(r.delOtro);
    expect(r.aOtro.empresa.planCambioPlanId).toBe(r.otro);
  });

  it("R14: asignar, guardar un pendiente y aplicarlo no escriben en wallet_movimiento ni en cobro_plataforma_movimiento", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos] = [await c.plan({ precio: MENSUAL_31000 }), await c.plan({ precio: MENSUAL_31000 })];
      const org = await c.empresa();
      // Por empresa y no el total de la tabla: otros archivos que corren a la vez pueden confirmar filas.
      const contar = async () => ({
        wallet: await tx.walletMovimiento.count({ where: { organizacionId: org } }),
        cobro: await tx.cobroPlataformaMovimiento.count({ where: { organizacionId: org } }),
      });
      const antes = await contar();
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: uno, tipoCobro: "anual", inicioCiclo: dia(-3) });
      await c.servicio.asignar(c.actor, { organizacionId: org, planId: dos, tipoCobro: "quincenal", vigenteDesde: dia(2) });
      // SLT-118 (R30): se aplica en la fecha real que guardó el pendiente (anual → quincenal: el 1 de enero siguiente).
      const { planCambioDesdeAt } = await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planCambioDesdeAt: true } });
      const aplicado = await aplicar(tx, org, new Date((planCambioDesdeAt as Date).getTime() + UNA_HORA_MS));
      return { antes, aplicado, despues: await contar() };
    });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.despues).toEqual(r.antes);
  });
});

/* -------------------------------------------------------------------------- */
/* SLT-118 (design §3.1; R30, R31, R33, R34) — la fecha de efecto real          */
/* -------------------------------------------------------------------------- */

/** Una empresa con `planId` en `tipo` desde el 1 de noviembre de 2026 (primera asignación, sin llevar). */
async function conPlanDesdeEl1(tx: TxDeTest, actor: Actor, planId: string, tipo: TipoCobro): Promise<string> {
  const org = (await crearOrganizacion(tx)).id;
  await primerPlan(tx, actor, org, planId, "2026-11-01", tipo);
  return org;
}

/** El pendiente de la empresa como `AAAA-MM-DD` de la plataforma (o `null`), y si ya rige el tipo nuevo. */
async function pendienteDe(tx: TxDeTest, organizacionId: string) {
  const e = await tx.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { planId: true, planTipoCobro: true, planCicloAnclaAt: true, planCambioDesdeAt: true },
  });
  return { ...e, pendiente: e.planCambioDesdeAt === null ? null : fechaCalendarioCR(e.planCambioDesdeAt) };
}

/** 10 de noviembre de 2026, 12:00 en la plataforma: el «hoy» de los ejemplos de R30. */
const EL_10 = new Date("2026-11-10T18:00:00.000Z");

describeSiHayBase("SLT-118 — la fecha de efecto de un cambio del superadmin (R30, R31, R33, R34)", () => {
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

  // [vigente, nuevo, elegida, real]. El tipo de referencia es el más largo de los dos (P9).
  const CASOS_R30: [TipoCobro, TipoCobro, string, string][] = [
    // mismo tipo
    ["mensual", "mensual", "2026-11-10", "2026-12-01"],
    ["quincenal", "quincenal", "2026-11-10", "2026-11-16"],
    ["quincenal", "quincenal", "2026-11-20", "2026-12-01"],
    ["bimestral", "bimestral", "2026-11-10", "2027-01-01"],
    ["anual", "anual", "2026-11-10", "2027-01-01"],
    // a un tipo más largo
    ["quincenal", "anual", "2026-11-10", "2027-01-01"],
    ["quincenal", "mensual", "2026-11-10", "2026-12-01"],
    ["mensual", "bimestral", "2026-11-10", "2027-01-01"],
    // a un tipo más corto
    ["anual", "mensual", "2026-11-10", "2027-01-01"],
    ["mensual", "quincenal", "2026-11-10", "2026-12-01"],
  ];

  it.each(CASOS_R30)(
    "R30, R32: asignar otro plan, %s → %s elegido el %s → pendiente para el %s, con su trabajo a esa hora; sigue el plan y el tipo de antes",
    async (vigente, nuevo, elegida, real) => {
      const r = await revertida(base, async (tx) => {
        const c = await caso(tx);
        const [viejo, otro] = [await c.plan(), await c.plan()];
        const org = await conPlanDesdeEl1(tx, c.actor, viejo, vigente);
        const res = await planesEnTx(tx).asignar(org, otro, c.actor.usuarioId, efecto("cambio", elegida), nuevo, EL_10);
        return { viejo, res, empresa: await pendienteDe(tx, org), jobs: await trabajos(tx, org) };
      });
      expect(r.res).toEqual({ estado: "ok", cambio: true, avisos: [], pendiente: true, vigenteDesde: real });
      expect(r.empresa).toMatchObject({ planId: r.viejo, planTipoCobro: vigente, pendiente: real });
      expect(r.empresa.planCambioDesdeAt?.toISOString()).toBe(inicioDelDiaPlataforma(real).toISOString());
      expect(r.jobs.map((j) => j.run_after.toISOString())).toEqual([inicioDelDiaPlataforma(real).toISOString()]);
    },
  );

  it("R30: «hoy» = 10 de noviembre, mensual → 1 de diciembre: pendiente, sin aplicarse en el acto; al aplicarse, la entrada y el historial llevan el 1 de diciembre", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [viejo, nuevo] = [await c.plan(), await c.plan()];
      const org = await conPlanDesdeEl1(tx, c.actor, viejo, "mensual");
      const antes = await estado(tx, org);
      const res = await c.servicioEn(EL_10).asignar(c.actor, { organizacionId: org, planId: nuevo, tipoCobro: "mensual", vigenteDesde: "2026-11-10" });
      const pendiente = await estado(tx, org);
      const aplicado = await aplicar(tx, org, new Date("2026-12-01T07:00:00.000Z"));
      return { nuevo, antes, res, pendiente, aplicado, despues: await estado(tx, org), actor: c.actor };
    });
    expect(r.res).toEqual({ estado: "ok", planId: r.nuevo, cambio: true, avisos: [], vigenteDesde: "2026-12-01" });
    expect(r.pendiente.empresa.planId).toBe(r.antes.empresa.planId);
    expect(r.pendiente.empresa.planCicloAnclaAt).toEqual(r.antes.empresa.planCicloAnclaAt);
    expect(r.pendiente.historial).toEqual(r.antes.historial);
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.despues.empresa).toMatchObject({ planId: r.nuevo, planCicloAnclaAt: new Date("2026-12-01T06:00:00.000Z") });
    expect(r.despues.historial).toEqual(
      [
        ...r.antes.historial,
        JSON.stringify({ accion: "plan_asignado", entidadId: r.nuevo, valorAnterior: null, valorNuevo: "2026-12-01 · mensual", actorUsuarioId: r.actor.usuarioId }),
      ].sort(),
    );
  });

  // [vigente, nuevo, elegida]: la elegida ya es el primer día de un período del tipo de referencia.
  const CASOS_R31: [TipoCobro, TipoCobro, string][] = [
    ["mensual", "mensual", "2026-12-01"],
    ["quincenal", "quincenal", "2026-11-16"],
    ["anual", "anual", "2027-01-01"],
    ["quincenal", "anual", "2027-01-01"],
  ];

  it.each(CASOS_R31)("R31: asignar otro plan, %s → %s elegido el %s (inicio de un período del tipo de referencia) → se respeta", async (vigente, nuevo, elegida) => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [viejo, otro] = [await c.plan(), await c.plan()];
      const org = await conPlanDesdeEl1(tx, c.actor, viejo, vigente);
      const res = await planesEnTx(tx).asignar(org, otro, c.actor.usuarioId, efecto("cambio", elegida), nuevo, EL_10);
      return { res, empresa: await pendienteDe(tx, org) };
    });
    expect(r.res).toEqual({ estado: "ok", cambio: true, avisos: [], pendiente: true, vigenteDesde: elegida });
    expect(r.empresa.pendiente).toBe(elegida);
  });

  it("R31, R30: quincenal → mensual el 16 de noviembre (inicio del vigente, no del de referencia) → 1 de diciembre", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [viejo, otro] = [await c.plan(), await c.plan()];
      const org = await conPlanDesdeEl1(tx, c.actor, viejo, "quincenal");
      const res = await planesEnTx(tx).asignar(org, otro, c.actor.usuarioId, efecto("cambio", "2026-11-16"), "mensual", EL_10);
      return { res, empresa: await pendienteDe(tx, org) };
    });
    expect(r.res).toEqual({ estado: "ok", cambio: true, avisos: [], pendiente: true, vigenteDesde: "2026-12-01" });
    expect(r.empresa.pendiente).toBe("2026-12-01");
  });

  it("R33: la primera asignación no se lleva: inicio el 10 (a mitad de período) futuro → pendiente para el 10; de hoy → rige el 10 en el acto", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const [futura, hoy] = [await c.empresa(), await c.empresa()];
      const repo = planesEnTx(tx);
      const enFutura = await repo.asignar(futura, plan, c.actor.usuarioId, efecto("inicio", "2026-11-10"), "mensual", new Date("2026-11-05T18:00:00.000Z"));
      const enHoy = await repo.asignar(hoy, plan, c.actor.usuarioId, efecto("inicio", "2026-11-10"), "quincenal", EL_10);
      return { enFutura, enHoy, futura: await pendienteDe(tx, futura), hoy: await pendienteDe(tx, hoy), plan };
    });
    expect(r.enFutura).toEqual({ estado: "ok", cambio: true, avisos: [], pendiente: true, vigenteDesde: "2026-11-10" });
    expect(r.futura).toMatchObject({ planId: null, pendiente: "2026-11-10" });
    expect(r.enHoy).toEqual({ estado: "ok", cambio: true, avisos: [], pendiente: false });
    expect(r.hoy).toMatchObject({ planId: r.plan, planTipoCobro: "quincenal", pendiente: null });
    expect(r.hoy.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma("2026-11-10").toISOString());
  });

  it("R34, R32: con hoy el 10 de noviembre, quincenal → anual elegido el 10 de noviembre de 2027 (el tope) → pendiente para el 1 de enero de 2028; el 11 → validation_error sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [viejo, nuevo] = [await c.plan(), await c.plan()];
      const [enTope, fuera] = [await conPlanDesdeEl1(tx, c.actor, viejo, "quincenal"), await conPlanDesdeEl1(tx, c.actor, viejo, "quincenal")];
      const servicio = c.servicioEn(EL_10);
      const antesFuera = await estado(tx, fuera);
      const dentro = await servicio.asignar(c.actor, { organizacionId: enTope, planId: nuevo, tipoCobro: "anual", vigenteDesde: "2027-11-10" });
      const rechazo = await servicio.asignar(c.actor, { organizacionId: fuera, planId: nuevo, tipoCobro: "anual", vigenteDesde: "2027-11-11" });
      return {
        nuevo,
        dentro,
        rechazo,
        enTope: await pendienteDe(tx, enTope),
        jobs: await trabajos(tx, enTope),
        antesFuera,
        despuesFuera: await estado(tx, fuera),
      };
    });
    expect(r.dentro).toEqual({ estado: "ok", planId: r.nuevo, cambio: true, avisos: [], vigenteDesde: "2028-01-01" });
    expect(r.enTope.pendiente).toBe("2028-01-01");
    expect(r.jobs.map((j) => j.run_after.toISOString())).toEqual([inicioDelDiaPlataforma("2028-01-01").toISOString()]);
    expect(r.rechazo.estado).toBe("validation_error");
    if (r.rechazo.estado === "validation_error") expect(Object.keys(r.rechazo.fieldErrors)).toEqual(["vigenteDesde"]);
    expect(r.despuesFuera).toEqual(r.antesFuera);
  });
});
