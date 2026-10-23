import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  CHECK_EMPRESA_O_SUPERADMIN,
  INDICE_UN_SOLO_SUPERADMIN,
  idDeRol,
  insertarUsuario,
  intentar,
  liberarHuecoDeSuperadmin,
} from "./_fixtures/superadmin-32";

// SL-32 / T3 (R27) — un solo superadmin en toda la base, por el indice unico parcial
// `usuario_un_solo_superadmin` de 20261023100100_seed_rol_superadmin. Contra Postgres real y por SQL
// a mano: la garantia es de la base, no del servicio ni del comando.
//
// Cada caso corre en una transaccion revertida, con sus propios usuarios. El lock de la 227 va
// primero (`serializarEscriturasReales`): los casos escriben en `usuario` y uno hace DDL sobre ella.
//
// Mutacion de T3: sin el CREATE INDEX en el migration.sql, en una base desechable, caen el segundo
// INSERT y el UPDATE.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let prisma: PrismaClient;

/** Transaccion revertida, serializada y sin superadmin previo. */
function enCaso<T>(fn: (tx: TxDeTest, rolSuperadmin: string) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const rolSuperadmin = await idDeRol(tx, "superadmin");
    await liberarHuecoDeSuperadmin(tx, rolSuperadmin);
    return fn(tx, rolSuperadmin);
  });
}

describeSiHayBase("SL-32 — un solo superadmin en la base (R27)", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("el primer superadmin, sin empresa, se inserta bien", async () => {
    const r = await enCaso(async (tx, rolSuperadmin) => {
      const primero = await insertarUsuario(tx, rolSuperadmin, null);
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "usuario" WHERE "rol_id" = $1`,
        rolSuperadmin,
      );
      return { desenlace: primero.desenlace, n };
    });

    expect(r).toEqual({ desenlace: { ok: true }, n: 1 });
  });

  it("un segundo INSERT de un usuario superadmin falla por el indice (23505)", async () => {
    const r = await enCaso(async (tx, rolSuperadmin) => {
      const primero = await insertarUsuario(tx, rolSuperadmin, null);
      const segundo = await insertarUsuario(tx, rolSuperadmin, null);
      return { primero: primero.desenlace, segundo: segundo.desenlace };
    });

    expect(r.primero).toEqual({ ok: true });
    expect(r.segundo).toEqual({ ok: false, sqlstate: "23505", restriccion: INDICE_UN_SOLO_SUPERADMIN });
  });

  it("un UPDATE que pasa a otro usuario al rol superadmin tambien falla por el indice (23505)", async () => {
    const r = await enCaso(async (tx, rolSuperadmin) => {
      const rolMaestro = await idDeRol(tx, "maestro");
      const primero = await insertarUsuario(tx, rolSuperadmin, null);
      // Con el CHECK de R28, pasar a superadmin a un usuario con empresa lo para el CHECK antes que
      // el indice, y un no superadmin sin empresa no puede existir. Para ver el indice solo, el CHECK
      // se suelta dentro de esta transaccion (el rollback lo devuelve) y el otro nace sin empresa.
      await tx.$executeRawUnsafe(`ALTER TABLE "usuario" DROP CONSTRAINT "${CHECK_EMPRESA_O_SUPERADMIN}"`);
      const otro = await insertarUsuario(tx, rolMaestro, null);
      const update = await intentar(tx, `UPDATE "usuario" SET "rol_id" = $1 WHERE "id" = $2`, rolSuperadmin, otro.id);
      return { primero: primero.desenlace, otro: otro.desenlace, update };
    });

    expect(r.primero).toEqual({ ok: true });
    expect(r.otro).toEqual({ ok: true });
    expect(r.update).toEqual({ ok: false, sqlstate: "23505", restriccion: INDICE_UN_SOLO_SUPERADMIN });
  });
});
