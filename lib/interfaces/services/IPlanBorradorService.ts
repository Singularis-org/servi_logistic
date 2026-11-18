import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  BorradoresResult,
  ConfirmarBorradorResult,
  DescartarBorradorResult,
  GuardarPasoResult,
  LeerBorradorResult,
} from "@/lib/types/plan-borrador";

// SLT-129 (design §4, §5.2) — el borrador de planes del superadmin. Cualquier otro rol: `forbidden` sin tocar la
// base (R1). La entrada llega sin tipar desde el borde y la valida el servicio.

export interface IPlanBorradorService {
  /** R2–R8: guarda un paso; sin borrador, un plan nuevo empieza por General. */
  guardarPaso(actor: Actor | null, input: unknown): Promise<GuardarPasoResult>;
  /** R9: `{ borradorId }` o `{ planId }`; `borrador: null` si no hay. */
  leer(actor: Actor | null, input: unknown): Promise<LeerBorradorResult>;
  /** R10: la lista, para la página (sin action). */
  borradores(actor: Actor | null): Promise<BorradoresResult>;
  /** R14: `{ borradorId }`. */
  descartar(actor: Actor | null, input: unknown): Promise<DescartarBorradorResult>;
  /** R16–R20: `{ borradorId }`; crea o edita por `PlanesService`, con sus reglas de hoy. */
  confirmar(actor: Actor | null, input: unknown): Promise<ConfirmarBorradorResult>;
}
