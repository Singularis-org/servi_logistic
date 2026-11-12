import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { crearPlanAplicarCambioHandler } from "@/lib/planes/jobs-cambio-plan";
import { PlanesService } from "@/lib/services/PlanesService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, RegistroCaido, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { entradaAsignable, entradaDePlan, planesEnTx, revertida, superadminEnTx } from "./_fixtures/planes";
import { tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SL-24 · T4 (design §2.8, §9; R29, R40, R43 en lo que toca a T4) — el rastro de los planes contra
// Postgres, con un superadmin DE VERDAD (su nombre y su rol quedan congelados en las filas):
//   · `plan_rastro` (plataforma): crear, editar y archivar un público SIN empresas, con el diff exacto;
//     archivar con un cambio pendiente lo cancela con su fila `cambio_cancelado` (R40);
//   · `historial_accion` de la empresa: `plan_asignado` con el superadmin, en el mismo lote que las
//     filas de módulos de la sincronización;
//   · si el registro falla, el cambio no persiste.
// T11 (§16.2, §16.3; R43): las cuatro filas del cambio programado (programar, reemplazar, cancelar y
// aplicar), con quién, qué plan y qué cambia; la de aplicar la firma el sistema en nombre de quien lo
// programó.
//
// LOCKS: el de superadmin (SL-32) desde el `beforeAll`; el de la 227 lo toma cada `revertida`, por
// dentro. Todo se revierte: el superadmin del caso también.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** SLT-86 (R22, R30): hoy en la plataforma, la fecha de un precio que rige ya y la del historial. */
const HOY = fechaCalendarioCR(new Date());

/** SLT-86 (R31): el alta deja las cuatro claves de descuento, vacías si no hay. */
const ALTA_SIN_DESCUENTOS = {
  descuento_quincenal: { antes: null, despues: null },
  descuento_mensual: { antes: null, despues: null },
  descuento_bimestral: { antes: null, despues: null },
  descuento_anual: { antes: null, despues: null },
};
let soltarSuperadmin: () => Promise<void> = async () => {};

async function conSuperadmin(tx: TxDeTest) {
  const id = await superadminEnTx(tx);
  const actor: Actor = { usuarioId: id, rol: "superadmin", organizacionId: null };
  const nombre = (await tx.usuario.findUniqueOrThrow({ where: { id }, select: { nombre: true, primerApellido: true } }));
  return { actor, nombre: `${nombre.nombre} ${nombre.primerApellido}` };
}

const ORDEN_DE_ACCION = [
  "creado",
  "editado",
  "archivado",
  "cambio_reemplazado",
  "cambio_programado",
  "cambio_cancelado",
  "cambio_aplicado",
];

/** Por `created_at`; dos filas de la misma operación pueden compartir milisegundo, y ahí manda la acción. */
async function rastroDe(tx: TxDeTest, planId: string) {
  const filas = await tx.planRastro.findMany({
    where: { planId },
    select: { planId: true, planNombre: true, accion: true, cambios: true, actorUsuarioId: true, actorNombre: true, createdAt: true },
  });
  return filas
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || ORDEN_DE_ACCION.indexOf(a.accion) - ORDEN_DE_ACCION.indexOf(b.accion))
    .map((f) => ({
      planId: f.planId,
      planNombre: f.planNombre,
      accion: f.accion,
      cambios: f.cambios,
      actorUsuarioId: f.actorUsuarioId,
      actorNombre: f.actorNombre,
    }));
}

