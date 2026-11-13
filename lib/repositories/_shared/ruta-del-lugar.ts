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

/** Los pasos de los niveles 1, 2 y 3 de una ruta; `null` donde la ruta no llega. */
export interface TresPrimerosNiveles {
  provincia: PasoDeRuta | null;
  canton: PasoDeRuta | null;
  distrito: PasoDeRuta | null;
}

/**
 * SLT-125 (design §4.2; R16, R17, R18, R37) — los campos de nombre de hoy (`provincia`, `canton`,
 * `distrito`) salen de la ruta del catalogo y no de las relaciones de Prisma a las tablas viejas.
 *
 * Los DTO conservan su forma (R37): el nivel k de la ruta va al campo de hoy del nivel k. Con la cadena
 * coherente son los mismos nombres que daban las tablas viejas (R17); una orden sin distrito tiene una
 * ruta de dos pasos y su distrito sale `null`, como hoy. Un lugar fuera del catalogo da `[]` y los tres
 * salen `null`: la superficie no falla (R18).
 */
export function tresPrimerosNiveles(ruta: readonly PasoDeRuta[]): TresPrimerosNiveles {
  return { provincia: ruta[0] ?? null, canton: ruta[1] ?? null, distrito: ruta[2] ?? null };
}

/**
 * SLT-125 (R18, R37) — los tres nombres de hoy de una ruta, con la forma de los DTO que los llevan:
 * provincia y canton son `string` y salen `""` (vacio) si la ruta no llega; el distrito es nullable,
 * como hoy, y sale `null`. Cambiar el tipo de los dos primeros a nullable cambiaria la forma de los DTO
 * y de sus lectores (R37), y R18 pide nombres vacios, no un fallo.
 */
export function nombresDeLaRuta(ruta: readonly PasoDeRuta[]): {
  provinciaNombre: string;
  cantonNombre: string;
  distritoNombre: string | null;
} {
  const { provincia, canton, distrito } = tresPrimerosNiveles(ruta);
  return {
    provinciaNombre: provincia?.nombre ?? "",
    cantonNombre: canton?.nombre ?? "",
    distritoNombre: distrito?.nombre ?? null,
  };
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
