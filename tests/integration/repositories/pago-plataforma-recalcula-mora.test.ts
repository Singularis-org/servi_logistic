import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { recalcularCongelamiento } from "@/lib/planes/mora-recalcular";
import { PagoPlataformaConfirmacionRepository } from "@/lib/repositories/PagoPlataformaConfirmacionRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "../db/_postgres-real";
import { GRACIA_GLOBAL, aLas, cero, comoDueno, congelar, empresa, estadoDe, facturaCerrada } from "../db/_fixtures/mora-121";
import { crearUsuarioDePrueba } from "../db/_fixtures/orden-minima";
import { capturar, revertida, superadminEnTx } from "../db/_fixtures/planes";
import { tomarLockDeSuperadmin } from "../db/_fixtures/superadmin-32";

// SLT-121 · T2.5 (design §5.2; R19, R20, R21, R34) — el enganche de la mora en `PagoPlataformaConfirmacionRepository`,
// contra Postgres real. Confirmar, registrar por fuera y anular corren ahora en una transacción que, si el
// resultado es `ok`, llama a `recalcularCongelamiento`: el descongelamiento, su fila del historial y su correo se
// confirman con el pago o se pierden con él.
//
// Cada caso en una transacción del dueño que se revierte. El repositorio recibe la `tx` del caso con un
// `$transaction` que abre un SAVEPOINT real (`clienteConSavepoint`). La empresa tiene una factura cerrada de 1000 con
// `hasta` = 16 nov: con la gracia global (7) está vencida desde las 00:00 del 24, y se congela a las 00:30.
// Los pagos se confirman a las 10:00 del 24.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

const MADRUGADA = aLas("2026-11-24", "00:30");
const AHORA = new Date(aLas("2026-11-24", "10:00"));

const repoEn = (tx: TxDeTest, romperRegistro = false) =>
  new PagoPlataformaConfirmacionRepository(clienteConSavepoint(tx, romperRegistro));

interface Caso {
  org: string;
  factura: string;
  superadmin: string;
  maestro: string;
}

/** Una empresa congelada por su factura vencida de 1000, su maestro y el superadmin. */
async function empresaCongelada(tx: TxDeTest, congelarla = true): Promise<Caso> {
  const superadmin = await superadminEnTx(tx);
  const org = await empresa(tx);
  const factura = await facturaCerrada(tx, org, { numero: 1, hasta: cero("2026-11-16"), total: "1000.00" });
  await comoApp(tx, org);
  const { id: maestro } = await crearUsuarioDePrueba(tx, "maestro");
  await comoDueno(tx);
  if (congelarla) {
    const r = await congelar(tx, org, MADRUGADA, GRACIA_GLOBAL);
    if (r.resultado !== "congelada") throw new Error(`la siembra no congeló: ${JSON.stringify(r)}`);
  }
  return { org, factura, superadmin, maestro };
}

/**
 * El pago de la empresa por confirmar, registrado como lo haría la wallet: `servi_app`, su empresa y el permiso
 * del pago a la plataforma (R11), sin el cual el trigger de la mora lo rechazaría con la empresa congelada.
 */
async function pagoDeLaEmpresa(tx: TxDeTest, c: Caso, monto: string): Promise<string> {
  const id = randomUUID();
  await comoApp(tx, c.org);
  await tx.$executeRawUnsafe(`SELECT set_config('app.mora_permitida', 'pago_plataforma', true)`);
  await tx.$executeRawUnsafe(
    `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
     VALUES ($1, 'egreso', 'egreso_pago_plataforma', $2::numeric, 'gasto', 'Pago SLT121', $3, $4)`,
    id,
    monto,
    c.org,
    c.maestro,
  );
  await tx.$executeRawUnsafe(`SELECT set_config('app.mora_permitida', '', true)`);
  await comoDueno(tx);
  return id;
}

async function accionesDeMora(tx: TxDeTest, org: string): Promise<{ accion: string; actor: string | null }[]> {
  return tx.$queryRawUnsafe(
    `SELECT "accion"::text AS accion, "actor_usuario_id" AS actor FROM "historial_accion"
      WHERE "organizacion_id" = $1 AND "accion"::text LIKE 'empresa_%' ORDER BY "created_at"`,
    org,
  );
}

async function avisosDe(tx: TxDeTest, org: string): Promise<Record<string, unknown>[]> {
  const filas = await tx.$queryRawUnsafe<{ payload: Record<string, unknown> }[]>(
    `SELECT "payload" FROM "jobs" WHERE "tipo" = 'mora_aviso_correo' AND "organizacion_id" = $1 ORDER BY "created_at"`,
    org,
  );
  return filas.map((f) => f.payload);
}

