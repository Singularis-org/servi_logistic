import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { CambiarMiPlanResult, CancelarCambioMiPlanResult, PlanesDeMiPlanResult } from "@/lib/types/planes";

// SLT-99 (design §4) — «Mi plan»: el maestro ve los planes disponibles y cambia el plan de su empresa. Ningún
// método recibe la empresa: es la de la sesión (R2). Cualquier otro actor, `forbidden` sin leer la base (R1).

export interface IMiPlanCambioService {
  /** R5, R7, R8, R10, R16–R19: los planes disponibles, el activo, el corte y el primer período de cada plan. */
  verPlanes(actor: Actor | null): Promise<PlanesDeMiPlanResult>;
  /** R11–R15, R18: `input` es exactamente `{ planId }`. */
  cambiarPlan(actor: Actor | null, input: unknown): Promise<CambiarMiPlanResult>;
  /** R16: `input` es exactamente `{}`. */
  cancelarCambio(actor: Actor | null, input: unknown): Promise<CancelarCambioMiPlanResult>;
}
