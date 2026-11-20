"use server";

import { construirMiPlanCambioService } from "@/lib/actions/_shared/mi-plan";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { IMiPlanCambioService } from "@/lib/interfaces/services/IMiPlanCambioService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { CambiarMiPlanResult, CancelarCambioMiPlanResult } from "@/lib/types/planes";

// SLT-99 (design §4) — el borde del cambio de plan del maestro. El actor sale de la sesión y la autorización la
// decide el servicio (R1) antes de tocar la base; la empresa es la del actor, nunca la del cliente (R2). Núcleo
// en `lib/modulos/reparto.ts`, como la ruta. No revalida la ruta: la guardia de SLT-91 R10 prohíbe nombrarla
// fuera del menú, el reparto y la página, así que el cliente refresca con `router.refresh()`.

/** Inyección para los tests del borde. */
export interface MiPlanDeps {
  readonly service?: IMiPlanCambioService;
  readonly getActor?: () => Promise<Actor | null>;
}

async function conServicio<T>(deps: MiPlanDeps, fn: (s: IMiPlanCambioService, actor: Actor | null) => Promise<T>): Promise<T> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirMiPlanCambioService(), actor);
}

/**
 * R11–R15, R18: el maestro pide `{ planId }`; queda pendiente para el corte de su empresa.
 */
export async function cambiarMiPlanAction(input: unknown, deps: MiPlanDeps = {}): Promise<CambiarMiPlanResult> {
  return conServicio(deps, (s, actor) => s.cambiarPlan(actor, input));
}

/**
 * R16: «Cancelar cambio» del pendiente de su empresa, sea de quien sea (P3). `input` es `{}`.
 */
export async function cancelarCambioMiPlanAction(input: unknown, deps: MiPlanDeps = {}): Promise<CancelarCambioMiPlanResult> {
  return conServicio(deps, (s, actor) => s.cancelarCambio(actor, input));
}
