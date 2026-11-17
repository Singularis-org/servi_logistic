"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IPlanBorradorService } from "@/lib/interfaces/services/IPlanBorradorService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { PlanBorradorService } from "@/lib/services/PlanBorradorService";
import { PlanesService } from "@/lib/services/PlanesService";
import type {
  ConfirmarBorradorResult,
  DescartarBorradorResult,
  GuardarPasoResult,
  LeerBorradorResult,
} from "@/lib/types/plan-borrador";

// SLT-129 (design §4) — el borde del borrador de planes del superadmin, para SLT-144. El actor sale de la sesión y
// la autorización la decide el servicio (R1). De plataforma: va al núcleo en `lib/modulos/reparto.ts`.

/** Inyección para los tests del borde. */
export interface PlanBorradorDeps {
  readonly service?: IPlanBorradorService;
  readonly getActor?: () => Promise<Actor | null>;
}

/** El composition root: el mismo repositorio para los borradores y para crear o editar al confirmar. */
function construirPlanBorradorService(): IPlanBorradorService {
  const repo = new PlanesRepository(getPrismaClient());
  return new PlanBorradorService(repo, new PlanesService(repo));
}

async function conServicio<T>(
  deps: PlanBorradorDeps,
  fn: (s: IPlanBorradorService, actor: Actor | null) => Promise<T>,
): Promise<T> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirPlanBorradorService(), actor);
}

/** R2–R8: guarda un paso de un borrador de creación o del borrador de cambio de un plan. */
export async function guardarPasoBorradorAction(input: unknown, deps: PlanBorradorDeps = {}): Promise<GuardarPasoResult> {
  return conServicio(deps, (s, actor) => s.guardarPaso(actor, input));
}

/** R9: `{ borradorId }` o `{ planId }`; lectura, como `previsualizarAsignacionAction` (la lista no tiene action). */
export async function leerBorradorAction(input: unknown, deps: PlanBorradorDeps = {}): Promise<LeerBorradorResult> {
  return conServicio(deps, (s, actor) => s.leer(actor, input));
}

/** R14: `{ borradorId }`. */
export async function descartarBorradorAction(input: unknown, deps: PlanBorradorDeps = {}): Promise<DescartarBorradorResult> {
  return conServicio(deps, (s, actor) => s.descartar(actor, input));
}

/** R16–R20: `{ borradorId }`; «Crear plan» o «Programar cambios». */
export async function confirmarBorradorAction(input: unknown, deps: PlanBorradorDeps = {}): Promise<ConfirmarBorradorResult> {
  return conServicio(deps, (s, actor) => s.confirmar(actor, input));
}
