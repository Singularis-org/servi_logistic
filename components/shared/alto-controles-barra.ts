"use client";

import { createContext, useContext } from "react";

/**
 * SLT-194 (R946, DC4, D1): alto en móvil de los controles de filtro de una barra con `escaneo`.
 * Lo pone la BARRA (`BuscadorFiltros` con `escaneo`) y lo leen los controles que monta
 * `FilterComponent`; ninguna pantalla pasa una prop. En escritorio siguen en `h-8`.
 */
export const ALTO_FILTRO_MOVIL_ESCANEO = "max-md:h-11";

/**
 * Clase de alto que la barra pide a sus controles de filtro. Por defecto `""`: un
 * `FilterComponent` suelto o en una barra sin `escaneo` se queda como estaba (R948).
 */
export const AltoControlesBarraContext = createContext<string>("");

/** La clase de alto que pide la barra que envuelve al control, o `""` si no hay ninguna. */
export function useAltoControlesBarra(): string {
  return useContext(AltoControlesBarraContext);
}
