import type { FacetasGeograficas, LugaresDelFiltro } from "@/lib/repositories/_shared/lugares-del-filtro";
import { resolverLugaresDelFiltro } from "@/lib/repositories/_shared/lugares-del-filtro";
import { crearCatalogo, type NodoDelCatalogo, type TipoDeNivel } from "@/lib/services/geografia-dominio";

// SLT-71 (design §11.1) — el catalogo de los tests unitarios de analitica que traen faceta
// geografica. NO es un archivo de test.
//
// Nodos `p1` → `c1` → `d1` (los ids que esos tests ya usaban en el filtro). Dos usos:
//  - `lugaresDe(filtro)`: los `lugares` resueltos que los constructores de condiciones reciben
//    ahora como segundo parametro (es la ENTRADA del test, no su asercion);
//  - `delegadosDelCatalogo()`: los delegados que `CatalogoGeograficoRepository.deLaEmpresa` lee,
//    para los dobles de cliente de los repositorios cuando el caso trae faceta (regla de SLT-44 §10).

const TIPOS: TipoDeNivel[] = [1, 2, 3].map((n) => ({
  id: `t${n}`,
  clave: `nivel_${n}`,
  nombreSingular: `Nivel ${n}`,
  nombrePlural: `Niveles ${n}`,
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
}));

function n(id: string, padreId: string | null, profundidad: number): NodoDelCatalogo {
  return {
    id,
    padreId,
    profundidad,
    tipoId: `t${profundidad}`,
    nombre: `Nombre ${id}`,
    nombreNormalizado: `nombre ${id}`,
    codigoOficial: null,
    activo: true,
  };
}

export const NODOS_FACETAS: readonly NodoDelCatalogo[] = [n("p1", null, 1), n("c1", "p1", 2), n("d1", "c1", 3)];

export const CATALOGO_FACETAS = crearCatalogo("XA", TIPOS, NODOS_FACETAS);

/** Los lugares de las facetas geograficas del filtro, resueltos sobre `CATALOGO_FACETAS`. */
export function lugaresDe(filtro: FacetasGeograficas): LugaresDelFiltro {
  return resolverLugaresDelFiltro(CATALOGO_FACETAS, filtro);
}

/** Los delegados que lee la carga del catalogo de la empresa, con `CATALOGO_FACETAS`. */
export function delegadosDelCatalogo() {
  return {
    zonaDistrito: { findMany: async () => [] },
    organizacion: { findFirst: async () => ({ paisId: "XA" }) },
    tipoNivelGeografico: { findMany: async () => TIPOS },
    nodoGeografico: { findMany: async () => [...NODOS_FACETAS] },
    distritoZonaEspecial: { findMany: async () => [] },
  };
}
