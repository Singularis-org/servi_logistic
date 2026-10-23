import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { urlDeBaseDeDatos, type TxDeTest } from "../_postgres-real";
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

/* -------------------------------------------------------------------------- */
/* El unico superadmin, compartido entre archivos de test                      */
/* -------------------------------------------------------------------------- */

/**
 * SL-32 (tarea A) — clave del lock de aviso que SERIALIZA a los archivos de test que crean un
 * superadmin. Distinta de `CLAVE_LOCK_ESCRITURA_REAL` (227): esta no ordena escrituras, ordena
 * quien es dueno del UNICO hueco que deja el indice `usuario_un_solo_superadmin` (R27), que es
 * GLOBAL.
 *
 * POR QUE HACE FALTA. Vitest corre un worker por archivo. Si dos archivos crean su superadmin a la
 * vez, el segundo muere con 23505 (los dos commiteados) o espera al primero dentro de su
 * transaccion hasta el timeout (uno en una transaccion revertida). Y `liberarHuecoDeSuperadmin` de
 * un archivo borraria, en su transaccion, el superadmin que otro acaba de commitear para sus casos.
 * Con el lock, los archivos que lo usan se turnan sin depender del orden en que vitest los reparta.
 */
export const CLAVE_LOCK_SUPERADMIN = 32_1023_01;

/** Lo minimo del `pg.Pool` que hay debajo del driver adapter (sin dependencia nueva). */
interface PoolDelDriver {
  connect(): Promise<{ query(texto: string): Promise<unknown>; release(): void }>;
  end(): Promise<void>;
}

/**
 * Toma el lock EN SESION, en una conexion propia que solo lo sostiene, y devuelve con que soltarlo.
 *
 * Uso: TODO archivo que cree un superadmin (commiteado o en una transaccion revertida) lo toma en
 * su `beforeAll`, ANTES de sembrar nada, y lo suelta en su `afterAll`, DESPUES de borrar lo suyo:
 *
 * ```ts
 * let soltarSuperadmin: () => Promise<void> = async () => {};
 * beforeAll(async () => { soltarSuperadmin = await tomarLockDeSuperadmin(); ... });
 * afterAll(async () => { ...limpieza...; await soltarSuperadmin(); });
 * ```
 *
 * Dentro, cada archivo crea SU superadmin con el rol `superadmin` y `organizacion_id` NULL, y lo
 * borra al acabar. Si ya hay uno en la base (una base de desarrollo donde corrio el comando de
 * arranque), los archivos que commitean fallan con `exigirSinSuperadmin`, y los de transaccion
 * revertida lo apartan dentro de ella con `liberarHuecoDeSuperadmin`.
 *
 * ORDEN DE LOCKS: este primero, y el de la 227 (`bajoLockDeEscrituraReal`,
 * `serializarEscriturasReales`) despues y por dentro. Ningun archivo puede sostener el de la 227 y
 * esperar este: con dos claves tomadas en orden distinto si podria haber un ciclo. Lo usaran
 * `arranque-superadmin.test.ts` (T8) y los que vengan.
 *
 * Si el proceso muere, la conexion se cierra y el lock se va con ella.
 */
export async function tomarLockDeSuperadmin(): Promise<() => Promise<void>> {
  const adaptador = await new PrismaPg({ connectionString: urlDeBaseDeDatos() as string, max: 1 }).connect();
  const pool = adaptador.underlyingDriver() as unknown as PoolDelDriver;
  const conexion = await pool.connect();
  const cerrar = async () => {
    conexion.release();
    await pool.end();
  };
  try {
    await conexion.query(`SELECT pg_advisory_lock(${CLAVE_LOCK_SUPERADMIN})`);
  } catch (error) {
    await cerrar();
    throw error;
  }
  let suelto = false;
  return async () => {
    if (suelto) return;
    suelto = true;
    try {
      await conexion.query(`SELECT pg_advisory_unlock(${CLAVE_LOCK_SUPERADMIN})`);
    } finally {
      // Cerrar la conexion tambien lo suelta: si el `unlock` fallara, el lock no se queda tomado.
      await cerrar();
    }
  };
}

/** Lo minimo de un cliente para contar superadmins (el base de un test, o un `tx`). */
interface ClienteDeConteo {
  $queryRawUnsafe<T = unknown>(sql: string, ...args: unknown[]): Promise<T>;
}

/**
 * Para los archivos que COMMITEAN su superadmin: con el lock tomado, la base no puede tener ya uno.
 * Lanza nombrando el motivo; no se borra un superadmin que no es del test.
 */
export async function exigirSinSuperadmin(cliente: ClienteDeConteo): Promise<void> {
  const filas = await cliente.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id" WHERE r."value"::text = 'superadmin'`,
  );
  if (filas[0]?.n !== 0) {
    throw new Error("la base ya tiene un superadmin que no es de este test: usa una base sin el (SL-32 R27)");
  }
}
