import type { LugarDeFiltroDTO, NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";

// SLT-48 (design §8; R43, R17) — EL ÁRBOL DE LA CORRECCIÓN DE UBICACIÓN, en funciones puras.
//
// La ventana pide un lugar por cada nivel del país (de 2 a 10) hasta llegar a una HOJA: un nodo sin
// hijos activos (decisión P2). Los niveles y los lugares salen del catálogo de filtros (SLT-47), no de
// las listas planas de provincias, cantones y distritos (esas se borran en SLT-196).
//
// Sin React a propósito: la ventana y el aviso del importe leen la misma regla de hoja, y una regla
// repetida en dos componentes es una regla que un día diverge.

/** Lo que la ventana necesita del catálogo: los niveles del país y todos sus lugares. */
export interface ArbolDeCorreccion {
  niveles: readonly NivelDeFiltroDTO[];
  lugares: readonly LugarDeFiltroDTO[];
}

/**
 * Los hijos que se pueden ofrecer de un lugar (`padreId` null = el primer nivel).
 *
 * FICHA 374 (R29): solo los disponibles. Corregir una ubicación es un alta encubierta; un nodo
 * retirado no se ofrece. El servidor lo rechaza igual (R30): esto es comodidad, no la puerta.
 */
export function hijosOfrecibles(
  lugares: readonly LugarDeFiltroDTO[],
  padreId: string | null,
): LugarDeFiltroDTO[] {
  return lugares.filter((l) => l.padreId === padreId && l.disponible);
}

/** P2 — un lugar es hoja si no tiene hijos activos. Un id fuera del catálogo no tiene hijos. */
export function esHoja(lugares: readonly LugarDeFiltroDTO[], id: string): boolean {
  return !lugares.some((l) => l.padreId === id && l.disponible);
}

/** Lo elegido en cada nivel, de la raíz hacia abajo, sin huecos. */
export type Seleccion = readonly string[];

/** Elegir `id` en el nivel `indice` (0 = primer nivel) recorta todo lo que colgaba debajo. */
export function elegirEnNivel(seleccion: Seleccion, indice: number, id: string): string[] {
  const base = seleccion.slice(0, indice);
  return id === "" ? base : [...base, id];
}

/** El estado de un selector de nivel. */
export interface EstadoDeNivel {
  nivel: NivelDeFiltroDTO;
  valor: string;
  opciones: LugarDeFiltroDTO[];
  /**
   * `abierto`: se puede elegir. `espera`: falta elegir el nivel de arriba. `tras-la-hoja`: el nivel de
   * arriba ya es una hoja; `primero` marca el inmediato, que dice «Sin <plural>» (los demás, «—»).
   */
  modo: "abierto" | "espera" | "tras-la-hoja";
  primeroTrasLaHoja: boolean;
}

/** El selector de cada nivel del país, encadenado al de arriba por `padreId`. */
export function estadosDeNiveles(arbol: ArbolDeCorreccion, seleccion: Seleccion): EstadoDeNivel[] {
  let hojaEn = -1;
  return arbol.niveles.map((nivel, i) => {
    const padre = i === 0 ? null : (seleccion[i - 1] ?? "");
    const valor = seleccion[i] ?? "";
    if (hojaEn >= 0) {
      return { nivel, valor: "", opciones: [], modo: "tras-la-hoja", primeroTrasLaHoja: i === hojaEn + 1 };
    }
    if (padre === "") {
      return { nivel, valor: "", opciones: [], modo: "espera", primeroTrasLaHoja: false };
    }
    if (valor !== "" && esHoja(arbol.lugares, valor)) hojaEn = i;
    return {
      nivel,
      valor,
      opciones: hijosOfrecibles(arbol.lugares, padre),
      modo: "abierto",
      primeroTrasLaHoja: false,
    };
  });
}

/** El lugar elegido si es una hoja (lo que viaja como `nodoId`); `null` si la ubicación está a medias. */
export function hojaElegida(arbol: ArbolDeCorreccion, seleccion: Seleccion): string | null {
  const ultimo = seleccion.at(-1);
  if (ultimo === undefined) return null;
  return esHoja(arbol.lugares, ultimo) ? ultimo : null;
}

/** El nivel que falta elegir para llegar a una hoja, o `null` si ya se llegó. */
export function nivelQueFalta(arbol: ArbolDeCorreccion, seleccion: Seleccion): NivelDeFiltroDTO | null {
  if (hojaElegida(arbol, seleccion) !== null) return null;
  return arbol.niveles[seleccion.length] ?? null;
}

/**
 * Un lugar tal como lo pinta el aviso del importe: su nombre, su profundidad (1 a P) y si es hoja.
 * `null` = la orden no tiene lugar (solo una orden de SQL a mano).
 */
export type LugarDelAviso = { nombre: string; profundidad: number; hoja: boolean } | null;

/** El último lugar de una ruta (de la raíz al nodo), con su profundidad y si es hoja. */
export function lugarDeRuta(
  lugares: readonly LugarDeFiltroDTO[],
  ruta: readonly { id: string; nombre: string }[],
): LugarDelAviso {
  const ultimo = ruta.at(-1);
  if (ultimo === undefined) return null;
  return { nombre: ultimo.nombre, profundidad: ruta.length, hoja: esHoja(lugares, ultimo.id) };
}

/** La ruta de la selección actual (nombres del catálogo), para pintar el lugar propuesto. */
export function rutaDeSeleccion(
  lugares: readonly LugarDeFiltroDTO[],
  seleccion: Seleccion,
): { id: string; nombre: string }[] {
  return seleccion.map((id) => ({ id, nombre: lugares.find((l) => l.id === id)?.nombre ?? "" }));
}
