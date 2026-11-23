import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EstadoMora } from "@/lib/planes/mora";
import type { DarPlazoResult, FijarGraciaResult, MoraDeEmpresaResult, QuitarPlazoResult } from "@/lib/types/mora";

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
  /**
   * SLT-255 R2-R4, R6: da plazo `{ organizacionId, motivo, hasta }`. Congelada, la descongela; si no, prórroga.
   */
  darPlazo(actor: Actor | null, input: unknown): Promise<DarPlazoResult>;
  /** SLT-255 R5, R6: quita la prórroga vigente `{ organizacionId, motivo }`. */
  quitarPlazo(actor: Actor | null, input: unknown): Promise<QuitarPlazoResult>;
}
