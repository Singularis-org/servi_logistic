"use server";

import type { z } from "zod";

import { requestContextFromHeaders } from "@/lib/actions/_shared/contexto-peticion";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EnviarReporteBugServiceResult, IReporteBugService } from "@/lib/interfaces/services/IReporteBugService";
import { BugReportRepository } from "@/lib/repositories/BugReportRepository";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { ReporteBugService } from "@/lib/services/ReporteBugService";
import { enviarReporteBugSchema } from "@/lib/types/reporte-bug";

// SLT-87 (design §3, §4; R9–R13) — el borde del botón «Reportar un problema». Orden: sesión → zod
// estricto → agente de usuario de la cabecera → servicio, que es la puerta de empresa (R11).
//
// Lo que pone el servidor y no el cliente (R13): quién reporta (sesión), el navegador (cabecera) y la
// fecha (la base). Es de núcleo (`lib/modulos/reparto.ts`): ningún módulo apagado quita la forma de
// avisar de un fallo.
//
// Errores (R10): un fallo al guardar es `error` y deja en el log solo el nombre de la causa; ni la
// descripción ni el mensaje de Postgres, que puede llevar los valores de la fila. La respuesta buena no
// lleva el id ni ningún dato del reporte (R9).

/** Dependencias inyectables: existen para probar el borde sin base ni sesión. */
export interface EnviarReporteBugDeps {
  getActor?: () => Promise<Actor | null>;
  contextoPeticion?: () => Promise<{ userAgent: string }>;
  servicio?: IReporteBugService;
}

export type EnviarReporteBugActionResult =
  | EnviarReporteBugServiceResult
  | { status: "unauthenticated" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error" };

function construirServicio(): IReporteBugService {
  return new ReporteBugService(new BugReportRepository(getPrismaClient()), crearEmailSender());
}

function errorDeValidacion(error: z.ZodError): EnviarReporteBugActionResult {
  const { formErrors, fieldErrors } = error.flatten();
  return {
    status: "validation_error",
    fieldErrors: {
      ...(fieldErrors as Record<string, string[]>),
      // `strict` reporta el campo desconocido como error de formulario, no de campo (R12).
      ...(formErrors.length > 0 ? { entrada: formErrors } : {}),
    },
  };
}

export async function enviarReporteBugAction(
  input: unknown,
  deps: EnviarReporteBugDeps = {},
): Promise<EnviarReporteBugActionResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (actor === null) return { status: "unauthenticated" };
  const parsed = enviarReporteBugSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    const { userAgent } = await (deps.contextoPeticion ?? requestContextFromHeaders)();
    const servicio = deps.servicio ?? construirServicio();
    return await servicio.enviar(actor, parsed.data, { userAgent });
  } catch (error) {
    const causa = error instanceof Error ? error.name : "desconocido";
    console.error(`[reporte-bug] fallo al guardar causa=${causa}`);
    return { status: "error" };
  }
}
