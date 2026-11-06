import { Prisma } from "@prisma/client";

import type { FiltroConteoEntregas } from "@/lib/analytics/entregas-conteo";
import type { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { PROFUNDIDAD_DEL_NIVEL, sqlLugarEn } from "@/lib/repositories/_shared/lugar-orden";
import { nodo, nodosBajo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";

// SLT-71 (design §3.2; R1, R3, R5, R7) — LAS FACETAS GEOGRAFICAS DE ANALITICA, RESUELTAS AL LUGAR DE
// LA ORDEN.
//
// Una faceta (`provincia_id`, `canton_id` o `distrito_id` del filtro) deja de ser «la columna del
// nivel IN (...)» y pasa a ser «el lugar de la orden es uno de los ids pedidos o un nodo bajo ellos».
// Los ids los calcula el dominio de SLT-44 sobre el catalogo del pais de la empresa (`nodosBajo`),
// sin CTE recursiva (R15).
//
// Las dos funciones de en medio son PURAS: los constructores de condiciones de cada lectura siguen
// siendo sincronos y se prueban sin base. La carga asincrona del catalogo vive en `lugaresDelFiltro`,
// que la llama el metodo del repositorio, y SOLO si el filtro trae alguna faceta geografica (R5).

/** Las tres facetas geograficas del filtro de analitica. La entrada no cambia (R6). */
export type FacetasGeograficas = Pick<FiltroConteoEntregas, "provincia_id" | "canton_id" | "distrito_id">;

/**
 * Por faceta pedida, los ids de su lugar: los validos de su nivel mas los nodos bajo ellos, sin
 * duplicados y ordenados. Una faceta ausente no tiene clave; una pedida sin ningun id valido es `[]`
 * y cuenta cero ordenes (R3), nunca «sin filtro».
 */
export interface LugaresDelFiltro {
  readonly provincia?: readonly string[];
  readonly canton?: readonly string[];
  readonly distrito?: readonly string[];
}

/** Sin facetas geograficas: las condiciones de lugar no aportan nada (R5). */
export const SIN_FACETAS_GEOGRAFICAS: LugaresDelFiltro = {};

/** Las facetas en el orden en que van en el `where`: provincia, canton, distrito (el de hoy, R2). */
const FACETAS: readonly { nivel: NivelGeografico; clave: keyof FacetasGeograficas }[] = [
  { nivel: "provincia", clave: "provincia_id" },
  { nivel: "canton", clave: "canton_id" },
  { nivel: "distrito", clave: "distrito_id" },
];

/** `undefined` o `[]` es «faceta no pedida», igual que hacia `enLista` con la columna. */
function pedida(ids: readonly string[] | undefined): ids is readonly string[] {
  return ids !== undefined && ids.length > 0;
}

/** Si el filtro trae alguna faceta geografica: solo entonces se carga el catalogo (R5). */
export function tieneFacetasGeograficas(filtro: FacetasGeograficas): boolean {
  return FACETAS.some((f) => pedida(filtro[f.clave]));
}

/**
 * Puro. Por cada faceta pedida:
 *  1. se queda con los ids que estan en el catalogo y cuya profundidad es la del nivel (R3);
 *  2. a cada valido le suma los nodos bajo el; une sin duplicados y ordena por id, para que el
 *     parametro sea estable;
 *  3. si no queda ninguno, la faceta queda como `[]`. Nunca se omite (R3).
 */
export function resolverLugaresDelFiltro(cat: CatalogoGeografico, filtro: FacetasGeograficas): LugaresDelFiltro {
  const lugares: { -readonly [K in keyof LugaresDelFiltro]: string[] } = {};
  for (const { nivel, clave } of FACETAS) {
    const ids = filtro[clave];
    if (!pedida(ids)) continue;
    const profundidad = PROFUNDIDAD_DEL_NIVEL[nivel];
    const resueltos = new Set<string>();
    for (const id of ids) {
      const n = nodo(cat, id);
      if (n === null || n.profundidad !== profundidad) continue;
      resueltos.add(n.id);
      for (const bajo of nodosBajo(cat, n.id)) resueltos.add(bajo.id);
    }
    lugares[nivel] = [...resueltos].sort();
  }
  return lugares;
}

/**
 * Puro. Una condicion por faceta pedida, en el orden provincia, canton, distrito:
 *  - con ids → `sqlLugarEn(ids)`;
 *  - con `[]` → `FALSE` (hoy, un `IN` con ids que no casan da cero filas; `FALSE` da lo mismo sin
 *    mandar un array vacio);
 *  - ausente → nada.
 */
export function condicionesDeLugar(lugares: LugaresDelFiltro): Prisma.Sql[] {
  const condiciones: Prisma.Sql[] = [];
  for (const { nivel } of FACETAS) {
    const ids = lugares[nivel];
    if (ids === undefined) continue;
    condiciones.push(ids.length === 0 ? Prisma.sql`FALSE` : sqlLugarEn(ids));
  }
  return condiciones;
}

/**
 * Los lugares del filtro, cargando el catalogo de la empresa SOLO si hay alguna faceta geografica
 * (R5). El catalogo lo da el repositorio del llamador, uno por instancia (R13, R16); en plataforma
 * `deLaEmpresa` lanza `EmpresaNoResuelta` (R13).
 */
export async function lugaresDelFiltro(
  catalogo: () => Pick<CatalogoGeograficoRepository, "deLaEmpresa">,
  filtro: FacetasGeograficas,
): Promise<LugaresDelFiltro> {
  if (!tieneFacetasGeograficas(filtro)) return SIN_FACETAS_GEOGRAFICAS;
  const { catalogo: cat } = await catalogo().deLaEmpresa();
  return resolverLugaresDelFiltro(cat, filtro);
}
