import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { CambiosZonaEspecial } from "@/lib/types/distrito-zona-especial";

// SL-38 (design §3) — el contrato del servicio que guarda la marca de zona especial de la empresa.
//
// `unauthenticated` no aparece: lo resuelve la Server Action antes de llamar al servicio, igual que
// en `IGeografiaService`.

export type ActualizarDistritosEspecialesServiceResult =
  /** `actualizados` = marcas creadas + marcas borradas, solo las efectivas (R9). */
  | { status: "ok"; actualizados: number }
  /** Un id en las dos listas, o un id de `marcar` que no es un distrito (R12, R13). */
  | { status: "validation_error" }
  /** Cualquier rol que no sea `maestro`, el superadmin incluido: la marca es de una empresa (R11). */
  | { status: "forbidden" };

export interface IDistritoZonaEspecialService {
  actualizar(
    cambios: CambiosZonaEspecial,
    actor: Actor,
  ): Promise<ActualizarDistritosEspecialesServiceResult>;
}
