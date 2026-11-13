import { cabeceraDeNivel, cabeceraNormalizada } from "@/lib/utils/plantilla-geo";

// SLT-125 (design §3; R1–R3, R7–R9, R11, R13, R14, R32) — LA PRESENTACION DE UN LUGAR A N NIVELES.
//
// Hoy hay nueve copias de «zona, provincia, canton y distrito, filtrados y unidos» (descargas, etiqueta,
// `/paquete`, pantallas de detalle). Reescribirlas para N niveles una por una daria nueve versiones que
// divergen a la primera correccion. Por eso hay un solo nucleo: recibe la ruta (nombres del nivel 1 al
// lugar) y los niveles del pais, y cada superficie lo llama con SU separador y SU orden de hoy. Lo unico
// que cambia frente a hoy es cuantos nombres hay y de donde salen (la ruta del catalogo).
//
// ⚠️ PURO A PROPOSITO: sin Prisma, sin React y sin I/O. Lo importan el servidor y el cliente.
//
// Ningun texto de nivel va escrito aqui (R42): los rotulos son el `singular` de los tipos del pais que
// llegan en `niveles`. Las claves `provincia`, `canton` y `distrito` NO son texto: son nombres internos
// de columna (R3, R37) que las preferencias guardadas del selector de columnas ya conocen.

/** Un nivel del pais de la empresa: el k de `nivel_<k>` y su tipo. Es `NivelDeFiltroDTO` sin el plural. */
export interface NivelDelPais {
  profundidad: number;
  singular: string;
}

/**
 * La ruta de un lugar, del nivel 1 al lugar. `id` es `null` cuando no se conoce: la que se reconstruye
 * de las tres columnas de nombre de un cierre viejo (R25) no tiene ids, y nunca se inventan.
 */
export type Ruta = readonly { id: string | null; nombre: string }[];

export interface ColumnaDeNivel {
  clave: string;
  encabezado: string;
}

// Las claves internas de los niveles 1 a 3 son las de hoy (R3): asi una preferencia de columnas guardada
// antes de esta ficha sigue aplicandose. Desde el nivel 4 la clave es la de reserva.
const CLAVES_DE_HOY: readonly string[] = ["provincia", "canton", "distrito"];

// Hasta SLT-48 el lugar de una orden es `lugarDeLaOrden` (su distrito o su canton): ninguna ruta de orden
// pasa del nivel 3, aunque el pais tenga mas (decision P1). Es lo que fija los «dos mas hondos» de una
// orden en un pais de 4 niveles en los niveles 2·3 y no en 3·4.
const PROFUNDIDAD_MAXIMA_DE_UNA_ORDEN = 3;

function ordenados(niveles: readonly NivelDelPais[]): NivelDelPais[] {
  return [...niveles].sort((a, b) => a.profundidad - b.profundidad);
}

/** La clave interna de la columna del nivel k (R3). */
export function claveDeColumnaDeNivel(k: number): string {
  return CLAVES_DE_HOY[k - 1] ?? cabeceraDeNivel(k);
}

/**
 * Cabeceras y claves de las columnas de nivel, del nivel 1 a P (R1–R3).
 *
 * El encabezado es el `singular` del tipo tal cual, como hoy las etiquetas. Pasa a `nivel_<k>` si choca
 * (R2): si, normalizado como en la plantilla de carga (`cabeceraNormalizada`), coincide con otra
 * cabecera del mismo archivo, con el tipo de otro nivel o con la reserva `nivel_<m>` de otro nivel, o si
 * queda vacio. Comparar normalizado es lo que hace que «Zona» y «zona» o «Cantón» y «Canton» choquen.
 */
