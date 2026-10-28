"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { ListarPlanesAsignablesResult, PlanResult } from "@/lib/types/planes";

// SL-24 (design §5, §16.5) — el borde de la gestión de planes del superadmin. El actor sale de la
// sesión y la autorización la decide el servicio (R5), antes de tocar la base. Es de plataforma, así
// que no lleva puerta de módulo: va al núcleo en `lib/modulos/reparto.ts`. Sin pantalla todavía: la
// monta SL-26. Los planes públicos (R7) NO se exponen aquí: son una lectura de servidor para SL-25.

/** Inyección para los tests del borde. */
export interface PlanesDeps {
  readonly service?: IPlanesService;
  readonly getActor?: () => Promise<Actor | null>;
}

/** El composition root: el servicio con su repositorio real. No exportado: un "use server" solo exporta actions. */
function construirPlanesService(): IPlanesService {
  return new PlanesService(new PlanesRepository(getPrismaClient()));
}

async function conServicio<T>(deps: PlanesDeps, fn: (s: IPlanesService, actor: Actor | null) => Promise<T>): Promise<T> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirPlanesService(), actor);
}

/**
 * Crea un plan público o custom (R1–R3).
 * @sin-superficie SL-24 (decisión «Pantalla», 2026-10-27): esta ficha es solo backend; la pantalla que la dispara es la de planes del superadmin de SL-26.
 */
export async function crearPlanAction(input: unknown, deps: PlanesDeps = {}): Promise<PlanResult> {
  return conServicio(deps, (s, actor) => s.crear(actor, input));
}

/**
 * Edita un plan: de inmediato con `vigenteDesde: null` (R15–R17), o programado con una fecha (R37).
 * @sin-superficie SL-24 (decisión «Pantalla», 2026-10-27): esta ficha es solo backend; la pantalla que la dispara es la de planes del superadmin de SL-26.
 */
export async function editarPlanAction(input: unknown, deps: PlanesDeps = {}): Promise<PlanResult> {
  return conServicio(deps, (s, actor) => s.editar(actor, input));
}

/**
 * Archiva un plan y cancela su cambio pendiente (R6, R40).
 * @sin-superficie SL-24 (decisión «Pantalla», 2026-10-27): esta ficha es solo backend; la pantalla que la dispara es la de planes del superadmin de SL-26.
 */
export async function archivarPlanAction(input: unknown, deps: PlanesDeps = {}): Promise<PlanResult> {
  return conServicio(deps, (s, actor) => s.archivar(actor, input));
}

/**
 * Asigna o cambia el plan de una empresa (R9–R13).
 * @sin-superficie SL-24 (decisión «Pantalla», 2026-10-27): esta ficha es solo backend; la pantalla que la dispara es la de planes del superadmin de SL-26.
 */
export async function asignarPlanAction(input: unknown, deps: PlanesDeps = {}): Promise<PlanResult> {
  return conServicio(deps, (s, actor) => s.asignar(actor, input));
}

/**
 * Los planes que se le pueden asignar a una empresa (R7).
 * @sin-superficie SL-24 (decisión «Pantalla», 2026-10-27): esta ficha es solo backend; la pantalla que la dispara es la de planes del superadmin de SL-26.
 */
export async function listarPlanesAsignablesAction(
  input: unknown,
  deps: PlanesDeps = {},
): Promise<ListarPlanesAsignablesResult> {
  return conServicio(deps, (s, actor) => s.asignables(actor, input));
}

/**
 * Cancela el cambio programado pendiente de un plan (R39).
 * @sin-superficie SL-24 (decisión «Pantalla», 2026-10-27): esta ficha es solo backend; la pantalla que la dispara es la de planes del superadmin de SL-26.
 */
export async function cancelarCambioPlanAction(input: unknown, deps: PlanesDeps = {}): Promise<PlanResult> {
  return conServicio(deps, (s, actor) => s.cancelarCambio(actor, input));
}
