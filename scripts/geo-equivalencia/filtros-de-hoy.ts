import { PROFUNDIDAD_DEL_NIVEL } from "@/lib/repositories/_shared/lugar-orden";
import { ancestros, nodo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";

import type { FacetasDeHoy } from "./analitica-de-hoy";

// SLT-47 (design §4.2, §7) — DE LAS FACETAS DE HOY AL LUGAR ELEGIDO.
//
// Hoy un filtro de lugar son hasta tres facetas por nivel (`provincia_id`, `canton_id`, `distrito_id`)
// cruzadas en AND. Desde SLT-47 es un solo `lugar_id`. Esta traduccion es la del cliente (un enlace
// viejo renombrado a `nivel_<k>` y validado por la barra): de cada nivel solo sobrevive lo que la lista
// de ese nivel ofrece (un id de esa profundidad), y de los niveles hondos solo lo que cuelga de lo
// elegido arriba (la poda de `dependsOn`). El lugar es lo que queda en el nivel mas hondo con eleccion.
//
// Si una faceta pedida no deja ningun id (un canton pedido como distrito, una combinacion
// incoherente), hoy esa faceta daba cero ordenes. El servidor nuevo da cero con un id que no esta en el
// catalogo (R12): se usa `LUGAR_INEXISTENTE`.
//
// Lo usan los scripts de equivalencia y sus tests. Vive en `scripts/` porque nombra las claves viejas.
// Se borra con SLT-48.

/** Un id que no esta en ningun catalogo: el lugar de un filtro que hoy daba cero ordenes. */
export const LUGAR_INEXISTENTE = "slt47-lugar-inexistente";

const NIVELES: readonly { nivel: NivelGeografico; clave: keyof FacetasDeHoy }[] = [
  { nivel: "provincia", clave: "provincia_id" },
  { nivel: "canton", clave: "canton_id" },
  { nivel: "distrito", clave: "distrito_id" },
];

/** Si el filtro trae alguna faceta geografica de hoy. */
export function tieneFacetasDeHoy(f: FacetasDeHoy): boolean {
  return NIVELES.some(({ clave }) => (f[clave]?.length ?? 0) > 0);
}

/**
 * Las facetas de hoy como `lugar_id`. `undefined` si no hay ninguna faceta geografica (sin filtro de
 * lugar). Si queda alguna faceta pedida sin ids validos, `[LUGAR_INEXISTENTE]`: cero ordenes, como hoy.
 */
export function lugarDeFacetas(cat: CatalogoGeografico, f: FacetasDeHoy): string[] | undefined {
  if (!tieneFacetasDeHoy(f)) return undefined;
  let arriba: Set<string> | null = null;
  let lugar: string[] = [];
  for (const { nivel, clave } of NIVELES) {
    const pedidos = f[clave];
    if (pedidos === undefined || pedidos.length === 0) continue;
    const profundidad = PROFUNDIDAD_DEL_NIVEL[nivel];
    const validos = [...new Set(pedidos)].filter((id) => {
      const n = nodo(cat, id);
      if (n === null || n.profundidad !== profundidad) return false;
      if (arriba === null) return true;
      const elegidosArriba = arriba;
      return ancestros(cat, id).some((a) => elegidosArriba.has(a.id));
    });
    if (validos.length === 0) return [LUGAR_INEXISTENTE];
    arriba = new Set(validos);
    lugar = validos;
  }
  return [...lugar].sort();
}

/** El `raw` de una consulta con las facetas de hoy pasado a `lugar_id` (el resto de claves, igual). */
export function rawConLugar<R extends FacetasDeHoy>(
  cat: CatalogoGeografico,
  raw: R,
): Omit<R, keyof FacetasDeHoy> & { lugar_id?: string[] } {
  const { provincia_id: _p, canton_id: _c, distrito_id: _d, ...resto } = raw;
  const lugar = lugarDeFacetas(cat, raw);
  return lugar === undefined ? resto : { ...resto, lugar_id: lugar };
}

/** Solo las facetas de hoy de un `raw`. */
export function facetasDe(raw: FacetasDeHoy): FacetasDeHoy {
  const { provincia_id, canton_id, distrito_id } = raw;
  return {
    ...(provincia_id ? { provincia_id } : {}),
    ...(canton_id ? { canton_id } : {}),
    ...(distrito_id ? { distrito_id } : {}),
  };
}
