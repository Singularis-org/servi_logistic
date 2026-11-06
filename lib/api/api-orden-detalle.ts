// Feature 177 (design §5.1) + SLT-45 (design §4.1, R20) — lector del detalle publico de UNA orden
// ya resuelta a `orden.id`, compartido por `GET /api/ordenes/api-key/orden/{id}` (v1) y
// `GET /api/v2/ordenes/{id}` (v2, que le añade `ubicacion`).
//
// Vive en `lib/` (no en el module de la ruta v1) porque un `route.ts` de Next solo exporta handlers
// HTTP y campos de config, y porque las DOS versiones deben leer EXACTAMENTE el mismo detalle: si
// cada ruta armara el suyo, v2 podria dejar de ser «v1 + `ubicacion`».
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ApiOrdenDetalleDTO } from "@/lib/types/api-orden";
import { ApiOrdenLecturaService } from "@/lib/services/ApiOrdenLecturaService";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
// ⏳ 2026-09-10 (feature 415, T5): la tarifa VIGENTE que alimenta `costoEstimado`.
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { SupabaseSignedUrlProvider } from "@/lib/storage/SupabaseSignedUrlProvider";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { gestionConfig } from "@/lib/config/gestion";

/** Lee el detalle publico (DTO de la feature 106) de una orden YA resuelta a `orden.id`. */
export type DetallePorOrdenId = (
  actor: Actor,
  ordenId: string,
) => Promise<ApiOrdenDetalleDTO | null>;

/**
 * R16/R17 (177) — el DTO de detalle lo produce el `ApiOrdenLecturaService` YA EXISTENTE de la 106:
 * mismo mapeo, mismas evidencias firmadas a 5 min, mismo `[]` cuando no hay. Como su
 * `detalle(actor, numGuia)` opera por `num_guia` (que puede ser NULL) y aqui la resolucion
 * entrega un `orden.id`, se usa su metodo hermano `detallePorOrdenId(actor, ordenId)`, que
 * comparte el mapeo/firmado y lee por `findDetalleByOrdenIdForOwner` (MISMA proyeccion,
 * `IOrdenRepository:617-622`). `detalle` de la 106 no se toca (R17).
 */
export function buildDetallePorOrdenId(): DetallePorOrdenId {
  const prisma = getPrismaClient();
  const signedUrls = new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET);
  // ⏳ 2026-09-10 (feature 415, T5): el MISMO resolutor que el listado, construido y **PASADO**.
  // Si no se pasara, el detalle publicaria `costoEstimado` muerto y nada mas se enteraria.
  const lectura = new ApiOrdenLecturaService(
    new OrdenRepository(prisma),
    signedUrls,
    new TarifaVigenteRepository(prisma),
  );
  return (actor, ordenId) => lectura.detallePorOrdenId(actor, ordenId);
}
