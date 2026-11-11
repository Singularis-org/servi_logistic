"use client";

import { createContext, type ReactNode } from "react";
import type { EtiquetasGeograficas } from "@/lib/types/pais";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";

/**
 * SL-20 (design §7; R19) — cómo llama el país de la empresa a cada nivel geográfico.
 *
 * Las calcula `app/(app)/layout.tsx`, que es quien resuelve la sesión: `etiquetasDeEmpresa` con una
 * empresa, `ETIQUETAS_NEUTRAS` con el superadmin (no tiene país). Bajan por contexto, como el mapa de
 * `AyudaProvider`, porque las leen una veintena de pantallas y pasarlas por props obligaría a cada
 * una a reenviarlas. Se leen con `useEtiquetasGeograficas` (`hooks/use-etiquetas-geograficas.ts`).
 */
export const EtiquetasGeograficasContexto = createContext<EtiquetasGeograficas | null>(null);

/**
 * SLT-47 (design §5.4) — los N niveles del país de la empresa (1 a P), con sus nombres. Los leen
 * novedades y mis-asignaciones, que no reciben el catálogo de filtros, para rotular sus listas. Es un
 * contexto aparte y no un campo más del de etiquetas: así las pantallas que solo leen las tres
 * etiquetas no cambian. Se lee con `useNivelesGeograficos` (`hooks/use-niveles-geograficos.ts`).
 */
export const NivelesGeograficosContexto = createContext<readonly NivelDeFiltroDTO[] | null>(null);

export function EtiquetasGeograficasProvider({
  etiquetas,
  children,
}: Readonly<{ etiquetas: EtiquetasGeograficas; children: ReactNode }>) {
  return <EtiquetasGeograficasContexto.Provider value={etiquetas}>{children}</EtiquetasGeograficasContexto.Provider>;
}

/**
 * SLT-47 (design §5.4) — baja los niveles del país por `NivelesGeograficosContexto`. Es un proveedor
 * aparte del de etiquetas (y no una prop más de aquel) para que el layout siga montando
 * `EtiquetasGeograficasProvider` tal cual y cada contexto tenga un único dueño. No pinta ninguna caja.
 */
export function NivelesGeograficosProvider({
  niveles,
  children,
}: Readonly<{ niveles: readonly NivelDeFiltroDTO[]; children: ReactNode }>) {
  return <NivelesGeograficosContexto.Provider value={niveles}>{children}</NivelesGeograficosContexto.Provider>;
}
