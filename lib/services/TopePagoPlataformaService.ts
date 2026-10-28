import { Prisma } from "@prisma/client";

import type { ICobroPlataformaMovimientoRepository } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IPagoPlataformaRepository } from "@/lib/interfaces/repositories/IPagoPlataformaRepository";
import type {
  ComprobarTopeInput,
  ITopePagoPlataforma,
  ResultadoTopePagoPlataforma,
  TopePagoPlataformaTx,
} from "@/lib/interfaces/services/ITopePagoPlataformaService";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

// SL-45 (design §6) — el tope del pago a la plataforma. El molde del candado es
// `AporteCapitalService` con `bloquearSaldoInicial`: candado primero, lectura después, todo con `tx`.

export class TopePagoPlataformaService implements ITopePagoPlataforma {
  constructor(
    private readonly cargos: ICobroPlataformaMovimientoRepository,
    private readonly pagos: IPagoPlataformaRepository,
  ) {}

  async comprobar(tx: TopePagoPlataformaTx, input: ComprobarTopeInput): Promise<ResultadoTopePagoPlataforma> {
    // R10: el candado ANTES de leer. El segundo pago espera aquí al COMMIT del primero, y entonces
    // lee la deuda con el primero ya restado.
    await this.pagos.bloquear(tx);
    // R11: la clave se mira DESPUÉS del candado. Si se mirara antes, un reenvío simultáneo al
    // original pasaría la mirada, esperaría el candado y chocaría con el tope en vez de responder
    // `ya_registrado`.
    if (await this.pagos.claveYaRegistrada(input.organizacionId, input.claveIdempotencia, tx)) return "reenvio";

    // Una tras otra: las dos van por la misma conexión de la transacción.
    const sumas = await this.cargos.sumasPorTipo(input.organizacionId, tx);
    const pagosVigentes = await this.pagos.sumaPagosVigentes(input.organizacionId, tx);
    const { deuda, estado } = derivarDeudaPlataforma(sumas, pagosVigentes);
    // R9: sin deuda no se paga, y nunca más de lo que se debe. Igual a la deuda, cabe.
    if (estado !== "debe") return "supera";
    return new Prisma.Decimal(input.monto).lte(new Prisma.Decimal(deuda)) ? "cabe" : "supera";
  }
}
