import type { PrismaClient } from "@prisma/client";

// SL-45 (design §3, §6) — los pagos de la empresa a la plataforma. Un pago es una fila de
// `wallet_movimiento` con categoría `egreso_pago_plataforma`; está VIGENTE mientras no tenga
// contra-asiento (`ingreso_ajuste`, `origen_tipo = gasto`, `origen_id` = el pago). Solo lectura y el
// candado: el pago lo escribe `WalletMovimientoRepository.crearMovimientoRegistrado` y la anulación,
// `EgresoCajaAnulacionService` (design §5).

/** Lo que lee este repositorio: el cliente extendido, o el `tx` de una transacción abierta. */
export type PagoPlataformaCliente = Pick<PrismaClient, "walletMovimiento">;

/** El `tx` de la transacción del registro: el candado es SQL a mano y vive lo que viva ella. */
export type PagoPlataformaTxCandado = Pick<PrismaClient, "$executeRaw">;

export interface IPagoPlataformaRepository {
  /**
   * Σ `monto` de los pagos vigentes de la empresa, de toda su historia, como texto con dos
   * decimales ("0.00" sin pagos). Con `cliente`, lee dentro de esa transacción (el tope, design §6).
   */
  sumaPagosVigentes(organizacionId: string, cliente?: PagoPlataformaCliente): Promise<string>;
  /**
   * El candado de los pagos de UNA empresa (R10): `pg_advisory_xact_lock` con una clave derivada de
   * la empresa de la transacción. Dos pagos simultáneos de la misma empresa se serializan aquí; los
   * de otra empresa no esperan. Se suelta solo al terminar la transacción.
   */
  bloquear(tx: PagoPlataformaTxCandado): Promise<void>;
  /**
   * ¿Ya hay una fila del libro de la empresa con esa clave de idempotencia? (R11). El tope la mira
   * dentro de su transacción, después del candado, para que un reenvío no choque con el tope.
   */
  claveYaRegistrada(organizacionId: string, claveIdempotencia: string, cliente?: PagoPlataformaCliente): Promise<boolean>;
}
