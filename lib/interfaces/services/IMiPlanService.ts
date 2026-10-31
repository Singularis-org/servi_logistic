import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { MiPlanResult } from "@/lib/types/consumo-plan";

// SLT-58 (design §3.1; R1–R9) — «Mi plan»: lo que la empresa del actor ve de su plan. Solo lectura (R11).

export interface IMiPlanService {
  /**
   * `forbidden` sin leer la base si no es `maestro` ni `admin` (R8). No recibe empresa: es la de la
   * sesión (R9).
   */
  ver(actor: Actor | null): Promise<MiPlanResult>;
}
