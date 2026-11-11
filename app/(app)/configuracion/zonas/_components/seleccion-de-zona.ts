import type { ArbolDeZonasDTO, NodoDeZonasDTO } from "@/lib/types/geografia-nodo";

// SLT-89 (design §8.1, §8.2) — la lógica PURA del selector de N niveles y del modal de guardado de
// zona: sin React, para que el selector y el formulario lean el árbol con las mismas reglas y para
// probarla sin montar nada.

/**
 * Profundidad de un distrito en el catálogo (vocabulario de `requirements.md`: «un distrito es un nodo
 * de profundidad 3»). Los nodos de esa profundidad viajan en `distritoIds`; el resto, en `nodoIds`
 * (design §8.1). Se escribe aquí y no se importa de `lib/repositories/_shared/lugar-orden.ts` porque
 * ese módulo arrastra `@prisma/client` al bundle del navegador.
 */
export const PROFUNDIDAD_DE_DISTRITO = 3;

/** Un nodo del árbol con su cadena de ancestros (de la raíz al padre). */
export interface NodoIndexado {
  nodo: NodoDeZonasDTO;
  ancestros: readonly NodoDeZonasDTO[];
}

/** Índice id → nodo con su cadena. Una pasada por el árbol. */
export function indexarArbol(arbol: ArbolDeZonasDTO): Map<string, NodoIndexado> {
  const indice = new Map<string, NodoIndexado>();
  const recorrer = (nodos: readonly NodoDeZonasDTO[], ancestros: readonly NodoDeZonasDTO[]) => {
    for (const nodo of nodos) {
      indice.set(nodo.id, { nodo, ancestros });
      recorrer(nodo.hijos, [...ancestros, nodo]);
    }
  };
  recorrer(arbol.raices, []);
  return indice;
}

/** Los nodos asignados DIRECTAMENTE a una zona, a cualquier profundidad y retirados incluidos (R27). */
export function nodosAsignadosA(arbol: ArbolDeZonasDTO, zonaId: string): string[] {
  const ids: string[] = [];
  const recorrer = (nodos: readonly NodoDeZonasDTO[]) => {
    for (const nodo of nodos) {
      if (nodo.asignadaA?.id === zonaId) ids.push(nodo.id);
      recorrer(nodo.hijos);
    }
  };
  recorrer(arbol.raices);
  return ids;
}

export interface NodosRepartidos {
  distritoIds: string[];
  nodoIds: string[];
}

/**
 * Reparte una selección entre las dos listas del contrato (design §6): profundidad de distrito a
 * `distritoIds`, el resto a `nodoIds`. Conserva el orden de entrada. Un id que el árbol no conoce va a
 * `nodoIds`: el servidor lo rechaza con su motivo (R4) en vez de que la pantalla lo pierda.
 */
export function repartirPorProfundidad(
  ids: Iterable<string>,
  indice: ReadonlyMap<string, NodoIndexado>,
): NodosRepartidos {
  const distritoIds: string[] = [];
  const nodoIds: string[] = [];
  for (const id of ids) {
    if (indice.get(id)?.nodo.profundidad === PROFUNDIDAD_DE_DISTRITO) distritoIds.push(id);
    else nodoIds.push(id);
  }
  return { distritoIds, nodoIds };
}

/**
 * R25: marcar un nodo quita de la selección sus descendientes marcados (pasan a heredarlo); desmarcar
 * solo lo quita a él. Devuelve un conjunto nuevo.
 */
export function alternarNodo(
  marcados: ReadonlySet<string>,
  id: string,
  indice: ReadonlyMap<string, NodoIndexado>,
): Set<string> {
  const siguiente = new Set(marcados);
  if (siguiente.has(id)) {
    siguiente.delete(id);
    return siguiente;
  }
  for (const otro of marcados) {
    if (indice.get(otro)?.ancestros.some((a) => a.id === id)) siguiente.delete(otro);
  }
  siguiente.add(id);
  return siguiente;
}