async function confirmaciones(tx: TxDeTest, org: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1`,
    org,
  );
  return n;
}

const porFuera = (c: Caso, monto: string, clave = randomUUID()) => ({
  organizacionId: c.org,
  pagoId: randomUUID(),
  monto,
  fecha: null,
  referencia: "Transferencia SLT121",
  claveIdempotencia: clave,
  aplicaciones: [{ facturaId: c.factura, monto }],
  por: c.superadmin,
  ahora: AHORA,
  comprobante: null,
});

describeSiHayBase("SLT-121 — el pago a la plataforma recalcula la mora (R19, R20, R21, R34)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });
  afterAll(async () => {
    await soltarSuperadmin();
    await base?.$disconnect();
  });

  it("R19, R30, R28: confirmar el pago que salda la vencida descongela en la misma transacción, con la fila y el correo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "1000.00");
      const resultado = await repoEn(tx).confirmar({
        organizacionId: c.org,
        pagoId,
        aplicaciones: [{ facturaId: c.factura, monto: "1000.00" }],
        por: c.superadmin,
        ahora: AHORA,
      });
      return { c, resultado, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.resultado).toEqual({ estado: "ok" });
    expect(r.estado.congeladaAt).toBeNull();
    // `empresa_congelada` no está: la siembra congela con la función, sin el repositorio.
    expect(r.acciones).toEqual([{ accion: "empresa_descongelada_por_pago", actor: r.c.superadmin }]);
    expect(r.avisos).toEqual([{ tipo: "descongelada", motivo: "pago" }]);
  });

  it("R19: un pago parcial no descongela ni escribe nada de la mora", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "400.00");
      const resultado = await repoEn(tx).confirmar({
        organizacionId: c.org,
        pagoId,
        aplicaciones: [{ facturaId: c.factura, monto: "400.00" }],
        por: c.superadmin,
        ahora: AHORA,
      });
      return { resultado, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.resultado).toEqual({ estado: "ok" });
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
    expect(r.acciones).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("R19: registrar por fuera el pago que salda descongela; repetirlo (ya_registrado) no vuelve a escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const entrada = porFuera(c, "1000.00");
      const repo = repoEn(tx);
      const primero = await repo.registrarPorFuera(entrada);
      const repetido = await repo.registrarPorFuera({ ...entrada, pagoId: randomUUID() });
      return { c, primero, repetido, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.primero).toEqual({ estado: "ok" });
    expect(r.repetido).toEqual({ estado: "ya_registrado" });
    expect(r.estado.congeladaAt).toBeNull();
    expect(r.acciones).toEqual([{ accion: "empresa_descongelada_por_pago", actor: r.c.superadmin }]);
    expect(r.avisos).toHaveLength(1);
  });

  it("R20: un pago de la empresa que sigue por confirmar no la descongela", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      await pagoDeLaEmpresa(tx, c, "1000.00");
      const recalculo = await recalcularCongelamiento(tx, c.org, AHORA, { causa: "pago", actor: null }, GRACIA_GLOBAL);
      return { recalculo, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org) };
    });
    expect(r.recalculo).toBe("sin_cambio");
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
    expect(r.acciones).toEqual([]);
  });

  it("R21: anular un pago confirmado no congela en el acto, aunque la factura vuelva a quedar vencida", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx, false);
      const entrada = porFuera(c, "1000.00");
      const repo = repoEn(tx);
      await repo.registrarPorFuera(entrada);
      const anulado = await repo.anularConfirmado({
        organizacionId: c.org,
        pagoId: entrada.pagoId,
        motivo: "Pago duplicado SLT121",
        por: c.superadmin,
        ahora: AHORA,
      });
      return { anulado, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.anulado).toEqual({ estado: "ok" });
    expect(r.estado.congeladaAt).toBeNull();
    expect(r.acciones).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("R34: si el recálculo falla, la confirmación se deshace con él y la empresa sigue congelada", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "1000.00");
      const error = await capturar(tx, () =>
        repoEn(tx, true).confirmar({
          organizacionId: c.org,
          pagoId,
          aplicaciones: [{ facturaId: c.factura, monto: "1000.00" }],
          por: c.superadmin,
          ahora: AHORA,
        }),
      );
      return { error, confirmaciones: await confirmaciones(tx, c.org), estado: await estadoDe(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.error).toBeInstanceOf(RegistroCaido);
    expect(r.confirmaciones).toBe(0);
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
    expect(r.avisos).toEqual([]);
  });

  it("R34: los resultados sin cambio de saldo no recalculan (ya_confirmado)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "1000.00");
      const entrada = {
        organizacionId: c.org,
        pagoId,
        aplicaciones: [{ facturaId: c.factura, monto: "1000.00" }],
        por: c.superadmin,
        ahora: AHORA,
      };
      const repo = repoEn(tx);
      const primero = await repo.confirmar(entrada);
      const segundo = await repo.confirmar(entrada);
      return { primero, segundo, acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.primero).toEqual({ estado: "ok" });
    expect(r.segundo).toEqual({ estado: "ya_confirmado" });
    expect(r.acciones).toHaveLength(1);
    expect(r.avisos).toHaveLength(1);
  });
});
