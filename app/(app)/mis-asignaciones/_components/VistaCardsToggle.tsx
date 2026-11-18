"use client";

import { LayoutGrid, Rows3 } from "lucide-react";

import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { cn } from "@/lib/utils";

// Rama ux (pedido humano): conmutador de la VISTA de las cards de "En reparto / por
// gestionar". Dos presentaciones de los MISMOS datos, sin filtrar ni reordenar nada:
//   - "mosaico": grilla de tarjetas compactas (`PosOrderCardMosaico`), para barrer muchas.
//   - "detalle": una fila por orden con la acción de navegar (`PosOrderCardDetalle`).
// Es estado de UI puro (no toca datos ni ruta), así que vive en el módulo, no en la URL.
//
// 2026-08-16 (pedido humano) — el CONTROL se mudó a `components/shared/SegmentedToggle`, sin
// tocar su DOM ni su nombre accesible: la pantalla de cierres pidió «tabs con el que se usa en
// órdenes del mensajero», y compartir el componente es lo que impide que los dos se despeguen
// al primer retoque. Este archivo se queda con lo que es SUYO —qué dos vistas existen y cómo se
// llaman—, que es justamente lo que el control compartido no debe saber.

export type VistaCards = "mosaico" | "detalle";

export interface VistaCardsToggleProps {
  vista: VistaCards;
  onVistaChange: (vista: VistaCards) => void;
  /** Clases extra del grupo, para que cada pantalla lo coloque en su fila (SLT-200: Reparto). */
  className?: string;
}

/**
 * SLT-156 (R493): el conmutador mide 44 px de alto en MÓVIL (< 768 px). Se aplica a los botones hijos
 * del grupo desde aquí, sin tocar el control compartido; en escritorio (y en `/novedades`, que también
 * lo monta) sigue con su alto de siempre.
 */
export const VISTA_TOGGLE_TACTIL = "max-md:[&>button]:h-11 max-md:[&>button]:px-4";

/**
 * SLT-200: cuando el conmutador va DENTRO de la barra de `BuscadorFiltros` (`trasFiltros`: Reparto,
 * Recoger, Recolección), en el móvil baja a su propia línea y sus dos botones se reparten el ancho.
 * Si no, «Filtros» y el conmutador se comían la fila y el campo se quedaba en la lupa: su
 * `flex-1 min-w-0` nunca fuerza el salto de línea. Desde md, como antes.
 */
export const CONMUTADOR_EN_SU_LINEA_MOVIL = "max-md:basis-full max-md:[&>button]:flex-1";

const OPCIONES = [
  { valor: "mosaico" as const, etiqueta: "Mosaico", Icono: LayoutGrid },
  { valor: "detalle" as const, etiqueta: "Detalle", Icono: Rows3 },
];

export function VistaCardsToggle({ vista, onVistaChange, className }: VistaCardsToggleProps) {
  return (
    <SegmentedToggle
      options={OPCIONES}
      valor={vista}
      onChange={onVistaChange}
      ariaLabel="Vista de las órdenes"
      className={cn(VISTA_TOGGLE_TACTIL, className)}
    />
  );
}
