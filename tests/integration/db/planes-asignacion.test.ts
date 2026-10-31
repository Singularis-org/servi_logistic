import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModuloApagable, PrismaClient } from "@prisma/client";

import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { ModulosEmpresaRepository } from "@/lib/repositories/ModulosEmpresaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ModulosEmpresaService } from "@/lib/services/ModulosEmpresaService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { entradaDePlan, planesEnTx, revertida } from "./_fixtures/planes";

// SL-24 · T4 (design §5.2, §7.1; R4, R6, R9–R13) — asignar un plan a una empresa contra Postgres, con
// `PlanesService` y `PlanesRepository` REALES. El repositorio abre su transacción como SAVEPOINT de la
// del caso (`clienteConSavepoint`), y la del caso SIEMPRE se revierte: nada queda en la base.
//
// El actor es un superadmin por su rol (la autorización es del servicio, R5). Que el historial lo
// congele bien lo mide `planes-historial`, con un superadmin de verdad.
//
// Mutación 4 de design §11 («la asignación no cuenta usuarios»): la matan los casos R12 de roles.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };

const jobsNoOp = {
  enqueue: async () => null,
  claimBatch: async () => [],
  findByDedupeKeys: async () => [],
  complete: async () => {},
  fail: async () => {},
} as unknown as IJobRepository;

let base: PrismaClient;

interface Caso {
  tx: TxDeTest;
  servicio: PlanesService;
  /** Crea un plan por el servicio y devuelve su id. */
  plan: (p?: Partial<CrearPlanInput>) => Promise<string>;
  asignar: (organizacionId: string, planId: string) => ReturnType<PlanesService["asignar"]>;
  empresa: () => Promise<string>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const servicio = new PlanesService(planesEnTx(tx));
  return {
    tx,
    servicio,
    plan: async (p) => {
      const r = await servicio.crear(SUPERADMIN, entradaDePlan(p));
      if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
      return r.planId;
    },
    asignar: (organizacionId, planId) => servicio.asignar(SUPERADMIN, { organizacionId, planId }),
    empresa: async () => (await crearOrganizacion(tx)).id,
  };
}

async function asignacion(tx: TxDeTest, organizacionId: string) {
  return tx.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { planId: true, planCicloAnclaAt: true },
  });
}

async function modulos(tx: TxDeTest, organizacionId: string): Promise<ModuloApagable[]> {
  const filas = await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } });
  return filas.map((f) => f.modulo).sort();
}

const historial = (tx: TxDeTest, organizacionId: string) => tx.historialAccion.count({ where: { organizacionId } });

async function encendidos(tx: TxDeTest, organizacionId: string, lista: ModuloApagable[]): Promise<void> {
  for (const modulo of lista) {
    await tx.organizacionModulo.create({ data: { organizacionId, modulo } });
  }
}

async function tiendasActivas(tx: TxDeTest, organizacionId: string, n: number): Promise<void> {
  await fijarEmpresa(tx, organizacionId);
  for (let i = 0; i < n; i++) await crearUsuarioDePrueba(tx, "adminTienda");
}

async function keysActivas(tx: TxDeTest, organizacionId: string, n: number): Promise<void> {
  await fijarEmpresa(tx, organizacionId);
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const repo = new ApiKeyRepository(clienteConSavepoint(tx));
  for (let i = 0; i < n; i++) {
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
    await repo.createConUsuario({
      identificador: `sl24 ${sufijo}`,
      slug: `sl24-${sufijo}`,
      email: `apikey-sl24a-${sufijo}@example.test`,
      cedula: `apikey-sl24a-${sufijo}`,
      passwordHash: "x",
      keyPrefix: `sl24${sufijo.slice(0, 4)}`,
      keyHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      createdById: maestro.id,
      tiendaDestinoId: null,
    });
  }
}

