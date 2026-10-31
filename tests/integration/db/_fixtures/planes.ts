import { randomUUID } from "node:crypto";

import type { PrismaClient, RolValue } from "@prisma/client";

import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import type { CrearPlanInput } from "@/lib/types/planes";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { CLAVE_LOCK_ESCRITURA_REAL, RegistroCaido, clienteConSavepoint, type TxDeTest } from "../_postgres-real";
import { crearUsuarioDePrueba } from "./orden-minima";
import { idDeRol, liberarHuecoDeSuperadmin } from "./superadmin-32";

// SL-24 — lo que comparten los tests de integración de planes y topes.
//
// No va en `tests/fabricas/` (SL-43 está en vuelo sobre ese directorio, design §14). Hasta que exista
// `PlanesRepository` (T4), los planes y las asignaciones se escriben como dueño con el cliente del
// test, que es como escribe el superadmin (`comoPlataforma`). El ancla se fija con `now()` de la base
// en UTC explícito (`now() AT TIME ZONE 'UTC'`), igual que los triggers y que Prisma al escribir
// `orden.created_at` (decisión 2026-10-28): no depende de la zona de la sesión. Una orden insertada
// por SQL a mano lleva su `created_at` en UTC explícito, no el DEFAULT `CURRENT_TIMESTAMP`, que es
// la hora local de la sesión.

/* -------------------------------------------------------------------------- */
/* La tabla de fechas del ciclo (R20): la usan la gemela TS y la función SQL   */
/* -------------------------------------------------------------------------- */

export interface CasoCiclo {
  caso: string;
  /** `TIMESTAMP` sin zona, en ISO con `Z` (Prisma lo entrega así). */
  ancla: string;
  ahora: string;
  inicio: string;
}

