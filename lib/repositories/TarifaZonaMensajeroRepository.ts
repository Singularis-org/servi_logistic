import type {
  ITarifaZonaMensajeroRepository,
  PagoTarifa,
} from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import {
  resolvePagoTarifaCon,
  resolverPagosCon,
  type ClientePagos,
} from "@/lib/repositories/_shared/resolver-tarifas";
import type { ContextoPagoGestion, TarifaPago } from "@/lib/types/tarifa-flexible";

// FICHA 398: `CierresAdminRepository` importa `resolvePagoTarifaCon` desde aqui. SLT-52 movio su
// cuerpo al resolver unico (`_shared/resolver-tarifas.ts`), que es quien decide el modelo; se
// reexporta para no tocar a ese llamador antes de T5.1.
export { resolvePagoTarifaCon };

/**
 * Feature 39 — resolver de la tarifa de pago al mensajero. SOLO queries Prisma.
 *
 * SLT-52 (design §5): es una FACHADA del resolver unico. Mismo constructor que antes (las raices de
 * composicion no cambian), con el tipo del cliente ampliado a los delegados del modelo nuevo: el
 * `prisma` que ya le pasan todas lo es.
 */
export class TarifaZonaMensajeroRepository implements ITarifaZonaMensajeroRepository {
  constructor(private readonly prisma: ClientePagos) {}

  async resolvePagoTarifa(
    zonaId: string,
    vehiculoId: string | null,
  ): Promise<PagoTarifa | null> {
    // FICHA 398: el cuerpo vive en `resolvePagoTarifaCon` para poder reusarlo sin instanciar esta
    // clase. Delegar (y no duplicar) es lo que impide que existan dos resoluciones de la tarifa.
    return resolvePagoTarifaCon(this.prisma.tarifaZonaMensajero, zonaId, vehiculoId);
  }

  /**
   * SLT-52 (R19-R22, R28, R36, R37, R39): el pago de N gestiones con el modelo de la empresa, en un
   * numero fijo de consultas. `tx` cuando el llamador esta dentro de su transaccion.
   */
  async resolvePagos(
    ctxs: readonly ContextoPagoGestion[],
    tx?: ClientePagos,
  ): Promise<Map<string, TarifaPago | null>> {
    return resolverPagosCon(tx ?? this.prisma, ctxs);
  }
}
