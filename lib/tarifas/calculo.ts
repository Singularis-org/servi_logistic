/**
 * SLT-52 (design §6, R26, R34) — la UNICA aritmetica del modelo nuevo de tarifas.
 *
 * Por que un modulo aparte y no dentro de `ingreso-empresa.ts`: el cobro a la tienda, el pago al
 * mensajero y el de la satelite usan la misma regla de importe; si cada uno la escribiera, un
 * redondeo distinto en un camino haria que el listado y el cierre discreparan en un centimo, que
 * es exactamente lo que la 204 midio en produccion.
 *
 * Dinero siempre en `Prisma.Decimal`, redondeo HALF_UP a 2 decimales (R26). Nunca `number`.
 */
import { Prisma } from "@prisma/client";

import type { ValorCobro, ValorPago } from "@/lib/types/tarifa-flexible";

function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Importe de un concepto: el monto tal cual, o `base * valor / 100` en porcentaje, redondeado.
 * `base` es la que fija el catalogo (R27 pedido, R28 flete sin IVA); quien llama la trae, porque
 * este modulo no sabe de ordenes ni de gestiones. Un valor 0 da `0.00`: el 0 escrito vale 0 (R23).
 */
export function importeDe(valor: ValorPago | ValorCobro, base: Prisma.Decimal): Prisma.Decimal {
  const v = new Prisma.Decimal(valor.valor);
  return round2(valor.modo === "monto" ? v : base.mul(v).div(100));
}

/**
 * IVA de un COBRO a la tienda. Solo acepta `ValorCobro`: los pagos no llevan IVA (P4, R34), y
 * con este tipo un IVA de pago no compila.
 *
 * Se aplica sobre el importe YA redondeado (R26), igual que el cierre desde la 204: la medicion
 * de 16618.40 al 3.5% dio 581.644 → 581.64 → IVA 75.61, y aplicar el IVA sin redondear antes
 * cambio un centimo el total pintado. Por eso redondea `importe` aunque llegue sin redondear.
 */
export function ivaDe(valor: ValorCobro, importe: Prisma.Decimal): Prisma.Decimal {
  return round2(round2(importe).mul(new Prisma.Decimal(valor.ivaPct)).div(100));
}
