import type { Prisma } from "@prisma/client";

// SLT-65 (design §3) — EL LUGAR DE UNA ORDEN, escrito en un solo sitio.
//
// El lugar sale de las FK viejas y no de `orden.nodo_geografico_id` (decision «Lugar de una orden»;
// R19): asi el resultado no depende de que haya corrido el backfill de SLT-43. El nodo tiene el mismo
// id que el distrito o el canton, de modo que el id de la FK es el id del nodo en el catalogo.

/** Decision «Lugar de una orden»: `COALESCE(distrito_id, canton_id)`. */
export function lugarDeLaOrden(o: { distritoId: string | null; cantonId: string }): string {
  return o.distritoId ?? o.cantonId;
}

/**
 * `lugar ∈ ids` como `where` de Prisma. Sin `COALESCE` a proposito: con un `OR` de dos columnas el
 * planificador puede usar los indices de `distrito_id` y `canton_id`, que ya existen.
 *
 * Va siempre como clave hermana del resto del `where` (AND), nunca dentro de otro `OR`: su `OR`
 * ocupa la clave y pisaria uno que ya estuviera.
 */
export function whereLugarEn(ids: readonly string[]): Prisma.OrdenWhereInput {
  const lista = [...ids];
  return { OR: [{ distritoId: { in: lista } }, { distritoId: null, cantonId: { in: lista } }] };
}
