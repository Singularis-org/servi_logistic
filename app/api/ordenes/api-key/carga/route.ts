// Feature 88 — Carga de órdenes por API (canal integrador). A diferencia de la carga
// masiva por sesión (`carga-masiva/chunk`), este endpoint se autentica por API KEY en el
// header `Authorization: Bearer svl_...` (no por cookie de sesión), asigna `num_guia` en el
// acto y devuelve cada orden con su guía. Reutiliza `BulkOrdenService` por dentro (misma
// validación/dedup/geo).
//
// FEATURE 155 — el estado inicial deja de ser fijo: lo resuelve la bifurcación por bodega
// (`resolverDestinoCreacion`) sobre el flag `fulfillment` del dueño de la key. En la práctica
// eso es siempre la rama (b): `por_recolectar_en_tienda` con guía en el acto. Y como ese lote
// SÍ produce un movimiento físico (tienda → bodega central), la respuesta gana el bloque
// `manifiesto` (R24, opción C de la puerta T0.1): el canal de API key no puede invocar la
// Server Action `obtenerManifiesto` —resuelve al actor por cookie de sesión— así que necesita
// su propio borde. Se sigue el precedente EXACTO de `etiquetasPdf`: best-effort, la carga ya
// commiteada nunca se revierte por él (R25), y el fallo se hace visible con `{ error }`.
//
// SEGURIDAD (R6): la key viaja en cada request. NUNCA se loguea (ni la key ni su hash), ni
// entra al cuerpo de una respuesta de error (`appErrorToResponse` no incluye headers).
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withErrorHandler,
  isAppErrorShape,
  appErrorToResponse,
  UnauthenticatedError,
  ForbiddenError,
  ValidationError,
  MSG,
} from "@/lib/errors";
import { buildAutenticar, conEmpresaDeLaKey } from "@/lib/api/api-key-request";
import {
  procesarCargaApi,
  type CargaApiDeps,
  type VersionCargaApi,
} from "@/lib/api/api-carga";
import { cargaMasivaConfig } from "@/lib/config/carga-masiva";
import { cargaV2BodySchema } from "@/lib/types/api-v2";

// SLT-45 (review m1): el pipeline (carga, etiquetas, manifiesto) y sus composition roots viven en
// `lib/api/api-carga.ts`; aqui queda el borde HTTP. Los tipos se re-exportan para quien los importa
// de esta ruta.
export type { CargaApiDeps, VersionCargaApi };

// El runtime de Node es OBLIGATORIO: Prisma, el hash de la API key y el render del
// PDF (jspdf/qrcode/bwip-js, R7) no corren en edge.
export const runtime = "nodejs";

// Presupuesto de tiempo de la ruta, coherente con el tope de etiquetas por PDF
// (`etiquetasConfig.MAX_ETIQUETAS_POR_PDF`, default 300 ~= 5.6 s de render): 60 s
// cubren la insercion del lote (hasta MAX_CHUNK_ROWS filas) MAS el PDF con margen.
// Explicito para no depender del default de plataforma (10 s), que si podia cortar
// la respuesta DESPUES de commitear las ordenes (BLOQ-1).
export const maxDuration = 60;

// R1/§3: extrae el secreto del header `Authorization: Bearer <key>`. `null` si el header
// está ausente o no usa el esquema `Bearer` (-> el autenticador lo trata como sin key, R2).
function extraerBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() === "" ? null : token;
}

// Body: filas crudas (clave = header, valor = texto), mismo shape que consume
// `BulkOrdenService`. Tope defensivo por lote reusado de la carga masiva.
const cargaApiBodySchema = z.object({
  ordenes: z
    .array(z.record(z.string(), z.string()))
    .min(1, "el lote no puede estar vacío")
    .max(cargaMasivaConfig.MAX_CHUNK_ROWS, "el lote excede el máximo permitido"),
  // Feature 141 (R20/R21/R22): nombre OPCIONAL del lote. Repetirlo dentro del mismo usuario
  // (el de la key) -> 409 (R24).
  name: z.string().trim().min(1).max(120).optional(),
  // Feature 141 (R42/R43/R44): modo de descarga de las etiquetas del lote. Ausente =
  // `consolidate` (compatibilidad con la feature 136); un valor fuera del enum es
  // VALIDATION_ERROR (422) ANTES de crear ninguna orden y sin tocar Storage. NO se persiste
  // en ninguna tabla (R45): es un parámetro de la petición, no un atributo del lote.
  download_type: z.enum(["consolidate", "individual"]).optional().default("consolidate"),
});

/**
 * Lógica del endpoint, extraída para inyección de dependencias en tests (autenticar +
 * service fake), sin DB ni cookies reales — mismo patrón que `handleCargaMasivaChunk`.
 */
export async function handleCargaApi(
  req: Request,
  deps: CargaApiDeps = {},
  version: VersionCargaApi = "v1",
): Promise<NextResponse> {
  const result = await withErrorHandler(async () => {
    // 1/2. R1-R5: autenticación por API key ANTES de tocar el cuerpo (defensa en profundidad).
    const rawKey = extraerBearer(req);
    const auth = await (deps.autenticar ?? buildAutenticar())(rawKey);
    if (auth.status === "unauthenticated") throw new UnauthenticatedError(); // R2/R4 -> 401
    if (auth.status === "forbidden") throw new ForbiddenError(); // R5 -> 403

    // SL-17 (R13): todo lo que sigue opera con la empresa de la key, no con la de nadie mas.
    return conEmpresaDeLaKey(auth, async () => {
      // 3. R7: cuerpo válido (JSON + schema).
      let json: unknown;
      try {
        json = await req.json();
      } catch {
        throw new ValidationError(MSG.VALIDATION_ERROR, {
          fieldErrors: { ordenes: ["cuerpo JSON inválido"] },
        });
      }
      // SLT-45 (§4.1): v2 valida con su propio schema (sin la terna, con `ubicacion`).
      const parsed =
        version === "v2" ? cargaV2BodySchema.safeParse(json) : cargaApiBodySchema.safeParse(json);
      if (!parsed.success) {
        const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
        throw new ValidationError(MSG.VALIDATION_ERROR, { fieldErrors });
      }

      return procesarCargaApi(parsed.data, auth.actor, deps, version);
    });
  });

  if (isAppErrorShape(result)) return appErrorToResponse(result);
  return NextResponse.json(result, { status: 200 });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleCargaApi(req);
}
