import { randomUUID } from "node:crypto";

import type { TxDeTest } from "../_postgres-real";
import { sqlstateDe } from "./sqlstate-461";

// SL-32 (T3) — lo comun a los tests del indice de un solo superadmin (R27) y del CHECK de empresa
// (R28). Todo va por SQL a mano: la garantia es de la BASE, venga de donde venga la escritura, y un
// INSERT por Prisma podria fallar antes en el cliente sin llegar a probar la restriccion.

export const INDICE_UN_SOLO_SUPERADMIN = "usuario_un_solo_superadmin";
export const CHECK_EMPRESA_O_SUPERADMIN = "usuario_empresa_o_superadmin";

const RESTRICCIONES = [INDICE_UN_SOLO_SUPERADMIN, CHECK_EMPRESA_O_SUPERADMIN];

/**
 * El desenlace de una sentencia. `restriccion` dice CUAL salto: sin ella, un 23505 por el email o un
 * 23514 de otra regla pasarian por el del indice o el del CHECK.
 */
export type Desenlace = { ok: true } | { ok: false; sqlstate: string; restriccion: string | null };

/** Ejecuta `sql` en un SAVEPOINT: un rechazo no aborta la transaccion del caso. */
export async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<Desenlace> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return { ok: true };
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    const texto = JSON.stringify(e, Object.getOwnPropertyNames(e as object)) + String((e as Error)?.message ?? "");
    return { ok: false, sqlstate: sqlstateDe(e), restriccion: RESTRICCIONES.find((r) => texto.includes(r)) ?? null };
  }
}

/** El `id` de un rol del catalogo, por su `value`. Lanza si falta: sin el, el caso no prueba nada. */
export async function idDeRol(tx: TxDeTest, value: string): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "rol" WHERE "value"::text = $1`, value);
  if (filas.length !== 1) throw new Error(`falta el rol «${value}»: aplica las migraciones de SL-32`);
  return filas[0].id;
}

async function idDeCedula(tx: TxDeTest): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "tipo_identificacion" WHERE "value" = 'cedula'`,
  );
  if (filas.length !== 1) throw new Error("falta el tipo de identificacion «cedula»: aplica las migraciones");
  return filas[0].id;
}

/**
 * INSERT de un usuario con email y cedula unicos. `organizacionId` explicito (una empresa o `null`)
 * o `"por_defecto"`, que deja la columna fuera para que la ponga el DEFAULT de SL-17 desde la empresa
 * fijada en la transaccion. Devuelve el `id` para los casos de UPDATE.
 */
export async function insertarUsuario(
  tx: TxDeTest,
  rolId: string,
  organizacionId: string | null | "por_defecto",
): Promise<{ id: string; desenlace: Desenlace }> {
  const id = randomUUID();
  const sufijo = id.replace(/-/g, "").slice(0, 12);
  const tipo = await idDeCedula(tx);
  const columnas = `"id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id", "rol_id", "estado", "updated_at"`;
  const valores = `$1, 'Prueba SL-32', $2, '88880000', 'x', $3, $4, $5, 'activo', now()`;
  const args: unknown[] = [id, `sl32-${sufijo}@example.com`, `sl32-${sufijo}`, tipo, rolId];
  const desenlace =
    organizacionId === "por_defecto"
      ? await intentar(tx, `INSERT INTO "usuario" (${columnas}) VALUES (${valores})`, ...args)
      : await intentar(
          tx,
          `INSERT INTO "usuario" (${columnas}, "organizacion_id") VALUES (${valores}, $6)`,
          ...args,
          organizacionId,
        );
  return { id, desenlace };
}

/**
 * Deja la base sin superadmin DENTRO de la transaccion del caso (el rollback lo devuelve). En una base
 * recien migrada no hay ninguno; en una de desarrollo donde ya corrio el comando de arranque, si. Sin
 * esto, «el primero se inserta bien» dependeria de la base y no de la regla. Si el existente tiene
 * filas que lo referencian, el DELETE falla y el caso lo dice en vez de seguir.
 */
export async function liberarHuecoDeSuperadmin(tx: TxDeTest, rolSuperadmin: string): Promise<void> {
  const r = await intentar(tx, `DELETE FROM "usuario" WHERE "rol_id" = $1`, rolSuperadmin);
  if (!r.ok) {
    throw new Error(`la base tiene un superadmin que no se puede apartar (${r.sqlstate}): usa una base sin el`);
  }
}
