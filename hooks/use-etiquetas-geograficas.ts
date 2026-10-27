"use client";

import { useContext } from "react";
import { EtiquetasGeograficasContexto } from "@/providers/EtiquetasGeograficasProvider";
import { ETIQUETAS_NEUTRAS, type EtiquetasGeograficas } from "@/lib/types/pais";

/**
 * SL-20 (design §7; R19) — los nombres de nivel del país de la empresa de la sesión.
 *
 * Sin proveedor devuelve `ETIQUETAS_NEUTRAS` («Nivel 1»…) y no lanza, por el mismo motivo que
 * `useMapaAyuda`: los componentes se montan sueltos en los tests. Neutras y no las de un país: dar
 * las de Costa Rica por defecto volvería a esconder un país implícito (design §7).
 */
export function useEtiquetasGeograficas(): EtiquetasGeograficas {
  return useContext(EtiquetasGeograficasContexto) ?? ETIQUETAS_NEUTRAS;
}
