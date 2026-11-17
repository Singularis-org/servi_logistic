"use client";

import { Select, type SelectOption } from "@/components/ui/select";

import {
  ARIA_FILTRO_TIENDA,
  ETIQUETA_FILTRO_TIENDA,
  TIENDA_TODAS,
} from "./filtro-tienda";

// SLT-190 (R850-R852, P2) — el control del filtro «Tienda» de Recoger en bodega y Recolección. Es
// el selector que ya existe (`Select` con el rótulo dentro, «Tienda: {nombre}», el mismo que pinta
// el `single` de `FilterComponent`), montado como hijo de `BuscadorFiltros` cuando el filtro está
// PUESTO, igual que el cantón de Reparto (`FiltroCantonDistrito`). Sin chip nuevo: se quita desde
// «Filtros» o con «Limpiar todo». Presentación pura: el estado vive en el módulo.

// El `Select` de base-ui trata `""` como «sin selección» y sus opciones exigen valor no vacío: para
// volver a «todas» desde el desplegable se antepone este centinela, que el handler traduce a `""`.
const TODAS = "__todas__";

// Mismo alto que el campo de la barra con `tactil` (44 px en el teléfono, R493/R852).
const CLASE_SELECT = "h-8 w-full max-md:h-11 sm:w-auto sm:min-w-56";

export interface FiltroTiendaProps {
  /** Tienda elegida (`""` = todas). */
  tienda: string;
  /** Tiendas de las órdenes cargadas, ya sin repetir y en orden (`opcionesTienda`). */
  tiendas: readonly string[];
  /** Recibe `""` para «todas». */
  onTiendaChange: (tienda: string) => void;
}

export function FiltroTienda({ tienda, tiendas, onTiendaChange }: FiltroTiendaProps) {
  const opciones: SelectOption[] = [
    { value: TODAS, label: TIENDA_TODAS },
    ...tiendas.map((nombre) => ({ value: nombre, label: nombre })),
  ];
  return (
    <Select
      aria-label={ARIA_FILTRO_TIENDA}
      labelPrefix={ETIQUETA_FILTRO_TIENDA}
      className={CLASE_SELECT}
      value={tienda}
      options={opciones}
      placeholder={TIENDA_TODAS}
      onValueChange={(siguiente) => onTiendaChange(siguiente === TODAS ? "" : siguiente)}
    />
  );
}
