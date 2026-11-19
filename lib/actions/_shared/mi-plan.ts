import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IMiPlanCambioService } from "@/lib/interfaces/services/IMiPlanCambioService";
import type { IMiPlanService } from "@/lib/interfaces/services/IMiPlanService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { MiPlanCambioService } from "@/lib/services/MiPlanCambioService";
import { MiPlanService } from "@/lib/services/MiPlanService";
import type { MiPlanResult } from "@/lib/types/consumo-plan";
import type { PlanesDeMiPlanResult } from "@/lib/types/planes";

// SLT-58 (design §3.1) — el composition root de «Mi plan». No es una Server Action (sin "use server"):
// la llama la página, que ya resolvió el actor de la sesión, y no hace falta exponer un endpoint de
// lectura. Patrón de `lib/actions/_shared/modulos-empresa.ts`. SLT-99 (design §4) suma el servicio del cambio
// de plan, que también usan las actions de `lib/actions/mi-plan.ts`.

/** El servicio con su repositorio real. */
export function construirMiPlanService(prisma = getPrismaClient()): IMiPlanService {
  return new MiPlanService(new MiPlanRepository(prisma));
}

/** El plan de la empresa de la sesión: `forbidden` sin leer nada si no es `maestro` (SLT-91 R2). */
export async function verMiPlan(
  actor: Actor | null,
  servicio: IMiPlanService = construirMiPlanService(),
): Promise<MiPlanResult> {
  return servicio.ver(actor);
}

/** SLT-99: el servicio del cambio de plan con su repositorio real. */
export function construirMiPlanCambioService(prisma = getPrismaClient()): IMiPlanCambioService {
  return new MiPlanCambioService(new PlanesRepository(prisma));
}

/** SLT-99 (R1, R5–R10, R16–R19): los planes de «Mi plan»; `forbidden` sin leer nada si no es `maestro`. */
export async function verPlanesDeMiPlan(
  actor: Actor | null,
  servicio: IMiPlanCambioService = construirMiPlanCambioService(),
): Promise<PlanesDeMiPlanResult> {
  return servicio.verPlanes(actor);
}
