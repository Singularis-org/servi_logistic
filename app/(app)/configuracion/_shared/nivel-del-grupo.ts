import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import type { EtiquetaDeNivel, EtiquetasGeograficas } from "@/lib/types/pais";

// SLT-48 (R45, decisión P3) — EL NIVEL DE LOS GRUPOS DE TARIFAS, sacado de los tipos del país.
//
// Por P3 el grupo se busca desde el nodo de la orden si está en el nivel 3 o más hondo: los grupos se
// nombran y se cuentan por el nivel 3 del país («distritos» en un país de 3 niveles, «comunas» en uno de 4,
// «provincias» en uno de 10). Un país de 2 niveles no tiene nivel 3: ninguna orden usa grupo.

/** P3 — la profundidad desde la que una orden usa grupo. No es de un país: es la regla de la decisión. */
export const PROFUNDIDAD_DEL_GRUPO = 3;

/**
 * El nombre del nivel de los grupos. Con los niveles del país (los del `layout`), el tipo de la
 * profundidad 3, o `null` si el país no la tiene (2 niveles). Sin niveles (una pantalla montada suelta,
 * sin proveedor), la etiqueta del nivel 3 de siempre.
 */
export function nivelDelGrupo(
  niveles: readonly NivelDeFiltroDTO[],
  etiquetas: EtiquetasGeograficas,
): EtiquetaDeNivel | null {
  if (niveles.length === 0) return etiquetas.distrito;
  const nivel = niveles.find((n) => n.profundidad === PROFUNDIDAD_DEL_GRUPO);
  return nivel === undefined ? null : { singular: nivel.singular, plural: nivel.plural };
}

/**
 * El nombre de cada nivel por profundidad (1 a P): los del país si llegan; si no, las tres etiquetas de
 * siempre. Lo que el árbol cubierto traiga por encima (sus tipos) lo pisa quien lo use.
 */
export function nombresDeNiveles(
  niveles: readonly NivelDeFiltroDTO[],
  etiquetas: EtiquetasGeograficas,
): Map<number, string> {
  if (niveles.length > 0) return new Map(niveles.map((n) => [n.profundidad, n.singular]));
  return new Map<number, string>([
    [1, etiquetas.provincia.singular],
    [2, etiquetas.canton.singular],
    [3, etiquetas.distrito.singular],
  ]);
}
