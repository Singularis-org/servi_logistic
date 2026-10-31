import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { VersionPlan } from "@/lib/types/planes";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, crearPlan, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-58 · T4 (design §3.2; R13, R16, R21) — las tres lecturas del superadmin en `PlanesRepository`
// contra Postgres real, como dueño (`comoPlataforma`). Lo que solo la base puede decir:
//   · R13: el catálogo trae también los archivados, cuenta las empresas con `_count` y lee la fecha
//     del pendiente;
//   · R16: el rastro sale del más reciente al más antiguo y solo el de ese plan;
//   · R21: plataforma no filtra por empresa, así que el `WHERE organizacion_id` explícito es lo único
//     que separa las asignaciones de una empresa de las de otra.
// Las filas de `plan_rastro` y `historial_accion` se insertan con su `created_at` explícito: dentro de
// la transacción revertida del caso, las escritas por el repositorio compartirían el instante.
// Todo se revierte (`revertida` toma el lock de la 227).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const VERSION: VersionPlan = {
  nombre: "Pendiente",
  topes: { ordenesPorCiclo: 10, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
};

/** Las 00:00 de la plataforma del 2027-01-10 (−06:00). */
const RIGE = new Date("2027-01-10T06:00:00.000Z");

async function programar(tx: TxDeTest, planId: string): Promise<void> {
  await tx.planCambioProgramado.create({
    data: {
      planId,
      vigenteDesde: RIGE,
      version: VERSION,
      avisosAlProgramar: [],
      actorUsuarioId: randomUUID(),
      actorNombre: "Ana Pérez",
    },
  });
}

async function rastro(tx: TxDeTest, planId: string, accion: "creado" | "editado" | "archivado", creadoAt: string) {
  const { id } = await tx.planRastro.create({
    data: {
      planId,
      planNombre: "x",
      accion,
      cambios: {},
      actorUsuarioId: randomUUID(),
      actorNombre: `actor ${accion}`,
      createdAt: new Date(creadoAt),
    },
    select: { id: true },
  });
  return id;
}

async function asignacion(tx: TxDeTest, organizacionId: string, planNombre: string, creadoAt: string): Promise<void> {
  await tx.historialAccion.create({
    data: {
      accion: "plan_asignado",
      entidadTipo: "plan",
      entidadId: randomUUID(),
      entidadEtiqueta: `Plan «${planNombre}»`,
      actorNombre: "Ana Pérez",
      loteId: randomUUID(),
      organizacionId,
      createdAt: new Date(creadoAt),
    },
  });
}

