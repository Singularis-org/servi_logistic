"use client";

import { useContext } from "react";
import { NivelesGeograficosContexto } from "@/providers/EtiquetasGeograficasProvider";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";

const SIN_NIVELES: readonly NivelDeFiltroDTO[] = [];

/**
 * SLT-47 (design §5.4) — los niveles del país de la empresa de la sesión, de 1 a P.
 *
 * Sin proveedor devuelve `[]` y no lanza, como `useEtiquetasGeograficas`: los componentes se montan
 * sueltos en los tests. Vacío y no los de un país: dar los de Costa Rica por defecto escondería un
 * país implícito. La referencia vacía es estable, para no disparar memos en cada render.
 */
export function useNivelesGeograficos(): readonly NivelDeFiltroDTO[] {
  return useContext(NivelesGeograficosContexto) ?? SIN_NIVELES;
}
