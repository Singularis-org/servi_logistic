import type { FormatoMoneda } from "@/lib/config/moneda";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type {
  CambiarDisponibilidadPaisInput,
  EtiquetasGeograficas,
  PaisDisponibleDTO,
  PaisDTO,
} from "@/lib/types/pais";

// SL-20 (design §5) — los países del superadmin y, desde SLT-235, los datos del país para las pantallas
// de una empresa.
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

/** Enmienda 2026-10-26, decisión 6 (R47): `ok` también cuando el país ya estaba así (sin escribir). */
export type CambiarDisponibilidadPaisServiceResult =
  | { status: "ok"; id: string; disponible: boolean }
  | { status: "not_found" }
  | { status: "forbidden" };

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
   * R47 y R37: el rol antes de tocar la base; `not_found` si el país no existe. La entrada llega ya
   * validada por la action (`cambiarDisponibilidadPaisSchema`).
   */
  cambiarDisponible(
    input: CambiarDisponibilidadPaisInput,
    actor: Actor,
  ): Promise<CambiarDisponibilidadPaisServiceResult>;

  /**
   * SLT-235 (R1, R3, R4, R7; design §5): los nombres de nivel (SL-20 R19), la moneda y el nombre del
   * impuesto del país de la empresa, de una sola lectura memorizada. Lo llama el layout con la empresa
   * de la sesión; sin empresa (el superadmin) no se llama (R2). Si la empresa no tiene país visible,
   * lanza: quien llama decide la caída (`paisParaPantallasDelActor`).
   */
  paraPantallas(organizacionId: string): Promise<PaisParaPantallas>;
}

/**
 * SLT-235 (design §5) — lo que las pantallas del portal necesitan del país de la empresa. Si al país
 * le falta moneda o impuesto, aquí ya llegan los de la plataforma (R3, R4).
 */
export interface PaisParaPantallas {
  etiquetas: EtiquetasGeograficas;
  moneda: FormatoMoneda;
  impuestoNombre: string;
}
