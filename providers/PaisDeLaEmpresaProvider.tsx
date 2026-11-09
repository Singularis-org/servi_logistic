"use client";

import { createContext, type ReactNode } from "react";
import type { TelefonoDelPais } from "@/lib/types/pais";

/**
 * SLT-81 (design §7.1; R18–R23) — la regla del teléfono del país de la empresa de la sesión.
 *
 * La calcula `app/(app)/layout.tsx` en la misma lectura de las etiquetas de nivel, así que no cuesta
 * una consulta más. Baja por contexto, junto a `EtiquetasGeograficasProvider` (que no se toca: lo
 * vigila su guardia), porque la usan varios formularios montados en pantallas distintas. `null` es
 * un valor real: el superadmin, o un país sin prefijo o sin dígitos (R23).
 */
export const PaisDeLaEmpresaContexto = createContext<TelefonoDelPais | null>(null);

export function PaisDeLaEmpresaProvider({
  telefono,
  children,
}: Readonly<{ telefono: TelefonoDelPais | null; children: ReactNode }>) {
  return <PaisDeLaEmpresaContexto.Provider value={telefono}>{children}</PaisDeLaEmpresaContexto.Provider>;
}
