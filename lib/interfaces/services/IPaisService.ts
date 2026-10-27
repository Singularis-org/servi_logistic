import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { EtiquetasGeograficas, PaisDisponibleDTO, PaisDTO } from "@/lib/types/pais";

// SL-20 (design §5) — los países del superadmin y los nombres de nivel de una empresa.
// `unauthenticated` no aparece: lo resuelve la Server Action antes de llamar al servicio.

export type ListarPaisesServiceResult = { status: "ok"; paises: PaisDTO[] } | { status: "forbidden" };

/** Enmienda 2026-10-26, decisión 6 (R9, R45): las opciones del `Select` de país del alta de empresa. */
export type ListarPaisesDisponiblesServiceResult =
  | { status: "ok"; paises: PaisDisponibleDTO[] }
  | { status: "forbidden" };

export type CrearPaisServiceResult =
  | { status: "ok"; pais: PaisDTO }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  /** R23: el código o el nombre (normalizado) ya existen. `campo` dice cuál. */
  | { status: "conflict"; campo: "id" | "nombre" };

export interface IPaisService {
  /** Solo la plataforma (R37). */
  listar(actor: Actor): Promise<ListarPaisesServiceResult>;

  /**
   * R9/R45: los países que se ofrecen en el alta de empresa (solo `disponible = true`, por nombre).
   * Solo la plataforma (R37), igual que el alta de empresa.
   */
  listarDisponibles(actor: Actor): Promise<ListarPaisesDisponiblesServiceResult>;

  /** R23 y R37: el rol antes de tocar la base; el código y el nombre normalizado, únicos. */
  crear(input: unknown, actor: Actor): Promise<CrearPaisServiceResult>;

  /**
   * R19: cómo llama a sus niveles el país de la empresa. Lo llama el layout con la empresa de la
   * sesión; sin empresa (el superadmin) el layout usa `ETIQUETAS_NEUTRAS` y no llama aquí.
   */
  etiquetasDeEmpresa(organizacionId: string): Promise<EtiquetasGeograficas>;
}
