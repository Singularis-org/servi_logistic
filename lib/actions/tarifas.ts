"use server";

import { z } from "zod";
import type { Actor } from "@/lib/interfaces/services/ITarifaService";
import type {
  ActivarTarifasResult,
  ITarifaActivacionService,
} from "@/lib/interfaces/services/ITarifaActivacionService";
import type {
  BorrarGrupoResult,
  CambiarGrupoResult,
  CrearGrupoResult,
  IGrupoDistritosService,
} from "@/lib/interfaces/services/IGrupoDistritosService";
import type {
  CargarPantallaResult,
  CargarZonaResult,
  ITarifasPantallaService,
} from "@/lib/interfaces/services/ITarifasPantallaService";
import type { ITarifaValorService } from "@/lib/interfaces/services/ITarifaValorService";
import type {
  GuardarTopeIntentosResult,
  ITopeIntentosService,
} from "@/lib/interfaces/services/ITopeIntentosService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { withErrorHandler, isAppErrorShape, UnauthenticatedError, type AppErrorShape } from "@/lib/errors";
import { defaultLogger } from "@/lib/errors/logger";
import {
  borrarGrupoDistritosSchema,
  cambiarDistritosDeGrupoSchema,
  cargarZonaTarifasSchema,
  crearGrupoSchema,
  guardarValoresTarifaSchema,
  renombrarGrupoDistritosSchema,
  type FijarValorInput,
} from "@/lib/types/tarifa-flexible";

// SLT-54 (design §7) — el borde del modulo de Tarifas. La empresa sale de la sesion, nunca del input, y
// cada service decide `forbidden`. SLT-54 R26: aqui ya no hay ninguna via de escritura de `tarifas`;
// `TarifaService` queda solo para los sembrados, hasta que SLT-57 lo retire.

type SinSesion = { status: "unauthenticated" };
type FalloInesperado = { status: "error" };
type EntradaInvalida = { status: "validation_error"; fieldErrors: Record<string, string[]> };

interface ConActor {
  getActor?: () => Promise<Actor | null>;
}

/**
 * Un fallo inesperado es `error` y no una excepcion: la pantalla tiene que poder decir que NO se guardo
 * ni se activo, y ofrecer reintentar en vez de pintar un estado vacio (R57).
 */
function aResultado<T>(r: T | AppErrorShape): T | SinSesion | FalloInesperado {
  if (!isAppErrorShape(r)) return r;
  return r.code === "UNAUTHORIZED" ? { status: "unauthenticated" } : { status: "error" };
}

async function actorDe(deps: ConActor): Promise<Actor> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

function invalida(error: z.ZodError): EntradaInvalida {
  return { status: "validation_error", fieldErrors: z.flattenError(error).fieldErrors };
}

export interface ActivarTarifasDeps extends ConActor {
  servicio?: ITarifaActivacionService;
}

export type ActivarTarifasNuevasResult = ActivarTarifasResult | SinSesion | FalloInesperado;

/**
 * SLT-54 (design §4, R4-R7): el maestro hace regir el modelo nuevo.
 */
export async function activarTarifasNuevas(
  input: unknown,
  deps: ActivarTarifasDeps = {},
): Promise<ActivarTarifasNuevasResult> {
  const r = await withErrorHandler(async () => {
    const actor = await actorDe(deps);
    const servicio = deps.servicio ?? serviciosDeTarifas(getPrismaClient()).tarifaActivacion;
    return servicio.activar(input, actor);
  });
  return aResultado(r);
}

export interface GuardarTopeIntentosDeps extends ConActor {
  servicio?: ITopeIntentosService;
}

/**
 * SLT-77 (design §4.1, R3-R5): el `maestro` fija los intentos de entrega de su empresa. El rol y la entrada
 * los decide el servicio, en ese orden; la empresa sale de la sesion.
 *
 * @sin-superficie SLT-77, solo mientras se hace la ficha: la sección de la pantalla la monta su tanda E (T5.1, `TarifasTopeIntentos.tsx`), que debe borrar esta nota.
 */
export async function guardarTopeIntentos(
  input: unknown,
  deps: GuardarTopeIntentosDeps = {},
): Promise<GuardarTopeIntentosResult | SinSesion | FalloInesperado> {
  const r = await withErrorHandler(async () => {
    const actor = await actorDe(deps);
    const servicio = deps.servicio ?? serviciosDeTarifas(getPrismaClient()).topeIntentos;
    return servicio.guardar(input, actor);
  });
  return aResultado(r);
}

export interface PantallaTarifasDeps extends ConActor {
  servicio?: ITarifasPantallaService;
}

export type CargarPantallaTarifasResult = CargarPantallaResult | SinSesion | FalloInesperado;

/**
 * SLT-54 (design §7, R55): lo que `page.tsx` carga de entrada. Maestro y admin.
 */
export async function cargarPantallaTarifas(deps: PantallaTarifasDeps = {}): Promise<CargarPantallaTarifasResult> {
  const r = await withErrorHandler(async () => {
    const actor = await actorDe(deps);
    const servicio = deps.servicio ?? serviciosDeTarifas(getPrismaClient()).tarifasPantalla;
    return servicio.cargarPantalla(actor);
  });
  return aResultado(r);
}

export type CargarZonaTarifasResult = CargarZonaResult | EntradaInvalida | SinSesion | FalloInesperado;

/**
 * SLT-54 (design §6, §7, R20-R24): grupos, distritos, valores y referencia de una zona. Se pide al abrirla.
 */
