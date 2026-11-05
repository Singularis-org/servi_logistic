"use server";

import type { z } from "zod";

import { exigirSuperadmin } from "@/lib/auth/exigir-superadmin";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  Actor,
  CambiarActivacionVehiculoServiceResult,
  CrearVehiculoServiceResult,
  IVehiculoService,
  ListarVehiculosServiceResult,
  RenombrarVehiculoServiceResult,
} from "@/lib/interfaces/services/IVehiculoService";
import { esViolacionDeUnico } from "@/lib/repositories/_shared/prisma-unique";
import { VehiculoRepository } from "@/lib/repositories/VehiculoRepository";
import { VehiculoService } from "@/lib/services/VehiculoService";
import {
  cambiarActivacionVehiculoSchema,
  crearVehiculoSchema,
  renombrarVehiculoSchema,
} from "@/lib/types/vehiculos";

// SL-42 (design §3, §4.3; R4–R14, R21) — el borde del catálogo de vehículos del superadmin. Mismo
// orden que `geografia-plataforma.ts`: sesión → `exigirSuperadmin` → zod → servicio.
//
// El servicio corre dentro de `comoPlataforma` (enmienda 2026-11-04): el rastro congela el nombre del
// actor, que vive en `usuario`, y `usuario` es de negocio. Sin contexto la extensión lo rechazaría con
// `EmpresaNoResuelta` (R7). Por eso este archivo está en `EXCEPCIONES_DE_PLATAFORMA`.
//
// El servicio vuelve a mirar `GESTION_ROLES`: la puerta de aquí es la primera, no la única (R14).
//
// Errores (R10, R11): solo la violación del único es `conflict`. Cualquier otro fallo es `error` y
// deja en el log la operación y el nombre de la causa; ni el nombre del vehículo ni el mensaje de la
// base, que puede llevar los valores de la fila. No hay `in_use`: el borrado se retiró (P1).

const FICHA = "SL-42";
const MOTIVO =
  "gestión del catálogo de vehículos por el superadmin, que no tiene empresa; congelar el nombre del actor en el rastro (R21)";

/** Dependencias inyectables: existen para probar el borde sin base ni sesión. */
export interface VehiculosPlataformaDeps {
  getActor?: () => Promise<Actor | null>;
  vehiculoService?: IVehiculoService;
}

function construirVehiculoService(): IVehiculoService {
  return new VehiculoService(new VehiculoRepository(getPrismaClient()));
}

type SinPermiso = { status: "unauthenticated" } | { status: "forbidden" };
type ErrorDeValidacion = { status: "validation_error"; fieldErrors: Record<string, string[]> };
type ErrorInterno = { status: "error" };

/** La puerta común, antes de validar nada: a un anónimo o a un rol de empresa no se le cuenta el borde. */
async function puerta(deps: VehiculosPlataformaDeps): Promise<{ actor: Actor } | { corte: SinPermiso }> {
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
      // `strict` reporta el campo desconocido como error de formulario, no de campo (R9).
      ...(formErrors.length > 0 ? { entrada: formErrors } : {}),
    },
  };
}

/** R11: solo el nombre del error; el mensaje de Postgres puede llevar los valores de la fila. */
function registrarFallo(operacion: string, error: unknown): ErrorInterno {
  const causa = error instanceof Error ? error.name : "desconocido";
  console.error(`[vehiculos-plataforma] fallo ${operacion} causa=${causa}`);
  return { status: "error" };
}

/** R10/R11: el único violado en carrera es `conflict`; todo lo demás, `error` con log. */
function fallaDeEscritura(operacion: string, error: unknown): { status: "conflict" } | ErrorInterno {
  if (esViolacionDeUnico(error)) return { status: "conflict" };
  return registrarFallo(operacion, error);
}

function enPlataforma<T>(fn: () => Promise<T>): Promise<T> {
  return comoPlataforma(FICHA, MOTIVO, fn);
}

export type ListarVehiculosPlataformaActionResult = ListarVehiculosServiceResult | SinPermiso;

/** R2: todos los tipos, activos e inactivos. Su fallo sube a la página, que lo dice (no lo pinta vacío). */
export async function listarVehiculosPlataformaAction(
  deps: VehiculosPlataformaDeps = {},
): Promise<ListarVehiculosPlataformaActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const servicio = deps.vehiculoService ?? construirVehiculoService();
  return enPlataforma(() => servicio.listarTodos(p.actor));
}

export type CrearVehiculoActionResult =
  | CrearVehiculoServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/** R4: alta activa con el nombre normalizado. */
export async function crearVehiculoAction(
  input: unknown,
  deps: VehiculosPlataformaDeps = {},
): Promise<CrearVehiculoActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = crearVehiculoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.vehiculoService ?? construirVehiculoService();
  try {
    return await enPlataforma(() => servicio.crear(parsed.data, p.actor));
  } catch (error) {
    return fallaDeEscritura("alta de vehiculo", error);
  }
}

export type RenombrarVehiculoActionResult =
  | RenombrarVehiculoServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/** R5: a su propio nombre es `ok`; al de otro tipo, `conflict`. */
export async function renombrarVehiculoAction(
  input: unknown,
  deps: VehiculosPlataformaDeps = {},
): Promise<RenombrarVehiculoActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = renombrarVehiculoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.vehiculoService ?? construirVehiculoService();
  try {
    return await enPlataforma(() => servicio.renombrar(parsed.data, p.actor));
  } catch (error) {
    return fallaDeEscritura("renombre de vehiculo", error);
  }
}

export type CambiarActivacionVehiculoActionResult =
  | CambiarActivacionVehiculoServiceResult
  | ErrorDeValidacion
  | SinPermiso
  | ErrorInterno;

/** R6: activa o desactiva sin borrar; el mismo estado es `ok` sin escribir. Aquí no hay único que violar. */
export async function cambiarActivacionVehiculoAction(
  input: unknown,
  deps: VehiculosPlataformaDeps = {},
): Promise<CambiarActivacionVehiculoActionResult> {
  const p = await puerta(deps);
  if ("corte" in p) return p.corte;
  const parsed = cambiarActivacionVehiculoSchema.safeParse(input);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  const servicio = deps.vehiculoService ?? construirVehiculoService();
  try {
    return await enPlataforma(() => servicio.cambiarActivacion(parsed.data, p.actor));
  } catch (error) {
    return registrarFallo(parsed.data.activo ? "activacion de vehiculo" : "desactivacion de vehiculo", error);
  }
}
