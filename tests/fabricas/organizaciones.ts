import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

// SL-17 (design §9.1, R33) — la empresa de un test. La base recien migrada no trae ninguna (R32):
// cada test crea la suya y deja sus datos colgando de ella. Con `fijarEmpresa`, el `DEFAULT` de
// `organizacion_id` (design §3, M2) la pone en cada fila, asi que las demas fabricas no necesitan
// conocer SL-17.
//
// SL-31 es duena del resto de `tests/fabricas/`; si su `ClienteDeFabrica` llega antes, este tipo se
// sustituye por el suyo.

/** Lo minimo que una fabrica necesita del cliente: el `PrismaClient` base o el `tx` de un test. */
export type ClienteDeFabrica = Pick<Prisma.TransactionClient, "organizacion">;

/**
 * Lo minimo para fijar el contexto de la transaccion: SQL crudo. Estructural (no `Pick` de Prisma)
 * para que valga tambien el `tx` minimo que reciben los helpers de `tests/integration/db/`.
 */
export interface ClienteDeSql {
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
}

/**
 * Nombre y slug unicos para una organizacion de prueba. El slug sigue el formato de design §3
 * (`^[a-z0-9]+(-[a-z0-9]+)*$`, 3–63): con uno que la validacion de alta rechazaria, un test podria
 * pasar con datos que la app nunca tendria.
 */
export function datosDeOrganizacionDePrueba(nombre?: string): { nombre: string; slug: string } {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  return { nombre: nombre ?? `Empresa de prueba ${sufijo}`, slug: `prueba-${sufijo}` };
}

/** Crea una organizacion con nombre y slug unicos. */
export async function crearOrganizacion(
  c: ClienteDeFabrica,
  o?: { nombre?: string },
): Promise<{ id: string }> {
  return c.organizacion.create({ data: datosDeOrganizacionDePrueba(o?.nombre), select: { id: true } });
}

/**
 * Fija la empresa para el resto de la transaccion (`is_local = true`): el `DEFAULT` de
 * `organizacion_id` y las politicas leen de aqui. Fuera de una transaccion no dura mas que la
 * sentencia, que es lo que se quiere: un ajuste de sesion sobreviviria en la conexion del pool.
 */
export async function fijarEmpresa(tx: ClienteDeSql, organizacionId: string): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', $1, true)`, organizacionId);
}

/**
 * `fijarEmpresa` y ademas baja la transaccion al rol `servi_app` (sin `BYPASSRLS`), como hace la
 * extension en produccion. Sin el cambio de rol, el usuario de la conexion es dueno de las tablas y
 * la RLS no se aplica: un test de aislamiento pasaria aunque la politica no existiera.
 */
export async function comoApp(tx: ClienteDeSql, organizacionId: string): Promise<void> {
  await fijarEmpresa(tx, organizacionId);
  await tx.$executeRawUnsafe(`SELECT set_config('role', 'servi_app', true)`);
}
