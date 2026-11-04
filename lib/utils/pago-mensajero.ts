import { Prisma } from "@prisma/client";
import type { GestionResultado } from "@prisma/client";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type { TarifaPago, ValorPago } from "@/lib/types/tarifa-flexible";
import { importeDe } from "@/lib/tarifas/calculo";
import { conceptoPorResultado, type ActorPago } from "@/lib/tarifas/catalogo";

/**
 * SLT-52 (design §6) — lo que aceptan `pagoPorResultado` e `ingresoBodegaPorResultado` mientras
 * conviven los dos modelos: la `TarifaPago` del resolver unico o, sin envolver, la `PagoTarifa`
 * vieja que el cierre aun pasa hasta T5.1 (desvio anotado en la bitacora; no lleva `modelo`, asi
 * que no hay ambiguedad).
 */
export type TarifaDePago = PagoTarifa | TarifaPago;

export function pagoConModelo(tarifa: TarifaDePago): TarifaPago {
  return "modelo" in tarifa ? tarifa : { modelo: "viejo", tarifa };
}

/**
 * SLT-52 (R28, R32, R34) — el pago de una gestion en el modelo nuevo, para el mensajero o la
 * satelite. Paga el valor resuelto SOLO si es el concepto de ESE resultado (`<actor>_<resultado>`);
 * si no, `"0.00"`. El % va sobre `baseFlete`, el flete sin IVA que se le cobra a la tienda por esa
 * gestion (P1). Y es EXACTAMENTE el importe: el pago no lleva IVA (P4); `ValorPago` ni siquiera
 * tiene donde guardarlo, y aqui no se llama a `ivaDe`.
 */
export function importePagoNuevo(
  actor: ActorPago,
  resultado: GestionResultado,
  valor: ValorPago | null,
  baseFlete: string,
): string {
  if (valor === null || valor.concepto !== conceptoPorResultado(actor, resultado)) return "0.00";
  return importeDe(valor, new Prisma.Decimal(baseFlete)).toFixed(2);
}

/**
 * Feature 39 (F1.4) — pago al MENSAJERO por una gestion. R5-R8/R7b: SOLO `entregada`
 * paga (`cobroEntregado`); cualquier otro resultado (`rechazada`/`reprogramada`/
 * `devuelta`) -> "0.00". `tarifa === null` (gap de datos, zona sin tarifa) -> "0.00" sin
 * bloquear (R8). El `cobroRechazado` NUNCA se paga al mensajero: es un ingreso de bodega
 * modelado en la feature 56 (fuera del alcance de la 39). Money-safe: Prisma.Decimal,
 * salida STRING escala 2 (R9). Funcion pura, testeable sin DB/red.
 */
export function pagoPorResultado(
  resultado: GestionResultado,
  entrada: TarifaDePago | null,
): string {
  if (entrada === null) return "0.00"; // R8: gap seguro, no bloquea
  const t = pagoConModelo(entrada);
  if (t.modelo === "nuevo") return importePagoNuevo("mensajero", resultado, t.mensajero, t.baseFlete);
  const tarifa = t.tarifa;
  if (resultado === "entregado") {
    // R5: unico caso que paga; usa cobroEntregado, NUNCA cobroRechazado.
    return new Prisma.Decimal(tarifa.cobroEntregado).toFixed(2);
  }
  return "0.00"; // R6/R7/R7b: rechazada/reprogramada/devuelta no pagan al mensajero
}
