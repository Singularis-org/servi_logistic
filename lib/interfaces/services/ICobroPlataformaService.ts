import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FijarCobroResult, VerCobroGlobalResult } from "@/lib/types/cobro-plataforma";

// SL-40 (design §5, §6) — la configuración del cobro por orden. Solo el superadmin.

export interface ICobroPlataformaService {
  /** El valor global vigente, o `monto: null` si no hay. `forbidden` sin leer nada (R6, R9). */
  verGlobal(actor: Actor | null): Promise<VerCobroGlobalResult>;
  /** Valida y fija el valor global (R1, R4, R6). La entrada llega sin tipar desde el borde. */
  fijarGlobal(actor: Actor | null, input: unknown): Promise<FijarCobroResult>;
  /** Valida y fija o quita la excepción de una empresa (R2, R4–R7). */
  fijarDeEmpresa(actor: Actor | null, input: unknown): Promise<FijarCobroResult>;
}
