"use client";

// SLT-242 (design §4.2; R1, R2, R4, R13) — la hoja de cliente que pone la moneda del pais en una
// cifra que pinta un componente de SERVIDOR.
//
// `TableroFinanciero`, `PanelConciliacion`, `KpisFinancieros` y `KpiCard` no pueden leer un
// contexto, y la pagina no puede pasarles la moneda (no importa `lib/services`). Esta hoja si lo
// lee: recibe props planas y serializables (un numero, una unidad, un string), asi que ninguna
// funcion cruza la frontera RSC. Es el precedente de `PriceLabel` (SLT-235).
//
// Devuelve SOLO el texto, en un fragmento y sin envoltorio: el DOM de quien la monta no cambia, y el
// texto queda como nodo hermano de los que lo rodean dentro del mismo elemento.
//
// Sin proveedor, `useMonedaDelPais()` cae a la moneda de la plataforma (SLT-235 R15): montada sola
// pinta lo mismo que antes de esta ficha (R13).

import { useMonedaDelPais } from "@/hooks/use-moneda-del-pais";
import { formatearMontoEn, SIN_MONTO } from "@/lib/config/moneda";

import { formatearValor } from "./formato";
import type { MetricaUnidad } from "./tipos";

export interface CifraAnaliticaProps {
  /** `null` = dato ausente; se pinta el marcador de siempre (`SIN_MONTO`). */
  readonly valor: number | null;
  readonly unidad: MetricaUnidad;
}

/** Un valor de la analitica con la moneda del pais. Devuelve solo el texto (un fragmento). */
export function CifraAnalitica({ valor, unidad }: CifraAnaliticaProps) {
  const moneda = useMonedaDelPais();
  return <>{formatearValor(valor, unidad, moneda)}</>;
}

export interface MontoAnaliticoProps {
  /** Importe serializado tal como llega del ledger, o `null` si no lo hay. */
  readonly monto: string | null;
}

/**
 * Un importe STRING con la moneda del pais, sin pasar por `number` (R4): el cuadre lo hace
 * `formatearMontoEn` sobre la cadena. Sin importe, `SIN_MONTO`, como `formatMontoString`.
 */
export function MontoAnalitico({ monto }: MontoAnaliticoProps) {
  const moneda = useMonedaDelPais();
  return <>{formatearMontoEn(moneda, monto, SIN_MONTO)}</>;
}
