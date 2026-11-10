"use server";

import { z } from "zod";
import {
  actualizarZonaSchema,
  crearZonaSchema,
  impactoAsignacionZonaSchema,
  listarZonasSchema,
  type ActualizarZonaResult,
  type ImpactoAsignacionZonaResult,
  type BorrarZonaResult,
  type CrearZonaResult,
  type ImpactoZonaCentralResult,
  type ListarZonasResult,
  type ObtenerZonaResult,
  type ZonaActionError,
} from "@/lib/types/zona";
import type { Actor, IZonaService } from "@/lib/interfaces/services/IZonaService";
import { ZonaService } from "@/lib/services/ZonaService";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import {
  withErrorHandler,
  isAppErrorShape,
  UnauthenticatedError,
  ValidationError,
  MSG,
  type AppErrorShape,
} from "@/lib/errors";

const idSchema = z.string().min(1);
/**
 * FICHA 376 (Q4): el borde de `impactoZonaCentral`. Tope de 20 ids —la pantalla pregunta por dos:
 * la que pierde la marca y la que la gana— para que un payload inventado no se convierta en una
 * consulta sobre el catalogo entero.
 */
const idsSchema = z.array(idSchema).max(20);

// Traduce el AppErrorShape del manejador global al ZonaActionError tipado. A
// diferencia de tarifas, el dominio de zonas SI produce `conflict` (borrar una
// zona referenciada). Switch exhaustivo sobre los 6 AppErrorCode.
function toZonaActionError(shape: AppErrorShape): ZonaActionError {
  switch (shape.code) {
    case "VALIDATION_ERROR":
      return {
        status: "validation_error",
        fieldErrors: (shape.details?.fieldErrors as Record<string, string[]> | undefined) ?? {},
      };
    case "UNAUTHORIZED":
      return { status: "unauthenticated" };
    case "FORBIDDEN":
      return { status: "forbidden" };
    case "NOT_FOUND":
      return { status: "not_found" };
    case "CONFLICT":
      return { status: "conflict" };
    case "INTERNAL":
      throw new Error("internal");
    default: {
      const _exhaustive: never = shape.code;
      throw new Error(`Unhandled AppErrorCode: ${String(_exhaustive)}`);
    }
  }
}

function buildZonaService(): IZonaService {
  const prisma = getPrismaClient();
  return new ZonaService(new ZonaRepository(prisma));
}

export interface ZonaActionDeps {
  zonaService?: IZonaService;
  getActor?: () => Promise<Actor | null>;
}

/**
 * SLT-54 (R27, enmienda de SLT-51 R9 solo en el borde): los costos de zona son del modelo viejo y ninguna
 * pantalla los edita ya. La guarda vive aqui y no en el esquema porque `ZonaService` y sus esquemas se
 * quedan para sembrar en las fabricas de tests, hasta que SLT-57 retire el modelo.
 */
const ZONA_SIN_COSTOS = "Los costos de la zona ya no se editan aquí: se configuran en Tarifas.";

function rechazoDeCostos(campos: string[]): ValidationError {
  return new ValidationError(MSG.VALIDATION_ERROR, {
    fieldErrors: Object.fromEntries(campos.map((c) => [c, [ZONA_SIN_COSTOS]])),
  });
}

/** Crear zona (solo maestro). */
export async function crearZona(
  input: unknown,
  deps: ZonaActionDeps = {},
): Promise<CrearZonaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const data = crearZonaSchema.parse(input);
    const costos = [
      ...(data.cobroVehiculo ? ["cobroVehiculo"] : []),
      ...(data.tarifas.length > 0 ? ["tarifas"] : []),
    ];
    if (costos.length > 0) throw rechazoDeCostos(costos);
    const service = deps.zonaService ?? buildZonaService();
    return service.crear(data, actor);
  });
  return isAppErrorShape(r) ? toZonaActionError(r) : r;
}

/** Obtener zona por id (solo maestro). */
export async function obtenerZona(
  id: unknown,
  deps: ZonaActionDeps = {},
): Promise<ObtenerZonaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      throw new ValidationError(MSG.VALIDATION_ERROR, { fieldErrors: { id: ["id invalido"] } });
    }
    const service = deps.zonaService ?? buildZonaService();
    return service.obtener(parsedId.data, actor);
  });
  return isAppErrorShape(r) ? toZonaActionError(r) : r;
}

/** Listar zonas paginadas; include opcional ["tarifas"] (solo maestro). */
export async function listarZonas(
  input: unknown,
  deps: ZonaActionDeps = {},
): Promise<ListarZonasResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const data = listarZonasSchema.parse(input ?? {});
    const service = deps.zonaService ?? buildZonaService();
    return service.listar(data, actor);
  });
  return isAppErrorShape(r) ? toZonaActionError(r) : r;
}

