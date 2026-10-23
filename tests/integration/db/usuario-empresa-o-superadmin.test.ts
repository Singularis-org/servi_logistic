import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  CHECK_EMPRESA_O_SUPERADMIN,
  idDeRol,
  insertarUsuario,
  intentar,
  liberarHuecoDeSuperadmin,
  tomarLockDeSuperadmin,
} from "./_fixtures/superadmin-32";

// SL-32 / T3 (R28) — un usuario tiene empresa si y solo si no es el superadmin: el CHECK
// `usuario_empresa_o_superadmin` de 20261023100200_usuario_empresa_o_superadmin. Contra Postgres
// real y por SQL a mano, con usuarios propios y una organizacion de la fabrica de SL-17.
//
// Cada caso corre en una transaccion revertida y serializada con el lock de la 227. Se aparta el
// superadmin que la base pudiera tener, para que el indice de R27 no responda por el CHECK.
//
// Mutacion de T3: sin el ADD CONSTRAINT en el migration.sql, en una base desechable, caen los casos
// que esperan 23514.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RECHAZO_DEL_CHECK = { ok: false, sqlstate: "23514", restriccion: CHECK_EMPRESA_O_SUPERADMIN };

let prisma: PrismaClient;
// Tarea A de SL-32: los archivos que crean un superadmin se turnan; ver `tomarLockDeSuperadmin`.
let soltarSuperadmin: () => Promise<void> = async () => {};

type Contexto = { tx: TxDeTest; rolSuperadmin: string; rolMaestro: string; empresa: string };

function enCaso<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const rolSuperadmin = await idDeRol(tx, "superadmin");
    const rolMaestro = await idDeRol(tx, "maestro");
    await liberarHuecoDeSuperadmin(tx, rolSuperadmin);
    const empresa = (await crearOrganizacion(tx)).id;
    return fn({ tx, rolSuperadmin, rolMaestro, empresa });
  });
}

describeSiHayBase("SL-32 — empresa o superadmin en usuario (R28)", () => {
  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });

  afterAll(async () => {
    await soltarSuperadmin();
    await prisma?.$disconnect();
  });

  it("un superadmin con organizacion_id no nulo falla con 23514", async () => {
    const r = await enCaso(async ({ tx, rolSuperadmin, empresa }) => insertarUsuario(tx, rolSuperadmin, empresa));

    expect(r.desenlace).toEqual(RECHAZO_DEL_CHECK);
  });

  it("un superadmin que toma la empresa por DEFAULT (la fijada en la transaccion) tambien falla con 23514", async () => {
    const r = await enCaso(async ({ tx, rolSuperadmin }) => insertarUsuario(tx, rolSuperadmin, "por_defecto"));

    expect(r.desenlace).toEqual(RECHAZO_DEL_CHECK);
  });

  it("un maestro con organizacion_id nulo falla con 23514", async () => {
    const r = await enCaso(async ({ tx, rolMaestro }) => insertarUsuario(tx, rolMaestro, null));

    expect(r.desenlace).toEqual(RECHAZO_DEL_CHECK);
  });

  it("el UPDATE que pone a NULL la empresa de un maestro falla con 23514", async () => {
    const r = await enCaso(async ({ tx, rolMaestro, empresa }) => {
      const maestro = await insertarUsuario(tx, rolMaestro, empresa);
      // El trigger `usuario_sin_cambio_de_empresa` de SL-17 ya para este UPDATE (SL017) antes de que
      // llegue al CHECK. Se apaga dentro de esta transaccion (el rollback lo devuelve) para ver la
      // regla de R28 sola: con el trigger puesto, el caso pasaria aunque el CHECK no existiera.
      await tx.$executeRawUnsafe(`ALTER TABLE "usuario" DISABLE TRIGGER "usuario_sin_cambio_de_empresa"`);
      const update = await intentar(tx, `UPDATE "usuario" SET "organizacion_id" = NULL WHERE "id" = $1`, maestro.id);
      return { alta: maestro.desenlace, update };
    });

    expect(r.alta).toEqual({ ok: true });
    expect(r.update).toEqual(RECHAZO_DEL_CHECK);
  });

  it("el UPDATE que pasa a superadmin a un maestro con empresa falla con 23514", async () => {
    const r = await enCaso(async ({ tx, rolSuperadmin, rolMaestro, empresa }) => {
      const maestro = await insertarUsuario(tx, rolMaestro, empresa);
      const update = await intentar(tx, `UPDATE "usuario" SET "rol_id" = $1 WHERE "id" = $2`, rolSuperadmin, maestro.id);
      return { alta: maestro.desenlace, update };
    });

    expect(r.alta).toEqual({ ok: true });
    expect(r.update).toEqual(RECHAZO_DEL_CHECK);
  });

  it("un superadmin con NULL y un maestro con empresa pasan", async () => {
    const r = await enCaso(async ({ tx, rolSuperadmin, rolMaestro, empresa }) => {
      const superadmin = await insertarUsuario(tx, rolSuperadmin, null);
      const maestro = await insertarUsuario(tx, rolMaestro, empresa);
      const filas = await tx.$queryRawUnsafe<{ id: string; organizacion_id: string | null }[]>(
        `SELECT "id", "organizacion_id" FROM "usuario" WHERE "id" IN ($1, $2)`,
        superadmin.id,
        maestro.id,
      );
      return {
        empresa,
        desenlaces: [superadmin.desenlace, maestro.desenlace],
        empresaDe: Object.fromEntries(filas.map((f) => [f.id === superadmin.id ? "superadmin" : "maestro", f.organizacion_id])),
      };
    });

    expect(r.desenlaces).toEqual([{ ok: true }, { ok: true }]);
    expect(r.empresaDe).toEqual({ superadmin: null, maestro: r.empresa });
  });
});
