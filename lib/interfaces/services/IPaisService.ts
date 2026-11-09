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
 * SLT-46 (2026-11-09, design §4.7; R57, R61): el «antes» que mostró el modal ya no es el de la base.
 * Variante NUEVA de la unión: los `conflict` que ya existían (nombre de hermano, país repetido, la
 * carrera del único) no llevan `motivo` y no cambian de forma (R12). La pantalla, ante este motivo,
 * avisa y recarga. Nada se escribió.
 */
export type CambioConcurrenteResult = { status: "conflict"; motivo: "cambio_concurrente" };

/**
 * SLT-46 (R25, R26, R61): `ok` también cuando los nombres ya eran esos (`sin_cambio`, sin escribir).
 * El único `conflict` es el cambio concurrente: el nombre de un tipo no es único.
 */
export type RenombrarTipoNivelServiceResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | CambioConcurrenteResult;

/**
 * SLT-46 (P3; R48, R49, R61): `tipo` es el tipo creado al final. El tope (10 tipos) es
 * `validation_error` en `paisId`. Otra alta de nivel que ganó la carrera es cambio concurrente
 * (`profundidad` ya no es P+1); si aun así salta el único, sube y la action lo hace `conflict`.
 */
export type AgregarNivelPaisServiceResult =
  | { status: "ok"; tipo: TipoNivelDTO }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | CambioConcurrenteResult;

/**
 * SLT-46 (2026-11-09; R55–R57): `ok` también cuando el orden pedido es el actual (`sin_cambio`, sin
 * escribir). Lista mal formada (repetidos, menos de 2, más de 10) → `validation_error`; la lista ya no
 * es la del país o un nombre cambió → cambio concurrente.
 */
export type ReordenarTiposServiceResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | CambioConcurrenteResult;

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
   * únicos. SLT-46: la entrada es `{ id, tipos }` (`crearPaisSchema`, 2–10 tipos).
   */
  crear(input: unknown, actor: Actor): Promise<CrearPaisServiceResult>;

  /** SLT-46 (R25, R26, R39): renombra un tipo de nivel (`renombrarTipoNivelSchema`). */
  renombrarTipo(input: unknown, actor: Actor): Promise<RenombrarTipoNivelServiceResult>;

  /** SLT-46 (P3; R48, R49, R39): agrega un nivel al final del país (`agregarNivelPaisSchema`). */
  agregarNivel(input: unknown, actor: Actor): Promise<AgregarNivelPaisServiceResult>;

  /**
   * SLT-46 (2026-11-09; R39, R55–R57): el nuevo orden de los niveles de un país ya creado
   * (`reordenarTiposSchema`). El rol antes de validar y de tocar la base.
   */
  reordenarTipos(input: unknown, actor: Actor): Promise<ReordenarTiposServiceResult>;

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