describeSiHayBase("SLT-58 — lecturas del superadmin en PlanesRepository (R13, R16, R21)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R13: el catálogo trae los archivados, el nº de empresas de cada plan, la empresa del custom y la fecha del pendiente", async () => {
    const r = await revertida(base, async (tx) => {
      const a = (await crearOrganizacion(tx, { nombre: "Empresa A slt58" })).id;
      const b = (await crearOrganizacion(tx)).id;
      const archivado = await crearPlan(tx, { archivado: true });
      const enUso = await crearPlan(tx, { ordenes: 100 });
      const custom = await crearPlan(tx, { custom: a });
      await asignarPlan(tx, a, enUso);
      await asignarPlan(tx, b, enUso);
      await programar(tx, enUso);
      const catalogo = await planesEnTx(tx).catalogo();
      return { archivado, enUso, custom, catalogo };
    });
    const de = (id: string) => r.catalogo.find((f) => f.plan.id === id);
    expect(de(r.archivado)).toMatchObject({
      plan: { archivado: true, visibilidad: "publico" },
      empresaNombre: null,
      empresas: 0,
      vigenteDesdePendiente: null,
    });
    expect(de(r.enUso)).toMatchObject({
      plan: { archivado: false, topes: { ordenesPorCiclo: 100 } },
      empresas: 2,
      vigenteDesdePendiente: RIGE,
    });
    expect(de(r.custom)).toMatchObject({
      plan: { visibilidad: "custom" },
      empresaNombre: "Empresa A slt58",
      empresas: 0,
      vigenteDesdePendiente: null,
    });
  });

  it("R16: el detalle trae la versión, el pendiente validado, sus empresas y su rastro del más reciente al más antiguo", async () => {
    const r = await revertida(base, async (tx) => {
      const a = (await crearOrganizacion(tx, { nombre: "B empresa slt58" })).id;
      const b = (await crearOrganizacion(tx, { nombre: "A empresa slt58" })).id;
      const planId = await crearPlan(tx, { ordenes: 50 });
      const otro = await crearPlan(tx);
      await asignarPlan(tx, a, planId);
      await asignarPlan(tx, b, planId);
      await programar(tx, planId);
      // Insertadas fuera de orden: el orden lo pone la lectura.
      const medio = await rastro(tx, planId, "editado", "2026-10-10T10:00:00.000Z");
      const viejo = await rastro(tx, planId, "creado", "2026-10-01T10:00:00.000Z");
      const nuevo = await rastro(tx, planId, "archivado", "2026-10-20T10:00:00.000Z");
      await rastro(tx, otro, "creado", "2026-10-15T10:00:00.000Z");
      const detalle = await planesEnTx(tx).detalle(planId);
      const inexistente = await planesEnTx(tx).detalle(randomUUID());
      return { a, b, planId, medio, viejo, nuevo, detalle, inexistente };
    });
    expect(r.inexistente).toBeNull();
    expect(r.detalle).not.toBeNull();
    const d = r.detalle!;
    expect(d.plan).toMatchObject({ id: r.planId, topes: { ordenesPorCiclo: 50 } });
    expect(d.empresaNombre).toBeNull();
    expect(d.pendiente).toEqual({ vigenteDesde: RIGE, version: VERSION });
    expect(d.empresas).toEqual([
      { id: r.b, nombre: "A empresa slt58" },
      { id: r.a, nombre: "B empresa slt58" },
    ]);
    expect(d.rastro.map((f) => f.id)).toEqual([r.nuevo, r.medio, r.viejo]);
    expect(d.rastro.map((f) => f.accion)).toEqual(["archivado", "editado", "creado"]);
    expect(d.rastro[0]).toMatchObject({ actorNombre: "actor archivado", cambios: {}, creadoAt: new Date("2026-10-20T10:00:00.000Z") });
  });

  it("R21: el plan de una empresa trae solo SUS asignaciones, de la más reciente a la más antigua", async () => {
    const r = await revertida(base, async (tx) => {
      const a = (await crearOrganizacion(tx)).id;
      const b = (await crearOrganizacion(tx)).id;
      const sinPlan = (await crearOrganizacion(tx)).id;
      const planId = await crearPlan(tx, { ordenes: 100, porRol: { mensajero: 3 } });
      await asignarPlan(tx, a, planId);
      await programar(tx, planId);
      await asignacion(tx, a, "Primero", "2026-09-01T10:00:00.000Z");
      await asignacion(tx, a, "Tercero", "2026-10-20T10:00:00.000Z");
      await asignacion(tx, a, "Segundo", "2026-10-01T10:00:00.000Z");
      await asignacion(tx, b, "De la otra", "2026-10-25T10:00:00.000Z");
      const repo = planesEnTx(tx);
      return {
        a,
        planId,
        deA: await repo.planDeEmpresa(a),
        deSinPlan: await repo.planDeEmpresa(sinPlan),
        inexistente: await repo.planDeEmpresa(randomUUID()),
      };
    });
    expect(r.inexistente).toBeNull();
    expect(r.deA).not.toBeNull();
    const a = r.deA!;
    expect(a.organizacionId).toBe(r.a);
    expect(a.asignaciones.map((x) => x.planNombre)).toEqual(["Plan «Tercero»", "Plan «Segundo»", "Plan «Primero»"]);
    expect(a.asignaciones[0]).toEqual({
      creadoAt: new Date("2026-10-20T10:00:00.000Z"),
      actorNombre: "Ana Pérez",
      planNombre: "Plan «Tercero»",
    });
    // El plan con su uso (R19, contado por las funciones de los triggers) y su pendiente.
    expect(a.plan).not.toBeNull();
    expect(a.plan!.dto).toMatchObject({ id: r.planId, topes: { ordenesPorCiclo: 100, porRol: { mensajero: 3 } } });
    expect(a.plan!.uso).toEqual({
      ordenes: 0,
      apiKeys: 0,
      porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 }, // SLT-66 R5: sin uso de maestro
    });
    expect(a.plan!.ancla).toBeInstanceOf(Date);
    expect(a.plan!.cambio).toEqual({ vigenteDesde: RIGE, version: VERSION });
    expect(r.deSinPlan).toEqual({ organizacionId: expect.any(String), plan: null, asignaciones: [] });
  });
});