/** Cómo queda un nodo con la selección EN CURSO (no con la de la base). */
export type EstadoDeNodo =
  /** Marcado para esta zona. */
  | { tipo: "elegido" }
  /** Asignado a otra zona de la empresa: no se puede marcar (SLT-75 R15, R26). */
  | { tipo: "otra_zona"; zona: string; excepcionDe: string | null }
  /** Lo cubre esta zona por un ancestro marcado: no se puede marcar (R26). */
  | { tipo: "hereda_esta"; zona: string; nodo: string }
  /** Lo cubre otra zona por un ancestro: se puede marcar y queda como excepción (R26). */
  | { tipo: "hereda_otra"; zona: string; nodo: string }
  | { tipo: "libre" };

/** La zona que cubre a un nodo por herencia, mientras se baja por el árbol. */
export interface Herencia {
  zona: string;
  nodo: string;
  esEsta: boolean;
}

/**
 * La asignación propia de un nodo con la selección en curso. Una asignación de la base a la zona que se
 * edita NO cuenta: la manda la selección (desmarcar la quita). Al crear (`zonaEnEdicionId` ausente),
 * toda asignación de la base es de otra zona.
 */
function asignacionPropia(
  nodo: NodoDeZonasDTO,
  marcados: ReadonlySet<string>,
  zonaEnEdicionId: string | undefined,
): { zona: string; esEsta: boolean } | null {
  if (marcados.has(nodo.id)) return { zona: "", esEsta: true };
  if (nodo.asignadaA !== null && nodo.asignadaA.id !== zonaEnEdicionId) {
    return { zona: nodo.asignadaA.nombre, esEsta: false };
  }
  return null;
}

/**
 * El estado de un nodo y la herencia que pasa a sus hijos. `nombreZona` es el nombre que se pinta para
 * la zona que se edita (el del campo del formulario).
 */
export function estadoDeNodo(
  nodo: NodoDeZonasDTO,
  herencia: Herencia | null,
  marcados: ReadonlySet<string>,
  zonaEnEdicionId: string | undefined,
  nombreZona: string,
): { estado: EstadoDeNodo; paraHijos: Herencia | null } {
  const propia = asignacionPropia(nodo, marcados, zonaEnEdicionId);
  if (propia?.esEsta) {
    return { estado: { tipo: "elegido" }, paraHijos: { zona: nombreZona, nodo: nodo.nombre, esEsta: true } };
  }
  if (propia !== null) {
    return {
      estado: { tipo: "otra_zona", zona: propia.zona, excepcionDe: herencia?.esEsta ? herencia.nodo : null },
      paraHijos: { zona: propia.zona, nodo: nodo.nombre, esEsta: false },
    };
  }
  if (herencia === null) return { estado: { tipo: "libre" }, paraHijos: null };
  return {
    estado: herencia.esEsta
      ? { tipo: "hereda_esta", zona: herencia.zona, nodo: herencia.nodo }
      : { tipo: "hereda_otra", zona: herencia.zona, nodo: herencia.nodo },
    paraHijos: herencia,
  };
}

/**
 * Cuántos distritos cuelgan de un nodo (a cualquier profundidad por debajo). Con `zonaEnEdicionId`, solo
 * los que heredaría la zona: una rama asignada a OTRA zona es una excepción y no cuenta (R11). Sin él
 * (`undefined` al crear) toda asignación de la base es de otra zona.
 */
export function distritosBajo(
  nodo: NodoDeZonasDTO,
  excepciones?: { zonaEnEdicionId: string | undefined },
): number {
  let n = 0;
  for (const hijo of nodo.hijos) {
    if (excepciones && hijo.asignadaA !== null && hijo.asignadaA.id !== excepciones.zonaEnEdicionId) continue;
    n += hijo.profundidad === PROFUNDIDAD_DE_DISTRITO ? 1 : distritosBajo(hijo, excepciones);
  }
  return n;
}

/** Lo que entra y lo que sale entre el «antes» y la selección pedida (orden de la selección / del antes). */
export function diferencia(
  antes: readonly string[],
  despues: readonly string[],
): { entran: string[]; salen: string[] } {
  const a = new Set(antes);
  const d = new Set(despues);
  return {
    entran: despues.filter((id) => !a.has(id)),
    salen: antes.filter((id) => !d.has(id)),
  };
}
