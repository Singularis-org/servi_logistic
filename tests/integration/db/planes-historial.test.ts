import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, RegistroCaido, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { entradaDePlan, planesEnTx, revertida, superadminEnTx } from "./_fixtures/planes";
import { tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SL-24 · T4 (design §2.8, §9; R29, R40, R43 en lo que toca a T4) — el rastro de los planes contra
// Postgres, con un superadmin DE VERDAD (su nombre y su rol quedan congelados en las filas):
//   · `plan_rastro` (plataforma): crear, editar y archivar un público SIN empresas, con el diff exacto;
//     archivar con un cambio pendiente lo cancela con su fila `cambio_cancelado` (R40);
//   · `historial_accion` de la empresa: `plan_asignado` con el superadmin, en el mismo lote que las
//     filas de módulos de la sincronización;
//   · si el registro falla, el cambio no persiste.
// La parte programada (programar, reemplazar, aplicar: las otras tres filas de R43) es de T11.
//
// LOCKS: el de superadmin (SL-32) desde el `beforeAll`; el de la 227 lo toma cada `revertida`, por
// dentro. Todo se revierte: el superadmin del caso también.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

async function conSuperadmin(tx: TxDeTest) {
  const id = await superadminEnTx(tx);
  const actor: Actor = { usuarioId: id, rol: "superadmin", organizacionId: null };
  const nombre = (await tx.usuario.findUniqueOrThrow({ where: { id }, select: { nombre: true, primerApellido: true } }));
  return { actor, nombre: `${nombre.nombre} ${nombre.primerApellido}` };
}

const ORDEN_DE_ACCION = ["creado", "editado", "archivado", "cambio_cancelado"];

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

describeSiHayBase("SL-24 — el rastro de los planes (R29, R40)", () => {
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
        topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "monto", mensual: "25000", anual: null },
      });
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const planId = creado.planId;
      await servicio.editar(actor, {
        planId,
        nombre: "Básico plus",
        topes: { ordenesPorCiclo: 150, porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "monto", mensual: "25000.00", anual: { tipo: "fijo", monto: "250000" } },
        vigenteDesde: null,
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
          topes: { antes: null, despues: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null } },
          modulos: { antes: null, despues: ["ranking"] },
          precio: { antes: null, despues: { tipo: "monto", mensual: "25000.00", anual: null } },
          archivado: { antes: null, despues: false },
        },
      },
      {
        ...quien,
        planNombre: "Básico plus",
        accion: "editado",
        cambios: {
          nombre: { antes: "Básico", despues: "Básico plus" },
          topes: {
            antes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null },
            despues: { ordenesPorCiclo: 150, porRol: { adminTienda: 3 }, apiKeys: null },
          },
          precio: {
            antes: { tipo: "monto", mensual: "25000.00", anual: null },
            despues: { tipo: "monto", mensual: "25000.00", anual: { tipo: "fijo", monto: "250000.00" } },
          },
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
      await tx.organizacionModulo.create({ data: { organizacionId: org, modulo: "wallet" } });
      const creado = await servicio.crear(actor, entradaDePlan({ nombre: "Pro con analítica", modulos: ["analitica"] }));
      if (creado.estado !== "ok") throw new Error(creado.estado);
      await servicio.asignar(actor, { organizacionId: org, planId: creado.planId });
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
      valorNuevo: null,
      ...actor,
    });
    expect(r.filas.filter((f) => f.accion !== "plan_asignado").map((f) => [f.accion, f.valorNuevo]).sort()).toEqual([
      ["modulo_activado", "analitica"],
      ["modulo_desactivado", "wallet"],
    ]);
    expect(r.filas).toHaveLength(3);
    expect(new Set(r.filas.map((f) => f.loteId)).size).toBe(1);
    for (const f of r.filas) expect(f).toMatchObject(actor);
  });

  it("R29: si el historial falla al asignar, ni el plan ni los módulos cambian", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await conSuperadmin(tx);
      const org = (await crearOrganizacion(tx)).id;
      const planId = await planesEnTx(tx).crear(entradaDePlan({ modulos: ["analitica"] }), actor.usuarioId);
      const roto = new PlanesService(planesEnTx(tx, "historial"));
      const error = await roto.asignar(actor, { organizacionId: org, planId }).catch((e: unknown) => e);
      const tras = {
        planId: (await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planId: true } })).planId,
        modulos: await tx.organizacionModulo.count({ where: { organizacionId: org } }),
        historial: await tx.historialAccion.count({ where: { organizacionId: org } }),
      };
      // Control: con el registro sano, la misma asignación sí se hace (el rojo no era otra cosa).
      const sano = await new PlanesService(planesEnTx(tx)).asignar(actor, { organizacionId: org, planId });
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
      const alEditar = await roto.editar(planId, entrada, actor.usuarioId).catch((e: unknown) => e);
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
});
