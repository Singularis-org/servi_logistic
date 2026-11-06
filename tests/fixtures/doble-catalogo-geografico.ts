import { vi } from "vitest";

import {
  crearCatalogo,
  type CatalogoGeografico,
  type NodoDelCatalogo,
  type TipoDeNivel,
} from "@/lib/services/geografia-dominio";
import { normalizeName } from "@/lib/utils/normalize";

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

// SLT-45 (T2.1; design §2.2) — el mismo catalogo, YA EN MEMORIA, para el motor de N niveles
// (`lib/services/geo-ubicacion.ts`), que es puro y no ve Prisma. La profundidad sale de la cadena
// de padres y hay un tipo por profundidad (`t<n>`, clave `nivel_<n>`, «Nivel <n>»). El nombre
// normalizado se calcula con `normalizeName`, que es lo que la base guarda en `nombre_normalizado`.

export interface NodoEnMemoria {
  id: string;
  padreId?: string | null;
  nombre: string;
  codigoOficial?: string | null;
  activo?: boolean;
  /** Para simular dos hermanos que la base no deja crear (nombre normalizado repetido). */
  nombreNormalizado?: string;
}

export function catalogoEnMemoria(nodos: readonly NodoEnMemoria[], paisId = PAIS_DEL_DOBLE): CatalogoGeografico {
  const padreDe = new Map(nodos.map((n) => [n.id, n.padreId ?? null]));
  const profundidad = (id: string): number => {
    const padre = padreDe.get(id) ?? null;
    return padre === null ? 1 : 1 + profundidad(padre);
  };
  const enMemoria: NodoDelCatalogo[] = nodos.map((n) => ({
    id: n.id,
    padreId: n.padreId ?? null,
    profundidad: profundidad(n.id),
    tipoId: `t${profundidad(n.id)}`,
    nombre: n.nombre,
    nombreNormalizado: n.nombreNormalizado ?? normalizeName(n.nombre),
    codigoOficial: n.codigoOficial ?? null,
    activo: n.activo ?? true,
  }));
  const maxima = Math.max(0, ...enMemoria.map((n) => n.profundidad));
  const tipos: TipoDeNivel[] = Array.from({ length: maxima }, (_, i) => ({
    id: `t${i + 1}`,
    clave: `nivel_${i + 1}`,
    nombreSingular: `Nivel ${i + 1}`,
    nombrePlural: `Niveles ${i + 1}`,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  }));
  return crearCatalogo(paisId, tipos, enMemoria);
}
