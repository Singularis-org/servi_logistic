import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FijarCobroResult, VerCobroGlobalResult } from "@/lib/types/cobro-plataforma";

// SL-40 (design §5, §6) — la configuración del cobro por orden. Solo el superadmin. SLT-126 (R2):
// solo el valor global; el cobro de cada empresa sale de su plan o del global.

export interface ICobroPlataformaService {
  /** El valor global vigente, o `monto: null` si no hay. `forbidden` sin leer nada (R6, R9). */
  verGlobal(actor: Actor | null): Promise<VerCobroGlobalResult>;
  /** Valida y fija el valor global (R1, R4, R6). La entrada llega sin tipar desde el borde. */
  fijarGlobal(actor: Actor | null, input: unknown): Promise<FijarCobroResult>;
}
