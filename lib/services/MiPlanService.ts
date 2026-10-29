import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import type { IMiPlanRepository } from "@/lib/interfaces/repositories/IMiPlanRepository";
import type { IMiPlanService } from "@/lib/interfaces/services/IMiPlanService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { planConConsumo } from "@/lib/planes/consumo";
import type { MiPlanResult } from "@/lib/types/consumo-plan";

// SLT-58 (design §3.1) — primero quién (R8) y solo después la base: ningún rol fuera de
// `ROLES_MI_PLAN`, ni el superadmin, ni una petición sin sesión llega al repositorio.

const FORBIDDEN: MiPlanResult = { estado: "forbidden" };

function puedeVerMiPlan(actor: Actor | null): actor is Actor {
  return actor !== null && (ROLES_MI_PLAN as readonly string[]).includes(actor.rol);
}

export class MiPlanService implements IMiPlanService {
  constructor(
    private readonly repo: IMiPlanRepository,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ver(actor: Actor | null): Promise<MiPlanResult> {
    if (!puedeVerMiPlan(actor)) return FORBIDDEN;
    const leido = await this.repo.planDeLaEmpresa();
    // R1–R7: el mismo armado que el detalle de empresa del superadmin (`lib/planes/consumo.ts`).
    return { estado: "ok", plan: leido === null ? null : planConConsumo(leido, this.ahora()) };
  }
}