describeSiHayBase("SL-24 — el rastro de los planes (R29, R40, R43)", () => {
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

  it("R29: un público sin empresas deja su rastro al crear, editar y archivar, con el diff exacto", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor, nombre } = await conSuperadmin(tx);
      const servicio = new PlanesService(planesEnTx(tx));
      const creado = await servicio.crear(actor, {
        nombre: "Básico",
        visibilidad: "publico",
        organizacionId: null,
        topes: { porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "monto", mensual: "25000", descuentos: {} },
        costoPorOrden: null, // SLT-66 R8: campo obligatorio nuevo; no cambia lo que se comprueba.
        costoPorOrdenPorcentual: null, // SLT-83: campo obligatorio nuevo; no cambia lo que se comprueba.
      });
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const planId = creado.planId;
      // SLT-86 (R22, R33): un descuento anual de 50 000 (el anual fijo de 250 000 de antes) con la fecha de hoy.
      await servicio.editar(actor, {
        planId,
        nombre: "Básico plus",
        topes: { porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "monto", mensual: "25000.00", descuentos: { anual: { tipo: "monto", monto: "50000" } } },
        costoPorOrden: null, // SLT-66 R8: campo obligatorio nuevo; no cambia lo que se comprueba.
        costoPorOrdenPorcentual: null, // SLT-83: campo obligatorio nuevo; no cambia lo que se comprueba.
        vigenteDesde: HOY,
      });
      await servicio.archivar(actor, { planId });
      const repetido = await servicio.archivar(actor, { planId });
      const empresas = await tx.organizacion.count({ where: { planId } });
      return { planId, actor, nombre, repetido, empresas, rastro: await rastroDe(tx, planId) };
    });
    expect(r.empresas).toBe(0);
    expect(r.repetido).toMatchObject({ estado: "ok", cambio: false });
    const quien = { planId: r.planId, actorUsuarioId: r.actor.usuarioId, actorNombre: r.nombre };
    expect(r.rastro).toEqual([
      {
        ...quien,
        planNombre: "Básico",
        accion: "creado",
        cambios: {
          nombre: { antes: null, despues: "Básico" },
          topes: { antes: null, despues: { porRol: { adminTienda: 3 }, apiKeys: null } },
          modulos: { antes: null, despues: ["ranking"] },
          // SLT-86 (R31): `precio` guarda solo el mensual; cada descuento, en su clave.
          precio: { antes: null, despues: { tipo: "monto", mensual: "25000.00" } },
          ...ALTA_SIN_DESCUENTOS,
          costoPorOrden: { antes: null, despues: null }, // SLT-66 R8: campo obligatorio nuevo; el alta lo registra como los demás.
          costoPorOrdenPorcentual: { antes: null, despues: null }, // SLT-83: campo nuevo del rastro; el alta lo registra como los demás.
          periodicidadOrdenes: { antes: null, despues: "quincenal" }, // SLT-118 R35: campo nuevo del rastro; sin ella al crear, quincenal.
          archivado: { antes: null, despues: false },
        },
      },
      {
        ...quien,
        planNombre: "Básico plus",
        accion: "editado",
        cambios: {
          nombre: { antes: "Básico", despues: "Básico plus" },
          // SLT-86 (R31): solo lo que cambió, el descuento anual; el mensual sigue igual y no sale.
          descuento_anual: { antes: null, despues: { tipo: "monto", monto: "50000.00" } },
        },
      },
      { ...quien, planNombre: "Básico plus", accion: "archivado", cambios: { archivado: { antes: false, despues: true } } },
    ]);
  });

  it("R29: asignar deja plan_asignado con el superadmin, en el mismo lote que los módulos que sincroniza", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor, nombre } = await conSuperadmin(tx);
      const servicio = new PlanesService(planesEnTx(tx));
      const org = (await crearOrganizacion(tx)).id;
      await tx.organizacionModulo.create({ data: { organizacionId: org, modulo: "ranking" } });
      const creado = await servicio.crear(actor, entradaAsignable({ nombre: "Pro con analítica", modulos: ["analitica"] }));
      if (creado.estado !== "ok") throw new Error(creado.estado);
      await servicio.asignar(actor, { organizacionId: org, planId: creado.planId, tipoCobro: "mensual" });
      const filas = await tx.historialAccion.findMany({
        where: { organizacionId: org },
        select: {
          accion: true,
          entidadTipo: true,
          entidadId: true,
          entidadEtiqueta: true,
          valorAnterior: true,
          valorNuevo: true,
          actorUsuarioId: true,
          actorNombre: true,
          actorRol: true,
          loteId: true,
        },
      });
      return { planId: creado.planId, actor, nombre, filas };
    });
    const actor = { actorUsuarioId: r.actor.usuarioId, actorNombre: r.nombre, actorRol: "superadmin" };
    const asignada = r.filas.find((f) => f.accion === "plan_asignado");
    expect(asignada).toMatchObject({
      entidadTipo: "plan",
      entidadId: r.planId,
      entidadEtiqueta: "Plan «Pro con analítica»",
      valorAnterior: null,
      // D6 (ajuste planes-custom) y SLT-86 (R2, R30): sin fecha rige desde hoy, que va delante del tipo.
      valorNuevo: `${HOY} · mensual`,
      ...actor,
    });
    expect(r.filas.filter((f) => f.accion !== "plan_asignado").map((f) => [f.accion, f.valorNuevo]).sort()).toEqual([
      ["modulo_activado", "analitica"],
      ["modulo_desactivado", "ranking"],
    ]);
    expect(r.filas).toHaveLength(3);
    expect(new Set(r.filas.map((f) => f.loteId)).size).toBe(1);
    for (const f of r.filas) expect(f).toMatchObject(actor);
  });

  it("R29: si el historial falla al asignar, ni el plan ni los módulos cambian", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await conSuperadmin(tx);
      const org = (await crearOrganizacion(tx)).id;
      const planId = await planesEnTx(tx).crear(entradaAsignable({ modulos: ["analitica"] }), actor.usuarioId);
      const roto = new PlanesService(planesEnTx(tx, "historial"));
      const error = await roto.asignar(actor, { organizacionId: org, planId, tipoCobro: "mensual" }).catch((e: unknown) => e);
      const tras = {
        planId: (await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planId: true } })).planId,
        modulos: await tx.organizacionModulo.count({ where: { organizacionId: org } }),
        historial: await tx.historialAccion.count({ where: { organizacionId: org } }),
      };
      // Control: con el registro sano, la misma asignación sí se hace (el rojo no era otra cosa).
      const sano = await new PlanesService(planesEnTx(tx)).asignar(actor, { organizacionId: org, planId, tipoCobro: "mensual" });
      return { error, tras, sano };
    });
    expect(r.error).toBeInstanceOf(RegistroCaido);
    expect(r.tras).toEqual({ planId: null, modulos: 0, historial: 0 });
    expect(r.sano).toMatchObject({ estado: "ok", cambio: true });
  });

  it("R29: si plan_rastro falla, el plan no se crea, no se edita y no se archiva", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await conSuperadmin(tx);
      const roto = planesEnTx(tx, "rastro");
      const sano = planesEnTx(tx);
      const nombre = `sl24 rastro ${randomUUID().slice(0, 6)}`;
      const alCrear = await roto.crear(entradaDePlan({ nombre }), actor.usuarioId).catch((e: unknown) => e);
      const creados = await tx.plan.count({ where: { nombre } });
      const planId = await sano.crear(entradaDePlan({ nombre }), actor.usuarioId);
      const entrada = entradaDePlan({ nombre: "Editado" });
      const alEditar = await roto.editar(planId, entrada, actor.usuarioId, new Date()).catch((e: unknown) => e);
      const alArchivar = await roto.archivar(planId, actor.usuarioId).catch((e: unknown) => e);
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { nombre: true, archivadoAt: true } });
      return { alCrear, creados, alEditar, alArchivar, plan, nombre, rastro: await tx.planRastro.count({ where: { planId } }) };
    });
    expect(r.alCrear).toBeInstanceOf(RegistroCaido);
    expect(r.creados).toBe(0);
    expect(r.alEditar).toBeInstanceOf(RegistroCaido);
    expect(r.alArchivar).toBeInstanceOf(RegistroCaido);
    expect(r.plan).toEqual({ nombre: r.nombre, archivadoAt: null });
    expect(r.rastro).toBe(1);
  });

  it("R40: archivar con un cambio pendiente lo cancela en la misma operación, con su fila cambio_cancelado", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor, nombre } = await conSuperadmin(tx);
      const repo = planesEnTx(tx);
      const planId = await repo.crear(entradaDePlan({ nombre: "Con pendiente" }), actor.usuarioId);
      // El pendiente se siembra como dueño: programarlo es de T11.
      const vigenteDesde = new Date("2027-01-15T06:00:00.000Z");
      await tx.planCambioProgramado.create({
        data: { planId, vigenteDesde, version: {}, avisosAlProgramar: [], actorUsuarioId: actor.usuarioId, actorNombre: nombre },
      });
      const archivado = await repo.archivar(planId, actor.usuarioId);
      return {
        archivado,
        pendientes: await tx.planCambioProgramado.count({ where: { planId } }),
        rastro: (await rastroDe(tx, planId)).map((f) => [f.accion, f.cambios]),
      };
    });
    expect(r.archivado).toEqual({ estado: "ok", cambio: true });
    expect(r.pendientes).toBe(0);
    expect(r.rastro).toEqual([
      ["creado", expect.any(Object)],
      ["archivado", { archivado: { antes: false, despues: true } }],
      ["cambio_cancelado", { vigenteDesde: { antes: "2027-01-15T06:00:00.000Z", despues: null } }],
    ]);
  });

  it("R39: cancelar sin pendiente no escribe nada; con pendiente lo borra con su fila cambio_cancelado", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor, nombre } = await conSuperadmin(tx);
      const servicio = new PlanesService(planesEnTx(tx));
      const creado = await servicio.crear(actor, entradaDePlan());
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const planId = creado.planId;
      const sinPendiente = await servicio.cancelarCambio(actor, { planId });
      const rastroSin = await tx.planRastro.count({ where: { planId } });
      await tx.planCambioProgramado.create({
        data: {
          planId,
          vigenteDesde: new Date("2027-02-01T06:00:00.000Z"),
          version: {},
          avisosAlProgramar: [],
          actorUsuarioId: actor.usuarioId,
          actorNombre: nombre,
        },
      });
      const conPendiente = await servicio.cancelarCambio(actor, { planId });
      return {
        sinPendiente,
        rastroSin,
        conPendiente,
        pendientes: await tx.planCambioProgramado.count({ where: { planId } }),
        ultima: (await rastroDe(tx, planId)).at(-1),
        noExiste: await servicio.cancelarCambio(actor, { planId: randomUUID() }),
      };
    });
    expect(r.sinPendiente).toEqual({ estado: "sin_cambio_programado" });
    expect(r.rastroSin).toBe(1);
    expect(r.conPendiente).toMatchObject({ estado: "ok" });
    expect(r.pendientes).toBe(0);
    expect(r.ultima).toMatchObject({ accion: "cambio_cancelado" });
    expect(r.noExiste).toEqual({ estado: "not_found" });
  });
  it("R43: programar, reemplazar, cancelar y aplicar dejan cada uno su fila, con quién y qué cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor, nombre } = await conSuperadmin(tx);
      const servicio = new PlanesService(planesEnTx(tx), () => new Date("2026-10-28T12:00:00.000Z"));
      // SLT-86 (R8): el tope que cambia en cada versión es el de API keys (antes, el de órdenes).
      const entrada = entradaDePlan({ nombre: "Rastro programado", topes: { porRol: {}, apiKeys: 100 } });
      const creado = await servicio.crear(actor, entrada);
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const planId = creado.planId;
      const version = (nombrePlan: string, apiKeys: number, vigenteDesde: string) => ({
        planId,
        nombre: nombrePlan,
        topes: { porRol: {}, apiKeys },
        modulos: [],
        precio: { tipo: "sin_precio" },
        costoPorOrden: null, // SLT-66 R8: campo obligatorio nuevo; no cambia lo que se comprueba.
        costoPorOrdenPorcentual: null, // SLT-83: campo obligatorio nuevo; no cambia lo que se comprueba.
        vigenteDesde,
      });
      // `created_at` lo pone Prisma en el cliente: una pausa entre operaciones evita que dos de ellas
      // compartan milisegundo y el orden del rastro dependa de la acción y no del momento.
      const pausa = () => new Promise((resolver) => setTimeout(resolver, 5));
      await pausa();
      await servicio.editar(actor, version("Rastro A", 80, "2026-11-10"));
      await pausa();
      await servicio.editar(actor, version("Rastro B", 60, "2026-11-20"));
      await pausa();
      await servicio.cancelarCambio(actor, { planId });
      await pausa();
      await servicio.editar(actor, version("Rastro C", 50, "2026-12-01"));
      await pausa();
      const [trabajo] = await tx.$queryRaw<{ payload: Record<string, unknown> }[]>`
        SELECT "payload" FROM "jobs" WHERE "tipo" = 'plan_aplicar_cambio' AND "payload"->>'planId' = ${planId}
         ORDER BY "run_after" DESC LIMIT 1`;
      await crearPlanAplicarCambioHandler(planesEnTx(tx), () => new Date("2026-12-01T06:01:00.000Z"))({
        payload: trabajo.payload,
      } as never);
      return { planId, actor, nombre, rastro: await rastroDe(tx, planId) };
    });
    const quien = { planId: r.planId, actorUsuarioId: r.actor.usuarioId, actorNombre: r.nombre };
    const topes = (n: number) => ({ porRol: {}, apiKeys: n });
    expect(r.rastro.map((f) => f.accion)).toEqual([
      "creado",
      "cambio_programado",
      "cambio_reemplazado",
      "cambio_programado",
      "cambio_cancelado",
      "cambio_programado",
      "cambio_aplicado",
    ]);
    const [, programadaA, reemplazada, programadaB, cancelada, programadaC, aplicada] = r.rastro;
    // Programar: qué cambia respecto de la vigente, y desde cuándo. El nombre es el de la vigente.
    expect(programadaA).toEqual({
      ...quien,
      planNombre: "Rastro programado",
      accion: "cambio_programado",
      cambios: {
        nombre: { antes: "Rastro programado", despues: "Rastro A" },
        topes: { antes: topes(100), despues: topes(80) },
        vigenteDesde: { antes: null, despues: "2026-11-10T06:00:00.000Z" },
      },
    });
    // Reemplazar: la fecha del pendiente que se va y la del que llega.
    expect(reemplazada).toEqual({
      ...quien,
      planNombre: "Rastro programado",
      accion: "cambio_reemplazado",
      cambios: { vigenteDesde: { antes: "2026-11-10T06:00:00.000Z", despues: "2026-11-20T06:00:00.000Z" } },
    });
    expect(programadaB.cambios).toMatchObject({ nombre: { despues: "Rastro B" }, vigenteDesde: { antes: null, despues: "2026-11-20T06:00:00.000Z" } });
    expect(cancelada).toEqual({
      ...quien,
      planNombre: "Rastro programado",
      accion: "cambio_cancelado",
      cambios: { vigenteDesde: { antes: "2026-11-20T06:00:00.000Z", despues: null } },
    });
    expect(programadaC.cambios).toMatchObject({ nombre: { despues: "Rastro C" } });
    // Aplicar: el sistema, en nombre de quien lo programó; el diff contra lo que regía al aplicar.
    expect(aplicada).toEqual({
      planId: r.planId,
      planNombre: "Rastro C",
      accion: "cambio_aplicado",
      actorUsuarioId: r.actor.usuarioId,
      actorNombre: `Sistema (programado por ${r.nombre})`,
      cambios: {
        nombre: { antes: "Rastro programado", despues: "Rastro C" },
        topes: { antes: topes(100), despues: topes(50) },
      },
    });
  });
});
