import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { SQLSTATE_EMPRESA_CRUZADA } from "@/lib/db/contexto-empresa";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-83 (design §2.2; R17) — las condiciones congeladas del cobro porcentual son de solo lectura para
// la empresa, y cada empresa lee solo las suyas. La garantía es de la BASE: todo va por SQL a mano.
//
//   · como `servi_app` (`comoApp`, sin BYPASSRLS): INSERT, UPDATE y DELETE sobre
//     `cobro_plataforma_porcentual_orden` y sobre `cobro_plataforma_movimiento` → 42501 (el REVOKE);
//     el SELECT devuelve solo las filas de la empresa del contexto (la política);
//   · como dueño (sin RLS): una condición de A que apunta a una orden de B → SL017 (trigger de misma
//     empresa), y cambiar la empresa de una condición → SL017 (trigger «sin cambio de empresa»).
//
// Hasta T3 ningún trigger escribe la tabla: las condiciones de control se insertan como dueño, que es
// como escribirá el trigger de alta (SECURITY DEFINER). Cada caso en una transacción revertida; los
// rechazos van en SAVEPOINT para no abortarla.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Escenario {
  a: string;
  b: string;
  ordenA: string;
  ordenB: string;
}

/** INSERT de una orden por SQL a mano, como dueño, con la empresa fijada (el DEFAULT la pone). */
async function insertarOrden(tx: TxDeTest, organizacionId: string): Promise<string> {
  await fijarEmpresa(tx, organizacionId);
  const fks = await crearFksDeOrden(tx);
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
                        provincia_id, canton_id, producto, created_at, updated_at)
     VALUES ($1, $2, $3, 'Destinatario SLT-83', '88880000', $4, $5, $6, $7, 'caja', now(), now())`,
    id,
    `SLT83-${id.slice(0, 8)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
  );
  return id;
}

/** Dos empresas con una orden cada una y, como dueño, la condición congelada de cada orden. */
async function sembrar(tx: TxDeTest): Promise<Escenario> {
  const a = (await crearOrganizacion(tx)).id;
  const b = (await crearOrganizacion(tx)).id;
  const ordenA = await insertarOrden(tx, a);
  const ordenB = await insertarOrden(tx, b);
  await fijarEmpresa(tx, "");
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_porcentual_orden" ("orden_id", "organizacion_id", "porcentaje", "minimo")
     VALUES ($1, $2, 2.50, 1500.00), ($3, $4, 3.00, NULL)`,
    ordenA,
    a,
    ordenB,
    b,
  );
  return { a, b, ordenA, ordenB };
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transacción del caso. El SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

async function condicion(tx: TxDeTest, ordenId: string) {
  const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; porcentaje: string; minimo: string | null }[]>(
    `SELECT "organizacion_id", "porcentaje"::text AS porcentaje, "minimo"::text AS minimo
       FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = $1`,
    ordenId,
  );
  return filas[0] ?? null;
}

describeSiHayBase("SLT-83 R17 — las condiciones congeladas son de solo lectura y por empresa", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R17: la empresa (servi_app) no puede escribir, cambiar ni borrar condiciones → 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await sembrar(tx);
      const ordenSinCondicion = await insertarOrden(tx, e.a);
      await comoApp(tx, e.a);
      const insertar = await intentar(
        tx,
        `INSERT INTO "cobro_plataforma_porcentual_orden" ("orden_id", "porcentaje", "minimo") VALUES ($1, 0.01, 0)`,
        ordenSinCondicion,
      );
      const actualizar = await intentar(
        tx,
        `UPDATE "cobro_plataforma_porcentual_orden" SET "porcentaje" = 0.01, "minimo" = 0 WHERE "orden_id" = $1`,
        e.ordenA,
      );
      const borrar = await intentar(tx, `DELETE FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = $1`, e.ordenA);
      // Control: la empresa SÍ lee su condición. Si no pudiera ni leer, el 42501 podría venir de otro sitio.
      const leida = await condicion(tx, e.ordenA);
      const nueva = await condicion(tx, ordenSinCondicion);
      return { insertar, actualizar, borrar, leida, nueva };
    });
    expect({ insertar: r.insertar, actualizar: r.actualizar, borrar: r.borrar }).toEqual({
      insertar: "42501",
      actualizar: "42501",
      borrar: "42501",
    });
    expect(r.leida).toEqual({ organizacion_id: expect.any(String), porcentaje: "2.50", minimo: "1500.00" });
    expect(r.nueva).toBeNull();
  });

  it("R17: la empresa (servi_app) tampoco puede escribir, cambiar ni borrar movimientos → 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await sembrar(tx);
      await comoApp(tx, e.a);
      const insertar = await intentar(
        tx,
        `INSERT INTO "cobro_plataforma_movimiento" ("id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
         VALUES (gen_random_uuid()::text, $1, 99, 'reverso', 'plan', 1000.00, now())`,
        e.ordenA,
      );
      const actualizar = await intentar(tx, `UPDATE "cobro_plataforma_movimiento" SET "monto" = 0 WHERE "orden_id" = $1`, e.ordenA);
      const borrar = await intentar(tx, `DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, e.ordenA);
      return { insertar, actualizar, borrar };
    });
    expect(r).toEqual({ insertar: "42501", actualizar: "42501", borrar: "42501" });
  });

  it("R17: la empresa lee solo las condiciones de sus órdenes", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await sembrar(tx);
      await comoApp(tx, e.a);
      const visibles = await tx.$queryRawUnsafe<{ orden_id: string; organizacion_id: string }[]>(
        `SELECT "orden_id", "organizacion_id" FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = ANY($1::text[])`,
        [e.ordenA, e.ordenB],
      );
      const deB = await condicion(tx, e.ordenB);
      return { e, visibles, deB };
    });
    expect(r.visibles).toEqual([{ orden_id: r.e.ordenA, organizacion_id: r.e.a }]);
    expect(r.deB).toBeNull();
  });

  it("R17: una condición de A no puede apuntar a una orden de B → SL017; la de su propia orden entra", async () => {
    const r = await revertida(base, async (tx) => {
      const a = (await crearOrganizacion(tx)).id;
      const b = (await crearOrganizacion(tx)).id;
      const ordenA = await insertarOrden(tx, a);
      const ordenB = await insertarOrden(tx, b);
      await fijarEmpresa(tx, "");
      const sql = `INSERT INTO "cobro_plataforma_porcentual_orden" ("orden_id", "organizacion_id", "porcentaje") VALUES ($1, $2, 5)`;
      const cruzada = await intentar(tx, sql, ordenB, a);
      const propia = await intentar(tx, sql, ordenA, a);
      return { cruzada, propia, deB: await condicion(tx, ordenB), deA: await condicion(tx, ordenA) };
    });
    expect(r.cruzada).toBe(SQLSTATE_EMPRESA_CRUZADA);
    expect(r.deB).toBeNull();
    expect(r.propia).toBeNull();
    expect(r.deA?.porcentaje).toBe("5.00");
  });

  it("R17: cambiar la empresa de una condición existente → SL017, y la fila no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await sembrar(tx);
      const mover = await intentar(
        tx,
        `UPDATE "cobro_plataforma_porcentual_orden" SET "organizacion_id" = $2 WHERE "orden_id" = $1`,
        e.ordenA,
        e.b,
      );
      return { e, mover, despues: await condicion(tx, e.ordenA) };
    });
    expect(r.mover).toBe(SQLSTATE_EMPRESA_CRUZADA);
    expect(r.despues?.organizacion_id).toBe(r.e.a);
  });
});
