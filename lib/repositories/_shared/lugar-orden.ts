import { Prisma } from "@prisma/client";

import type { NivelGeografico } from "@/lib/types/geografia-nodo";

// SLT-65 (design §3) — EL LUGAR DE UNA ORDEN, escrito en un solo sitio.
//
// El lugar sale de las FK viejas y no de `orden.nodo_geografico_id` (decision «Lugar de una orden»;
// R19): asi el resultado no depende de que haya corrido el backfill de SLT-43. El nodo tiene el mismo
// id que el distrito o el canton, de modo que el id de la FK es el id del nodo en el catalogo.
//
// SLT-71 (design §3.1) — la misma regla en SQL crudo (`sqlLugarEn`), para las lecturas de analitica, y
// la correspondencia entre nivel y profundidad, movida aqui desde `OrdenRepository`.

/**
 * SLT-65 (design §5, paso 2; design §13): la unica correspondencia entre el nivel de tres valores
 * (SL-20) y la profundidad del catalogo. Se retira con SLT-47/SLT-48, cuando el nivel deje de viajar.
 * SLT-71 la movio aqui desde `OrdenRepository` para que siga escrita una sola vez.
 */
export const PROFUNDIDAD_DEL_NIVEL: Record<NivelGeografico, number> = { provincia: 1, canton: 2, distrito: 3 };

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

/**
 * SLT-71 (design §3.1) — `lugar ∈ ids` en SQL crudo, sobre el alias `o` de `orden`. El mismo `OR` que
 * `whereLugarEn`, sin `COALESCE` por el mismo motivo: asi puede usar los indices de `distrito_id` y
 * `canton_id`.
 *
 * `ids` viaja como UN parametro de tipo array (`= ANY($n::text[])`), no como un `IN` con un parametro
 * por id. Aparece dos veces en el texto, asi que va dos veces. Se copia: mutar la lista de entrada
 * despues no cambia la consulta.
 */
export function sqlLugarEn(ids: readonly string[]): Prisma.Sql {
  const lista = [...ids];
  return Prisma.sql`(o."distrito_id" = ANY(${lista}::text[]) OR (o."distrito_id" IS NULL AND o."canton_id" = ANY(${lista}::text[])))`;
}
