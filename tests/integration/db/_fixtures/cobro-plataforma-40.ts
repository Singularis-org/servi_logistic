import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient } from "@prisma/client";

import { urlDeBaseDeDatos } from "../_postgres-real";

// SL-40 — lo que comparten los tests de integración del cobro de la plataforma por orden.
//
// EL VALOR GLOBAL ES UNA SOLA FILA PARA TODA LA BASE. Dos archivos que lo fijan a la vez se pisan
// el importe que espera cada uno, y un tercero que solo crea órdenes vería cargos con una tarifa que
// no pidió (sin romperse: sus aserciones no miran esta tabla). Por eso quien lo toca lo hace bajo un
// lock de sesión propio de SL-40, tomado en el `beforeAll` y soltado en el `afterAll`, y deja la
// fila como la encontró.

/** Clave del lock de sesión del valor global (SL-40, 2026-10-23). */
export const CLAVE_LOCK_TARIFA_GLOBAL = 40_2026_1023;

/** Lo mínimo del `pg.Pool` que hay debajo del driver adapter (sin dependencia nueva). */
interface PoolDelDriver {
  connect(): Promise<{
    query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    release(): void;
  }>;
  end(): Promise<void>;
}

export interface TarifaGlobalBajoLock {
  /** Fija el valor global (texto con dos decimales) o lo quita (`null` = sin configurar). */
  fijar(monto: string | null): Promise<void>;
  /** Deja la fila como estaba al tomar el lock y lo suelta. Idempotente. */
  soltar(): Promise<void>;
}

/**
 * Toma el lock del valor global por una conexión propia (un lock de sesión vive en su conexión) y
 * recuerda el valor que había. Si la tabla no existe todavía (T1 en rojo), falla al leerla.
 */
export async function tomarTarifaGlobal(): Promise<TarifaGlobalBajoLock> {
  const adaptador = await new PrismaPg({ connectionString: urlDeBaseDeDatos() as string, max: 1 }).connect();
  const pool = adaptador.underlyingDriver() as unknown as PoolDelDriver;
  const conexion = await pool.connect();
  const cerrar = async () => {
    conexion.release();
    await pool.end();
  };
  let previo: string | null;
  try {
    await conexion.query(`SELECT pg_advisory_lock(${CLAVE_LOCK_TARIFA_GLOBAL})`);
    const { rows } = await conexion.query(`SELECT "monto"::text AS m FROM "cobro_plataforma_tarifa"`);
    previo = rows.length ? String(rows[0].m) : null;
  } catch (error) {
    await cerrar();
    throw error;
  }
  const fijar = async (monto: string | null) => {
    if (monto === null) {
      await conexion.query(`DELETE FROM "cobro_plataforma_tarifa"`);
      return;
    }
    await conexion.query(
      `INSERT INTO "cobro_plataforma_tarifa" ("id", "monto", "updated_at") VALUES (true, $1::numeric, now())
       ON CONFLICT ("id") DO UPDATE SET "monto" = EXCLUDED."monto", "updated_at" = now()`,
      [monto],
    );
  };
  let suelto = false;
  return {
    fijar,
    async soltar() {
      if (suelto) return;
      suelto = true;
      try {
        await fijar(previo);
        await conexion.query(`SELECT pg_advisory_unlock(${CLAVE_LOCK_TARIFA_GLOBAL})`);
      } finally {
        // Cerrar la conexión también suelta el lock: si algo de arriba falla, no se queda tomado.
        await cerrar();
      }
    },
  };
}

export interface MovimientoLeido {
  tipo: string;
  fuente: string;
  monto: string;
  secuencia: number;
}

/** Los movimientos de una orden, leídos como dueño (lo que de verdad hay en la base). */
export async function movimientosDe(base: PrismaClient, ordenId: string): Promise<MovimientoLeido[]> {
  return base.$queryRawUnsafe<MovimientoLeido[]>(
    `SELECT "tipo"::text AS tipo, "fuente"::text AS fuente, "monto"::text AS monto, "secuencia" AS secuencia
       FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    ordenId,
  );
}

/** Σ cargo − Σ reverso de una empresa, como texto con dos decimales, leído como dueño. */
export async function deudaDe(base: PrismaClient, organizacionId: string): Promise<string> {
  const filas = await base.$queryRawUnsafe<{ d: string }[]>(
    `SELECT COALESCE(SUM(CASE WHEN "tipo" = 'cargo' THEN "monto" ELSE -"monto" END), 0)::numeric(14, 2)::text AS d
       FROM "cobro_plataforma_movimiento" WHERE "organizacion_id" = $1`,
    organizacionId,
  );
  return filas[0].d;
}