async function ordenes(tx: TxDeTest, organizacionId: string, n: number): Promise<void> {
  await fijarEmpresa(tx, organizacionId);
  const fks = await crearFksDeOrden(tx);
  const repo = new OrdenRepository(clienteConSavepoint(tx), jobsNoOp);
  const datos = Array.from({ length: n }, () => ({
    numRemision: `SL24A-${randomUUID().slice(0, 12)}`,
    estatusId: fks.estatusId,
    destinatario: "Destinatario SL-24",
    telefonoDest: "88880000",
    tiendaId: fks.tiendaId,
    zonaId: fks.zonaId,
    provinciaId: fks.provinciaId,
    cantonId: fks.cantonId,
    distritoId: null,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: null,
    montoCobrar: null,
  }));
  await repo.createManyOrdenes(
    datos,
    500,
    { actorUsuarioId: fks.tiendaId, origenTipo: "carga_masiva" },
    { cargaId: null, usuarioCargaId: fks.tiendaId, totalFiles: n, name: null },
  );
}

describeSiHayBase("SL-24 — asignar un plan a una empresa (R4, R6, R9–R13)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R9: la primera asignación fija el ancla con el reloj de la base; cambiar de plan la conserva", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const [uno, dos] = [await c.plan(), await c.plan()];
      const antes = await asignacion(tx, org);
      const primera = await c.asignar(org, uno);
      const tras1 = await asignacion(tx, org);
      // `now()` es el instante de la transacción del caso: el ancla es exactamente ese, en la escala
      // de los triggers (y no el reloj de Node).
      const [{ igual }] = await tx.$queryRawUnsafe<{ igual: boolean }[]>(
        `SELECT "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC')::timestamp(3) AS igual FROM "organizacion" WHERE "id" = $1`,
        org,
      );
      const segunda = await c.asignar(org, dos);
      const tras2 = await asignacion(tx, org);
      return { antes, igual, primera, tras1, segunda, tras2, uno, dos };
    });
    expect(r.antes).toEqual({ planId: null, planCicloAnclaAt: null });
    expect(r.primera).toMatchObject({ estado: "ok", planId: r.uno, cambio: true });
    expect(r.tras1.planId).toBe(r.uno);
    expect(r.igual).toBe(true);
    expect(r.segunda).toMatchObject({ estado: "ok", planId: r.dos, cambio: true });
    expect(r.tras2).toEqual({ planId: r.dos, planCicloAnclaAt: r.tras1.planCicloAnclaAt });
  });

  it("R10: deja encendidos exactamente los módulos incluidos, en la misma operación", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      await encendidos(tx, org, ["monitoreo", "ranking"]);
      const plan = await c.plan({ modulos: ["analitica", "ranking"] });
      const res = await c.asignar(org, plan);
      return { res, modulos: await modulos(tx, org) };
    });
    expect(r.res.estado).toBe("ok");
    expect(r.modulos).toEqual(["analitica", "ranking"]);
  });

  it("R11: la excepción de SL-23 sobrevive a editar los topes y se apaga al cambiar de plan", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const plan = await c.plan({ modulos: ["analitica"], topes: { ordenesPorCiclo: 10, porRol: {}, apiKeys: null } });
      const otro = await c.plan({ modulos: ["analitica"] });
      await c.asignar(org, plan);
      const interruptor = new ModulosEmpresaService(new ModulosEmpresaRepository(clienteConSavepoint(tx)));
      const excepcion = await interruptor.fijar(SUPERADMIN, { organizacionId: org, modulo: "monitoreo", activo: true });
      const conExcepcion = await modulos(tx, org);
      const edicion = await c.servicio.editar(SUPERADMIN, {
        planId: plan,
        nombre: "Con más órdenes",
        topes: { ordenesPorCiclo: 20, porRol: {}, apiKeys: null },
        modulos: ["analitica"],
        precio: { tipo: "sin_precio" },
        costoPorOrden: null, // SLT-66 R8: campo obligatorio nuevo; no cambia lo que se comprueba.
        vigenteDesde: null,
      });
      const trasEditar = await modulos(tx, org);
      await c.asignar(org, otro);
      return { excepcion, conExcepcion, edicion, trasEditar, trasCambiar: await modulos(tx, org) };
    });
    expect(r.excepcion).toEqual({ estado: "ok", cambio: true });
    expect(r.conExcepcion).toEqual(["analitica", "monitoreo"]);
    expect(r.edicion).toMatchObject({ estado: "ok", cambio: true });
    expect(r.trasEditar).toEqual(["analitica", "monitoreo"]);
    expect(r.trasCambiar).toEqual(["analitica"]);
  });

  it.each([
    ["Admin Tienda", "adminTienda" as const],
    ["API keys", "api_keys" as const],
  ])("R12 (%s): con 3 en uso, bajar a un tope de 2 se rechaza sin cambiar nada; a un tope de 3 se asigna", async (_c, tope) => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const topes = (maximo: number) =>
        tope === "adminTienda"
          ? { ordenesPorCiclo: null, porRol: { adminTienda: maximo }, apiKeys: null }
          : { ordenesPorCiclo: null, porRol: {}, apiKeys: maximo };
      const grande = await c.plan({ topes: topes(10), modulos: ["ranking"] });
      const chico = await c.plan({ topes: topes(2), modulos: ["analitica"] });
      const justo = await c.plan({ topes: topes(3), modulos: ["analitica"] });
      await c.asignar(org, grande);
      if (tope === "adminTienda") await tiendasActivas(tx, org, 3);
      else await keysActivas(tx, org, 3);
      const foto = async () => ({ ...(await asignacion(tx, org)), modulos: await modulos(tx, org), historial: await historial(tx, org) });
      const antes = await foto();
      const rechazo = await c.asignar(org, chico);
      const trasRechazo = await foto();
      const bien = await c.asignar(org, justo);
      return { org, grande, justo, antes, rechazo, trasRechazo, bien, despues: await asignacion(tx, org) };
    });
    expect(r.rechazo).toMatchObject({
      estado: "tope_excedido",
      excedidos: [{ organizacionId: r.org, tope, usados: 3, maximo: 2 }],
    });
    if (r.rechazo.estado === "tope_excedido") expect(r.rechazo.mensaje).toMatch(/ya tiene 3 .* y el plan permite 2\./);
    // Sin cambiar nada: ni el plan, ni los módulos, ni el historial.
    expect(r.trasRechazo).toEqual(r.antes);
    expect(r.antes.planId).toBe(r.grande);
    expect(r.bien).toMatchObject({ estado: "ok", cambio: true });
    expect(r.despues.planId).toBe(r.justo);
  });

  it("R12 (órdenes): se comparan las del ciclo en curso; igual al tope no impide", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const grande = await c.plan({ topes: { ordenesPorCiclo: 10, porRol: {}, apiKeys: null } });
      const chico = await c.plan({ topes: { ordenesPorCiclo: 2, porRol: {}, apiKeys: null } });
      const justo = await c.plan({ topes: { ordenesPorCiclo: 3, porRol: {}, apiKeys: null } });
      await c.asignar(org, grande);
      await ordenes(tx, org, 3);
      return { org, rechazo: await c.asignar(org, chico), bien: await c.asignar(org, justo) };
    });
    expect(r.rechazo).toMatchObject({
      estado: "tope_excedido",
      excedidos: [{ organizacionId: r.org, tope: "ordenes", usados: 3, maximo: 2 }],
    });
    expect(r.bien).toMatchObject({ estado: "ok", cambio: true });
  });

  it("R12: un rol sin tope en el plan nuevo no limita, aunque el viejo lo topara", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      await tiendasActivas(tx, org, 3);
      const sinTopeDeTiendas = await c.plan({ topes: { ordenesPorCiclo: null, porRol: { admin: 1 }, apiKeys: null } });
      return c.asignar(org, sinTopeDeTiendas);
    });
    expect(r).toMatchObject({ estado: "ok", cambio: true });
  });

  it("R13: empresa o plan que no existen, y el custom de otra empresa, se rechazan sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const otra = await c.empresa();
      const plan = await c.plan();
      const deOtra = await c.plan({ visibilidad: "custom", organizacionId: otra });
      const propio = await c.plan({ visibilidad: "custom", organizacionId: org });
      return {
        sinEmpresa: await c.asignar(randomUUID(), plan),
        sinPlan: await c.asignar(org, randomUUID()),
        deOtra: await c.asignar(org, deOtra),
        trasRechazos: { ...(await asignacion(tx, org)), historial: await historial(tx, org) },
        propio: await c.asignar(org, propio),
      };
    });
    expect(r.sinEmpresa).toEqual({ estado: "not_found" });
    expect(r.sinPlan).toEqual({ estado: "not_found" });
    expect(r.deOtra).toEqual({ estado: "custom_de_otra_empresa" });
    expect(r.trasRechazos).toEqual({ planId: null, planCicloAnclaAt: null, historial: 0 });
    expect(r.propio).toMatchObject({ estado: "ok", cambio: true });
  });

  it("R13: el repositorio, bajo cerrojo, rechaza lo mismo aunque el servicio no lo hubiera visto", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const otra = await c.empresa();
      const deOtra = await c.plan({ visibilidad: "custom", organizacionId: otra });
      const plan = await c.plan();
      const repo = planesEnTx(tx);
      await c.asignar(org, plan);
      return {
        deOtra: await repo.asignar(org, deOtra, SUPERADMIN.usuarioId),
        mismo: await repo.asignar(org, plan, SUPERADMIN.usuarioId),
        noExiste: await repo.asignar(randomUUID(), plan, SUPERADMIN.usuarioId),
        historial: await historial(tx, org),
      };
    });
    expect(r.deOtra).toEqual({ estado: "custom_de_otra_empresa" });
    expect(r.mismo).toEqual({ estado: "ok", cambio: false });
    expect(r.noExiste).toEqual({ estado: "not_found" });
    // Solo la primera asignación dejó su fila.
    expect(r.historial).toBe(1);
  });

  it("R13: asignar el plan que ya tiene responde bien sin cambiar nada ni registrar", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const plan = await c.plan({ modulos: ["analitica"] });
      await c.asignar(org, plan);
      // Una excepción encendida: si la asignación repetida sincronizara, la apagaría.
      await encendidos(tx, org, ["monitoreo"]);
      const antes = { ...(await asignacion(tx, org)), historial: await historial(tx, org), modulos: await modulos(tx, org) };
      const repetida = await c.asignar(org, plan);
      const despues = { ...(await asignacion(tx, org)), historial: await historial(tx, org), modulos: await modulos(tx, org) };
      return { repetida, antes, despues };
    });
    expect(r.repetida).toMatchObject({ estado: "ok", cambio: false });
    expect(r.despues).toEqual(r.antes);
    expect(r.antes.modulos).toEqual(["analitica", "monitoreo"]);
  });

  it("R6: un plan archivado no se asigna", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const plan = await c.plan();
      await c.servicio.archivar(SUPERADMIN, { planId: plan });
      return { res: await c.asignar(org, plan), despues: await asignacion(tx, org) };
    });
    expect(r.res).toEqual({ estado: "archivado" });
    expect(r.despues.planId).toBeNull();
  });

  it("R4: asignar un plan con precio no crea cobros, movimientos de caja ni cargos", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const org = await c.empresa();
      const plan = await c.plan({
        precio: { tipo: "monto", mensual: "25000", anual: { tipo: "fijo", monto: "250000" } },
      });
      const contar = async () => ({
        wallet: await tx.walletMovimiento.count(),
        cobro: await tx.cobroPlataformaMovimiento.count(),
      });
      const antes = await contar();
      const res = await c.asignar(org, plan);
      return { res, antes, despues: await contar() };
    });
    expect(r.res).toMatchObject({ estado: "ok", cambio: true });
    expect(r.despues).toEqual(r.antes);
  });
});
