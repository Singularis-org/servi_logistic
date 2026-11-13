import { esAccesoTotal } from "@/lib/auth/acceso-total";
import type { ICobroPlataformaMovimientoRepository } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IPagoPlataformaRepository } from "@/lib/interfaces/repositories/IPagoPlataformaRepository";
import type { IDeudaPlataformaService, VerDeudaPlataformaResult } from "@/lib/interfaces/services/IDeudaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

// SL-40 (design §5, §6) — la deuda de la empresa con la plataforma. La ven los mismos que ven la caja
// (`esAccesoTotal`: maestro y admin), y no depende de los filtros del libro (R23).
// SL-45 (design §3): resta los pagos vigentes, que se leen del libro de la caja.
// SLT-60 (design §4.7; R6, R7): resta solo los pagos CONFIRMADOS por el superadmin. Un pago por confirmar
// ya bajó la caja, pero no la deuda.

export class DeudaPlataformaService implements IDeudaPlataformaService {
  constructor(
    private readonly movimientos: ICobroPlataformaMovimientoRepository,
    private readonly pagos: IPagoPlataformaRepository,
  ) {}

  async verDeuda(actor: Actor | null): Promise<VerDeudaPlataformaResult> {
    // R25: la autorización va antes de la base. Un actor sin empresa (el superadmin) no tiene deuda
    // que ver, y se rechaza igual en vez de leer sin filtro.
    if (actor === null || !esAccesoTotal(actor.rol)) return { status: "forbidden" };
    const organizacionId = actor.organizacionId ?? null;
    if (organizacionId === null) return { status: "forbidden" };

    const [sumas, pagosConfirmados] = await Promise.all([
      this.movimientos.sumasPorTipo(organizacionId),
      this.pagos.sumaPagosConfirmados(organizacionId),
    ]);
    return { status: "ok", deudaPlataforma: derivarDeudaPlataforma(sumas, pagosConfirmados) };
  }
}
