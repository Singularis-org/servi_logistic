import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { CLAVE_LOCK_ESCRITURA_REAL, type TxDeTest } from "../_postgres-real";

// SL-20 (T1.7) — lo que comparten los tests de integración del país: una transacción del dueño que
// siempre se revierte, un intento en SAVEPOINT que devuelve el SQLSTATE y la vuelta al dueño tras
// `comoApp`. Mismo método que `distrito-zona-especial-por-empresa.test.ts` (SL-38).

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/**
 * Transacción del dueño que siempre se revierte. Toma primero el lock de aviso de la 227: los tests
 * de SL-20 escriben en `usuario`, `orden` y en la geografía, igual que los de otros archivos en paralelo.
 */
export async function revertida<T>(base: PrismaClient, fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** SQLSTATE de un error de Prisma 7 + adapter-pg (P2010 o `DriverAdapterError`) o de `pg`. */
export function sqlstateDe(e: unknown): string {
  const o = e as {
    message?: string;
    code?: string;
    cause?: { originalCode?: string; code?: string };
    meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } };
  };
  const causa = o.meta?.driverAdapterError?.cause ?? o.cause;
  return (
    causa?.originalCode ??
    causa?.code ??
    /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ??
    (typeof o.code === "string" && /^[0-9A-Z]{5}$/.test(o.code) ? o.code : undefined) ??
    `?? ${String(o.message ?? e).slice(0, 160)}`
  );
}

/** Corre `fn` en un SAVEPOINT: un rechazo no aborta la transacción del caso. El error o `null`. */
export async function errorEnSavepoint(tx: TxDeTest, fn: () => Promise<unknown>): Promise<unknown> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await fn();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return e;
  }
}

/** SQL a mano en un SAVEPOINT. SQLSTATE del rechazo o `null` si pasó. */
export async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const error = await errorEnSavepoint(tx, () => tx.$executeRawUnsafe(sql, ...args));
  return error === null ? null : sqlstateDe(error);
}

/** Vuelve al dueño dentro de la misma transacción, para medir sin la RLS de por medio. */
export async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}
