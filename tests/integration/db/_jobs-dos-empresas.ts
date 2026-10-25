import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import { CLAVE_LOCK_ESCRITURA_REAL, type TxDeTest } from "./_postgres-real";

/**
 * SL-19 (design §6) — piezas comunes de los tests de `jobs` con dos empresas contra Postgres real.
 *
 * Los jobs se siembran como DUENO de las tablas (la conexion de los tests), nombrando la empresa:
 * asi la siembra no depende de la politica que se esta probando, y se puede sembrar un job de B o
 * sin empresa aunque luego el test baje a `servi_app` con A.
 *
 * NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.
 */

/** Un instante que ningun job real de la base alcanza: el reclamo y la salud solo ven lo sembrado. */
export const HACE_MUCHO = new Date("1990-01-01T00:00:00Z");

/** SQLSTATE de un error de Prisma con driver adapter («Code: `42501`») o de `pg` (`code`). */
export function sqlstateDe(error: unknown): string {
  const texto =
    JSON.stringify(error, Object.getOwnPropertyNames(error as object)) + String((error as Error)?.message ?? "");
  const conCode = /Code: `([0-9A-Z]{5})`/.exec(texto) ?? /"code":"([0-9A-Z]{5})"/.exec(texto);
  return conCode?.[1] ?? `?? ${String((error as Error)?.message ?? error).replace(/\s+/g, " ").slice(0, 160)}`;
}

/** Corre `fn` en un SAVEPOINT: un fallo no aborta la transaccion del test. SQLSTATE o `null`. */
export async function intentar(tx: TxDeTest, fn: () => Promise<unknown>): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await fn();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

/** Vuelve al dueno dentro de la misma transaccion, para medir sin la RLS de por medio. */
export async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}

/**
 * `servi_app` SIN empresa fijada: el `app.organizacion_id` que dejo un paso anterior se vacia, que
 * es lo que ve la politica cuando la transaccion no paso por `conEmpresa`.
 */
export async function comoAppSinEmpresa(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', '', true)`);
  await tx.$executeRawUnsafe(`SELECT set_config('role', 'servi_app', true)`);
}

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/**
 * Transaccion que siempre se revierte, con dos empresas recien creadas. El lock de aviso de la 227
 * va PRIMERO: los casos escriben en `organizacion`, como los demas tests serializados.
 */
export async function conDosEmpresas<T>(
  prisma: PrismaClient,
  fn: (tx: TxDeTest, a: string, b: string) => Promise<T>,
): Promise<T> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        const a = (await crearOrganizacion(tx)).id;
        const b = (await crearOrganizacion(tx)).id;
        throw new Revertir(await fn(tx, a, b));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

export interface JobSembrado {
  tipo?: string;
  estado?: "pending" | "processing" | "done" | "failed";
  runAfter?: Date;
  updatedAt?: Date;
  lastError?: string | null;
  dedupeKey?: string | null;
}

/** Inserta un job como dueno, con `organizacion_id` explicito (`null` = sin empresa). Devuelve su id. */
export async function sembrarJob(
  tx: TxDeTest,
  organizacionId: string | null,
  o: JobSembrado = {},
): Promise<string> {
  const id = randomUUID();
  const cuando = o.updatedAt ?? HACE_MUCHO;
  await tx.$executeRawUnsafe(
    `INSERT INTO "jobs" ("id", "tipo", "payload", "estado", "intentos", "max_intentos", "run_after",
                         "last_error", "dedupe_key", "organizacion_id", "created_at", "updated_at")
     VALUES ($1, $2::"job_tipo", '{}'::jsonb, $3::"job_estado", 0, 5, $4, $5, $6, $7, $8, $8)`,
    id,
    o.tipo ?? "geocodificacion",
    o.estado ?? "pending",
    o.runAfter ?? HACE_MUCHO,
    o.lastError ?? null,
    o.dedupeKey ?? null,
    organizacionId,
    cuando,
  );
  return id;
}

export interface FilaDeJob {
  id: string;
  estado: string;
  organizacion_id: string | null;
  last_error: string | null;
  run_after: Date;
  intentos: number;
  updated_at: Date;
}

/** Las filas de `ids` vistas por quien sea el rol actual, ordenadas por id. */
export async function filasDe(tx: TxDeTest, ids: readonly string[]): Promise<FilaDeJob[]> {
  return tx.$queryRawUnsafe<FilaDeJob[]>(
    `SELECT "id", "estado"::text AS "estado", "organizacion_id", "last_error", "run_after",
            "intentos"::int AS "intentos", "updated_at"
       FROM "jobs" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
    ids,
  );
}
