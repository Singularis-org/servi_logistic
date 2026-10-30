import type {
  LiquidacionCierreTxClient,
  LiquidacionPagoTxClient,
} from "@/lib/interfaces/repositories/ILiquidacionPagoRepository";
import type { PagoMensajeroTxClient } from "@/lib/interfaces/repositories/IPagoMensajeroMovimientoRepository";
import type { CajaIncentivoMensajeroTxClient } from "@/lib/interfaces/services/ICajaIncentivoMensajeroFeedService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  AnularIncentivoMensajeroInput,
  AnularIncentivoMensajeroResult,
  RegistrarIncentivoMensajeroInput,
  RegistrarIncentivoMensajeroResult,
} from "@/lib/types/incentivo-mensajero";

/**
 * SLT-68 (design §6) — lo que toca la transaccion del incentivo: el candado del cierre (el mismo que
 * toma el pago a mensajero), su relectura, el libro del mensajero y la caja.
 */
export type IncentivoTx = LiquidacionPagoTxClient &
  LiquidacionCierreTxClient &
  PagoMensajeroTxClient &
  CajaIncentivoMensajeroTxClient;

/**
 * Ejecuta `fn` en UNA transaccion y revierte si lanza (R11). En produccion,
 * `(fn) => prisma.$transaction(fn)`; en los tests, un runner con la misma semantica.
 */
export type IncentivoTxRunner = <T>(fn: (tx: IncentivoTx) => Promise<T>) => Promise<T>;

export interface IIncentivoMensajeroService {
  registrar(input: RegistrarIncentivoMensajeroInput, actor: Actor): Promise<RegistrarIncentivoMensajeroResult>;
  anular(input: AnularIncentivoMensajeroInput, actor: Actor): Promise<AnularIncentivoMensajeroResult>;
}
