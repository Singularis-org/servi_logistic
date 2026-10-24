import type { IDistritoZonaEspecialRepository } from "@/lib/interfaces/repositories/IDistritoZonaEspecialRepository";
import type {
  ActualizarDistritosEspecialesServiceResult,
  IDistritoZonaEspecialService,
} from "@/lib/interfaces/services/IDistritoZonaEspecialService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { CambiosZonaEspecial } from "@/lib/types/distrito-zona-especial";

// SL-38 (design §3) — guardar la marca de zona especial de la empresa desde Tarifas.
//
// Solo `maestro`. El superadmin tambien recibe `forbidden`: no tiene empresa, y la marca es de una.

export class DistritoZonaEspecialService implements IDistritoZonaEspecialService {
  constructor(private readonly repo: IDistritoZonaEspecialRepository) {}

  async actualizar(
    cambios: CambiosZonaEspecial,
    actor: Actor,
  ): Promise<ActualizarDistritosEspecialesServiceResult> {
    if (actor.rol !== "maestro") return { status: "forbidden" }; // R11

    const marcar = [...new Set(cambios.marcar)];
    const desmarcar = [...new Set(cambios.desmarcar)];
    // Un id en las dos listas es una orden contradictoria: se rechaza en vez de dejar que gane el
    // orden de las escrituras (R12).
    const enAmbas = new Set(desmarcar);
    if (marcar.some((id) => enAmbas.has(id))) return { status: "validation_error" };
    if (marcar.length === 0 && desmarcar.length === 0) return { status: "ok", actualizados: 0 };

    const r = await this.repo.aplicarCambios({ marcar, desmarcar });
    if (r.estado === "distrito_inexistente") return { status: "validation_error" }; // R13
    return { status: "ok", actualizados: r.creadas + r.borradas };
  }
}