export async function cargarZonaTarifas(
  input: unknown,
  deps: PantallaTarifasDeps = {},
): Promise<CargarZonaTarifasResult> {
  const r = await withErrorHandler(async (): Promise<CargarZonaResult | EntradaInvalida> => {
    const actor = await actorDe(deps);
    const parseado = cargarZonaTarifasSchema.safeParse(input);
    if (!parseado.success) return invalida(parseado.error);
    const servicio = deps.servicio ?? serviciosDeTarifas(getPrismaClient()).tarifasPantalla;
    return servicio.cargarZona(parseado.data, actor);
  });
  return aResultado(r);
}

export interface ValoresTarifaDeps extends ConActor {
  servicio?: ITarifaValorService;
}

/** Una entrada por `clave` del cambio: la pantalla pinta el resultado en esa fila (R37, R38). */
export interface ResultadoDeCambio {
  clave: string;
  status: "ok" | "validation_error" | "forbidden" | "not_found" | "error";
  fieldErrors?: Record<string, string[]>;
}

export type GuardarValoresTarifaResult =
  | { status: "ok"; resultados: ResultadoDeCambio[] }
  | EntradaInvalida
  | SinSesion
  | FalloInesperado;

/**
 * SLT-54 (design §7, R35, R38): fija o quita cada concepto, en serie, cada uno con su transaccion y su
 * historial. Sin transaccion comun a proposito: un fallo en una fila no debe tirar lo demas, y por eso
 * la excepcion de una fila se queda en su resultado y el guardado sigue.
 */
export async function guardarValoresTarifa(
  input: unknown,
  deps: ValoresTarifaDeps = {},
): Promise<GuardarValoresTarifaResult> {
  const r = await withErrorHandler(async (): Promise<GuardarValoresTarifaResult> => {
    const actor = await actorDe(deps);
    const parseado = guardarValoresTarifaSchema.safeParse(input);
    if (!parseado.success) return invalida(parseado.error);
    const servicio = deps.servicio ?? serviciosDeTarifas(getPrismaClient()).tarifaValor;

    const resultados: ResultadoDeCambio[] = [];
    for (const cambio of parseado.data.cambios) {
      try {
        const res =
          cambio.accion === "fijar"
            ? // El service valida `datos` con `escrituraValorSchema` antes de leer ninguna columna.
              await servicio.fijarValor(cambio.datos as unknown as FijarValorInput, actor)
            : await servicio.quitarValor(cambio.id, actor);
        resultados.push({
          clave: cambio.clave,
          status: res.status,
          ...("fieldErrors" in res ? { fieldErrors: res.fieldErrors } : {}),
        });
      } catch (error) {
        defaultLogger.logError(error);
        resultados.push({ clave: cambio.clave, status: "error" });
      }
    }
    return { status: "ok", resultados };
  });
  return aResultado(r);
}

export interface GruposDistritosDeps extends ConActor {
  servicio?: IGrupoDistritosService;
}

function serviciosDeGrupos(deps: GruposDistritosDeps): IGrupoDistritosService {
  return deps.servicio ?? serviciosDeTarifas(getPrismaClient()).grupoDistritos;
}

/**
 * SLT-54 (design §7, R42, R44): crear un grupo. La zona especial es un grupo mas.
 */
export async function crearGrupoDistritos(
  input: unknown,
  deps: GruposDistritosDeps = {},
): Promise<CrearGrupoResult | SinSesion | FalloInesperado> {
  const r = await withErrorHandler(async (): Promise<CrearGrupoResult> => {
    const actor = await actorDe(deps);
    const parseado = crearGrupoSchema.safeParse(input);
    if (!parseado.success) return invalida(parseado.error);
    return serviciosDeGrupos(deps).crearGrupo(parseado.data, actor);
  });
  return aResultado(r);
}

/**
 * SLT-54 (design §7, R42).
 */
export async function renombrarGrupoDistritos(
  input: unknown,
  deps: GruposDistritosDeps = {},
): Promise<CambiarGrupoResult | SinSesion | FalloInesperado> {
  const r = await withErrorHandler(async (): Promise<CambiarGrupoResult> => {
    const actor = await actorDe(deps);
    const parseado = renombrarGrupoDistritosSchema.safeParse(input);
    if (!parseado.success) return invalida(parseado.error);
    return serviciosDeGrupos(deps).renombrarGrupo(parseado.data.id, parseado.data.nombre, actor);
  });
  return aResultado(r);
}

/**
 * SLT-54 (design §7, R42): el rechazo de SLT-52 R11 llega con el nombre del distrito en `distritoIds`.
 */
export async function cambiarDistritosDeGrupo(
  input: unknown,
  deps: GruposDistritosDeps = {},
): Promise<CambiarGrupoResult | SinSesion | FalloInesperado> {
  const r = await withErrorHandler(async (): Promise<CambiarGrupoResult> => {
    const actor = await actorDe(deps);
    const parseado = cambiarDistritosDeGrupoSchema.safeParse(input);
    if (!parseado.success) return invalida(parseado.error);
    return serviciosDeGrupos(deps).fijarDistritos(parseado.data.id, parseado.data.distritoIds, actor);
  });
  return aResultado(r);
}

/**
 * SLT-54 (design §7, R43): la confirmacion la pide la pantalla; los valores del grupo caen con el.
 */
export async function borrarGrupoDistritos(
  input: unknown,
  deps: GruposDistritosDeps = {},
): Promise<BorrarGrupoResult | EntradaInvalida | SinSesion | FalloInesperado> {
  const r = await withErrorHandler(async (): Promise<BorrarGrupoResult | EntradaInvalida> => {
    const actor = await actorDe(deps);
    const parseado = borrarGrupoDistritosSchema.safeParse(input);
    if (!parseado.success) return invalida(parseado.error);
    return serviciosDeGrupos(deps).borrarGrupo(parseado.data.id, actor);
  });
  return aResultado(r);
}
