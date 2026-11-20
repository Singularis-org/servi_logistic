"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { FormatoMoneda } from "@/lib/config/moneda";

/** Lo que baja el proveedor: la moneda y el nombre del impuesto del país de la empresa. */
export interface MonedaDelPais {
  moneda: FormatoMoneda;
  impuestoNombre: string;
}

/**
 * SLT-235 (design §6; R1) — la moneda y el nombre del impuesto del país de la empresa.
 *
 * Los resuelve `app/(app)/layout.tsx` en el servidor, en la misma lectura que las etiquetas de SL-20
 * (`paisParaPantallasDelActor`), y bajan por contexto como aquellas: los leen muchas pantallas y pasarlos
 * por props obligaría a cada una a reenviarlos. Así la moneda está en el HTML desde el primer pintado;
 * por eso no se lee por pantalla ni se guarda en el navegador (decisión cerrada). `FormatoMoneda` es un
 * objeto plano y cruza del servidor al cliente sin transformarlo.
 *
 * `null` sin proveedor: los hooks de `hooks/use-moneda-del-pais.ts` deciden la caída (R15).
 */
export const MonedaDelPaisContexto = createContext<MonedaDelPais | null>(null);

export function MonedaDelPaisProvider({
  moneda,
  impuestoNombre,
  children,
}: Readonly<{ moneda: FormatoMoneda; impuestoNombre: string; children: ReactNode }>) {
  // Memorizado para que un repintado del layout con los mismos datos no repinte a cada consumidor.
  const valor = useMemo(() => ({ moneda, impuestoNombre }), [moneda, impuestoNombre]);
  return <MonedaDelPaisContexto.Provider value={valor}>{children}</MonedaDelPaisContexto.Provider>;
}
