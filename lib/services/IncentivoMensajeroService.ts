import { randomUUID } from "node:crypto";

import { esAccesoTotal } from "@/lib/auth/acceso-total";
import type {
  CierreImputableDTO,
  ILiquidacionPagoRepository,
} from "@/lib/interfaces/repositories/ILiquidacionPagoRepository";
import type { IPagoMensajeroMovimientoRepository } from "@/lib/interfaces/repositories/IPagoMensajeroMovimientoRepository";
import type { ICajaIncentivoMensajeroFeedService } from "@/lib/interfaces/services/ICajaIncentivoMensajeroFeedService";
import type {
  IIncentivoMensajeroService,
  IncentivoTxRunner,
} from "@/lib/interfaces/services/IIncentivoMensajeroService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  AnularIncentivoMensajeroInput,
  AnularIncentivoMensajeroResult,
  RegistrarIncentivoMensajeroInput,
  RegistrarIncentivoMensajeroResult,
} from "@/lib/types/incentivo-mensajero";
import { derivarCuentaPorPagar } from "@/lib/utils/cuenta-por-pagar";
import { instanteDelMovimientoManual } from "@/lib/utils/fecha-movimiento-manual";

/**
 * SLT-68 (design §6.1/§6.2) — el INCENTIVO MANUAL A UN MENSAJERO: «un premio sin podio».
 *
 * Registrar escribe dos filas en UNA transaccion: el egreso de la caja (baja la ganancia) y el devengo
 * `incentivo` del libro del mensajero (sube su cuenta por pagar), imputado al cierre `aprobado` mas
 * reciente para que el pago a mensajero (reparto de la 205) lo vea como pagable (Q1). Anular escribe
 * sus dos contraasientos. Las filas originales no se tocan nunca, ni el cierre.
 *
 * El servicio no recibe el repositorio de la caja: escribe en ella SOLO por su puerto estrecho.
 */
export class IncentivoMensajeroService implements IIncentivoMensajeroService {
  constructor(
    private readonly cierres: Pick<
      ILiquidacionPagoRepository,
      "listarCierresImputables" | "bloquearBeneficiario" | "obtenerCierreParaPago"
    >,
    private readonly libro: Pick<
      IPagoMensajeroMovimientoRepository,
      "obtenerNombreMensajero" | "crearMovimientos" | "obtenerIncentivo" | "agregarCuentaPorPagar"
    >,
    private readonly caja: ICajaIncentivoMensajeroFeedService,
    private readonly runTransaction: IncentivoTxRunner,
    private readonly nuevoId: () => string = randomUUID,
  ) {}

  async registrar(
    input: RegistrarIncentivoMensajeroInput,
    actor: Actor,
  ): Promise<RegistrarIncentivoMensajeroResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R1: antes de leer nada

    const mensajeroNombre = await this.libro.obtenerNombreMensajero(input.mensajeroId);
    if (mensajeroNombre === null) return { status: "no_encontrado" }; // R4 (RLS por empresa)

    const cierre = cierreMasReciente(await this.cierres.listarCierresImputables(input.mensajeroId));
    if (cierre === null) return { status: "sin_cierre_aprobado" }; // R5

    // La identidad del incentivo: el egreso de caja la nombra antes de que exista el devengo.
    const id = this.nuevoId();
    const descripcion = `Incentivo · ${input.motivo}`;
    const fechaMovimiento = instanteDelMovimientoManual(input.fecha);

