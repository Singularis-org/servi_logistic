import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModuloApagable, PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, EditarPlanInput } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaDePlan, planesEnTx, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SL-24 · T4 (design §5.3, §7.2; R15, R16 revisado el 2026-10-28, R17) — editar de inmediato un plan
// en uso, contra Postgres, con `PlanesService` y `PlanesRepository` REALES. Las altas que siguen las
// juzgan los triggers de T3 con los topes nuevos. Todo en una transacción del dueño que se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };

let base: PrismaClient;

async function preparar(tx: TxDeTest, plan: Partial<CrearPlanInput>, empresas = 1) {
  const servicio = new PlanesService(planesEnTx(tx));
  const entrada = entradaDePlan(plan);
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(creado)}`);
  const orgs: string[] = [];
  for (let i = 0; i < empresas; i++) {
    const { id } = await crearOrganizacion(tx, { nombre: `SL24 edición ${i} ${randomUUID().slice(0, 6)}` });
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId: creado.planId });
    if (r.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(r)}`);
    orgs.push(id);
  }
  const editar = (cambio: Partial<EditarPlanInput>) =>
    servicio.editar(SUPERADMIN, {
      planId: creado.planId,
      nombre: entrada.nombre,
      topes: entrada.topes,
      modulos: entrada.modulos,
      precio: entrada.precio,
      costoPorOrden: entrada.costoPorOrden, // SLT-66 R8: campo obligatorio nuevo; no cambia lo que se comprueba.
      vigenteDesde: null,
      ...cambio,
    });
  return { servicio, planId: creado.planId, entrada, orgs, editar };
}

async function modulos(tx: TxDeTest, organizacionId: string): Promise<ModuloApagable[]> {
  const filas = await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } });
  return filas.map((f) => f.modulo).sort();
}

/** Crea una tienda activa como dueño: el trigger de usuario la juzga igual que por cualquier vía. */
async function tiendaNueva(tx: TxDeTest, organizacionId: string): Promise<unknown> {
  await fijarEmpresa(tx, organizacionId);
  return capturar(tx, () => crearUsuarioDePrueba(tx, "adminTienda"));
}

