import type { Prisma } from "@prisma/client";

import type { ZonaAsignada } from "@/lib/services/geografia-dominio";

// SLT-89 (design §4.1; R9) — LAS ASIGNACIONES DE ZONA A NODOS QUE NO SON DISTRITOS.
//
// POR QUE VIVE APARTE DEL CARGADOR. Las asignaciones a distritos se leen de `zona_distrito.distrito_id`
// y NUNCA de su `nodo_geografico_id` (SLT-44 R12): asi no dependen del backfill de SLT-43, y lo vigila
// `geografia-lecturas-sin-nodo-fk.guardia` sobre `CatalogoGeograficoRepository`. `zona_nodo` es otra
// tabla: nacio con SLT-89, su unica columna de lugar ES `nodo_geografico_id` (NOT NULL, sin backfill
// posible que faltar) y R9 manda leerla de ahi. Aislarla en este archivo deja el cargador sin nombrar
// la columna y la regla de la guardia intacta para las tablas viejas.

/** El cliente minimo para leer `zona_nodo`. */
export type ClienteDeZonaNodo = Pick<Prisma.TransactionClient, "zonaNodo">;

/**
 * Las filas de `zona_nodo` de la empresa de la transaccion (la ponen la extension y la RLS), en el
 * orden de su id, con la forma que `crearAsignaciones` espera.
 */
export async function leerAsignacionesANodos(
  tx: ClienteDeZonaNodo,
): Promise<{ nodoId: string; zona: ZonaAsignada }[]> {
  const filas = await tx.zonaNodo.findMany({
    select: { nodoGeograficoId: true, zona: { select: { id: true, nombre: true, esCentral: true } } },
    orderBy: { id: "asc" },
  });
  return filas.map((f) => ({ nodoId: f.nodoGeograficoId, zona: f.zona }));
}
