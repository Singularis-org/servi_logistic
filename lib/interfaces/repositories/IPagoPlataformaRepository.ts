import type { PrismaClient } from "@prisma/client";

// SL-45 (design §3, §6) — los pagos de la empresa a la plataforma. Un pago es una fila de
// `wallet_movimiento` con categoría `egreso_pago_plataforma`; está VIGENTE mientras no tenga
// contra-asiento (`ingreso_ajuste`, `origen_tipo = gasto`, `origen_id` = el pago). Solo lectura y el
// candado: el pago lo escribe `WalletMovimientoRepository.crearMovimientoRegistrado` y la anulación,
// `EgresoCajaAnulacionService` (design §5).
// SLT-60 (design §4.1): la deuda cuenta solo los pagos CONFIRMADOS por el superadmin, y el tope del
// registro compara con lo DISPONIBLE, que calcula la base (`pago_plataforma_disponible`).

/** Lo que lee este repositorio: el cliente extendido, o el `tx` de una transacción abierta. */
export type PagoPlataformaCliente = Pick<PrismaClient, "walletMovimiento" | "pagoPlataformaAplicacion" | "$queryRaw">;

/** El `tx` de la transacción del registro: el candado es SQL a mano y vive lo que viva ella. */
export type PagoPlataformaTxCandado = Pick<PrismaClient, "$executeRaw">;

/** El `tx` del registro con el que se lee lo disponible: una función de la base, por SQL a mano. */
export type PagoPlataformaTxDisponible = Pick<PrismaClient, "$queryRaw">;

export interface IPagoPlataformaRepository {
  /**
   * SLT-60 (R7): Σ `monto` de las aplicaciones de la empresa, como texto con dos decimales ("0.00" sin
   * confirmaciones). Las aplicaciones de una confirmación suman el monto de su pago (design §3.4), así
   * que es la Σ de los pagos confirmados.
   */
  sumaPagosConfirmados(organizacionId: string, cliente?: Pick<PrismaClient, "pagoPlataformaAplicacion">): Promise<string>;
  /**
   * SLT-60 (R2, R3, R6): lo disponible para registrar de la empresa del contexto, como texto con dos
   * decimales y con signo (≤ 0 sin facturas cerradas con saldo). Lo calcula
   * `pago_plataforma_disponible`: Σ saldos de las facturas cerradas − Σ pagos por confirmar. Se lee con
   * el `tx` del registro, después del candado.
   */
  disponibleParaRegistrar(organizacionId: string, tx: PagoPlataformaTxDisponible): Promise<string>;
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
  claveYaRegistrada(
    organizacionId: string,
    claveIdempotencia: string,
    cliente?: Pick<PrismaClient, "walletMovimiento">,
  ): Promise<boolean>;
}