    const escrito = await this.runTransaction(async (tx) => {
      // El mismo candado que el pago a mensajero: serializa contra un reparto simultaneo del cierre.
      await this.cierres.bloquearBeneficiario(tx, { tipo: "cierre", cierreId: cierre.id });
      const vigente = await this.cierres.obtenerCierreParaPago(cierre.id, tx);
      if (vigente === null || vigente.estado !== "aprobado") return { status: "sin_cierre_aprobado" as const };

      // La CAJA PRIMERO: su clave de idempotencia es la barrera del doble envio (R10). Sin fila
      // escrita no se escribe nada mas.
      const enCaja = await this.caja.emitirEgreso(tx, {
        incentivoId: id,
        monto: input.monto,
        descripcion,
        registradoPor: actor.usuarioId,
        fechaMovimiento,
        claveIdempotencia: input.claveIdempotencia,
      });
      if (enCaja === 0) return { status: "ya_registrado" as const };

      const enLibro = await this.libro.crearMovimientos(tx, [
        {
          id,
          mensajeroId: input.mensajeroId,
          tipo: "devengo",
          categoria: "incentivo",
          monto: input.monto,
          origenTipo: "cierre_dia", // Q1: cuelga del cierre para ser pagable
          origenId: cierre.id,
          descripcion,
          registradoPor: actor.usuarioId,
          ...(fechaMovimiento !== undefined ? { fechaMovimiento } : {}),
        },
      ]);
      // R11: el egreso ya esta escrito; sin su devengo la transaccion entera se revierte.
      if (enLibro === 0) {
        throw new Error(`incentivo-mensajero: el egreso del incentivo ${id} se escribio pero su devengo no`);
      }
      return { status: "ok" as const };
    });
    if (escrito.status !== "ok") return escrito;

    const agregado = await this.libro.agregarCuentaPorPagar(input.mensajeroId, {});
    return {
      status: "ok",
      incentivo: { id, monto: input.monto, cierreId: cierre.id, mensajeroNombre },
      cuentaPorPagar: derivarCuentaPorPagar(agregado.devengado, agregado.pagado).cuentaPorPagar,
    };
  }

  async anular(input: AnularIncentivoMensajeroInput, actor: Actor): Promise<AnularIncentivoMensajeroResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R1: antes de leer nada

    const incentivo = await this.libro.obtenerIncentivo(input.incentivoId);
    if (incentivo === null) return { status: "no_encontrado" }; // R4
    if (incentivo.anulado) return { status: "ya_anulado" }; // R15
    // Q2: no hay guarda de «ya pagado». Anular uno pagado deja la cuenta por pagar en negativo.

    const descripcion = `Anulación del incentivo · ${input.motivo}`;
    return this.runTransaction(async (tx) => {
      await this.cierres.bloquearBeneficiario(tx, { tipo: "cierre", cierreId: incentivo.cierreId });

      // El unico de origen admite UN `reverso_incentivo` por incentivo: el segundo escribe 0 (R15).
      const enLibro = await this.libro.crearMovimientos(tx, [
        {
          mensajeroId: incentivo.mensajeroId,
          tipo: "pago",
          categoria: "reverso_incentivo",
          monto: incentivo.monto,
          origenTipo: "incentivo_mensajero",
          origenId: incentivo.id,
          descripcion,
          registradoPor: actor.usuarioId,
        },
      ]);
      if (enLibro === 0) return { status: "ya_anulado" as const };

      const enCaja = await this.caja.reversarEgreso(tx, {
        incentivoId: incentivo.id,
        monto: incentivo.monto,
        descripcion,
        registradoPor: actor.usuarioId,
      });
      // R11: el contraasiento del libro ya esta escrito; sin el de la caja se revierte todo.
      if (enCaja === 0) {
        throw new Error(`incentivo-mensajero: el reverso del incentivo ${incentivo.id} se escribio pero el de su caja no`);
      }
      return { status: "ok" as const };
    });
  }
}

/** Q1 — el cierre aprobado mas reciente: `solicitadoAt` descendente y, a igualdad, el mayor `id`. */
export function cierreMasReciente(cierres: readonly CierreImputableDTO[]): CierreImputableDTO | null {
  let elegido: CierreImputableDTO | null = null;
  for (const c of cierres) {
    if (c.estado !== "aprobado") continue;
    if (
      elegido === null ||
      c.solicitadoAt > elegido.solicitadoAt ||
      (c.solicitadoAt === elegido.solicitadoAt && c.id > elegido.id)
    ) {
      elegido = c;
    }
  }
  return elegido;
}
