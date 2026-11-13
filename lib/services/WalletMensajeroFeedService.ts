import { Prisma } from "@prisma/client";
import type { CrearPagoMensajeroInput } from "@/lib/interfaces/repositories/IPagoMensajeroMovimientoRepository";
import type { CrearMovimientoInput } from "@/lib/interfaces/repositories/IWalletMovimientoRepository";
import type {
  IWalletMensajeroFeedService,
  MovimientosDePagoMensajero,
  WalletMensajeroFeedTxClient,
} from "@/lib/interfaces/services/IWalletMensajeroFeedService";
import { calcularSplitPago } from "@/lib/utils/cuenta-por-pagar";

/**
 * Feature 44 (design §2.2) — construye los movimientos del PAGO AL MENSAJERO de un cierre
 * aprobado. Corre DENTRO de la transaccion de aprobacion (misma `tx` que 42 y 43, R7). NO
 * recalcula el pago: CONSUME los snapshots ya congelados del cierre_dia (`total_pago_mensajero`
 * de la 39 = P y `total_efectivo` de la 37 = E). Aplica la regla money-safe `pagado = min(P, E)`
 * (fuente unica: `calcularSplitPago`) y emite:
 *   - LIBRO por mensajero: `pago_devengado = P` (si P>0), `pago_efectivo = pagado` (si pagado>0).
 *     El pendiente (cuenta por pagar) NO es fila: es el saldo derivado (R10/R14).
 *   - CAJA 42 (F1.4-Qa=SI, R17): un EGRESO `egreso_pago_mensajero = P` (si P>0), el costo total
 *     del pago (accrual). Idempotente por el constraint existente de la 42; la liquidacion
 *     posterior (Qf) NO vuelve a emitir egreso (evita doble conteo).
 * SI P=0 (cierre sin entregas que paguen) devuelve listas vacias (R10). NO persiste (lo hacen los
 * repos en la tx). Money-safe: Prisma.Decimal + montos STRING.
 *
 * SLT-123 (R313, R325): la regla la decide SOLO `cierre_dia.pago_independiente_efectivo`. Con la
 * marca en `true` (cierre de la central aprobado desde SLT-123) el libro lleva solo el devengo; el
 * egreso de caja no cambia (R314). Con `false` todo sigue como arriba.
 *
 * SLT-139 (R317, R340): un cierre NUEVO de SATELITE (marca en `true`, `destino_tipo =
 * bodega_satelite`) lleva ademas `pago_satelite = P`: la satelite le pago P al mensajero. Solo llega
 * aqui desde la conciliacion de su consolidacion (la aprobacion asienta solo la central). La REGLA la
 * decide la marca; el destino solo dice, dentro de la regla nueva, quien puso el pago. Un cierre viejo
 * de satelite sigue con `pago_efectivo = min(P, E)` aunque se concilie hoy (R340).
 */
export class WalletMensajeroFeedService implements IWalletMensajeroFeedService {
  async construirMovimientosDePago(
    cierreId: string,
    tx: WalletMensajeroFeedTxClient,
  ): Promise<MovimientosDePagoMensajero> {
    // R8: UN SOLO read del cierre; consume los snapshots (mensajero + P + E), no re-deriva.
    const cierre = await tx.cierreDia.findUnique({
      where: { id: cierreId },
      // SLT-123 (R313, R325): + la marca de la regla, en la MISMA lectura.
      select: {
        mensajeroId: true,
        totalPagoMensajero: true,
        totalEfectivo: true,
        pagoIndependienteEfectivo: true,
        destinoTipo: true, // SLT-139 (R317): quien puso el pago de un cierre nuevo
      },
    });
    // Defensivo: si el cierre no existe, no hay nada que alimentar (el enganche solo llama tras
    // una aprobacion aplicada, por lo que en la practica siempre existe).
    if (cierre === null) return { libro: [], egresoCaja: [] };

    // R8/R9/R13: P y E se leen como Decimal/STRING (nunca number); `min(P,E)` POR CIERRE.
    const split = calcularSplitPago(
      cierre.totalPagoMensajero.toFixed(2),
      cierre.totalEfectivo.toFixed(2),
    );
    const P = new Prisma.Decimal(split.devengado);
    const pagado = new Prisma.Decimal(split.pagado);

    const libro: CrearPagoMensajeroInput[] = [];
    // R10: emite el devengo SOLO si P>0 (P=0 -> ningun movimiento para ese mensajero).
    if (P.gt(0)) {
      libro.push({
        mensajeroId: cierre.mensajeroId,
        tipo: "devengo",
        categoria: "pago_devengado",
        monto: split.devengado,
        origenTipo: "cierre_dia",
        origenId: cierreId,
        descripcion: null,
        registradoPor: null,
      });
    }
    // R10: emite el pago (tomado del efectivo) SOLO si pagado>0 y SOLO con la regla de la 44
    // (marca en `false`, R325). SLT-123 (R313): con la marca en `true` el pago es independiente
    // del efectivo: el libro solo devenga P y la central lo paga despues con «Registrar pago».
    if (!cierre.pagoIndependienteEfectivo && pagado.gt(0)) {
      libro.push({
        mensajeroId: cierre.mensajeroId,
        tipo: "pago",
        categoria: "pago_efectivo",
        monto: split.pagado,
        origenTipo: "cierre_dia",
        origenId: cierreId,
        descripcion: null,
        registradoPor: null,
      });
    } else if (cierre.pagoIndependienteEfectivo && cierre.destinoTipo === "bodega_satelite" && P.gt(0)) {
      // SLT-139 (R317): P completo, no `min(P, E)`. Idempotente por `origen_uq` (R318).
      libro.push({
        mensajeroId: cierre.mensajeroId,
        tipo: "pago",
        categoria: "pago_satelite",
        monto: split.devengado,
        origenTipo: "cierre_dia",
        origenId: cierreId,
        descripcion: null,
        registradoPor: null,
      });
    }

    // R17 (F1.4-Qa=SI FIRME): el costo total P se refleja como EGRESO en la caja 42, un solo
    // egreso por cierre (idempotente por el constraint (origen_tipo, origen_id, categoria) de la
    // 42). Se omite si P=0.
    const egresoCaja: CrearMovimientoInput[] = [];
    if (P.gt(0)) {
      egresoCaja.push({
        tipo: "egreso",
        categoria: "egreso_pago_mensajero",
        monto: split.devengado,
        origenTipo: "cierre_dia",
        origenId: cierreId,
        descripcion: null,
        registradoPor: null,
      });
    }

    return { libro, egresoCaja };
  }
}
