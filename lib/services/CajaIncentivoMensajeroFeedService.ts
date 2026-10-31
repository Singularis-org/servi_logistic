import type { IWalletMovimientoRepository } from "@/lib/interfaces/repositories/IWalletMovimientoRepository";
import type {
  CajaIncentivoMensajeroTxClient,
  ICajaIncentivoMensajeroFeedService,
  MovimientoDeCajaDeIncentivo,
} from "@/lib/interfaces/services/ICajaIncentivoMensajeroFeedService";

/**
 * SLT-68 (design §6) — la unica implementacion del puerto de caja del incentivo. El `tipo`, la
 * `categoria` y el `origenTipo` de las dos filas son LITERALES escritos aqui una vez: el servicio del
 * incentivo no tiene forma de emitir otra cosa en la caja. Money-safe: el monto viaja como STRING y
 * esta clase no hace aritmetica.
 */
export class CajaIncentivoMensajeroFeedService implements ICajaIncentivoMensajeroFeedService {
  constructor(private readonly cajaRepo: IWalletMovimientoRepository) {}

  async emitirEgreso(tx: CajaIncentivoMensajeroTxClient, m: MovimientoDeCajaDeIncentivo): Promise<number> {
    return this.cajaRepo.crearMovimientos(tx, [
      {
        tipo: "egreso",
        categoria: "egreso_pago_mensajero", // propio: baja la ganancia (D5)
        monto: m.monto,
        origenTipo: "incentivo_mensajero",
        origenId: m.incentivoId,
        descripcion: m.descripcion,
        registradoPor: m.registradoPor,
        ...(m.fechaMovimiento !== undefined ? { fechaMovimiento: m.fechaMovimiento } : {}),
        ...(m.claveIdempotencia !== undefined ? { claveIdempotencia: m.claveIdempotencia } : {}),
      },
    ]);
  }

  async reversarEgreso(tx: CajaIncentivoMensajeroTxClient, m: MovimientoDeCajaDeIncentivo): Promise<number> {
    return this.cajaRepo.crearMovimientos(tx, [
      {
        tipo: "ingreso",
        categoria: "ingreso_ajuste", // propio, como el egreso que revierte
        monto: m.monto,
        origenTipo: "incentivo_mensajero", // la MISMA clave de origen que el egreso
        origenId: m.incentivoId,
        descripcion: m.descripcion,
        registradoPor: m.registradoPor,
      },
    ]);
  }
}
