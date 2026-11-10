import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type {
  CambiarDisponibilidadPaisInput,
  EtiquetasGeograficas,
  PaisDeLaEmpresaParaUi,
  PaisDisponibleDTO,
  PaisDTO,
  PaisParaAltaDTO,
  TipoDocumentoDTO,
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
  /**
   * R23: el código o el nombre (normalizado) ya existen. `campo` dice cuál. SLT-81 (R6):
   * `tiposDocumento` si la base rechazó la clave o el `value` de un tipo en carrera.
   */
  | { status: "conflict"; campo: "id" | "nombre" | "tiposDocumento" };

type ValidationError = { status: "validation_error"; fieldErrors: Record<string, string[]> };

/** SLT-81 (R10, R11): `cambiado: false` = no había nada distinto y no se escribió. */
export type ActualizarDatosPaisServiceResult =
  | { status: "ok"; pais: PaisDTO; cambiado: boolean }
  /** R10: el cambio afecta a `empresas` empresas; se reenvía con `empresasConfirmadas` = ese número. */
  | { status: "requiere_confirmacion"; empresas: number }
  | ValidationError
  | { status: "not_found" }
  | { status: "forbidden" };

/** SLT-81 (R2): todos los tipos del país, activos e inactivos, por `orden`. */
export type ListarTiposDocumentoServiceResult = { status: "ok"; tipos: TipoDocumentoDTO[] } | { status: "forbidden" };

export type CrearTipoDocumentoServiceResult =
  | { status: "ok"; tipo: TipoDocumentoDTO }
  | ValidationError
  /** R9: el nombre (normalizado) ya existe en el país. */
  | { status: "conflict"; campo: "nombre" }
  | { status: "not_found" }
  | { status: "forbidden" };

export type EditarTipoDocumentoServiceResult =
  | { status: "ok"; tipo: TipoDocumentoDTO; cambiado: boolean }
  | ValidationError
  | { status: "conflict"; campo: "nombre" }
  | { status: "not_found" }
  | { status: "forbidden" };

export type CambiarActivoTipoDocumentoServiceResult =
  | { status: "ok"; tipo: TipoDocumentoDTO }
  /** También R15: el único activo del país, en `activo`. */
  | ValidationError
  | { status: "not_found" }
  | { status: "forbidden" };

/** SLT-81 (R20): los países del alta de empresa con su prefijo y sus tipos activos. */
export type ListarPaisesParaAltaServiceResult = { status: "ok"; paises: PaisParaAltaDTO[] } | { status: "forbidden" };

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

  // ── SLT-81: datos del país. Todos empiezan por el rol (R1) y validan su entrada aquí (R7–R9, R26). ──

  /**
   * R10–R12, R26, R8: prefijo, dígitos y zona. Con empresas en el país, exige `empresasConfirmadas`
   * igual al número de hoy; si no, `requiere_confirmacion` sin escribir.
   */
  actualizarDatos(input: unknown, actor: Actor): Promise<ActualizarDatosPaisServiceResult>;

  listarTiposDocumento(paisId: string, actor: Actor): Promise<ListarTiposDocumentoServiceResult>;

  /** R9, R13: la clave y el `value` salen del nombre y no cambian después. */
  crearTipoDocumento(input: unknown, actor: Actor): Promise<CrearTipoDocumentoServiceResult>;

  /** R9, R13, R14: nombre y regla; lo ya guardado con el tipo no se revalida. */
  editarTipoDocumento(input: unknown, actor: Actor): Promise<EditarTipoDocumentoServiceResult>;

  /** R13, R15: no se desactiva el único activo del país. */
  cambiarActivoTipoDocumento(input: unknown, actor: Actor): Promise<CambiarActivoTipoDocumentoServiceResult>;

  /** R20: solo la plataforma, igual que `listarDisponibles`. */
  listarDisponiblesParaAlta(actor: Actor): Promise<ListarPaisesParaAltaServiceResult>;

  /**
   * R19: cómo llama a sus niveles el país de la empresa. Lo llama el layout con la empresa de la
   * sesión; sin empresa (el superadmin) el layout usa `ETIQUETAS_NEUTRAS` y no llama aquí.
   */
  etiquetasDeEmpresa(organizacionId: string): Promise<EtiquetasGeograficas>;

  /**
   * SLT-81 (design §7.1; R18–R23): las etiquetas y la regla del teléfono del país de la empresa, con
   * la misma única lectura de `etiquetasDeEmpresa`. Lanza igual que ella si la empresa no tiene país.
   */
  paisDeLaEmpresaParaUi(organizacionId: string): Promise<PaisDeLaEmpresaParaUi>;
}
