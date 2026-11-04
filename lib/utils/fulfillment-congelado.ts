import type { Prisma } from "@prisma/client";

import type { TarifaCongelada } from "@/lib/utils/cierre-detalle";
import { ivaFulfillmentDeTarifa, montoFulfillmentDeTarifa } from "@/lib/utils/ingreso-empresa";

/**
 * SLT-52 (R46, R47, design §12.1) — el fulfillment de una orden y su IVA, leidos de lo CONGELADO en
 * su `cierre_detail`. Lo usan las tres lecturas que lo muestran: `costoReal` de la API por key, el
 * detalle del cierre de administracion y Analitica.
 *
 * Vive fuera de `cierre-detalle.ts` a proposito: `tarifaDe` no puede nombrar el fulfillment (ficha
 * 449, `fulfillment-fuera-de-la-formula.guardia.test.ts`) y aqui no se liquida nada: ninguno de los
 * dos importes entra en `derivarIngresoOrden` ni en las wallets (R31).
 *
 * - Viejo: el monto de la COLUMNA `tarifa_fulfillment` (`NULL` -> `"0.00"`, R29 de la 415) y un IVA
 *   de `"0.00"` siempre (R47: `tarifas` no tiene % de IVA para el fulfillment).
 * - Nuevo: la columna va NULL; el monto y su IVA salen del concepto `tienda_fulfillment` congelado
 *   con su `iva_pct`, por las MISMAS funciones que la carga y la cotizacion (R38). Sin fila = 0.
 */
export interface FulfillmentCongelado {
  fulfillment: string;
  ivaFulfillment: string;
}

export function fulfillmentCongeladoDe(
  tarifa: TarifaCongelada | null,
  columna: Prisma.Decimal | null | undefined,
  montoCobrar: string | null,
): FulfillmentCongelado {
  const monto =
    tarifa !== null && tarifa.modelo === "nuevo"
      ? montoFulfillmentDeTarifa(tarifa, montoCobrar).toFixed(2)
      : columna == null
        ? "0.00"
        : columna.toFixed(2);
  return {
    fulfillment: monto,
    // Viejo o sin tarifa -> 0 por la propia funcion (R47); no se escribe un cero aparte.
    ivaFulfillment: ivaFulfillmentDeTarifa(tarifa, montoCobrar).toFixed(2),
  };
}
