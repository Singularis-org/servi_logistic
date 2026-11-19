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

/* -------------------------------------------------------------------------- */
/* El superadmin que la base ya tiene (una base de desarrollo)                 */
/* -------------------------------------------------------------------------- */
//
// En CI la base esta recien migrada y no tiene superadmin: cada archivo crea el suyo con el lock
// tomado. Una base de desarrollo SI suele tener el real, el del comando de arranque, con filas que lo
// referencian. Ese no es del test: NUNCA se borra ni se modifica, ni siquiera dentro de una
// transaccion revertida. Los casos que solo NECESITAN un superadmin (de actor) usan ese; los que
// necesitan el hueco del indice (R27) o un superadmin con datos propios se saltan con
// `saltarSiHaySuperadminAjeno`, nombrando el motivo.

/** Lo minimo de un cliente para leer la tabla `usuario` (el base de un test, o un `tx`). */
interface ClienteDeLectura {
  $queryRawUnsafe<T = unknown>(sql: string, ...args: unknown[]): Promise<T>;
}

/**
 * El `id` del superadmin que la base ya tiene, o `null`. El indice R27 deja como mucho uno. Con el
 * lock de `tomarLockDeSuperadmin` tomado, el que haya no es de otro archivo de test: es el de la base.
 */
export async function superadminDeLaBase(cliente: ClienteDeLectura): Promise<string | null> {
  const filas = await cliente.$queryRawUnsafe<{ id: string }[]>(
    `SELECT u."id" FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id" WHERE r."value"::text = 'superadmin'`,
  );
  return filas[0]?.id ?? null;
}

/** El superadmin que usa un caso o un archivo, y si es suyo (y por tanto suyo para borrar). */
export interface SuperadminDelTest {
  id: string;
  propio: boolean;
}

/**
 * Para los casos en transaccion revertida que solo necesitan un superadmin de actor: el que ya tiene
 * la base (no se toca) o, si no hay, uno sembrado en `tx` con `insertarUsuario` (el rollback lo
 * quita). En una base vacia es exactamente la siembra de siempre.
 */
export async function superadminDelCaso(tx: TxDeTest, rolSuperadmin: string): Promise<SuperadminDelTest> {
  const existente = await superadminDeLaBase(tx);
  if (existente !== null) return { id: existente, propio: false };
  const u = await insertarUsuario(tx, rolSuperadmin, null);
  if (!u.desenlace.ok) throw new Error(`no se sembro el superadmin del caso: ${JSON.stringify(u.desenlace)}`);
  return { id: u.id, propio: true };
}

/**
 * Para los archivos que COMMITEAN su superadmin: con el lock tomado, el que ya tiene la base (ajeno:
 * no se borra) o el que crea `crear` (propio: el archivo lo borra en su `afterAll`, y solo entonces).
 */
export async function obtenerOCrearSuperadmin(
  cliente: ClienteDeLectura,
  crear: () => Promise<string>,
): Promise<SuperadminDelTest> {
  const existente = await superadminDeLaBase(cliente);
  if (existente !== null) {
    console.warn(`[superadmin-32] se reutiliza el superadmin que ya tiene la base (${existente}); no se borra al acabar`);
    return { id: existente, propio: false };
  }
  return { id: await crear(), propio: true };
}

/** Por que se salta un caso cuando la base ya tiene un superadmin que no es del test. */
export const MOTIVO_SUPERADMIN_AJENO =
  "la base ya tiene un superadmin que no es del test (no se borra ni se toca): este caso necesita el hueco del indice R27 o un superadmin propio; en CI (base sin el) corre";

/** Lo minimo del contexto de un test de vitest para saltarlo en marcha. */
interface ContextoSaltable {
  skip(condicion: boolean, nota?: string): void;
}

/**
 * Salta el caso, con el motivo a la vista, si `hayAjeno`. La condicion se conoce en el `beforeAll`
 * (con el lock tomado), no al recolectar: por eso `ctx.skip` y no `it.skipIf`. Al recolectar, otro
 * archivo podria tener commiteado su superadmin de un momento y el caso se saltaria en CI.
 */
export function saltarSiHaySuperadminAjeno(ctx: ContextoSaltable, hayAjeno: boolean): void {
  if (hayAjeno) console.warn(`[superadmin-32] caso saltado: ${MOTIVO_SUPERADMIN_AJENO}`);
  ctx.skip(hayAjeno, MOTIVO_SUPERADMIN_AJENO);
}

/**
 * Para los casos que necesitan el hueco del indice R27 dentro de su transaccion revertida: en CI, con
 * el lock tomado, la base no tiene superadmin y esto no hace nada. Si lo tiene, el caso tenia que
 * haberse saltado con `saltarSiHaySuperadminAjeno`: lanza en vez de borrarlo.
 */
export async function exigirHuecoDeSuperadmin(tx: TxDeTest): Promise<void> {
  if ((await superadminDeLaBase(tx)) !== null) {
    throw new Error(`hay un superadmin que no es del test y no se toca: ${MOTIVO_SUPERADMIN_AJENO}`);
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
 * transaccion hasta el timeout (uno en una transaccion revertida). Y un archivo que lee «el superadmin
 * de la base» (`superadminDeLaBase`) tomaria por ajeno el que otro acaba de commitear para sus casos.
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
 * arranque), se reutiliza sin tocarlo (`obtenerOCrearSuperadmin`, `superadminDelCaso`) y los casos
 * que no lo admiten se saltan (`saltarSiHaySuperadminAjeno`).
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
