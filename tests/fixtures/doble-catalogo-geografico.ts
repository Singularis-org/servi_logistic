import { vi } from "vitest";

// SLT-65 (design §14.1) — los delegados del catalogo geografico (SLT-44) para un doble de Prisma.
//
// Desde SLT-65 la marca de zona especial de una orden no viaja anidada en `distrito.zonasEspeciales`:
// la calcula `OrdenRepository` con `CatalogoGeograficoRepository.deLaEmpresa()`, que lee estos cinco
// modelos. Un doble que antes simulaba la marca en la fila ahora la simula aqui: el distrito de la
// fila es un nodo del catalogo, y si estaba marcado, tiene su fila en `distritoZonaEspecial`. Es un
// cambio de ENTRADA; las salidas esperadas de cada test no cambian.

/** Pais del doble. No es un pais real: el doble no mira la geografia de ningun pais. */
const PAIS_DEL_DOBLE = "XX";

export interface NodoDelDoble {
  id: string;
  nombre?: string;
}

export interface OpcionesDelCatalogo {
  /** Nodos del catalogo (distritos o cantones de las filas). Los marcados se anaden solos. */
  nodos?: readonly (string | NodoDelDoble)[];
  /** Ids de los distritos con marca de zona especial de la empresa. */
  marcas?: readonly string[];
}

function nodoDelDoble(n: NodoDelDoble) {
  const nombre = n.nombre ?? n.id;
  return {
    id: n.id,
    padreId: null,
    profundidad: 3,
    tipoId: "tipo-del-doble",
    nombre,
    nombreNormalizado: nombre.toLowerCase(),
    codigoOficial: null,
    activo: true,
  };
}

export function delegadosDelCatalogo(o: OpcionesDelCatalogo = {}) {
  const porId = new Map<string, NodoDelDoble>();
  for (const n of o.nodos ?? []) {
    const nodo = typeof n === "string" ? { id: n } : n;
    porId.set(nodo.id, nodo);
  }
  for (const id of o.marcas ?? []) if (!porId.has(id)) porId.set(id, { id });
  return {
    organizacion: { findFirst: vi.fn().mockResolvedValue({ paisId: PAIS_DEL_DOBLE }) },
    tipoNivelGeografico: { findMany: vi.fn().mockResolvedValue([]) },
    nodoGeografico: { findMany: vi.fn().mockResolvedValue([...porId.values()].map(nodoDelDoble)) },
    zonaDistrito: { findMany: vi.fn().mockResolvedValue([]) },
    distritoZonaEspecial: {
      findMany: vi.fn().mockResolvedValue((o.marcas ?? []).map((distritoId) => ({ distritoId }))),
    },
  };
}