/** Actualizar zona por id (reemplazo completo; solo maestro). */
export async function actualizarZona(
  id: unknown,
  input: unknown,
  deps: ZonaActionDeps = {},
): Promise<ActualizarZonaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      throw new ValidationError(MSG.VALIDATION_ERROR, { fieldErrors: { id: ["id invalido"] } });
    }
    const data = actualizarZonaSchema.parse(input);
    const costos = [
      ...(data.cobroVehiculo !== undefined ? ["cobroVehiculo"] : []),
      ...(data.tarifas !== undefined ? ["tarifas"] : []),
    ];
    if (costos.length > 0) throw rechazoDeCostos(costos);
    const service = deps.zonaService ?? buildZonaService();
    return service.actualizar(parsedId.data, data, actor);
  });
  return isAppErrorShape(r) ? toZonaActionError(r) : r;
}

/** Borrado FISICO de zona por id (solo maestro). */
export async function borrarZona(
  id: unknown,
  deps: ZonaActionDeps = {},
): Promise<BorrarZonaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      throw new ValidationError(MSG.VALIDATION_ERROR, { fieldErrors: { id: ["id invalido"] } });
    }
    const service = deps.zonaService ?? buildZonaService();
    return service.borrar(parsedId.data, actor);
  });
  if (!isAppErrorShape(r)) return r;
  const error = toZonaActionError(r);
  // ⭑ FICHA 376 (R11) — POR QUE `en_uso` ES EL DEFAULT CORRECTO POR ESTA VIA, Y NO UNA SUPOSICION.
  // `toZonaActionError` traduce el `AppErrorShape` del manejador GLOBAL, y por ahi solo puede
  // llegar un `ConflictError` LANZADO —hoy, el `translateEsCentralConflict` de `ZonaRepository`
  // («Ya existe una zona central»), que es una carrera perdida contra el indice unico, no un
  // rechazo de R10—. El rechazo de R10 NO se lanza: viaja tipado como `"es_central"` por el
  // `return` del service y no pasa por aqui.
  return error.status === "conflict" ? { status: "conflict", motivo: "en_uso" } : error;
}

/**
 * ⭑ FICHA 376 (Q4) — cuantas ordenes VIVAS re-tarifaria mover la marca de zona central.
 *
 * Solo lectura y `maestro`-only, como el resto del CRUD de zonas. Existe para que la confirmacion
 * del formulario pueda decir el IMPACTO antes de enviar nada: mover la marca cambia la columna de
 * flete (`resolverFlete`) de todo lo que aun no esta congelado en un cierre, y ese numero no es
 * pequeño. Devuelve una entrada POR ZONA PEDIDA —con cero si no tiene ninguna—: quien lo consuma
 * compone el texto, este borde no lo redacta.
 *
 * Su superficie es la confirmacion de `CrearZonaForm` (T12). La excepcion de accion sin pantalla
 * que vivia en este bloque se borro al llegar esa pantalla: `superficie-de-uso.guardia` exige que
 * ninguna excepcion sobreviva a su motivo.
 */
export async function impactoZonaCentral(
  zonaIds: unknown,
  deps: ZonaActionDeps = {},
): Promise<ImpactoZonaCentralResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const parsed = idsSchema.safeParse(zonaIds);
    if (!parsed.success) {
      throw new ValidationError(MSG.VALIDATION_ERROR, {
        fieldErrors: { zonaIds: ["zonaIds invalido"] },
      });
    }
    const service = deps.zonaService ?? buildZonaService();
    return service.impactoZonaCentral(parsed.data, actor);
  });
  return isAppErrorShape(r) ? toZonaActionError(r) : r;
}

/**
 * ⭑ SLT-89 (R13–R15, R36; design §5.3) — el aviso de impacto de guardar una zona con esos nodos:
 * cuantas ordenes pendientes cambian de zona y de tarifa y cuantas no se mueven, sin escribir nada.
 * `maestro`-only. Zod en el borde con tope de ids (`impactoAsignacionZonaSchema`).
 *
 * @sin-superficie SLT-89 (deuda con fecha de salida, no decision): la consume el modal unico de guardado de `CrearZonaForm` (T7.2, design §8.2), que no empieza hasta que el humano apruebe la maqueta (T0.2, R48). La cubren `tests/unit/services/zona-service.test.ts` (rol) y `tests/integration/db/zona-nodo-impacto.test.ts` (las cifras contra Postgres). Esta anotacion se borra en el commit de T7 que la llama.
 */
export async function impactoAsignacionZona(
  input: unknown,
  deps: ZonaActionDeps = {},
): Promise<ImpactoAsignacionZonaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const parsed = impactoAsignacionZonaSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(MSG.VALIDATION_ERROR, {
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      });
    }
    const service = deps.zonaService ?? buildZonaService();
    return service.impactoAsignacion(parsed.data, actor);
  });
  return isAppErrorShape(r) ? toZonaActionError(r) : r;
}

// `arbolZonas` (arbol zona -> canton -> distrito) se borro el 2026-08-07 por decision humana:
// su unico importador fue siempre `configuracion/_components/ZonaForm.tsx`, que dejo de estar
// montado en `19b9cccf` (2026-07-22, «remove zones from cofign>user») y lo borro la tanda 1 de
// este mismo chore. `IZonaService.arbol` / `ZonaRepository.arbol` NO se tocan: siguen probados y
// son la lectura que habria que recablear si la pantalla vuelve.
