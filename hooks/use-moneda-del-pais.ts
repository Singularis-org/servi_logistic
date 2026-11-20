"use client";

import { useContext } from "react";
import { MonedaDelPaisContexto } from "@/providers/MonedaDelPaisProvider";
import { MONEDA_PLATAFORMA, type FormatoMoneda } from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";

/**
 * SLT-235 (design §6; R11, R15) — la moneda del país de la empresa de la sesión, para pasarla a
 * `formatearMontoEn`.
 *
 * Sin proveedor devuelve `MONEDA_PLATAFORMA` y no lanza (R15). A diferencia de las etiquetas de SL-20,
 * que caen a las neutras, aquí la caída es la de la plataforma porque es la que decidió el humano: un
 * componente de monto montado fuera del portal (o suelto en un test) pinta lo mismo que antes de SL-21.
 */
export function useMonedaDelPais(): FormatoMoneda {
  return useContext(MonedaDelPaisContexto)?.moneda ?? MONEDA_PLATAFORMA;
}

/**
 * SLT-235 (design §6; R15, R17) — el nombre del impuesto del país de la empresa de la sesión. Sin
 * proveedor, `IMPUESTO_ROTULO`, por la misma razón que `useMonedaDelPais`.
 */
export function useImpuestoDelPais(): string {
  return useContext(MonedaDelPaisContexto)?.impuestoNombre ?? IMPUESTO_ROTULO;
}
