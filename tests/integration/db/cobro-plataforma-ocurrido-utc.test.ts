import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { asignarPlan, crearPlan, revertida } from "./_fixtures/planes";

// SLT-212 — `cobro_plataforma_movimiento.ocurrido_at` guarda UTC aunque la sesión tenga otro TimeZone.
//
// La demo de QA no pudo registrar su pago a la plataforma en una base local con `TimeZone = America/Bogota`
// entre las 00:00 y las 05:00 de la plataforma: el trigger escribía `now()` a secas, Postgres lo convertía con la
// zona de la sesión, el cargo quedaba 5 h antes de su instante real, fuera del día de la factura, y la factura
// cerraba con total 0. Este test fija una zona de +14 h (`Pacific/Kiritimati`) dentro de la transacción: con el
// defecto, cada `ocurrido_at` sale 14 h por delante de `now() AT TIME ZONE 'UTC'`, una diferencia que ningún
// reloj produce por casualidad. Dentro de una transacción `now()` es fijo, así que el valor esperado es exacto.
//
// Cubre los cuatro `INSERT` con reloj de 20261119120100: el cargo de alta fijo, el re-cobro al restaurar una
// orden fija, y el cargo y el reverso de la conciliación porcentual.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ZONA_LEJANA = "Pacific/Kiritimati";

let base: PrismaClient;

interface Movimiento {
  tipo: string;
  secuencia: number;
  /** `ocurrido_at` menos `now() AT TIME ZONE 'UTC'` en segundos; 0 = guardado en UTC. */
  desfase: number;
}

async function conPlan(tx: TxDeTest, organizacionId: string, costo: { fijo: string } | { pct: string }): Promise<void> {
  const id = await crearPlan(tx, { custom: organizacionId });
  await tx.plan.update({
    where: { id },
    data: "fijo" in costo ? { costoPorOrden: costo.fijo } : { costoPorOrdenPct: costo.pct, costoPorOrdenMinimo: "0.00" },
  });
  await asignarPlan(tx, organizacionId, id);
}

async function insertarOrden(tx: TxDeTest, organizacionId: string, estado: string): Promise<string> {
  await fijarEmpresa(tx, organizacionId);
  const fks = await crearFksDeOrden(tx);
  const estatus = await tx.orderStatus.findUnique({ where: { value: estado }, select: { id: true } });
  if (estatus === null) throw new Error(`falta el estado «${estado}»`);
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                          "provincia_id", "canton_id", "producto", "monto_cobrar", "updated_at", "created_at")
     VALUES ($1, $2, $3, 'Destinatario SLT-212', '88880000', $4, $5, $6, $7, 'Caja', 10000, now(), now() AT TIME ZONE 'UTC')`,
    id,
    `SLT212-${randomUUID().slice(0, 12)}`,
    estatus.id,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
  );
  return id;
}

async function movimientos(tx: TxDeTest, ordenId: string): Promise<Movimiento[]> {
  return tx.$queryRawUnsafe<Movimiento[]>(
    `SELECT "tipo"::text AS tipo, "secuencia"::int AS secuencia,
            extract(epoch FROM ("ocurrido_at" - (now() AT TIME ZONE 'UTC')::timestamp(3)))::float8 AS desfase
       FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    ordenId,
  );
}

describeSiHayBase("SLT-212 — el instante del cobro de la plataforma, en UTC con cualquier TimeZone de sesión", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("orden fija: el cargo de alta y el re-cobro al restaurarla guardan el instante UTC", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      await conPlan(tx, org, { fijo: "100.00" });
      await tx.$executeRawUnsafe(`SET LOCAL TimeZone = '${ZONA_LEJANA}'`);
      const ordenId = await insertarOrden(tx, org, "en_preparacion");
      // Anular (reverso con el `deleted_at` que pone la app) y restaurar (re-cobro con el reloj de la base).
      await tx.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = now() AT TIME ZONE 'UTC' WHERE "id" = $1`, ordenId);
      await tx.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = NULL WHERE "id" = $1`, ordenId);
      return movimientos(tx, ordenId);
    });
    // Control positivo: los tres movimientos existen; sin ellos el desfase no probaría nada.
    expect(r.map((m) => m.tipo), "SLT-212: cargo, reverso y re-cobro de la orden fija").toEqual(["cargo", "reverso", "cargo"]);
    expect(r.map((m) => m.desfase), "SLT-212: ocurrido_at guarda UTC, no la hora de la sesión").toEqual([0, 0, 0]);
  });

  it("orden porcentual: el cargo y el reverso de la conciliación guardan el instante UTC", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      await conPlan(tx, org, { pct: "5.00" });
      await tx.$executeRawUnsafe(`SET LOCAL TimeZone = '${ZONA_LEJANA}'`);
      // Nace entregada: la conciliación cobra en el acto (R8 de SLT-83).
      const ordenId = await insertarOrden(tx, org, "entregado");
      // Vuelve a un estado no final: la conciliación revierte con `now()` (sin `deleted_at`).
      const enPreparacion = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
      await tx.$executeRawUnsafe(`UPDATE "orden" SET "estatus_id" = $1 WHERE "id" = $2`, enPreparacion?.id, ordenId);
      return movimientos(tx, ordenId);
    });
    expect(r.map((m) => m.tipo), "SLT-212: cargo y reverso de la orden porcentual").toEqual(["cargo", "reverso"]);
    expect(r.map((m) => m.desfase), "SLT-212: ocurrido_at guarda UTC, no la hora de la sesión").toEqual([0, 0]);
  });
});
