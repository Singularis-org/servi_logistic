"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { ICobroPlataformaService } from "@/lib/interfaces/services/ICobroPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { CobroPlataformaService } from "@/lib/services/CobroPlataformaService";
import type { FijarCobroResult, VerCobroGlobalResult } from "@/lib/types/cobro-plataforma";

// SL-40 (design §5, §9.1) — el borde de la configuración del cobro por orden. Lo usa la pantalla
// «Empresas» del superadmin. El actor sale de la sesión y la autorización la decide el servicio
// (R6), antes de tocar la base.

/** Inyección para los tests del borde. */
export interface CobroPlataformaDeps {
  readonly service?: ICobroPlataformaService;
  readonly getActor?: () => Promise<Actor | null>;
}

/** El composition root: el servicio con su repositorio real sobre el cliente de la app. */
function construirServicio(): ICobroPlataformaService {
  return new CobroPlataformaService(new CobroPlataformaTarifaRepository(getPrismaClient()));
}

async function conServicio<T>(deps: CobroPlataformaDeps, fn: (s: ICobroPlataformaService, a: Actor | null) => Promise<T>): Promise<T> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirServicio(), actor);
}

/** @sin-superficie SL-40 T5 (tanda B): la lee la página «Empresas» en T8, que quita esta anotación al cablearla. */
export async function verCobroGlobalAction(deps: CobroPlataformaDeps = {}): Promise<VerCobroGlobalResult> {
  return conServicio(deps, (s, actor) => s.verGlobal(actor));
}

/** @sin-superficie SL-40 T5 (tanda B): la llama el bloque «Cobro por orden» de «Empresas» en T8, que quita esta anotación al cablearla. */
export async function fijarCobroGlobalAction(input: unknown, deps: CobroPlataformaDeps = {}): Promise<FijarCobroResult> {
  return conServicio(deps, (s, actor) => s.fijarGlobal(actor, input));
}

/** @sin-superficie SL-40 T5 (tanda B): la llama la columna «Cobro por orden» de «Empresas» en T8, que quita esta anotación al cablearla. */
export async function fijarCobroEmpresaAction(input: unknown, deps: CobroPlataformaDeps = {}): Promise<FijarCobroResult> {
  return conServicio(deps, (s, actor) => s.fijarDeEmpresa(actor, input));
}
