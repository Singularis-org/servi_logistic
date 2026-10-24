import { esAccesoTotal } from "@/lib/auth/acceso-total";
import type { ICobroPlataformaMovimientoRepository } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IDeudaPlataformaService, VerDeudaPlataformaResult } from "@/lib/interfaces/services/IDeudaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

// SL-40 (design §5, §6) — la deuda de la empresa con la plataforma. La ven los mismos que ven la caja
// (`esAccesoTotal`: maestro y admin), y no depende de los filtros del libro (R23).

export class DeudaPlataformaService implements IDeudaPlataformaService {
  constructor(private readonly movimientos: ICobroPlataformaMovimientoRepository) {}

  async verDeuda(actor: Actor | null): Promise<VerDeudaPlataformaResult> {
    // R25: la autorización va antes de la base. Un actor sin empresa (el superadmin) no tiene deuda
    // que ver, y se rechaza igual en vez de leer sin filtro.
    if (actor === null || !esAccesoTotal(actor.rol)) return { status: "forbidden" };
    const organizacionId = actor.organizacionId ?? null;
    if (organizacionId === null) return { status: "forbidden" };

    const sumas = await this.movimientos.sumasPorTipo(organizacionId);
    return { status: "ok", deudaPlataforma: { deuda: derivarDeudaPlataforma(sumas) } };
  }
}
