import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelCicloPorDefecto } from "@/lib/planes/ciclo";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, TopesPlan } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// Ajuste planes-custom (D10, D12, D13, D14; 2026-11-03), contra Postgres, con `PlanesService` y
// `PlanesRepository` REALES (el repositorio abre su transacción como SAVEPOINT de la del caso, que siempre
// se revierte):
//   · D10: cambiar SOLO el tipo de cobro guarda el tipo y deja su fila `plan_asignado` (con
//     `valor_anterior` = el tipo de antes), sin tocar `plan_id`, el ancla, el ciclo corto ni los módulos;
//     el mismo tipo no escribe nada; una empresa sin plan es `sin_plan`.
//   · D14: la lectura del detalle trae el tipo de cobro de cada fila y el cambio de solo el tipo como fila propia.
//   · D12: crear un custom con fecha devuelve los topes ya pasados en `avisos`, como la primera asignación.
//   · D13: la vista previa con los topes del form avisa lo mismo que luego devuelve crear el custom.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };

let base: PrismaClient;

beforeAll(() => {
  base = crearPrismaDeTest();
});

afterAll(async () => {
  await base?.$disconnect();
});

async function estadoDeLaEmpresa(tx: TxDeTest, organizacionId: string) {
  return {
    empresa: await tx.organizacion.findUniqueOrThrow({
      where: { id: organizacionId },
      select: { planId: true, planTipoCobro: true, planCicloAnclaAt: true, planCicloCortoDesdeAt: true },
    }),
    modulos: (await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } }))
      .map((m) => m.modulo)
      .sort(),
    historial: await tx.historialAccion.findMany({
      where: { organizacionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { accion: true, entidadId: true, valorAnterior: true, valorNuevo: true },
    }),
  };
}

/** Una empresa con un plan público asignado en `mensual`. */
async function empresaConPlan(tx: TxDeTest, servicio: PlanesService) {
  const org = (await crearOrganizacion(tx)).id;
  const plan = await servicio.crear(SUPERADMIN, entradaAsignable({ modulos: ["analitica"] }));
  if (plan.estado !== "ok") throw new Error(plan.estado);
  const asignado = await servicio.asignar(SUPERADMIN, { organizacionId: org, planId: plan.planId, tipoCobro: "mensual" });
  if (asignado.estado !== "ok") throw new Error(asignado.estado);
  return { org, planId: plan.planId };
}

describeSiHayBase("Ajuste planes-custom D10 — cambiar solo el tipo de cobro del plan actual", () => {
  it("guarda el tipo y deja su fila en el historial; plan, ancla, ciclo corto y módulos quedan igual", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const { org, planId } = await empresaConPlan(tx, servicio);
      const antes = await estadoDeLaEmpresa(tx, org);
      const res = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: org, tipoCobro: "anual" });
      return { res, antes, despues: await estadoDeLaEmpresa(tx, org), planId };
    });
    expect(r.res).toEqual({ estado: "ok", cambio: true });
    expect(r.despues.empresa).toEqual({ ...r.antes.empresa, planTipoCobro: "anual" });
    expect(r.antes.empresa.planTipoCobro).toBe("mensual");
    expect(r.despues.modulos).toEqual(r.antes.modulos);
    // Una sola fila nueva, `plan_asignado` del mismo plan, con el tipo de antes y el de ahora.
    expect(r.despues.historial).toEqual([
      ...r.antes.historial,
      { accion: "plan_asignado", entidadId: r.planId, valorAnterior: "mensual", valorNuevo: "anual" },
    ]);
  });

  it("el mismo tipo → ok sin cambio, y no escribe nada (ni historial)", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const { org } = await empresaConPlan(tx, servicio);
      const antes = await estadoDeLaEmpresa(tx, org);
      const res = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: org, tipoCobro: "mensual" });
      return { res, antes, despues: await estadoDeLaEmpresa(tx, org) };
    });
    expect(r.res).toEqual({ estado: "ok", cambio: false });
    expect(r.despues).toEqual(r.antes);
  });

  it("empresa sin plan → sin_plan (también directo al repositorio, bajo el cerrojo) y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const antes = await estadoDeLaEmpresa(tx, org);
      const res = await new PlanesService(planesEnTx(tx)).cambiarTipoCobro(SUPERADMIN, { organizacionId: org, tipoCobro: "anual" });
      const directo = await planesEnTx(tx).cambiarTipoCobro(org, "anual", SUPERADMIN.usuarioId);
      return { res, directo, antes, despues: await estadoDeLaEmpresa(tx, org) };
    });
    expect(r.res).toEqual({ estado: "sin_plan" });
    expect(r.directo).toEqual({ estado: "sin_plan" });
    expect(r.despues).toEqual(r.antes);
  });

  it("empresa inexistente → not_found en el repositorio", async () => {
    const r = await revertida(base, (tx) => planesEnTx(tx).cambiarTipoCobro(randomUUID(), "anual", SUPERADMIN.usuarioId));
    expect(r).toEqual({ estado: "not_found" });
  });

  it("si el historial falla, el tipo no se guarda (misma transacción)", async () => {
    const r = await revertida(base, async (tx) => {
      const { org } = await empresaConPlan(tx, new PlanesService(planesEnTx(tx)));
      const antes = await estadoDeLaEmpresa(tx, org);
      const error = await new PlanesService(planesEnTx(tx, "historial"))
        .cambiarTipoCobro(SUPERADMIN, { organizacionId: org, tipoCobro: "anual" })
        .catch((e: unknown) => e);
      return { error, antes, despues: await estadoDeLaEmpresa(tx, org) };
    });
    expect(r.error).toBeInstanceOf(Error);
    expect(r.despues).toEqual(r.antes);
  });
});

