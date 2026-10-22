"use server";

import { getPrismaClient } from "@/lib/db/prisma-client";
import { DevolucionTiendaRepository } from "@/lib/repositories/DevolucionTiendaRepository";
import { DevolucionTiendaService } from "@/lib/services/DevolucionTiendaService";
import { SupabaseFileStorage } from "@/lib/storage/SupabaseFileStorage";
import { SupabaseSignedUrlProvider } from "@/lib/storage/SupabaseSignedUrlProvider";
import { gestionConfig } from "@/lib/config/gestion";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IDevolucionTiendaService } from "@/lib/interfaces/services/IDevolucionTiendaService";
import type { EvidenciaArchivo } from "@/lib/interfaces/services/IMisAsignacionesService";
import {
  confirmarEntregaTiendaSchema,
  verComprobanteDevolucionTiendaSchema,
  type ConfirmarEntregaTiendaResult,
  type VerComprobanteDevolucionTiendaResult,
} from "@/lib/types/devolucion-tienda";
import { withErrorHandler, isAppErrorShape, UnauthenticatedError } from "@/lib/errors";
import type { AppErrorShape } from "@/lib/errors";

// FICHA 419 (design D6) — Server Actions de la confirmacion CENTRAL de entrega a la tienda.
// Mutacion interna -> Server Action, no Route API. Espejo de `recepcion-origen.ts` (actor por
// sesion, zod en el borde, `withErrorHandler`, deps inyectables) y de `incidentes.ts` para los
// archivos del FormData. Es tambien el COMPOSITION ROOT: el comprobante vive en el MISMO bucket
// privado que las evidencias de gestion (119) y del incidente (158), carpeta `devolucion-tienda/`.

function toDevolucionTiendaActionError(
  shape: AppErrorShape,
):
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" } {
  switch (shape.code) {
    case "VALIDATION_ERROR":
      return {
        status: "validation_error",
        fieldErrors: (shape.details?.fieldErrors as Record<string, string[]> | undefined) ?? {},
      };
    case "UNAUTHORIZED":
      return { status: "unauthenticated" };
    default:
      throw new Error(`devolucion-tienda: AppErrorCode inesperado ${shape.code}`);
  }
}

/**
 * Composition root. NO se exporta: en un archivo `"use server"` todo export async es una accion
 * invocable desde el cliente. El test del bucket lo ejercita por `verComprobanteDevolucionTienda`.
 */
function buildService(): IDevolucionTiendaService {
  return new DevolucionTiendaService(
    new DevolucionTiendaRepository(getPrismaClient()),
    new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET),
    new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
  );
}

export interface DevolucionTiendaDeps {
  service?: IDevolucionTiendaService;
  getActor?: () => Promise<Actor | null>;
}

interface FileLike {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * R1-R15 — confirma la entrega a la tienda de un lote de ordenes, con comprobante obligatorio.
 * FormData: `tiendaId`, una entrada `ordenId` por orden y una entrada `evidencia` por archivo.
 */
export async function confirmarEntregaTienda(
  formData: FormData,
  deps: DevolucionTiendaDeps = {},
): Promise<ConfirmarEntregaTiendaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const data = confirmarEntregaTiendaSchema.parse(rawFromFormData(formData)); // ZodError -> VALIDATION_ERROR
    const service = deps.service ?? buildService();
    return service.confirmarEntrega(
      {
        tiendaId: data.tiendaId,
        ordenIds: data.ordenIds,
        evidencias: await leerEvidencias(data.evidencias as unknown as FileLike[]),
      },
      actor,
    );
  });
  return isAppErrorShape(r) ? toDevolucionTiendaActionError(r) : r;
}

/** R22/R23 — URLs firmadas del comprobante de entrega de una orden (solo maestro/admin). */
export async function verComprobanteDevolucionTienda(
  input: unknown,
  deps: DevolucionTiendaDeps = {},
): Promise<VerComprobanteDevolucionTiendaResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError();
    const data = verComprobanteDevolucionTiendaSchema.parse(input);
    const service = deps.service ?? buildService();
    return service.verComprobante(data.ordenId, actor);
  });
  return isAppErrorShape(r) ? toDevolucionTiendaActionError(r) : r;
}

function rawFromFormData(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const tiendaId = formData.get("tiendaId");
  if (typeof tiendaId === "string") raw.tiendaId = tiendaId;
  raw.ordenIds = formData.getAll("ordenId").filter((v): v is string => typeof v === "string");
  // Todas las entradas `evidencia` (`append("evidencia", file)` por archivo); las strings fuera.
  raw.evidencias = formData
    .getAll("evidencia")
    .filter((v): v is Exclude<FormDataEntryValue, string> => typeof v !== "string");
  return raw;
}

async function leerEvidencias(files: FileLike[]): Promise<EvidenciaArchivo[]> {
  return Promise.all(
    files.map(async (file) => ({
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}