export function columnasDeNivel(
  niveles: readonly NivelDelPais[],
  otrasCabeceras: readonly string[],
): ColumnaDeNivel[] {
  const lista = ordenados(niveles);
  const otras = new Set(otrasCabeceras.map(cabeceraNormalizada));
  const veces = new Map<string, number>();
  for (const n of lista) {
    const c = cabeceraNormalizada(n.singular);
    veces.set(c, (veces.get(c) ?? 0) + 1);
  }
  return lista.map((n) => {
    const k = n.profundidad;
    const c = cabeceraNormalizada(n.singular);
    const reservaDeOtro = /^nivel_\d+$/.test(c) && c !== cabeceraDeNivel(k);
    const choca = c === "" || otras.has(c) || (veces.get(c) ?? 0) > 1 || reservaDeOtro;
    return { clave: claveDeColumnaDeNivel(k), encabezado: choca ? cabeceraDeNivel(k) : n.singular };
  });
}

/**
 * La celda de cada columna de nivel (R1): el nombre del paso de la ruta en ese nivel, o `null` (celda
 * vacia) si la ruta no llega o el nombre esta vacio. `null` y no `""`: es lo que las descargas de hoy
 * ponen en una columna sin dato.
 */
export function celdasDeNivel(ruta: Ruta, niveles: readonly NivelDelPais[]): Record<string, string | null> {
  const celdas: Record<string, string | null> = {};
  for (const n of ordenados(niveles)) {
    const nombre = ruta[n.profundidad - 1]?.nombre;
    celdas[claveDeColumnaDeNivel(n.profundidad)] = nombre ? nombre : null;
  }
  return celdas;
}

/**
 * La zona y todos los nombres de la ruta, del nivel 1 al lugar, unidos por `separador` y sin tramos
 * vacios (R7–R9). `null` si no queda ningun tramo. El filtro es el `Boolean` de las copias de hoy, para
 * que en Costa Rica la linea salga byte a byte igual (R10).
 */
export function lineaDeUbicacion(zona: string | null, ruta: Ruta, separador: string): string | null {
  const partes = [zona, ...ruta.map((p) => p.nombre)].filter((parte): parte is string => Boolean(parte));
  return partes.length === 0 ? null : partes.join(separador);
}

/** D: el nivel mas hondo que puede tener una orden en un pais de P niveles (hasta SLT-48). */
function nivelMasHondoDeUnaOrden(P: number): number {
  return Math.min(P, PROFUNDIDAD_MAXIMA_DE_UNA_ORDEN);
}

/**
 * Los dos niveles mas hondos de la ruta DE LA ORDEN (R11; decision del 2026-11-12): los pasos de los
 * niveles D−1 y D, con D = min(P, 3). Cada uno es `null` si la ruta no llega o su nombre esta vacio.
 *
 * P7 (opcion a, «como hoy»): se toman por NIVEL y no como «los dos ultimos pasos». Asi una orden de Costa
 * Rica sin distrito da `{ arriba: canton, abajo: null }` y las tarjetas siguen mostrando solo el canton,
 * en vez de pasar a «provincia · canton».
 */
export function dosMasHondos(ruta: Ruta, P: number): { arriba: string | null; abajo: string | null } {
  const D = nivelMasHondoDeUnaOrden(P);
  const nombreEn = (k: number): string | null => (k >= 1 ? ruta[k - 1]?.nombre || null : null);
  return { arriba: nombreEn(D - 1), abajo: nombreEn(D) };
}

/**
 * Los tipos de los niveles D−1 y D (R13), para el titulo del PDF de transito. Las mayusculas y el
 * separador los pone el PDF. Un nivel que el pais no tiene da `""`: el titulo no inventa un tipo.
 */
export function tiposDeDosMasHondos(niveles: readonly NivelDelPais[]): [string, string] {
  const D = nivelMasHondoDeUnaOrden(niveles.length);
  const singularDe = (k: number): string => niveles.find((n) => n.profundidad === k)?.singular ?? "";
  return [singularDe(D - 1), singularDe(D)];
}

/**
 * Los nombres de la ruta del mas hondo al nivel 1, sin vacios (R14, R32): el orden de una direccion
 * postal («Carmen, San José, San José»), que es el de hoy en el destino de navegacion y en la consulta
 * de geocodificacion.
 */
export function rutaInvertida(ruta: Ruta): string[] {
  return ruta
    .map((p) => p.nombre)
    .filter(Boolean)
    .reverse();
}
