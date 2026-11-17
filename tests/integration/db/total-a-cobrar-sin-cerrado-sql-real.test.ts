import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { ESTATUS_454, crearEscenario, type Escenario, type Mundo } from "./454/_escenario";

/**
 * SLT-151 — «Total a cobrar» del mensajero SIN lo que ya esta en un cierre del dia.
 *
 * El fallo (visto en Preview): un mensajero sin nada asignado ni pendiente veia ₡8 000 en «Total a
 * cobrar» porque `sumMontoCobrarGestionadas` sumaba la gestion entregada de HOY aunque su cierre ya
 * estuviera APROBADO. Ese dinero ya se entrego; no esta en la mano del mensajero.
 *
 * La regla vive en el `WHERE` del repositorio, asi que se mide contra Postgres real (los tests de
 * servicio usan dobles y no ven el SQL). Todo el camino es el REAL: `gestionar` del portal,
 * `solicitarCierre` del mensajero y `aprobarCierre` / `rechazarCierre` del admin.
 *
 * El mundo (catalogos aparte) lo crea el propio test DENTRO de su transaccion revertida: no lee
 * ordenes, usuarios ni zonas de la base, y LANZA si falta un catalogo o la base.
 *
 * Los cuatro casos sobre la MISMA forma de orden (COD 8 000, entregada hoy):
 *   - sin cierre        -> cuenta (control positivo: sin el, «0» podria ser que el WHERE no la ve nunca);
 *   - cierre solicitado -> no cuenta (declarado);
 *   - cierre aprobado   -> no cuenta (el caso de Preview);
 *   - cierre rechazado  -> cuenta: la gestion conserva su `cierre_id`, el cierre se re-solicita y el
 *     dinero sigue en manos del mensajero hasta entonces.
 */

const MONTO = 8000;

// Ventana amplia alrededor de AHORA: la gestion nace con el `now()` de la transaccion del escenario.
function ventanaDeHoy() {
  const ahora = Date.now();
  return { desde: new Date(ahora - 2 * 60 * 60 * 1000), hasta: new Date(ahora + 2 * 60 * 60 * 1000) };
}

async function entregadaHoy(e: Escenario): Promise<void> {
  const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: MONTO });
  await e.gestionarOk(o.ordenId, "entregado", { monto: MONTO });
}

/** El `Mundo` del escenario 454, pero CREADO en la transaccion (la base recien migrada no trae datos). */
async function mundoPropio(prisma: PrismaClient, tx: TxDeTest): Promise<Mundo> {
  const fks = await crearFksDeOrden(tx);
  const tipo = await tx.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
  if (tipo === null) throw new Error("falta el tipo de identificacion «cedula»: aplica las migraciones.");
  const roles = await tx.rol.findMany({ select: { id: true, value: true } });
  const rolId = new Map(roles.map((r) => [r.value as string, r.id]));
  for (const r of ["admin", "mensajero", "adminTienda", "adminSatelite", "maestro"]) {
    if (!rolId.has(r)) throw new Error(`falta el rol «${r}»: aplica las migraciones.`);
  }
  const catalogo = await tx.orderStatus.findMany({ select: { id: true, value: true } });
  const estatus = new Map(catalogo.map((c) => [c.value, c.id]));
  for (const v of ["en_reparto", "entregado"] satisfies (typeof ESTATUS_454)[number][]) {
    if (!estatus.has(v)) throw new Error(`falta el estatus «${v}»: aplica las migraciones.`);
  }
  const existente = await tx.zona.findFirst({ where: { esCentral: true }, select: { id: true } });
  const central =
    existente ??
    (await tx.zona.create({
      data: {
        nombre: `Central SLT-151 ${randomUUID().slice(0, 8)}`,
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
        esCentral: true,
      },
      select: { id: true },
    }));
  return {
    prisma,
    fks: { tiendaId: fks.tiendaId, zonaId: fks.zonaId, provinciaId: fks.provinciaId, cantonId: fks.cantonId },
    tipoIdentificacionId: tipo.id,
    rolId,
    estatus,
    valorDeEstatus: new Map(catalogo.map((c) => [c.id, c.value])),
    centralZonaId: central.id,
  };
}

/** Escenario 454 sobre un mundo propio, en una transaccion que SIEMPRE se revierte. */
function conEscenario<T>(prisma: PrismaClient, fn: (e: Escenario) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const cliente = clienteConTransaccionAnidada(tx);
    const e = await crearEscenario(await mundoPropio(prisma, tx), tx, cliente);
    return fn(e);
  });
}

function totalGestionado(e: Escenario): Promise<number> {
  return new GestionOrdenRepository(e.cliente).sumMontoCobrarGestionadas(e.mensajeroId, ventanaDeHoy());
}

describe("SLT-151 — Total a cobrar no suma lo ya cerrado (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!HAY_BASE_DE_DATOS) throw new Error("SLT-151: hace falta DATABASE_URL; este test no se salta.");
    prisma = crearPrismaDeTest();
  });

  it("sin cierre: la entregada de hoy SIGUE contando", async () => {
    const total = await conEscenario(prisma, async (e) => {
      await entregadaHoy(e);
      return totalGestionado(e);
    });
    expect(total).toBe(8000);
  });

  it("cierre solicitado: la entregada ya declarada NO cuenta", async () => {
    const r = await conEscenario(prisma, async (e) => {
      await entregadaHoy(e);
      const antes = await totalGestionado(e);
      await e.solicitarCierreOk();
      return { antes, despues: await totalGestionado(e) };
    });
    expect(r.antes).toBe(8000);
    expect(r.despues).toBe(0);
  });

  it("cierre aprobado: la entregada ya entregada al admin NO cuenta (caso de Preview)", async () => {
    const r = await conEscenario(prisma, async (e) => {
      await entregadaHoy(e);
      const antes = await totalGestionado(e);
      const cierreId = await e.solicitarCierreOk();
      const aprobacion = await e.aprobar(cierreId);
      return { antes, aprobacion: aprobacion.status, despues: await totalGestionado(e) };
    });
    expect(r.antes).toBe(8000);
    expect(r.aprobacion).toBe("ok");
    expect(r.despues).toBe(0);
  });

  it("cierre rechazado: el dinero sigue en la mano del mensajero y VUELVE a contar", async () => {
    const r = await conEscenario(prisma, async (e) => {
      await entregadaHoy(e);
      const cierreId = await e.solicitarCierreOk();
      const rechazo = await e.rechazar(cierreId);
      const vinculada = await e.tx.gestionOrden.count({ where: { cierreId } });
      return { rechazo: rechazo.status, vinculada, despues: await totalGestionado(e) };
    });
    expect(r.rechazo).toBe("ok");
    expect(r.vinculada).toBe(1); // el rechazo NO libera la gestion: conserva su `cierre_id`
    expect(r.despues).toBe(8000);
  });
});
