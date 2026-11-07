import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";
import type {
  CambiarDisponibilidadPaisInput,
  EtiquetasGeograficas,
  PaisDisponibleDTO,
  PaisDTO,
} from "@/lib/types/pais";

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

/**
 * SLT-46 (R25, R26): `ok` también cuando los nombres ya eran esos (`sin_cambio`, sin escribir). Sin
 * `conflict`: el nombre de un tipo no es único.
 */
export type RenombrarTipoNivelServiceResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };

/**
 * SLT-46 (P3; R48, R49): `tipo` es el tipo creado al final. El tope (10 tipos) es `validation_error`
 * en `paisId`. La carrera de dos altas de nivel no aparece aquí: el único sube y la action lo hace
 * `conflict`.
 */
export type AgregarNivelPaisServiceResult =
  | { status: "ok"; tipo: TipoNivelDTO }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };

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

  /**
   * R23, R24 y R37/R39: el rol antes de validar y de tocar la base; el código y el nombre normalizado,
   * únicos. SLT-46: la entrada es `{ id, tipos }` (`crearPaisConTiposSchema`, 2–10 tipos).
   */
  crear(input: unknown, actor: Actor): Promise<CrearPaisServiceResult>;

  /** SLT-46 (R25, R26, R39): renombra un tipo de nivel (`renombrarTipoNivelSchema`). */
  renombrarTipo(input: unknown, actor: Actor): Promise<RenombrarTipoNivelServiceResult>;

  /** SLT-46 (P3; R48, R49, R39): agrega un nivel al final del país (`agregarNivelPaisSchema`). */
  agregarNivel(input: unknown, actor: Actor): Promise<AgregarNivelPaisServiceResult>;

  /**
   * R47 y R37: el rol antes de tocar la base; `not_found` si el país no existe. No mira los niveles
   * del país (SLT-46, R28). La entrada llega ya
   * validada por la action (`cambiarDisponibilidadPaisSchema`).
   */
  cambiarDisponible(
    input: CambiarDisponibilidadPaisInput,
    actor: Actor,
  ): Promise<CambiarDisponibilidadPaisServiceResult>;

  /**
   * R19: cómo llama a sus niveles el país de la empresa. Lo llama el layout con la empresa de la
   * sesión; sin empresa (el superadmin) el layout usa `ETIQUETAS_NEUTRAS` y no llama aquí.
   */
  etiquetasDeEmpresa(organizacionId: string): Promise<EtiquetasGeograficas>;
}
