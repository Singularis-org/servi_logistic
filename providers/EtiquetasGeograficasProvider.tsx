"use client";

import { createContext, type ReactNode } from "react";
import type { EtiquetasGeograficas } from "@/lib/types/pais";

/**
 * SL-20 (design §7; R19) — cómo llama el país de la empresa a cada nivel geográfico.
 *
 * Las calcula `app/(app)/layout.tsx`, que es quien resuelve la sesión: `etiquetasDeEmpresa` con una
 * empresa, `ETIQUETAS_NEUTRAS` con el superadmin (no tiene país). Bajan por contexto, como el mapa de
 * `AyudaProvider`, porque las leen una veintena de pantallas y pasarlas por props obligaría a cada
 * una a reenviarlas. Se leen con `useEtiquetasGeograficas` (`hooks/use-etiquetas-geograficas.ts`).
 */
export const EtiquetasGeograficasContexto = createContext<EtiquetasGeograficas | null>(null);

export function EtiquetasGeograficasProvider({
  etiquetas,
  children,
}: Readonly<{ etiquetas: EtiquetasGeograficas; children: ReactNode }>) {
  return (
    <EtiquetasGeograficasContexto.Provider value={etiquetas}>{children}</EtiquetasGeograficasContexto.Provider>
  );
}
