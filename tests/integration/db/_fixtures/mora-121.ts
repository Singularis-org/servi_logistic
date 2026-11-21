import { randomUUID } from "node:crypto";

import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import type { TxDeTest } from "../_postgres-real";
import { sqlstateDe } from "./planes";

// SLT-121 (design §10) — lo que comparten los tests de la base de la mora: `factura-plataforma-mora`,
// `mora-congelar` y `bloqueo-por-mora`. Todo corre dentro de una transacción del dueño que se revierte
// (`revertida` de `./planes`).
//
// ARTIFICIO ACEPTADO: `facturaCerrada` escribe la factura cerrada a mano, como dueño, con el `hasta` y el total
// que el caso necesita. El cierre real (`factura_plataforma_cerrar`) solo emite en los fines de período, y la
// tabla de casos de la fecha límite pide fines arbitrarios (fin de mes, 29 de febrero). La fila cumple los CHECK
// de `factura_plataforma` («cerrada» con número y cifras, sin cuotas); el saldo lo calcula, como siempre,
// `factura_plataforma_saldos`. Los casos que miden el camino real usan el cierre real.
//
// No es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.

/** La gracia global que el caso pasa a las funciones; en la app la lee `diasDeGraciaGlobal()`. */
export const GRACIA_GLOBAL = 7;

/** Las 00:00 de la plataforma de un día, en UTC. */
export const cero = (fecha: string) => `${fecha}T06:00:00.000Z`;
/** Un instante de la plataforma (`AAAA-MM-DD`, `HH:MM`) en UTC. */
export const aLas = (fecha: string, hora: string) =>
  new Date(new Date(cero(fecha)).getTime() + (Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))) * 60_000).toISOString();

/** Una empresa nueva, con la empresa del contexto vacía al volver. */
export async function empresa(tx: TxDeTest): Promise<string> {
  const { id } = await crearOrganizacion(tx);
  return id;
}

/** Una factura cerrada de `org`, escrita a mano como dueño (ver el artificio arriba). Devuelve su id. */
export async function facturaCerrada(
  tx: TxDeTest,
  org: string,
  f: { numero: number; hasta: string; total: string },
): Promise<string> {
  const id = randomUUID();
  const desde = new Date(new Date(f.hasta).getTime() - 15 * 86_400_000).toISOString();
  await tx.$executeRawUnsafe(
    `INSERT INTO "factura_plataforma"
       ("id", "organizacion_id", "estado", "numero", "desde_at", "hasta_at", "fin_natural_at", "periodicidad",
        "cargos", "reversos", "total_ordenes", "movimientos", "total", "cerrada_at")
     VALUES ($1, $2, 'cerrada', $3, $4::timestamp, $5::timestamp, $5::timestamp, 'quincenal',
             $6::numeric, 0, $6::numeric, 1, $6::numeric, $5::timestamp)`,
    id,
    org,
    f.numero,
    desde,
    f.hasta,
    f.total,
  );
  return id;
}

/** Fija la gracia propia de la empresa como dueño (NULL = la global). */
export async function fijarGracia(tx: TxDeTest, org: string, dias: number | null): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "factura_dias_gracia" = $2 WHERE "id" = $1`, org, dias);
}

export interface EstadoMoraFila {
  congeladaAt: string | null;
  descongeladaHasta: string | null;
}

/** Las columnas de la mora de una empresa, leídas como dueño y en texto. */
export async function estadoDe(tx: TxDeTest, org: string): Promise<EstadoMoraFila> {
  const [fila] = await tx.$queryRawUnsafe<{ c: string | null; d: string | null }[]>(
    `SELECT to_char("congelada_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS c, "descongelada_hasta"::text AS d
       FROM "organizacion" WHERE "id" = $1`,
    org,
  );
  return { congeladaAt: fila.c, descongeladaHasta: fila.d };
}

/** `organizacion_mora_congelar` como dueño; el JSON de vuelta. */
export async function congelar(tx: TxDeTest, org: string, ahora: string, gracia = GRACIA_GLOBAL): Promise<Record<string, unknown>> {
  const [{ r }] = await tx.$queryRawUnsafe<{ r: Record<string, unknown> }[]>(
    `SELECT organizacion_mora_congelar($1, $2::timestamp, $3) AS r`,
    org,
    ahora,
    gracia,
  );
  return r;
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transacción del caso. El SQLSTATE o `null`. */
export async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
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

/** Vuelve al dueño y deja la empresa del contexto vacía. */
export async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`RESET ROLE`);
  await fijarEmpresa(tx, "");
}
