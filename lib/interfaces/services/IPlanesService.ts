import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ListarPlanesAsignablesResult, PlanDTO, PlanResult } from "@/lib/types/planes";

// SL-24 (design §5; R1–R17, R37–R40) — la gestión de planes. Solo el superadmin, salvo
// `planesPublicos`, que no tiene actor y no se expone en ninguna action (R7, para SL-25). La entrada
// llega sin tipar desde el borde y la valida el servicio.

export interface IPlanesService {
  crear(actor: Actor | null, input: unknown): Promise<PlanResult>;
  /** De inmediato (`vigenteDesde: null`) o programada (R37, T11). */
  editar(actor: Actor | null, input: unknown): Promise<PlanResult>;
  archivar(actor: Actor | null, input: unknown): Promise<PlanResult>;
  asignar(actor: Actor | null, input: unknown): Promise<PlanResult>;
  cancelarCambio(actor: Actor | null, input: unknown): Promise<PlanResult>;
  asignables(actor: Actor | null, input: unknown): Promise<ListarPlanesAsignablesResult>;
  planesPublicos(): Promise<PlanDTO[]>;
}
