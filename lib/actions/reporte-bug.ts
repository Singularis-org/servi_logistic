"use server";

import type { z } from "zod";

import { requestContextFromHeaders } from "@/lib/actions/_shared/contexto-peticion";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  EnviarReporteBugServiceResult,
  IReporteBugService,
  PermisoSubidaImagen,
} from "@/lib/interfaces/services/IReporteBugService";
import { BugReportRepository } from "@/lib/repositories/BugReportRepository";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import { ReporteBugService } from "@/lib/services/ReporteBugService";
import { SupabaseAlmacenImagenesReporte } from "@/lib/storage/SupabaseAlmacenImagenesReporte";
import { enviarReporteBugSchema, prepararSubidasImagenesSchema } from "@/lib/types/reporte-bug";

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
//
// SLT-98 (design §4.1, §5.2; R9, R11, R12, R14): `prepararSubidaImagenesReporteAction` da los permisos
// de subida directa al bucket, con el mismo orden (sesión → zod estricto → servicio, que es la puerta).
// La ruta de cada imagen la fija el servicio con la sesión; la entrada solo declara tipo y tamaño.
// SLT-98 (design §16.4; R25, R31): el tope diario lo cuenta el servicio con el usuario de la sesión y la
// hora del servidor; un campo de más en la entrada (usuario, fecha, cupo) cae en zod antes de contar.

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

/** SLT-98 (design §4.1): los permisos van en el orden de la entrada. */
export type PrepararSubidaImagenesReporteActionResult =
  | { status: "listas"; permisos: PermisoSubidaImagen[] }
  // SLT-98 (design §16.4; R25): sin cupo en el tope diario. No es un error: no se registra.
  | { status: "sin_cupo_imagenes" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error" };

/** SLT-98: dependencias inyectables del borde de la subida, por la misma razón que las del envío. */
export interface PrepararSubidaImagenesReporteDeps {
  getActor?: () => Promise<Actor | null>;
  servicio?: IReporteBugService;
}

function construirServicio(): IReporteBugService {
  const prisma = getPrismaClient();
  // El repositorio es también el cupo diario de imágenes (design §16.4).
  const repo = new BugReportRepository(prisma);
  return new ReporteBugService(
    repo,
    new SupabaseAlmacenImagenesReporte(),
    repo,
    crearEmailSender(),
    construirReglasPaisEmpresa(prisma),
  );
}

function errorDeValidacion(error: z.ZodError): { status: "validation_error"; fieldErrors: Record<string, string[]> } {
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

/** SLT-98 (design §4.2): la llama el panel `components/shared/ReporteBugBoton.tsx` al pulsar «Enviar». */
export async function prepararSubidaImagenesReporteAction(
  input: unknown,
  deps: PrepararSubidaImagenesReporteDeps = {},
): Promise<PrepararSubidaImagenesReporteActionResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (actor === null) return { status: "unauthenticated" };
  const parsed = prepararSubidasImagenesSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    const servicio = deps.servicio ?? construirServicio();
    return await servicio.prepararSubidas(actor, parsed.data);
  } catch (error) {
    const causa = error instanceof Error ? error.name : "desconocido";
    console.error(`[reporte-bug] fallo al preparar la subida causa=${causa}`);
    return { status: "error" };
  }
}
