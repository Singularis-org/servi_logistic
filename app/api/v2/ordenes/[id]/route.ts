// SLT-45 (design §4.1, §4.3, R10, R20, R21) — `GET /api/v2/ordenes/{id}`: el detalle de una orden
// propia, el de v1 mas `ubicacion`.
//
// Reutiliza `handleConsultaOrdenApi` de v1 (feature 177) sin tocarlo: mismo orden de pasos
// (auth 401/403 → empresa de la key → `{id}` 422 → resolucion guia/remision → 404 uniforme). Lo
// unico que cambia es la lectura del detalle: al DTO de v1 se le añade la ruta del lugar de la
// orden, que da `GeografiaApiService.ubicacionDeOrden` con el dueño forzado. Una orden ajena,
// borrada o inexistente sigue dando el MISMO 404.
//
// `carga` y `cotizacion` son segmentos estaticos y ganan a `[id]` en el App Router.
// MIDDLEWARE: `/api/v2` esta en `SELF_AUTH_ROUTES`; la key se valida en el handler.
import type { NextResponse } from "next/server";

import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IGeografiaApiService } from "@/lib/interfaces/services/IGeografiaApiService";
import type { ApiOrdenDetalleDTO } from "@/lib/types/api-orden";
import type { UbicacionDTO } from "@/lib/types/api-v2";
import { GeografiaApiService } from "@/lib/services/GeografiaApiService";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { buildDetallePorOrdenId, type DetallePorOrdenId } from "@/lib/api/api-orden-detalle";
import { handleConsultaOrdenApi, type ConsultaOrdenApiDeps } from "@/app/api/ordenes/api-key/orden/[id]/route";

export const runtime = "nodejs";

/** El detalle de v2: el de v1 + la ruta de su lugar (R20, R21). */
export type OrdenDetalleV2 = ApiOrdenDetalleDTO & { ubicacion: UbicacionDTO[] };

export interface ConsultaOrdenV2Deps extends ConsultaOrdenApiDeps {
  geografiaService?: IGeografiaApiService;
}

function buildGeografiaService(): IGeografiaApiService {
  const prisma = getPrismaClient();
  return new GeografiaApiService(
    new CatalogoGeograficoRepository(prisma),
    new PaisRepository(prisma),
    new OrdenRepository(prisma),
  );
}

/**
 * Lee el detalle con el lector de v1 (el inyectado, o el de su propio composition root) y le añade
 * `ubicacion`. `null` (→ 404 uniforme) si v1 no lo encuentra. Todo se construye perezosamente, ya
 * dentro de `conEmpresaDeLaKey`.
 */
function detalleV2(detalleV1: DetallePorOrdenId | undefined, geo: () => IGeografiaApiService): DetallePorOrdenId {
  return async (actor: Actor, ordenId: string): Promise<OrdenDetalleV2 | null> => {
    const detalle = await (detalleV1 ?? buildDetallePorOrdenId())(actor, ordenId);
    if (!detalle) return null;
    const r = await geo().ubicacionDeOrden(actor, ordenId);
    if (r.status === "forbidden") throw new ForbiddenError();
    // Carrera (borrada entre las dos lecturas): el mismo 404 de siempre.
    if (r.status === "not_found") throw new NotFoundError();
    return { ...detalle, ubicacion: r.ubicacion };
  };
}

/** Logica del endpoint, con `{id}` crudo y `deps` inyectables para tests. */
export async function handleConsultaOrdenV2(
  req: Request,
  rawId: string,
  deps: ConsultaOrdenV2Deps = {},
): Promise<NextResponse> {
  return handleConsultaOrdenApi(req, rawId, {
    autenticar: deps.autenticar,
    resolucionService: deps.resolucionService,
    detallePorOrdenId: detalleV2(deps.detallePorOrdenId, () => deps.geografiaService ?? buildGeografiaService()),
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return handleConsultaOrdenV2(req, id);
}
