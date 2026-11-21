import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EstadoMora } from "@/lib/planes/mora";
import type { DescongelarResult, FijarGraciaResult, MoraDeEmpresaResult } from "@/lib/types/mora";

// SLT-121 (design §5.3) — la mora de una empresa. La autorización vive aquí: el banner es de `maestro` y `admin`
// (R24); lo demás, del superadmin (R4). Un actor sin permiso recibe su respuesta antes de que se lea nada. La
// entrada llega sin tipar desde la action y se valida después de la autorización.

export interface IMoraEmpresaService {
  /** R24: el estado del banner de la empresa de la sesión; `null` sin leer nada para cualquier otro rol. */
  avisoDeMiEmpresa(actor: Actor | null): Promise<EstadoMora | null>;
  /** R31, R32: la gracia, el estado, las facturas con saldo y el historial de `{ organizacionId }`. */
  moraDeEmpresa(actor: Actor | null, input: unknown): Promise<MoraDeEmpresaResult>;
  /** R3, R5: fija `{ organizacionId, dias }` (1–60) o la quita con `dias: null`. */
  fijarGracia(actor: Actor | null, input: unknown): Promise<FijarGraciaResult>;
  /** R22: descongela a mano `{ organizacionId, motivo, hasta }`. */
  descongelar(actor: Actor | null, input: unknown): Promise<DescongelarResult>;
}
