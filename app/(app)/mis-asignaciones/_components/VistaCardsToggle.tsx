"use client";

import { LayoutGrid, Rows3 } from "lucide-react";

import { SegmentedToggle } from "@/components/shared/SegmentedToggle";

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
}

/**
 * SLT-156 (R493): el conmutador mide 44 px de alto en MÓVIL (< 768 px). Se aplica a los botones hijos
 * del grupo desde aquí, sin tocar el control compartido; en escritorio (y en `/novedades`, que también
 * lo monta) sigue con su alto de siempre.
 */
export const VISTA_TOGGLE_TACTIL = "max-md:[&>button]:h-11 max-md:[&>button]:px-4";

const OPCIONES = [
  { valor: "mosaico" as const, etiqueta: "Mosaico", Icono: LayoutGrid },
  { valor: "detalle" as const, etiqueta: "Detalle", Icono: Rows3 },
];

export function VistaCardsToggle({ vista, onVistaChange }: VistaCardsToggleProps) {
  return (
    <SegmentedToggle
      options={OPCIONES}
      valor={vista}
      onChange={onVistaChange}
      ariaLabel="Vista de las órdenes"
      className={VISTA_TOGGLE_TACTIL}
    />
  );
}
