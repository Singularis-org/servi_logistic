import type { PrismaClient } from "@prisma/client";

// SL-45 (design §6, R9, R10, R11) — el tope del pago a la plataforma: un pago no puede superar la
// deuda vigente. Se decide DENTRO de la transacción del registro, con el candado de la empresa
// tomado, para que dos pagos simultáneos no pasen los dos (R10).

/** El `tx` del registro: el candado (SQL a mano), los cargos y el libro de la caja. */
export type TopePagoPlataformaTx = Pick<PrismaClient, "$executeRaw" | "cobroPlataformaMovimiento" | "walletMovimiento">;

export interface ComprobarTopeInput {
  organizacionId: string;
  /** Texto con dos decimales, ya validado por zod (> 0). */
  monto: string;
  claveIdempotencia: string;
}

/**
 * - `cabe`: el pago no supera la deuda vigente;
 * - `supera`: la supera, o no hay deuda (al día o a favor) (R9);
 * - `reenvio`: la clave ya tiene su pago. No se compara: el `INSERT` lo deduplica y el servicio
 *   responde `ya_registrado` (R11). Un reenvío del mismo pago no es un pago de más.
 */
export type ResultadoTopePagoPlataforma = "cabe" | "supera" | "reenvio";

export interface ITopePagoPlataforma {
  /**
   * Toma el candado de la empresa, mira la clave y compara `monto` con la deuda vigente leída con
   * `tx`. El candado dura lo que la transacción: hasta el `COMMIT` del pago, ningún otro pago de la
   * empresa lee la deuda.
   */
  comprobar(tx: TopePagoPlataformaTx, input: ComprobarTopeInput): Promise<ResultadoTopePagoPlataforma>;
}
