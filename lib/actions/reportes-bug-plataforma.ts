"use server";

import type { z } from "zod";

import { exigirSuperadmin } from "@/lib/auth/exigir-superadmin";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  CambiarEstadoReporteServiceResult,
  IReportesBugPlataformaService,
  ListarReportesServiceResult,
  VerReporteServiceResult,
} from "@/lib/interfaces/services/IReportesBugPlataformaService";
import { BugReportRepository } from "@/lib/repositories/BugReportRepository";
import { ReportesBugPlataformaService } from "@/lib/services/ReportesBugPlataformaService";
import { SupabaseAlmacenImagenesReporte } from "@/lib/storage/SupabaseAlmacenImagenesReporte";
import { cambiarEstadoReporteSchema, filtrosReportesSchema, verReporteSchema } from "@/lib/types/reporte-bug";

// SLT-97 (design §3, §6; R2, R9, R15, R18, R20) — el borde del módulo de reportes del superadmin. Mismo
// orden que `vehiculos-plataforma.ts`: sesión → `exigirSuperadmin` → zod → servicio. La puerta va antes
// del zod: a un anónimo o a un rol de empresa no se le cuenta el contrato (R2).
//
// Aquí no se abre `comoPlataforma`: el repositorio abre el suyo en cada operación, y el servicio no
// toca ninguna otra tabla. Por eso este archivo no está en `EXCEPCIONES_DE_PLATAFORMA`.
//
// Errores: un fallo es `error` y deja en el log la operación y el nombre de la causa; ni la nota ni la
// descripción ni el mensaje de Postgres, que puede llevar los valores de la fila.

/** Dependencias inyectables: existen para probar el borde sin base ni sesión. */
export interface ReportesBugPlataformaDeps {
  getActor?: () => Promise<Actor | null>;
  servicio?: IReportesBugPlataformaService;
}

type SinPermiso = { status: "unauthenticated" } | { status: "forbidden" };
type ErrorDeValidacion = { status: "validation_error"; fieldErrors: Record<string, string[]> };
type ErrorInterno = { status: "error" };

function construirServicio(): IReportesBugPlataformaService {
  // SLT-98 (design §7): el almacén firma los enlaces de las imágenes del detalle (R22, R23).
  return new ReportesBugPlataformaService(new BugReportRepository(getPrismaClient()), new SupabaseAlmacenImagenesReporte());
}

async function puerta(deps: ReportesBugPlataformaDeps): Promise<{ actor: Actor } | { corte: SinPermiso }> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (actor === null) return { corte: { status: "unauthenticated" } };
  if (!exigirSuperadmin(actor)) return { corte: { status: "forbidden" } };
  return { actor };
}

function errorDeValidacion(error: z.ZodError): ErrorDeValidacion {
  const { formErrors, fieldErrors } = error.flatten();
  return {
    status: "validation_error",
    fieldErrors: {
      ...(fieldErrors as Record<string, string[]>),
      // `strict` reporta el campo desconocido como error de formulario, no de campo.
      ...(formErrors.length > 0 ? { entrada: formErrors } : {}),
    },
  };
}

function registrarFallo(operacion: string, error: unknown): ErrorInterno {
  const causa = error instanceof Error ? error.name : "desconocido";
  console.error(`[reportes-bug-plataforma] fallo ${operacion} causa=${causa}`);
  return { status: "error" };
}

export type ListarReportesBugActionResult = ListarReportesServiceResult | ErrorDeValidacion | SinPermiso | ErrorInterno;

/**
 * R5, R7–R11. Recibe los `searchParams` de la página: un estado desconocido, una fecha inválida o
 * «Desde» posterior a «Hasta» son `validation_error` (R9); una página que no es un número es la 1 (R11).
 * Un fallo es `error`, y la página lo dice en vez de pintar el vacío (R12).
 */
export async function listarReportesBugAction(
  input: unknown,
  deps: ReportesBugPlataformaDeps = {},
): Promise<ListarReportesBugActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = filtrosReportesSchema.safeParse(input ?? {});
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    return await (deps.servicio ?? construirServicio()).listar(p.actor, parsed.data);
  } catch (error) {
    return registrarFallo("listado de reportes", error);
  }
}

export type VerReporteBugActionResult = VerReporteServiceResult | ErrorDeValidacion | SinPermiso | ErrorInterno;

/** R14, R15: un id que no es uuid es `validation_error`, y la página responde «no encontrado». */
export async function verReporteBugAction(
  input: unknown,
  deps: ReportesBugPlataformaDeps = {},
): Promise<VerReporteBugActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = verReporteSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    return await (deps.servicio ?? construirServicio()).detalle(p.actor, parsed.data.reporteId);
  } catch (error) {
    return registrarFallo("detalle de reporte", error);
  }
}

export type CambiarEstadoReporteBugActionResult =
  | CambiarEstadoReporteServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/**
 * R17–R21. La nota llega recortada: más de 500 letras es `validation_error` sin tocar nada (R20); una
 * transición fuera de R17 es `transicion_invalida` con el estado actual (R18). No avisa a nadie (R4).
 */
export async function cambiarEstadoReporteBugAction(
  input: unknown,
  deps: ReportesBugPlataformaDeps = {},
): Promise<CambiarEstadoReporteBugActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = cambiarEstadoReporteSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    return await (deps.servicio ?? construirServicio()).cambiarEstado(p.actor, parsed.data);
  } catch (error) {
    return registrarFallo("cambio de estado de reporte", error);
  }
}