describeSiHayBase("SL-24 — editar un plan en uso (R15, R16, R17)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R15: la siguiente alta de cada empresa del plan se cuenta contra el tope nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: null, porRol: { adminTienda: 5 }, apiKeys: null } }, 2);
      for (const org of p.orgs) expect(await tiendaNueva(tx, org)).toBeNull();
      const edicion = await p.editar({ topes: { ordenesPorCiclo: null, porRol: { adminTienda: 1 }, apiKeys: null } });
      expect(await triggerActivo(tx, "plan_tope_usuario_alta", "usuario")).toBe(true);
      const rechazos = [];
      for (const org of p.orgs) rechazos.push(traducirErrorDeTope(await tiendaNueva(tx, org)));
      return { edicion, rechazos };
    });
    expect(r.edicion).toMatchObject({ estado: "ok", cambio: true, avisos: [] });
    for (const e of r.rechazos) {
      expect(e).toBeInstanceOf(TopeDelPlanAlcanzado);
      expect((e as TopeDelPlanAlcanzado).details).toMatchObject({ tope: "rol", rol: "adminTienda", maximo: 1, usados: 1 });
    }
  });

  it("R16: con 3 tiendas activas y un tope nuevo de 2 se guarda, avisa con 3 y 2, rechaza la cuarta y entra tras inactivar dos", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: null, porRol: { adminTienda: 3 }, apiKeys: null } });
      const [org] = p.orgs;
      const nombre = (await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { nombre: true } })).nombre;
      const tiendas: string[] = [];
      await fijarEmpresa(tx, org);
      for (let i = 0; i < 3; i++) tiendas.push((await crearUsuarioDePrueba(tx, "adminTienda")).id);
      const edicion = await p.editar({ topes: { ordenesPorCiclo: null, porRol: { adminTienda: 2 }, apiKeys: null } });
      const tope = (await tx.planTopeRol.findMany({ where: { planId: p.planId } })).map((t) => [t.rol, t.maximo]);
      const cuarta = await tiendaNueva(tx, org);
      await tx.usuario.updateMany({ where: { id: { in: tiendas.slice(0, 2) } }, data: { estado: "inactivo" } });
      const trasInactivar = await tiendaNueva(tx, org);
      return { org, nombre, edicion, tope, cuarta: sqlstateDe(cuarta), trasInactivar };
    });
    expect(r.edicion).toEqual({
      estado: "ok",
      planId: expect.any(String),
      cambio: true,
      avisos: [{ organizacionId: r.org, empresa: r.nombre, tope: "adminTienda", usados: 3, maximo: 2 }],
      vigenteDesde: null,
    });
    // Se guardó (ya no se rechaza).
    expect(r.tope).toEqual([["adminTienda", 2]]);
    expect(r.cuarta).toBe("SL024");
    expect(r.trasInactivar).toBeNull();
  });

  it("R16: el aviso nombra cada empresa y cada tope que pasa, en orden de empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: null, porRol: { adminTienda: 5, admin: 5 }, apiKeys: null } }, 2);
      for (const org of p.orgs) {
        await fijarEmpresa(tx, org);
        for (let i = 0; i < 2; i++) await crearUsuarioDePrueba(tx, "adminTienda");
        await crearUsuarioDePrueba(tx, "admin");
      }
      const edicion = await p.editar({ topes: { ordenesPorCiclo: null, porRol: { adminTienda: 1, admin: 0 }, apiKeys: null } });
      return { orgs: [...p.orgs].sort(), edicion };
    });
    if (r.edicion.estado !== "ok") throw new Error(r.edicion.estado);
    expect(r.edicion.avisos.map((a) => [a.organizacionId, a.tope, a.usados, a.maximo])).toEqual([
      [r.orgs[0], "admin", 1, 0],
      [r.orgs[0], "adminTienda", 2, 1],
      [r.orgs[1], "admin", 1, 0],
      [r.orgs[1], "adminTienda", 2, 1],
    ]);
  });

  it("R17: enciende lo añadido y apaga lo quitado en cada empresa del plan, sin tocar sus excepciones", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { modulos: ["ranking"] }, 2);
      const [conExcepcion, sinExcepcion] = p.orgs;
      // La excepción de SL-23 en una de las dos.
      await tx.organizacionModulo.create({ data: { organizacionId: conExcepcion, modulo: "analitica" } });
      const historialAntes = await tx.historialAccion.count({ where: { organizacionId: { in: p.orgs } } });
      const edicion = await p.editar({ modulos: ["monitoreo"] });
      const filas = await tx.historialAccion.findMany({
        where: { organizacionId: { in: p.orgs } },
        orderBy: { createdAt: "asc" },
        skip: historialAntes,
        select: { organizacionId: true, accion: true, valorNuevo: true, loteId: true },
      });
      return {
        edicion,
        conExcepcion: await modulos(tx, conExcepcion),
        sinExcepcion: await modulos(tx, sinExcepcion),
        incluidos: (await tx.planModulo.findMany({ where: { planId: p.planId } })).map((m) => m.modulo).sort(),
        filas,
        orgs: p.orgs,
      };
    });
    expect(r.edicion).toMatchObject({ estado: "ok", cambio: true });
    expect(r.incluidos).toEqual(["monitoreo"]);
    expect(r.conExcepcion).toEqual(["analitica", "monitoreo"]);
    expect(r.sinExcepcion).toEqual(["monitoreo"]);
    // Las filas de SL-23 en cada empresa, con un lote por empresa.
    for (const org of r.orgs) {
      const suyas = r.filas.filter((f) => f.organizacionId === org);
      expect(suyas.map((f) => [f.accion, f.valorNuevo]).sort()).toEqual([
        ["modulo_activado", "monitoreo"],
        ["modulo_desactivado", "ranking"],
      ]);
      expect(new Set(suyas.map((f) => f.loteId)).size).toBe(1);
    }
  });

  it("R17: si una empresa ya tenía encendido por excepción el módulo que se añade, no se duplica ni se registra", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { modulos: ["analitica"] });
      const [org] = p.orgs;
      await tx.organizacionModulo.create({ data: { organizacionId: org, modulo: "monitoreo" } });
      const antes = await tx.historialAccion.count({ where: { organizacionId: org } });
      await p.editar({ modulos: ["analitica", "monitoreo"] });
      return { modulos: await modulos(tx, org), nuevas: (await tx.historialAccion.count({ where: { organizacionId: org } })) - antes };
    });
    expect(r.modulos).toEqual(["analitica", "monitoreo"]);
    expect(r.nuevas).toBe(0);
  });

  it("una edición sin cambios reales no escribe nada ni toca updated_at", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {
        topes: { ordenesPorCiclo: 10, porRol: { admin: 1 }, apiKeys: 2 },
        modulos: ["ranking", "analitica"],
        precio: { tipo: "monto", mensual: "100", anual: { tipo: "descuento", porcentaje: "10" } },
      });
      const foto = async () => ({
        plan: await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { updatedAt: true, nombre: true } }),
        rastro: await tx.planRastro.count({ where: { planId: p.planId } }),
      });
      const antes = await foto();
      const edicion = await p.editar({
        modulos: ["analitica", "ranking"],
        precio: { tipo: "monto", mensual: "100.00", anual: { tipo: "descuento", porcentaje: "10.0" } },
      });
      return { antes, edicion, despues: await foto() };
    });
    expect(r.edicion).toMatchObject({ estado: "ok", cambio: false, avisos: [] });
    expect(r.despues).toEqual(r.antes);
  });

  it("R6: un plan archivado no se edita", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, 0);
      await p.servicio.archivar(SUPERADMIN, { planId: p.planId });
      return {
        porServicio: await p.editar({ nombre: "Otro" }),
        // Bajo cerrojo en el repositorio, aunque el servicio no lo hubiera visto.
        porRepositorio: await planesEnTx(tx).editar(p.planId, { ...p.entrada, nombre: "Otro" }, SUPERADMIN.usuarioId),
        nombre: (await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { nombre: true } })).nombre,
      };
    });
    expect(r.porServicio).toEqual({ estado: "archivado" });
    expect(r.porRepositorio).toEqual({ estado: "archivado" });
    expect(r.nombre).not.toBe("Otro");
  });
});
