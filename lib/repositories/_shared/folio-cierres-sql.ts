import type { PrismaClient } from "@prisma/client";

/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R456, R458) — los ids de
 * los cierres de la empresa activa cuyo FOLIO (los últimos 8 caracteres del id, R156) contiene
 * `texto`. Es la lectura de `/cierre-dia` (`idsDeCierresPorFolio`, SLT-138) para las colas de
 * `/cierres-admin`, sin el mensajero: el alcance de cada lista lo pone el `WHERE` de Prisma que
 * recibe estos ids, dentro de su `AND`.
 *
 * Prisma no sabe decir «contiene, solo en los últimos 8»: un `contains` sobre el id entero daría por
 * bueno un texto del primer bloque del uuid. `strpos` y no `LIKE`: `%`/`_` no son comodines.
 * Parametrizada: ningún texto se interpola. `texto` ya llega normalizado (1-8 `0-9A-F`).
 *
 * Archivo aparte (D6): la empresa se filtra POR ESCRITO con `app.organizacion_id`, la que fija la
 * extensión del cliente (o el test), así que no hace falta sumar archivos a `EXCEPCIONES_SQL_A_MANO`.
 * Sin empresa no casa ninguna fila: falla cerrado.
 */
type ClienteSql = Pick<PrismaClient, "$queryRaw">;

/** Cierres del día (`cierre_dia`): las colas de mensajeros y la consolidación de la satélite. */
export async function idsCierresDiaPorFolio(cliente: ClienteSql, texto: string): Promise<string[]> {
  const filas = await cliente.$queryRaw<{ id: string }[]>`
    SELECT cd."id" FROM "cierre_dia" cd
     WHERE cd."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')
       AND strpos(upper(right(cd."id", 8)), ${texto}) > 0`;
  return filas.map((f) => f.id);
}

/** Cierres de bodega (`cierre_bodega`): las colas de la central y los solicitados de la satélite. */
export async function idsCierresBodegaPorFolio(cliente: ClienteSql, texto: string): Promise<string[]> {
  const filas = await cliente.$queryRaw<{ id: string }[]>`
    SELECT cb."id" FROM "cierre_bodega" cb
     WHERE cb."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')
       AND strpos(upper(right(cb."id", 8)), ${texto}) > 0`;
  return filas.map((f) => f.id);
}

/** El recorte por folio para un `AND`: sin folio, nada (el `WHERE` queda como antes, R459). */
export function recortePorFolio(ids: readonly string[] | undefined): Array<{ id: { in: string[] } }> {
  return ids === undefined ? [] : [{ id: { in: [...ids] } }];
}
