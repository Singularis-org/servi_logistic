"use server";

import {
  generarEtiquetasSchema,
  etiquetaPorGuiaSchema,
  type GenerarEtiquetasResult,
  type EtiquetaPorGuiaResult,
} from "@/lib/types/etiqueta-guia";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IEtiquetaGuiaService } from "@/lib/interfaces/services/IEtiquetaGuiaService";
import { EtiquetaGuiaService } from "@/lib/services/EtiquetaGuiaService";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { withErrorHandler, isAppErrorShape, UnauthenticatedError } from "@/lib/errors";
import type { AppErrorShape } from "@/lib/errors";

function buildEtiquetaService(): IEtiquetaGuiaService {
  return new EtiquetaGuiaService(new OrdenRepository(getPrismaClient()));
}

export interface EtiquetaActionDeps {
  etiquetaService?: IEtiquetaGuiaService;
  getActor?: () => Promise<Actor | null>;
}

// Traduce el AppErrorShape que puede producir este borde: solo ZodError
// (VALIDATION_ERROR, R15) o falta de sesion (UNAUTHORIZED, R14). `forbidden`
// (R13) lo devuelve el service directamente como resultado de dominio (nunca como
// excepcion), por eso NO aparece aqui.
function toEtiquetaActionError(
  shape: AppErrorShape,
): { status: "validation_error"; fieldErrors: Record<string, string[]> } | { status: "unauthenticated" } {
  switch (shape.code) {
    case "VALIDATION_ERROR":
      return {
        status: "validation_error",
        fieldErrors: (shape.details?.fieldErrors as Record<string, string[]> | undefined) ?? {},
      };
    case "UNAUTHORIZED":
      return { status: "unauthenticated" };
    default:
      // FORBIDDEN/NOT_FOUND/CONFLICT/INTERNAL: este borde nunca los lanza como
      // AppError; si algo desconocido llega aqui, se propaga como fallo real.
      throw new Error(`etiquetas-guia: AppErrorCode inesperado ${shape.code}`);
  }
}

/**
 * Feature 32/R1-R8/R14-R15: genera las etiquetas de guia (QR + barcode + datos)
 * de la seleccion. READ derivado, sin efectos. Disponible para cualquier rol
 * autenticado, sin `forbidden` por rol; pero el service acota el DUEÑO segun
 * `resolverAlcanceEtiquetasOrden` (SLT-49): un `adminTienda` (y una `apiKey`, 136)
 * solo recibe las etiquetas de su tienda y cada orden ajena sale en `omitidas` como
 * `no_encontrada`, sin abortar el lote. La autorizacion vive en el service; esta
 * action no la repite. Lo disparan maestro/admin desde el flujo de guia/asignacion
 * por lote, la tienda desde su «Imprimir etiquetas» y cualquiera por fila. Sin sesion
 * -> `unauthenticated` antes de tocar el service (R14); entrada invalida (lista
 * vacia / id malformado) -> `validation_error` (R15).
 */
export async function generarEtiquetas(
  input: unknown,
  deps: EtiquetaActionDeps = {},
): Promise<GenerarEtiquetasResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError(); // R14: antes de tocar el service
    const data = generarEtiquetasSchema.parse(input); // ZodError -> VALIDATION_ERROR (R15)
    const service = deps.etiquetaService ?? buildEtiquetaService();
    return service.generarEtiquetas(data, actor); // resultado tipado de dominio (ok/forbidden)
  });
  return isAppErrorShape(r) ? toEtiquetaActionError(r) : r;
}

/**
 * Feature 32/R1-R8/R14/R15 (QR por guia): resuelve la etiqueta de UNA orden por su
 * `num_guia` (lo que codifica el QR y la URL `/paquete/<numGuia>`). READ derivado, sin
 * efectos, para cualquier rol autenticado, con el mismo alcance por dueño que
 * `generarEtiquetas` (SLT-49/R9: la guia de otra tienda, para un `adminTienda`, sale
 * `no_encontrada`, igual que una inexistente).
 * Sin sesion -> `unauthenticated` antes de tocar el service (R14); `numGuia` no entero
 * positivo -> `validation_error` (R15); sin orden viva con esa guia -> `no_encontrada`.
 */
export async function obtenerEtiquetaPorGuia(
  input: unknown,
  deps: EtiquetaActionDeps = {},
): Promise<EtiquetaPorGuiaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError(); // R14: antes de tocar el service
    const data = etiquetaPorGuiaSchema.parse(input); // ZodError -> VALIDATION_ERROR (R15)
    const service = deps.etiquetaService ?? buildEtiquetaService();
    return service.obtenerEtiquetaPorGuia(data.numGuia, actor);
  });
  return isAppErrorShape(r) ? toEtiquetaActionError(r) : r;
}
