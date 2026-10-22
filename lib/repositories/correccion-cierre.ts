import { Prisma } from "@prisma/client";

/**
 * FICHA 477 (design D2, T1.1) — EL PREDICADO UNICO DE «ORDEN EN CORRECCION DE UN CIERRE RECHAZADO».
 *
 * Una orden esta EN CORRECCION de un cierre X si y solo si:
 *   1. tiene fila en `cierre_detail` para X;
 *   2. X es un cierre `rechazado` DEL MENSAJERO que pregunta (`cierre_dia.mensajero_id`);
 *   3. NO tiene ninguna gestion VIGENTE (no anulada) vinculada a X.
 *
 * Es la huella exacta que deja el deshacer de la 477 (anular + desvincular, D1): la fila de
 * `cierre_detail` se queda y la gestion se va. Antes de la 477 el conjunto es VACIO por
 * construccion: ninguna via dejaba una fila de `cierre_detail` sin gestion vigente.
 *
 * POR QUE SQL CRUDO Y NO UN `where` DE PRISMA. La condicion 3 es una correlacion
 * `g.cierre_id = cd.cierre_id AND g.orden_id = cd.orden_id`, que no se puede expresar como filtro
 * de relacion: `orden.gestiones.none` no sabe atarse al MISMO cierre de la fila exterior. Entra por
 * los indices que ya existen: `cierre_detail(cierre_id, orden_id)` (unico),
 * `cierre_dia(mensajero_id, estado)` y `gestion_orden(cierre_id)`.
 *
 * QUIEN LO CONSUME (todos por este modulo, nadie con una copia):
 *   - la exencion del bloqueo al escoger y al gestionar (`MisAsignacionesService`, R12/R13);
 *   - la marca `enCorreccion` del listado de Entregas (R27);
 *   - la exencion del deshacer caso (b) (`CierreDiaService.deshacerGestion`, R4);
 *   - la re-solicitud del rechazado (`CierreDiaRepository.resolicitarCierreRechazado`, R15/R18);
 *   - la pantalla de cierre del dia (`CierreDiaRepository.findCorreccionesPendientes`, R26).
 *
 * Los filtros por ordenes y por cierre son OPCIONALES y solo ESTRECHAN: nunca relajan una de las
 * tres condiciones. Lista de ordenes vacia = conjunto vacio, y quien llama no deberia ni consultar.
 */
export interface FiltroOrdenesEnCorreccion {
  mensajeroId: string;
  ordenIds?: readonly string[];
  cierreId?: string;
}

/** Fila del predicado: la orden y el cierre rechazado del que esta en correccion. */
export interface OrdenEnCorreccion {
  ordenId: string;
  cierreId: string;
}

/** Lo minimo que necesita el predicado del cliente: el cliente agrupado o la tx de un repositorio. */
export interface ClienteSqlCorreccion {
  $queryRaw<T = unknown>(query: Prisma.Sql): Prisma.PrismaPromise<T>;
}

export function sqlOrdenesEnCorreccion(filtro: FiltroOrdenesEnCorreccion): Prisma.Sql {
  const porOrdenes =
    filtro.ordenIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND "cd"."orden_id" IN (${Prisma.join([...filtro.ordenIds])})`;
  const porCierre =
    filtro.cierreId === undefined ? Prisma.empty : Prisma.sql`AND "cd"."cierre_id" = ${filtro.cierreId}`;
  return Prisma.sql`
    SELECT "cd"."orden_id" AS "orden_id", "cd"."cierre_id" AS "cierre_id"
      FROM "cierre_detail" "cd"
      JOIN "cierre_dia" "c" ON "c"."id" = "cd"."cierre_id"
     WHERE "c"."mensajero_id" = ${filtro.mensajeroId}
       AND "c"."estado" = 'rechazado'
       AND NOT EXISTS (
         SELECT 1 FROM "gestion_orden" "g"
          WHERE "g"."cierre_id" = "cd"."cierre_id"
            AND "g"."orden_id" = "cd"."orden_id"
            AND "g"."anulada_at" IS NULL
       )
       ${porOrdenes}
       ${porCierre}
     ORDER BY "cd"."cierre_id", "cd"."orden_id"`;
}

/**
 * Ejecuta el predicado. Con `ordenIds` VACIO no consulta: devuelve `[]` (un `IN ()` ademas no es
 * SQL valido).
 */
export async function ordenesEnCorreccion(
  cliente: ClienteSqlCorreccion,
  filtro: FiltroOrdenesEnCorreccion,
): Promise<OrdenEnCorreccion[]> {
  if (filtro.ordenIds !== undefined && filtro.ordenIds.length === 0) return [];
  const filas = await cliente.$queryRaw<{ orden_id: string; cierre_id: string }[]>(
    sqlOrdenesEnCorreccion(filtro),
  );
  return filas.map((f) => ({ ordenId: f.orden_id, cierreId: f.cierre_id }));
}
