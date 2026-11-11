import { lugarDeLaOrden } from "@/lib/repositories/_shared/lugar-orden";
import { ancestros, nodo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { PasoDeRuta } from "@/lib/types/geografia-nodo";

// SLT-47 (design §3.4; R16) — LA RUTA DEL LUGAR DE UNA ORDEN, del nivel 1 al lugar.
//
// Mis-asignaciones y novedades filtran en el cliente, sobre el conjunto cargado: para hacerlo por id y
// a cualquier profundidad (R8, R13), cada fila trae los ids y nombres de su lugar y de sus ancestros.
// Sale del catalogo (`ancestros`) y de `lugarDeLaOrden`, no de las FK viejas: asi SLT-48 cambia un solo
// sitio (alternativa 3 descartada). Puro: sin base ni Prisma.
//
// No es dato personal: son ids y nombres de lugar que la tarjeta ya pinta.

export type { PasoDeRuta };

/** Del nivel 1 al lugar de la orden. Un lugar que no esta en el catalogo da `[]`. */
export function rutaDelLugar(
  cat: CatalogoGeografico,
  o: { distritoId: string | null; cantonId: string },
): PasoDeRuta[] {
  const lugar = nodo(cat, lugarDeLaOrden(o));
  if (lugar === null) return [];
  return [...ancestros(cat, lugar.id).reverse(), lugar].map((n) => ({ id: n.id, nombre: n.nombre }));
}
