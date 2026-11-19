import type { PrismaClient } from "@prisma/client";

// SL-45 (design §6, R9, R10, R11) — el tope del pago a la plataforma: un pago no puede superar lo que
// se puede pagar. Se decide DENTRO de la transacción del registro, con el candado de la empresa
// tomado, para que dos pagos simultáneos no pasen los dos (R10).
// SLT-60 (design §4.2; R2, R3, R5): lo que se puede pagar es lo DISPONIBLE para registrar (saldo de las
// facturas cerradas − pagos por confirmar), que calcula la base.

/**
 * El `tx` del registro: el candado (SQL a mano), la clave en el libro de la caja y lo disponible, que
 * es una función de la base leída por SQL a mano (SLT-60).
 */
export type TopePagoPlataformaTx = Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "walletMovimiento">;

export interface ComprobarTopeInput {
  organizacionId: string;
  /** Texto con dos decimales, ya validado por zod (> 0). */
  monto: string;
  claveIdempotencia: string;
}

/**
 * - `cabe`: el pago no supera lo disponible para registrar (igual, cabe);
 * - `supera`: lo supera, o lo disponible es 0 o negativo (R2, R3);
 * - `reenvio`: la clave ya tiene su pago. No se compara: el `INSERT` lo deduplica y el servicio
 *   responde `ya_registrado` (R11). Un reenvío del mismo pago no es un pago de más.
 */
export type ResultadoTopePagoPlataforma = "cabe" | "supera" | "reenvio";

export interface ITopePagoPlataforma {
  /**
   * Toma el candado de la empresa, mira la clave y compara `monto` con lo disponible leído con `tx`.
   * El candado dura lo que la transacción: hasta el `COMMIT` del pago, ningún otro pago de la empresa
   * lee lo disponible.
   */
  comprobar(tx: TopePagoPlataformaTx, input: ComprobarTopeInput): Promise<ResultadoTopePagoPlataforma>;
}
