import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IMiPlanService } from "@/lib/interfaces/services/IMiPlanService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { MiPlanService } from "@/lib/services/MiPlanService";
import type { MiPlanResult } from "@/lib/types/consumo-plan";

// SLT-58 (design §3.1) — el composition root de «Mi plan». No es una Server Action (sin "use server"):
// la llama la página, que ya resolvió el actor de la sesión, y no hace falta exponer un endpoint de
// lectura. Patrón de `lib/actions/_shared/modulos-empresa.ts`.

/** El servicio con su repositorio real. */
export function construirMiPlanService(prisma = getPrismaClient()): IMiPlanService {
  return new MiPlanService(new MiPlanRepository(prisma));
}

/** El plan de la empresa de la sesión: `forbidden` sin leer nada si no es `maestro` ni `admin` (R8). */
export async function verMiPlan(
  actor: Actor | null,
  servicio: IMiPlanService = construirMiPlanService(),
): Promise<MiPlanResult> {
  return servicio.ver(actor);
}
