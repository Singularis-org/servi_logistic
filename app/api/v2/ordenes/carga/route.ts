// SLT-45 (design §4.1, R10, R17) — `POST /api/v2/ordenes/carga`: la carga por lote de v2.
//
// Es la carga de v1 (`handleCargaApi`, feature 88) con `version: "v2"`: mismo orden de pasos
// (auth 401/403 → empresa de la key → cuerpo 422 → carga → etiquetas → manifiesto), mismo
// resumen, y la fila trae `ubicacion` o `ubicacion_codigo` en vez de la terna. Solo `POST`: un
// `GET` aqui es 405, igual que en v1.
//
// MIDDLEWARE: `/api/v2` esta en `SELF_AUTH_ROUTES`; la key se valida en el handler.
import type { NextResponse } from "next/server";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";

// Prisma, el hash de la API key y el render del PDF no corren en edge.
export const runtime = "nodejs";

// El mismo presupuesto que la carga de v1: el lote mas su PDF de etiquetas.
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  return handleCargaApi(req, {}, "v2");
}
