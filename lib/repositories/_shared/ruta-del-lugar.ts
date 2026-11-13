import { lugarDeLaOrden } from "@/lib/repositories/_shared/lugar-orden";
import { ancestros, nodo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { PasoDeRuta } from "@/lib/types/geografia-nodo";
import type { NivelDelPais } from "@/lib/utils/ubicacion-presentacion";

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

/** k de una clave `nivel_<k>`, o `null` si no lo es. */
function profundidadDeClave(clave: string): number | null {
  const m = /^nivel_(\d+)$/.exec(clave);
  return m === null ? null : Number(m[1]);
}

/**
 * SLT-125 (design §4.1) — los niveles del pais del catalogo, del 1 a P: el tipo de la profundidad k es el
 * de clave `nivel_<k>` (SLT-44). Un tipo con otra clave no es un nivel y no entra.
 */
export function nivelesDelCatalogo(cat: CatalogoGeografico): NivelDelPais[] {
  return cat.tipos
    .flatMap((t) => {
      const k = profundidadDeClave(t.clave);
      return k === null ? [] : [{ profundidad: k, singular: t.nombreSingular }];
    })
    .sort((a, b) => a.profundidad - b.profundidad);
}

/** Un paso de la ruta con su nivel y el tipo de ese nivel en este instante. */
export interface PasoConTipo extends PasoDeRuta {
  profundidad: number;
  tipo: string;
}

/**
 * Lanzado cuando un paso de la ruta no tiene tipo en el pais. No ocurre con datos reales (cada nodo
 * cuelga de un tipo del pais); se lanza para que un cierre no congele un tipo inventado (R23).
 */
export class TipoDeNivelAusente extends Error {
  readonly profundidad: number;
  constructor(profundidad: number) {
    super(`ruta del lugar: el pais del catalogo no tiene tipo para el nivel ${profundidad}`);
    this.name = "TipoDeNivelAusente";
    this.profundidad = profundidad;
  }
}

/**
 * SLT-125 (design §2.1, §4.1; R21, R22) — la ruta con la profundidad y el tipo de cada paso, para el
 * `ubicacion_snapshot` y el PDF de transito.
 *
 * La profundidad es la POSICION del paso (la ruta va del nivel 1 al lugar sin huecos) y el tipo es el
 * `nombre_singular` de `nivel_<k>` del pais: la misma regla que `geo:backfill` (`scripts/geo-backfill-nodo.ts`),
 * para que un cierre nuevo y uno rellenado por el script den el mismo snapshot en Costa Rica (R22).
 */
export function rutaConTipos(cat: CatalogoGeografico, ruta: readonly PasoDeRuta[]): PasoConTipo[] {
  const tipoPorNivel = new Map(nivelesDelCatalogo(cat).map((n) => [n.profundidad, n.singular]));
  return ruta.map((paso, i) => {
    const profundidad = i + 1;
    const tipo = tipoPorNivel.get(profundidad);
    if (tipo === undefined) throw new TipoDeNivelAusente(profundidad);
    return { profundidad, tipo, nombre: paso.nombre, id: paso.id };
  });
}
