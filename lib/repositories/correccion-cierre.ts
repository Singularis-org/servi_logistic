import { Prisma } from "@prisma/client";

/**
 * FICHA 477 (design D2, T1.1) — EL PREDICADO UNICO DE «ORDEN EN CORRECCION DE UN CIERRE RECHAZADO».
 *
 * Una orden esta EN CORRECCION de un cierre X si y solo si:
 *   1. tiene fila en `cierre_detail` para X;
 *   2. X es un cierre `rechazado` DEL MENSAJERO que pregunta (`cierre_dia.mensajero_id`);
 *   3. NO tiene ninguna gestion VIGENTE (no anulada) vinculada a X.
 *
 * SLT-247 (design §3) le suma una SEGUNDA FUENTE, `cierre_sin_gestion`: la barrida de X que sigue
 * `en_reparto` con el mensajero de X (el rechazo la devolvio, R1770) y sin gestion vigente en X ni
 * en un cierre posterior al barrido (R1790). Cada fila lleva su `fuente`.
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

/**
 * SLT-247 (design §3) — DE DONDE SALE la orden en correccion:
 *   - `detalle`: la rama de la 477 (fila de `cierre_detail` sin gestion vigente en X);
 *   - `sin_gestion`: una BARRIDA de X (`cierre_sin_gestion`) que el rechazo devolvio a `en_reparto`
 *     (R1770). Es OBLIGATORIA: el reenvio se bloquea mientras no tenga gestion (R1782).
 */
export type FuenteCorreccion = "detalle" | "sin_gestion";

/** Fila del predicado: la orden y el cierre rechazado del que esta en correccion. */
export interface OrdenEnCorreccion {
  ordenId: string;
  cierreId: string;
  fuente: FuenteCorreccion;
}

/** Lo minimo que necesita el predicado del cliente: el cliente agrupado o la tx de un repositorio. */
export interface ClienteSqlCorreccion {
  $queryRaw<T = unknown>(query: Prisma.Sql): Prisma.PrismaPromise<T>;
}

export function sqlOrdenesEnCorreccion(filtro: FiltroOrdenesEnCorreccion): Prisma.Sql {
  const porOrdenes = (alias: string) =>
    filtro.ordenIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND ${Prisma.raw(`"${alias}"."orden_id"`)} IN (${Prisma.join([...filtro.ordenIds])})`;
  const porCierre = (alias: string) =>
    filtro.cierreId === undefined
      ? Prisma.empty
      : Prisma.sql`AND ${Prisma.raw(`"${alias}"."cierre_id"`)} = ${filtro.cierreId}`;
  // SLT-247 (design §3): la union de dos ramas. Un par (cierre, orden) que sale por las dos
  // (barrida gestionada, vinculada y luego deshecha tras un segundo rechazo) se queda con
  // `sin_gestion`: sigue siendo obligatoria (D2). `DISTINCT ON` con `sin_gestion` primero.
  return Prisma.sql`
    SELECT DISTINCT ON ("u"."cierre_id", "u"."orden_id")
           "u"."orden_id" AS "orden_id", "u"."cierre_id" AS "cierre_id", "u"."fuente" AS "fuente"
      FROM (
        SELECT "cd"."orden_id", "cd"."cierre_id", 'detalle'::text AS "fuente"
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
           ${porOrdenes("cd")}
           ${porCierre("cd")}
        UNION ALL
        -- SLT-247 (R1770/R1778/R1800): la barrida de X que el rechazo devolvio al mensajero. El
        -- estado (en_reparto) y el dueno son los que dejan fuera, por construccion, la barrida de
        -- un rechazado anterior al despliegue (sigue en novedad_interna, R1800).
        SELECT "csg"."orden_id", "csg"."cierre_id", 'sin_gestion'::text AS "fuente"
          FROM "cierre_sin_gestion" "csg"
          JOIN "cierre_dia" "c" ON "c"."id" = "csg"."cierre_id"
          JOIN "orden" "o" ON "o"."id" = "csg"."orden_id"
          JOIN "order_status" "s" ON "s"."id" = "o"."estatus_id"
         WHERE "c"."mensajero_id" = ${filtro.mensajeroId}
           AND "c"."estado" = 'rechazado'
           AND "o"."mensajero_asignado_id" = "c"."mensajero_id"
           AND "o"."deleted_at" IS NULL
           AND "s"."value" = 'en_reparto'
           -- Sin gestion vigente vinculada a X. Y, por R1790, tampoco a un cierre POSTERIOR al
           -- barrido: si el corte se llevo la gestion a su cierre antes del reenvio, la orden ya
           -- esta gestionada y su dinero va alli una sola vez. Una gestion de otro cierre posterior
           -- al barrido solo puede ser de despues del rechazo: entre el barrido y el rechazo la
           -- orden esta en novedad_interna y no se puede gestionar.
           AND NOT EXISTS (
             SELECT 1 FROM "gestion_orden" "g"
              WHERE "g"."orden_id" = "csg"."orden_id"
                AND "g"."anulada_at" IS NULL
                AND (
                  "g"."cierre_id" = "csg"."cierre_id"
                  OR ("g"."cierre_id" IS NOT NULL AND "g"."created_at" > "csg"."created_at")
                )
           )
           ${porOrdenes("csg")}
           ${porCierre("csg")}
      ) "u"
     ORDER BY "u"."cierre_id", "u"."orden_id", ("u"."fuente" = 'sin_gestion') DESC`;
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
  const filas = await cliente.$queryRaw<
    { orden_id: string; cierre_id: string; fuente: FuenteCorreccion }[]
  >(sqlOrdenesEnCorreccion(filtro));
  return filas.map((f) => ({ ordenId: f.orden_id, cierreId: f.cierre_id, fuente: f.fuente }));
}

/**
 * SLT-247 (design §3/§5, R1788/R1789) — fragmento Prisma para el corte diario: la orden NO es
 * barrida de un cierre que siga `rechazado`. Va en los DOS puntos del predicado gemelo (seleccion
 * en `CorteDiarioRepository` y barrido en `CierreDiaRepository.crearCierre`). Mira el estado del
 * cierre, no el mensajero (Prisma no ata el mensajero del cierre al de la fila exterior): ver
 * design §5.
 */
export function whereOrdenNoRetenidaPorRechazado(): Prisma.OrdenWhereInput {
  return { cierresSinGestion: { none: { cierre: { estado: "rechazado" } } } };
}
