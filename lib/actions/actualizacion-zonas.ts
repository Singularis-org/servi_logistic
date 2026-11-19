"use server";

import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { toActionError } from "@/lib/actions/_shared/to-action-error";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { ForbiddenError, UnauthenticatedError, isAppErrorShape, withErrorHandler } from "@/lib/errors";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IActualizacionZonasService } from "@/lib/interfaces/services/IActualizacionZonasService";
import { ActualizacionZonasRepository } from "@/lib/repositories/ActualizacionZonasRepository";
import { ActualizacionZonasService } from "@/lib/services/ActualizacionZonasService";
import type {
  ActualizarZonasResult,
  VistaPreviaActualizacionZonasResult,
} from "@/lib/types/actualizacion-zonas";

// SLT-224 (design §3b.2, R1714-R1719) — el BORDE del boton «Actualizar zonas» de `/ordenes`. Patron
// `lib/actions/reprogramadas-retenidas.ts`: actor por sesion, autorizacion ANTES de instanciar el
// servicio (ocultar el boton no es la defensa), `withErrorHandler`, `toActionError` y `deps`
// inyectables para test sin DB ni cookies. Sin entrada del usuario: no hay nada que validar con zod.

export interface ActualizacionZonasDeps {
  service?: IActualizacionZonasService;
  getActor?: () => Promise<Actor | null>;
}

/** El composition root: el repositorio real sobre el cliente con la empresa de la sesion. */
function buildService(): IActualizacionZonasService {
  return new ActualizacionZonasService(new ActualizacionZonasRepository(getPrismaClient()));
}

/** R1714: sesion y rol (maestro o admin), antes de leer o escribir una sola orden. */
async function actorAutorizado(deps: ActualizacionZonasDeps): Promise<Actor> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) throw new UnauthenticatedError();
  if (!esAccesoTotal(actor.rol)) throw new ForbiddenError();
  return actor;
}

function rechazo(r: Parameters<typeof toActionError>[0]): { status: "unauthenticated" } | { status: "forbidden" } {
  const e = toActionError(r);
  if (e.status === "unauthenticated" || e.status === "forbidden") return e;
  // Sin entrada ni busqueda por id: cualquier otro codigo es un error interno real.
  throw new Error(`actualizacion-zonas: resultado inesperado ${e.status}`);
}

/**
 * R1715 — la vista previa: cuantas ordenes con zona errada de la empresa se actualizarian,
 * agrupadas por zona actual -> nueva, y las saltadas con su guia y motivo. NO escribe nada.
 *
 * @sin-superficie SLT-224 en curso: la monta el boton «Actualizar zonas» de la cabecera de /ordenes (tarea T9, pantalla); al montarlo esta anotacion caduca y se quita.
 */
export async function vistaPreviaActualizacionZonas(
  deps: ActualizacionZonasDeps = {},
): Promise<VistaPreviaActualizacionZonasResult> {
  const r = await withErrorHandler(async () => {
    await actorAutorizado(deps);
    const service = deps.service ?? buildService();
    return { status: "ok" as const, vistaPrevia: await service.vistaPrevia() };
  });
  return isAppErrorShape(r) ? rechazo(r) : r;
}

/**
 * R1717/R1718 — confirma: en UNA transaccion actualiza a la zona de su distrito toda orden con zona
 * errada que en ese momento no este saltada, con quien confirma como actor y un mismo lote. Devuelve
 * cuantas se actualizaron y las saltadas.
 *
 * @sin-superficie SLT-224 en curso: la monta el boton «Actualizar zonas» de la cabecera de /ordenes (tarea T9, pantalla); al montarlo esta anotacion caduca y se quita.
 */
export async function actualizarZonas(deps: ActualizacionZonasDeps = {}): Promise<ActualizarZonasResult> {
  const r = await withErrorHandler(async () => {
    const actor = await actorAutorizado(deps);
    const service = deps.service ?? buildService();
    return { status: "ok" as const, resultado: await service.actualizar(actor) };
  });
  return isAppErrorShape(r) ? rechazo(r) : r;
}
