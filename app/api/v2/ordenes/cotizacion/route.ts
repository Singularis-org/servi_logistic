// SLT-45 (design §4.1, R19) — `POST /api/v2/ordenes/cotizacion`: la cotizacion de v2.
//
// Es la cotizacion de v1 (`handleCotizacionApi`, feature 255) con `version: "v2"`: los mismos
// importes del mismo `CotizacionOrdenService` y la misma tarifa, mas `filas[].ubicacion`. No
// persiste nada.
//
// MIDDLEWARE: `/api/v2` esta en `SELF_AUTH_ROUTES`; la key se valida en el handler.
import type { NextResponse } from "next/server";

import { handleCotizacionApi } from "@/app/api/ordenes/api-key/cotizacion/route";

// Prisma y el hash de la API key no corren en edge.
export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  return handleCotizacionApi(req, {}, "v2");
}
