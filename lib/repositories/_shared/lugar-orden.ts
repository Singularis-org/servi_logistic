import { Prisma } from "@prisma/client";

import type { NivelGeografico } from "@/lib/types/geografia-nodo";

// SLT-65 (design §3) — EL LUGAR DE UNA ORDEN, escrito en un solo sitio.
//
// SLT-48 (design §5; R22, R23) — el lugar es `orden.nodo_geografico_id`. Hasta SLT-48 salia de las FK
// viejas (`COALESCE(distrito_id, canton_id)`); una orden nueva las deja en NULL (R15). Para una orden
// vieja da lo mismo: su nodo es ese `COALESCE` (trigger y backfill de SLT-43; precondicion R6).
//
// SLT-71 (design §3.1) — la misma regla en SQL crudo (`sqlLugarEn`), para las lecturas de analitica, y
// la correspondencia entre nivel y profundidad, movida aqui desde `OrdenRepository`.

/**
 * SLT-65 (design §5, paso 2; design §13): la unica correspondencia entre el nivel de tres valores
 * (SL-20) y la profundidad del catalogo. Se retira con SLT-47/SLT-48, cuando el nivel deje de viajar.
 * SLT-71 la movio aqui desde `OrdenRepository` para que siga escrita una sola vez.
 */
export const PROFUNDIDAD_DEL_NIVEL: Record<NivelGeografico, number> = { provincia: 1, canton: 2, distrito: 3 };

/**
 * SLT-48 (design §5): el nodo de la orden. `null` solo en una orden sin nodo (SQL a mano: R6 lo impide
 * en los datos y la app siempre lo manda); las superficies lo tratan como lugar fuera del catalogo.
 */
export function lugarDeLaOrden(o: { nodoGeograficoId: string | null }): string | null {
  return o.nodoGeograficoId;
}

/**
 * `lugar ∈ ids` como `where` de Prisma, sobre `orden.nodo_geografico_id` (indice de SLT-43).
 *
 * Va como clave hermana del resto del `where` (AND); ya no ocupa la clave `OR`.
 */
export function whereLugarEn(ids: readonly string[]): Prisma.OrdenWhereInput {
  return { nodoGeograficoId: { in: [...ids] } };
}

/**
 * SLT-71 (design §3.1), SLT-48 (design §5) — `lugar ∈ ids` en SQL crudo, sobre el alias `o` de `orden`:
 * el nodo de la orden, con el indice de `nodo_geografico_id`.
 *
 * `ids` viaja como UN parametro de tipo array (`= ANY($n::text[])`), no como un `IN` con un parametro
 * por id. Se copia: mutar la lista de entrada despues no cambia la consulta.
 */
export function sqlLugarEn(ids: readonly string[]): Prisma.Sql {
  const lista = [...ids];
  return Prisma.sql`o."nodo_geografico_id" = ANY(${lista}::text[])`;
}