export const CASOS_CICLO: readonly CasoCiclo[] = [
  { caso: "alta el 15: a mitad del tercer ciclo", ancla: "2026-01-15T10:00:00.000Z", ahora: "2026-03-20T00:00:00.000Z", inicio: "2026-03-15T10:00:00.000Z" },
  { caso: "alta el 15: el 14 sigue en el ciclo que empezó el 15 anterior", ancla: "2026-01-15T10:00:00.000Z", ahora: "2026-03-14T23:59:59.999Z", inicio: "2026-02-15T10:00:00.000Z" },
  { caso: "alta el 31 de enero, año normal: febrero empieza el 28", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-02-28T08:00:00.000Z", inicio: "2027-02-28T08:00:00.000Z" },
  { caso: "alta el 31 de enero, año normal: el 1 de marzo sigue en el ciclo del 28", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-03-01T00:00:00.000Z", inicio: "2027-02-28T08:00:00.000Z" },
  { caso: "alta el 31 de enero: marzo vuelve al 31", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-03-31T08:00:00.000Z", inicio: "2027-03-31T08:00:00.000Z" },
  { caso: "alta el 31 de enero: el 30 de marzo aún es el ciclo de febrero", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-03-30T23:00:00.000Z", inicio: "2027-02-28T08:00:00.000Z" },
  { caso: "alta el 31 de enero: abril empieza el 30", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-05-15T00:00:00.000Z", inicio: "2027-04-30T08:00:00.000Z" },
  { caso: "alta el 31 de enero, año bisiesto: febrero empieza el 29", ancla: "2028-01-31T08:00:00.000Z", ahora: "2028-02-29T08:00:00.000Z", inicio: "2028-02-29T08:00:00.000Z" },
  { caso: "alta el 31 de enero, año bisiesto: el 28 sigue en el primer ciclo", ancla: "2028-01-31T08:00:00.000Z", ahora: "2028-02-28T23:59:00.000Z", inicio: "2028-01-31T08:00:00.000Z" },
  { caso: "la frontera exacta empieza el ciclo nuevo", ancla: "2026-10-15T12:00:00.000Z", ahora: "2026-11-15T12:00:00.000Z", inicio: "2026-11-15T12:00:00.000Z" },
  { caso: "un milisegundo antes de la frontera es el ciclo anterior", ancla: "2026-10-15T12:00:00.000Z", ahora: "2026-11-15T11:59:59.999Z", inicio: "2026-10-15T12:00:00.000Z" },
  { caso: "un ahora anterior al ancla da el ancla", ancla: "2026-10-15T12:00:00.000Z", ahora: "2026-09-01T00:00:00.000Z", inicio: "2026-10-15T12:00:00.000Z" },
  { caso: "ahora igual al ancla da el ancla", ancla: "2026-10-15T12:00:00.000Z", ahora: "2026-10-15T12:00:00.000Z", inicio: "2026-10-15T12:00:00.000Z" },
  { caso: "cruza de año desde un 31 de diciembre", ancla: "2025-12-31T00:00:00.000Z", ahora: "2026-02-28T00:00:00.000Z", inicio: "2026-02-28T00:00:00.000Z" },
  { caso: "cruza de año: el 30 de enero sigue en el ciclo del 31 de diciembre", ancla: "2025-12-31T00:00:00.000Z", ahora: "2026-01-30T00:00:00.000Z", inicio: "2025-12-31T00:00:00.000Z" },
];

/* -------------------------------------------------------------------------- */
/* Transacciones y errores                                                     */
/* -------------------------------------------------------------------------- */

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transacción del dueño que siempre se revierte. El lock de aviso de la 227 va primero. */
export async function revertida<T>(base: PrismaClient, fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** SQLSTATE de un error de Prisma 7 + adapter-pg, en sus dos formas (P2010 o `DriverAdapterError`). */
export function sqlstateDe(e: unknown): string {
  const o = e as {
    message?: string;
    cause?: { originalCode?: string; code?: string };
    meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } };
  };
  const causa = o.meta?.driverAdapterError?.cause ?? o.cause;
  return (
    causa?.originalCode ??
    causa?.code ??
    /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ??
    `?? ${String(o.message ?? e).slice(0, 200)}`
  );
}

/** Corre `fn` en un SAVEPOINT: un rechazo no aborta la transacción del caso. El error o `null`. */
export async function capturar(tx: TxDeTest, fn: () => Promise<unknown>): Promise<unknown> {
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

/* -------------------------------------------------------------------------- */
/* Planes y asignación (como dueño)                                            */
/* -------------------------------------------------------------------------- */

type ClienteDePlanes = Pick<TxDeTest, "plan" | "$executeRawUnsafe">;

export interface PlanDePrueba {
  ordenes?: number | null;
  apiKeys?: number | null;
  porRol?: Partial<Record<RolValue, number>>;
  /** La empresa de un custom; sin ella, público. */
  custom?: string;
  archivado?: boolean;
}

export async function crearPlan(c: ClienteDePlanes, p: PlanDePrueba = {}): Promise<string> {
  const { id } = await c.plan.create({
    data: {
      nombre: `sl24 ${randomUUID().slice(0, 8)}`,
      visibilidad: p.custom ? "custom" : "publico",
      organizacionExclusivaId: p.custom ?? null,
      topeOrdenesCiclo: p.ordenes ?? null,
      topeApiKeys: p.apiKeys ?? null,
      archivadoAt: p.archivado ? new Date() : null,
      topesPorRol: {
        create: Object.entries(p.porRol ?? {}).map(([rol, maximo]) => ({ rol: rol as RolValue, maximo: maximo as number })),
      },
    },
    select: { id: true },
  });
  return id;
}

/**
 * Asigna el plan con el ancla `now() - desfase` (por defecto una hora: las filas que el caso cree
 * después quedan dentro del ciclo aunque el reloj de la base y el de Node no casen al milisegundo).
 */
export async function asignarPlan(
  c: ClienteDePlanes,
  organizacionId: string,
  planId: string,
  desfase = "1 hour",
): Promise<void> {
  await c.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - $2::interval WHERE "id" = $3`,
    planId,
    desfase,
    organizacionId,
  );
}

/* -------------------------------------------------------------------------- */
/* T4: el repositorio real dentro de la transacción del caso                   */
/* -------------------------------------------------------------------------- */

/**
 * `PlanesRepository` sobre la transacción del caso: cada `$transaction` suya es un SAVEPOINT real
 * (`clienteConSavepoint`), así que un rechazo o un registro roto deshace solo esa operación.
 * `romper` sustituye `historialAccion.createMany` o `planRastro.create` por uno que lanza.
 */
export function planesEnTx(tx: TxDeTest, romper: "nada" | "historial" | "rastro" = "nada"): PlanesRepository {
  const cliente = clienteConSavepoint(tx, romper === "historial");
  if (romper !== "rastro") return new PlanesRepository(cliente);
  const conRastroRoto: unknown = new Proxy(cliente as object, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        const abrir = Reflect.get(objetivo, prop) as (fn: (t: unknown) => unknown) => Promise<unknown>;
        return (fn: (t: unknown) => unknown) => abrir((t) => fn(rastroRoto(t)));
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
  return new PlanesRepository(conRastroRoto as PrismaClient);
}

function rastroRoto(t: unknown): unknown {
  return new Proxy(t as object, {
    get(objetivo, prop) {
      if (prop === "planRastro") {
        return {
          create: () => {
            throw new RegistroCaido();
          },
        };
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
}

/** Una entrada válida de `crearPlanSchema`, pública y sin topes ni precio salvo lo que se pida. */
export function entradaDePlan(p: Partial<CrearPlanInput> = {}): CrearPlanInput {
  return {
    nombre: `sl24 ${randomUUID().slice(0, 8)}`,
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "sin_precio" },
    costoPorOrden: null, // SLT-66 R7: sin costo por orden salvo que el caso lo pida.
    ...p,
  };
}

/**
 * El superadmin del caso, dentro de su transacción revertida (SL-32: hay uno solo en toda la base).
 * El archivo tiene que sostener `tomarLockDeSuperadmin` desde su `beforeAll`. Deja la empresa del
 * contexto vacía: quien llama la vuelve a fijar si la necesita.
 */
export async function superadminEnTx(tx: TxDeTest): Promise<string> {
  await liberarHuecoDeSuperadmin(tx, await idDeRol(tx, "superadmin"));
  // '' vuelve NULL el DEFAULT de `usuario.organizacion_id`: el superadmin no tiene empresa.
  await fijarEmpresa(tx, "");
  return (await crearUsuarioDePrueba(tx, "superadmin")).id;
}

/** Control de no vacuidad: el trigger existe sobre esa tabla y está activo. */
export async function triggerActivo(
  c: Pick<TxDeTest, "$queryRawUnsafe">,
  nombre: string,
  tabla: string,
): Promise<boolean> {
  const filas = await c.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE t.tgname = $1 AND c.relname = $2 AND s.nspname = 'public' AND t.tgenabled <> 'D'`,
    nombre,
    tabla,
  );
  return filas[0]?.n === 1;
}
