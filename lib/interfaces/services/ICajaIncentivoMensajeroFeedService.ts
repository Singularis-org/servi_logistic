import type { PrismaClient } from "@prisma/client";

// SLT-68 (design §6) — EL PUERTO ESTRECHO de la caja principal para el incentivo a un mensajero,
// calcado del del premio (`ICajaPremioRankingFeedService`) y por el mismo motivo: con
// `IWalletMovimientoRepository` el servicio podria escribir CUALQUIER categoria de la caja. Este
// puerto tiene dos metodos y no expone ni el tipo, ni la categoria, ni el origen: los fija su
// implementacion con literales.

/** El LIBRO DE LA CAJA y nada mas: el puerto no puede tocar el libro del mensajero. */
export type CajaIncentivoMensajeroTxClient = Pick<PrismaClient, "walletMovimiento">;

/**
 * Lo que el puerto necesita saber del incentivo. `incentivoId` es el id del devengo `incentivo` del
 * libro del mensajero y la mitad de la clave de origen de las dos filas de caja. NO es el cierre: el
 * feed del cierre ya escribio `(cierre_dia, cierreId, egreso_pago_mensajero)` al aprobar, y reusar
 * esa clave mandaria el egreso a `ON CONFLICT DO NOTHING` (design §2.2).
 */
export interface MovimientoDeCajaDeIncentivo {
  incentivoId: string;
  /** STRING escala 2. Nunca `number`. El MISMO string que va al libro del mensajero. */
  monto: string;
  descripcion: string;
  registradoPor: string;
  /** Solo en el egreso: la fecha elegida (`instanteDelMovimientoManual`); `undefined` = ahora. */
  fechaMovimiento?: Date;
  /** Solo en el egreso: la clave del cliente, barrera del doble envio (R10). */
  claveIdempotencia?: string;
}

export interface ICajaIncentivoMensajeroFeedService {
  /**
   * R6 — el dinero SALE: `egreso` / `egreso_pago_mensajero` (propio: baja la ganancia) con origen
   * `(incentivo_mensajero, incentivoId)`. Devuelve las filas escritas: 0 = la clave de idempotencia
   * ya existia (R10).
   */
  emitirEgreso(tx: CajaIncentivoMensajeroTxClient, movimiento: MovimientoDeCajaDeIncentivo): Promise<number>;
  /**
   * R13 — el dinero VUELVE: `ingreso` / `ingreso_ajuste` (propio) con el MISMO origen. Deja la
   * ganancia como estaba antes del incentivo (precedente 293 §7.1).
   */
  reversarEgreso(tx: CajaIncentivoMensajeroTxClient, movimiento: MovimientoDeCajaDeIncentivo): Promise<number>;
}