describeSiHayBase("Ajuste planes-custom D14 — el historial de asignaciones del detalle trae el tipo de cobro", () => {
  it("cada fila con su tipo; el cambio de solo el tipo (D10) es una fila propia, distinguible", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const { org } = await empresaConPlan(tx, servicio);
      await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: org, tipoCobro: "anual" });
      return servicio.planDeEmpresa(SUPERADMIN, { organizacionId: org });
    });
    if (r.estado !== "ok") throw new Error(r.estado);
    // Del más reciente al más antiguo.
    expect(r.vista.asignaciones.map(({ tipo, tipoCobro, tipoCobroAnterior }) => ({ tipo, tipoCobro, tipoCobroAnterior }))).toEqual([
      { tipo: "cambio_tipo_cobro", tipoCobro: "anual", tipoCobroAnterior: "mensual" },
      { tipo: "asignacion", tipoCobro: "mensual", tipoCobroAnterior: null },
    ]);
    // D10: el cobro que muestra el detalle ya es el anual (el siguiente cobro se recalcula al leer).
    expect(r.vista.plan?.cobro.tipo).toBe("anual");
  });
});

describeSiHayBase("Ajuste planes-custom D12, D13 — avisos de topes ya pasados en el custom con fecha", () => {
  const TOPES: TopesPlan = { ordenesPorCiclo: null, porRol: { adminTienda: 2 }, apiKeys: null };

  function custom(organizacionId: string, extra: Partial<CrearPlanInput> = {}): CrearPlanInput {
    return entradaAsignable({
      nombre: `custom ${randomUUID().slice(0, 8)}`,
      visibilidad: "custom",
      organizacionId,
      tipoCobro: "mensual",
      topes: TOPES,
      ...extra,
    });
  }

  /** Una empresa sin plan con tres admin de tienda: pasa el tope de 2 del custom. */
  async function empresaQuePasaElTope(tx: TxDeTest) {
    const org = (await crearOrganizacion(tx)).id;
    await fijarEmpresa(tx, org);
    for (let i = 0; i < 3; i++) await crearUsuarioDePrueba(tx, "adminTienda");
    await fijarEmpresa(tx, "");
    return org;
  }

  it("D13: la vista previa con los topes del form avisa lo que D12 devuelve al crear con esa fecha; la vista previa no escribe", async () => {
    const manana = inicioDelCicloPorDefecto(new Date());
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const org = await empresaQuePasaElTope(tx);
      const antes = await estadoDeLaEmpresa(tx, org);
      const vista = await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: org, inicioCiclo: manana, topes: TOPES });
      const trasVista = await estadoDeLaEmpresa(tx, org);
      const creado = await servicio.crear(SUPERADMIN, custom(org, { inicioCiclo: manana }));
      return { org, vista, antes, trasVista, creado, despues: await estadoDeLaEmpresa(tx, org) };
    });
    const aviso = { organizacionId: r.org, empresa: expect.any(String), tope: "adminTienda", usados: 3, maximo: 2 };
    expect(r.vista).toEqual({ estado: "ok", avisos: [aviso], siguienteCiclo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(r.trasVista).toEqual(r.antes);
    // D12: la creación con fecha no rechaza: asigna y avisa, igual que la primera asignación (SLT-58 R36, R42).
    expect(r.creado).toEqual({ estado: "ok", planId: expect.any(String), cambio: true, avisos: [aviso], vigenteDesde: null });
    expect(r.despues.empresa.planId).toBe(r.creado.estado === "ok" ? r.creado.planId : "");
  });

  it("D13: la vista previa usa los topes del form, no un plan: con topes holgados no avisa nada", async () => {
    const manana = inicioDelCicloPorDefecto(new Date());
    const r = await revertida(base, async (tx) => {
      const org = await empresaQuePasaElTope(tx);
      return new PlanesService(planesEnTx(tx)).previsualizarCustom(SUPERADMIN, {
        organizacionId: org,
        inicioCiclo: manana,
        topes: { ordenesPorCiclo: null, porRol: { adminTienda: 3 }, apiKeys: null },
      });
    });
    expect(r).toMatchObject({ estado: "ok", avisos: [] });
  });

  it("D13: la empresa ya tiene plan → validation_error en inicioCiclo (SLT-58 R31)", async () => {
    const manana = inicioDelCicloPorDefecto(new Date());
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const { org } = await empresaConPlan(tx, servicio);
      return servicio.previsualizarCustom(SUPERADMIN, { organizacionId: org, inicioCiclo: manana, topes: TOPES });
    });
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { inicioCiclo: [expect.any(String)] } });
  });

  it("D13: empresa inexistente → null en el repositorio", async () => {
    const r = await revertida(base, (tx) =>
      planesEnTx(tx).vistaPreviaConTopes(randomUUID(), TOPES, { fecha: "2026-11-01", ancla: new Date("2026-11-01T06:00:00.000Z") }),
    );
    expect(r).toBeNull();
  });
});
