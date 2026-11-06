import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  CambiarTipoCobroResult,
  CancelarCambioEmpresaResult,
  CatalogoResult,
  DetallePlanResult,
  ListarPlanesAsignablesResult,
  PlanDTO,
  PlanDeEmpresaResult,
  PlanResult,
  VistaPreviaAsignacionResult,
  VistaPreviaCustomResult,
} from "@/lib/types/planes";

// SL-24 (design §5; R1–R17, R37–R40) — la gestión de planes. Solo el superadmin, salvo
// `planesPublicos`, que no tiene actor y no se expone en ninguna action (R7, para SL-25). La entrada
// llega sin tipar desde el borde y la valida el servicio.
//
// SLT-58 (design §3.2) — las lecturas de las pantallas del superadmin. Las llaman las páginas de
// servidor, que ya resolvieron el actor; no hay action de lectura. Cualquier otro rol: `forbidden` sin
// leer nada (R22). La excepción es la vista previa de la primera asignación (§11.4), que sí tiene action.

export interface IPlanesService {
  crear(actor: Actor | null, input: unknown): Promise<PlanResult>;
  /**
   * De inmediato (`vigenteDesde: null`) o programada (R37, T11). SLT-86 (R22): un cambio de costo base o de
   * descuento lleva fecha `≥ hoy`; la de hoy se aplica en el acto.
   */
  editar(actor: Actor | null, input: unknown): Promise<PlanResult>;
  archivar(actor: Actor | null, input: unknown): Promise<PlanResult>;
  /**
   * SLT-58 (R29–R31, R36, R42): `inicioCiclo` opcional, solo en la primera asignación. SLT-86 (R16):
   * `vigenteDesde` obligatorio en un cambio a una empresa con plan; con fecha futura queda pendiente.
   */
  asignar(actor: Actor | null, input: unknown): Promise<PlanResult>;
  /** SLT-58 (R37): `{ organizacionId, planId, inicioCiclo }`; solo lee. */
  previsualizarAsignacion(actor: Actor | null, input: unknown): Promise<VistaPreviaAsignacionResult>;
  /** Ajuste planes-custom (D13): `{ organizacionId, inicioCiclo, topes }`; solo lee. */
  previsualizarCustom(actor: Actor | null, input: unknown): Promise<VistaPreviaCustomResult>;
  /**
   * Ajuste planes-custom (D10): `{ organizacionId, tipoCobro, vigenteDesde }`; solo el tipo de cobro del
   * plan actual, desde la fecha de efecto (SLT-86 R16, R17).
   */
  cambiarTipoCobro(actor: Actor | null, input: unknown): Promise<CambiarTipoCobroResult>;
  /** SLT-86 (R19, R26): `{ organizacionId }`; cancela el cambio pendiente de la empresa. */
  cancelarCambioEmpresa(actor: Actor | null, input: unknown): Promise<CancelarCambioEmpresaResult>;
  cancelarCambio(actor: Actor | null, input: unknown): Promise<PlanResult>;
  asignables(actor: Actor | null, input: unknown): Promise<ListarPlanesAsignablesResult>;
  planesPublicos(): Promise<PlanDTO[]>;
  /** SLT-58 R13: todos los planes, también los archivados. */
  catalogo(actor: Actor | null): Promise<CatalogoResult>;
  /** SLT-58 R16: `{ planId }`; no uuid → `validation_error`, inexistente → `not_found` (R22). */
  detallePlan(actor: Actor | null, input: unknown): Promise<DetallePlanResult>;
  /** SLT-58 R19, R21: `{ organizacionId }`. */
  planDeEmpresa(actor: Actor | null, input: unknown): Promise<PlanDeEmpresaResult>;
}
