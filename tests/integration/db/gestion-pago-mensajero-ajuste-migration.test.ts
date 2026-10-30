import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { sembrarCierre56, type Corpus56 } from "./_fixtures/cierre-ajuste-56";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-56 / T1 (design §1.1; R17) — la tabla `gestion_pago_mensajero_ajuste` contra Postgres real:
//   · los tres CHECK (pago nuevo no negativo, distinto del anterior, motivo no en blanco);
//   · inmutable para la app: `servi_app` inserta pero no actualiza ni borra (42501);
//   · RLS: otra empresa no ve la fila;
//   · misma empresa: una fila de B que apunte a la gestion, el cierre o el actor de A da SL017.
//
// La conexion del test es la del DUEÑO (sin RLS ni privilegios): para medir RLS y REVOKE se baja a
// `servi_app` con `comoApp`. Cada caso corre en una transaccion que SIEMPRE se revierte, con la
// siembra dentro (`sembrarCierre56`): ningun caso puede pasar «porque no habia nada», y cada uno
// comprueba primero que la fila de control SI entra.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** SQLSTATE de un error de SQL a mano por Prisma 7 + adapter-pg (P2010 con la causa del driver). */
function sqlstateDe(e: unknown): string {
  const o = e as { message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } };
  const causa = o.meta?.driverAdapterError?.cause;
  return (
    causa?.originalCode ??
    causa?.code ??
    /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ??
    `?? ${String(o.message ?? e).slice(0, 160)}`
  );
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transaccion del caso. SQLSTATE o `null`. */
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

const INSERTAR = `INSERT INTO "gestion_pago_mensajero_ajuste"
  ("id", "gestion_id", "cierre_id", "pago_anterior", "pago_nuevo", "actor_usuario_id", "actor_rol", "motivo")
  VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, 'admin'::rol_value, $7)`;

function insertar(
  tx: TxDeTest,
  c: Corpus56,
  campos: { id?: string; anterior?: string; nuevo?: string; motivo?: string } = {},
): Promise<string | null> {
  const { id = randomUUID(), anterior = "0.00", nuevo = "1000.00", motivo = "rechazo con traslado largo" } = campos;
  return intentar(tx, INSERTAR, id, c.gestionRechazo, c.cierreId, anterior, nuevo, c.admin.id, motivo);
}

async function contar(tx: TxDeTest): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "gestion_pago_mensajero_ajuste"`,
  );
  return n;
}

describeSiHayBase("SLT-56 — gestion_pago_mensajero_ajuste: CHECK, inmutable, RLS y misma empresa (R17)", () => {
  let prisma: PrismaClient;

  /** Siembra el corpus y corre `fn`; todo se revierte. */
  const conCorpus = <T>(fn: (tx: TxDeTest, c: Corpus56) => Promise<T>): Promise<T> =>
    enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      return fn(tx, await sembrarCierre56(tx));
    });

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("control: una fila valida entra, con la empresa de la transaccion", async () => {
    const r = await conCorpus(async (tx, c) => {
      const id = randomUUID();
      const error = await insertar(tx, c, { id });
      const filas = await tx.$queryRawUnsafe<{ org: string; anterior: string; nuevo: string }[]>(
        `SELECT "organizacion_id" AS org, "pago_anterior"::text AS anterior, "pago_nuevo"::text AS nuevo
           FROM "gestion_pago_mensajero_ajuste" WHERE "id" = $1`,
        id,
      );
      return { error, filas, org: c.organizacionId };
    });
    expect(r.error).toBeNull();
    expect(r.filas).toEqual([{ org: r.org, anterior: "0.00", nuevo: "1000.00" }]);
  });

  it("R8 — CHECK: un pago nuevo negativo no entra (23514)", async () => {
    const r = await conCorpus(async (tx, c) => ({
      control: await insertar(tx, c, { nuevo: "0.01" }),
      negativo: await insertar(tx, c, { nuevo: "-0.01" }),
    }));
    expect(r.control).toBeNull();
    expect(r.negativo).toBe("23514");
  });

  it("R8 — CHECK: un pago nuevo igual al anterior no entra (23514), tampoco escrito distinto", async () => {
    const r = await conCorpus(async (tx, c) => ({
      igual: await insertar(tx, c, { anterior: "1500.00", nuevo: "1500.00" }),
      igualOtraEscala: await insertar(tx, c, { anterior: "1500", nuevo: "1500.00" }),
      filas: await contar(tx),
    }));
    expect(r.igual).toBe("23514");
    expect(r.igualOtraEscala).toBe("23514");
    expect(r.filas).toBe(0);
  });

  it("R7 — CHECK: un motivo vacio o solo con espacios no entra (23514)", async () => {
    const r = await conCorpus(async (tx, c) => ({
      vacio: await insertar(tx, c, { motivo: "" }),
      espacios: await insertar(tx, c, { motivo: "   \t  " }),
      filas: await contar(tx),
    }));
    expect(r.vacio).toBe("23514");
    expect(r.espacios).toBe("23514");
    expect(r.filas).toBe(0);
  });

  it("R17 — servi_app inserta su ajuste, pero no lo puede actualizar ni borrar (42501)", async () => {
    const r = await conCorpus(async (tx, c) => {
      await comoApp(tx, c.organizacionId);
      const inserta = await insertar(tx, c);
      const visibles = await contar(tx);
      const actualiza = await intentar(
        tx,
        `UPDATE "gestion_pago_mensajero_ajuste" SET "pago_nuevo" = 5.00`,
      );
      const actualizaMotivo = await intentar(tx, `UPDATE "gestion_pago_mensajero_ajuste" SET "motivo" = 'otro'`);
      const borra = await intentar(tx, `DELETE FROM "gestion_pago_mensajero_ajuste"`);
      return { inserta, visibles, actualiza, actualizaMotivo, borra, despues: await contar(tx) };
    });
    expect(r.inserta).toBeNull();
    expect(r.visibles).toBe(1);
    expect(r.actualiza).toBe("42501");
    expect(r.actualizaMotivo).toBe("42501");
    expect(r.borra).toBe("42501");
    expect(r.despues).toBe(1);
  });

  it("RLS — otra empresa no ve el ajuste de A, ni pidiendolo por su gestion", async () => {
    const r = await conCorpus(async (tx, c) => {
      expect(await insertar(tx, c)).toBeNull();
      const comoDueno = await contar(tx);
      const otra = await crearOrganizacion(tx);
      await comoApp(tx, otra.id);
      const ve = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM "gestion_pago_mensajero_ajuste" WHERE "gestion_id" = $1`,
        c.gestionRechazo,
      );
      return { comoDueno, ve, total: await contar(tx) };
    });
    expect(r.comoDueno).toBe(1);
    expect(r.ve).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("misma empresa — un ajuste de B que apunta a la gestion, el cierre y el actor de A da SL017", async () => {
    const r = await conCorpus(async (tx, c) => {
      const otra = await crearOrganizacion(tx);
      await fijarEmpresa(tx, otra.id);
      const cruzada = await insertar(tx, c);
      // Control: la misma fila con la empresa de A entra.
      await fijarEmpresa(tx, c.organizacionId);
      const propia = await insertar(tx, c);
      return { cruzada, propia };
    });
    expect(r.cruzada).toBe("SL017");
    expect(r.propia).toBeNull();
  });
});
