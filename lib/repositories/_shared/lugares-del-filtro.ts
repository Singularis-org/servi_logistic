import { Prisma } from "@prisma/client";

import type { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { sqlLugarEn } from "@/lib/repositories/_shared/lugar-orden";
import { nodo, nodosBajo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";

// SLT-71 (design §3.2) — EL FILTRO DE LUGAR, RESUELTO AL LUGAR DE LA ORDEN. SLT-47 (design §3.1) lo
// generaliza: de tres facetas con nivel (`provincia_id`, `canton_id`, `distrito_id`) a UNA, `lugar_id`,
// con los ids del lugar elegido en cualquier nivel del pais (2 a 10).
//
// «El lugar de la orden es uno de los ids pedidos o un nodo bajo ellos». Los ids los calcula el dominio
// de SLT-44 sobre el catalogo del pais de la empresa (`nodosBajo`), sin CTE recursiva (R15), y viajan a
// la consulta como un unico parametro de tipo lista (`sqlLugarEn`, R11).
//
// Las dos funciones de en medio son PURAS: los constructores de condiciones de cada lectura siguen
// siendo sincronos y se prueban sin base. La carga asincrona del catalogo vive en `lugaresDelFiltro`,
// que la llama el metodo del repositorio, y SOLO si el filtro trae `lugar_id` (R5 de SLT-71).
//
// Ya no mira la profundidad (`PROFUNDIDAD_DEL_NIVEL`): el id es el lugar elegido, no una faceta con
// nivel. La constante se queda en `lugar-orden.ts` hasta SLT-48.

/** La entrada: los ids del lugar elegido. Ausente o vacia = sin filtro de lugar. */
export interface FiltroDeLugar {
  readonly lugar_id?: readonly string[];
}

/**
 * Los ids del lugar ya resueltos: los pedidos que estan en el catalogo, mas los nodos bajo ellos, sin
 * duplicados y ordenados. Sin `lugar`, no hay filtro; `lugar: []` cuenta cero ordenes (R12), nunca
 * «sin filtro».
 */
export interface LugaresDelFiltro {
  readonly lugar?: readonly string[];
}

/** Sin filtro de lugar: las condiciones no aportan nada. */
export const SIN_LUGAR: LugaresDelFiltro = {};

/** `undefined` o `[]` es «sin filtro de lugar», igual que hacia `enLista` con la columna. */
export function tieneLugar(filtro: FiltroDeLugar): boolean {
  return filtro.lugar_id !== undefined && filtro.lugar_id.length > 0;
}

/**
 * Puro (R11, R12). Los ids que estan en el catalogo, de cualquier profundidad, mas todos los nodos
 * bajo ellos; sin duplicados y ordenados por id, para que el parametro sea estable. Un id que no esta
 * en el catalogo (de otro pais, inexistente) no aporta; si no queda ninguno, `[]`.
 */
export function resolverLugar(cat: CatalogoGeografico, ids: readonly string[]): readonly string[] {
  const resueltos = new Set<string>();
  for (const id of ids) {
    const n = nodo(cat, id);
    if (n === null || resueltos.has(n.id)) continue;
    resueltos.add(n.id);
    for (const bajo of nodosBajo(cat, n.id)) resueltos.add(bajo.id);
  }
  return [...resueltos].sort();
}

/**
 * Puro. A lo sumo una condicion:
 *  - con ids → `sqlLugarEn(ids)`;
 *  - con `[]` → `FALSE` (hoy, un `IN` con ids que no casan da cero filas; `FALSE` da lo mismo sin
 *    mandar un array vacio, R12);
 *  - ausente → nada.
 */
export function condicionesDeLugar(lugares: LugaresDelFiltro): Prisma.Sql[] {
  const ids = lugares.lugar;
  if (ids === undefined) return [];
  return [ids.length === 0 ? Prisma.sql`FALSE` : sqlLugarEn(ids)];
}

/**
 * Los lugares del filtro, cargando el catalogo de la empresa SOLO si trae `lugar_id`. El catalogo lo da
 * el repositorio del llamador, uno por instancia (R35); en plataforma `deLaEmpresa` lanza
 * `EmpresaNoResuelta` (R37).
 */
export async function lugaresDelFiltro(
  catalogo: () => Pick<CatalogoGeograficoRepository, "deLaEmpresa">,
  filtro: FiltroDeLugar,
): Promise<LugaresDelFiltro> {
  if (!tieneLugar(filtro)) return SIN_LUGAR;
  const { catalogo: cat } = await catalogo().deLaEmpresa();
  return { lugar: resolverLugar(cat, filtro.lugar_id ?? []) };
}
