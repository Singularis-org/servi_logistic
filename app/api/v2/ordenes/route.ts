// SLT-45 (design §4.1, §4.2, R10, R18) — `POST /api/v2/ordenes`: crear UNA orden.
//
// La orden se pasa al pipeline de la carga como un lote de una fila (`procesarCargaApi`, el mismo
// que usa `POST /api/v2/ordenes/carga`): crea su `carga` de una orden y emite etiquetas y
// manifiesto igual que el lote, y responde con la misma forma (`CargaResponseV2`). Lo unico propio
// de esta ruta es el cuerpo: `{ orden, name?, download_type? }` en vez de `{ ordenes: [...] }`.
//
// Orden de pasos (§4.4): `extraerBearer` → `buildAutenticar` → 401/403 → `conEmpresaDeLaKey` →
// cuerpo 422 → pipeline. La key nunca se loguea ni entra a una respuesta.
//
// MIDDLEWARE: `/api/v2` esta en `SELF_AUTH_ROUTES`; la key se valida aqui.
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
import { extraerBearer, buildAutenticar, conEmpresaDeLaKey } from "@/lib/api/api-key-request";
import { crearOrdenV2BodySchema } from "@/lib/types/api-v2";
import { procesarCargaApi, type CargaApiDeps } from "@/app/api/ordenes/api-key/carga/route";

// Prisma, el hash de la API key y el render del PDF no corren en edge.
export const runtime = "nodejs";

// El mismo presupuesto que la carga: una orden mas su PDF de etiquetas.
export const maxDuration = 60;

/** Logica del endpoint, con `deps` inyectables para tests (los mismos que la carga). */
export async function handleCrearOrdenV2(req: Request, deps: CargaApiDeps = {}): Promise<NextResponse> {
  const result = await withErrorHandler(async () => {
    // 1. R11: autenticacion por API key ANTES de tocar el cuerpo.
    const rawKey = extraerBearer(req);
    const auth = await (deps.autenticar ?? buildAutenticar())(rawKey);
    if (auth.status === "unauthenticated") throw new UnauthenticatedError(); // 401
    if (auth.status === "forbidden") throw new ForbiddenError(); // 403

    // SL-17 (R13): todo lo que sigue opera con la empresa de la key.
    return conEmpresaDeLaKey(auth, async () => {
      let json: unknown;
      try {
        json = await req.json();
      } catch {
        throw new ValidationError(MSG.VALIDATION_ERROR, {
          fieldErrors: { orden: ["cuerpo JSON inválido"] },
        });
      }
      const parsed = crearOrdenV2BodySchema.safeParse(json);
      if (!parsed.success) {
        const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
        throw new ValidationError(MSG.VALIDATION_ERROR, { fieldErrors });
      }

      // R18: la orden es un lote de una fila.
      const { orden, name, download_type } = parsed.data;
      return procesarCargaApi({ ordenes: [orden], name, download_type }, auth.actor, deps, "v2");
    });
  });

  if (isAppErrorShape(result)) return appErrorToResponse(result);
  return NextResponse.json(result, { status: 200 });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleCrearOrdenV2(req);
}
