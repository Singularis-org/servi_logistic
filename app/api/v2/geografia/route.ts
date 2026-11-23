// SLT-45 (design §6, R10, R22, R23) — `GET /api/v2/geografia?pais=`: el catalogo geografico del
// pais de la empresa de la key (tipos de nivel y todos los nodos, con el activo en cascada).
//
// Orden de pasos (§4.4): `extraerBearer` → `buildAutenticar` → 401/403 → `conEmpresaDeLaKey` →
// query 422 → servicio. Un pais ajeno y uno inexistente dan el MISMO 404 (`NotFoundError`): el
// canal no revela que paises existen.
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
  NotFoundError,
  ValidationError,
  MSG,
} from "@/lib/errors";
import {
  extraerBearer,
  buildAutenticar,
  conEmpresaDeLaKey,
  type AutenticadorApiKey,
} from "@/lib/api/api-key-request";
import type { IGeografiaApiService } from "@/lib/interfaces/services/IGeografiaApiService";
import { GeografiaApiService } from "@/lib/services/GeografiaApiService";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { geografiaQuerySchema } from "@/lib/types/api-v2";

// Prisma y el hash de la API key no corren en edge.
export const runtime = "nodejs";

export interface GeografiaApiDeps {
  autenticar?: AutenticadorApiKey;
  geografiaService?: IGeografiaApiService;
}

function buildGeografiaService(): IGeografiaApiService {
  const prisma = getPrismaClient();
  return new GeografiaApiService(new CatalogoGeograficoRepository(prisma), new PaisRepository(prisma));
}

/** Logica del endpoint, con `deps` inyectables para tests. */
export async function handleGeografiaApi(req: Request, deps: GeografiaApiDeps = {}): Promise<NextResponse> {
  const result = await withErrorHandler(async () => {
    // 1. R11: autenticacion por API key ANTES de leer la query.
    const rawKey = extraerBearer(req);
    const auth = await (deps.autenticar ?? buildAutenticar())(rawKey);
    if (auth.status === "unauthenticated") throw new UnauthenticatedError(); // 401
    if (auth.status === "forbidden") throw new ForbiddenError(); // 403

    // SL-17 (R13): todo lo que sigue opera con la empresa de la key.
    return conEmpresaDeLaKey(auth, async () => {
      // 2. R23: solo se lee `pais`; cualquier otra clave de la query se ignora.
      const sp = new URL(req.url).searchParams;
      const raw: Record<string, string> = {};
      if (sp.has("pais")) raw.pais = sp.get("pais") ?? "";
      const parsed = geografiaQuerySchema.safeParse(raw);
      if (!parsed.success) {
        const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
        throw new ValidationError(MSG.VALIDATION_ERROR, { fieldErrors }); // 422
      }

      // 3. R22/R23: el servicio sirve solo el pais de la empresa de la key.
      const service = deps.geografiaService ?? buildGeografiaService();
      const r = await service.catalogo(auth.actor, parsed.data.pais);
      if (r.status === "forbidden") throw new ForbiddenError(); // defensa en profundidad
      if (r.status === "not_found") throw new NotFoundError(); // 404 uniforme
      return r.catalogo;
    });
  });

  if (isAppErrorShape(result)) return appErrorToResponse(result);
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleGeografiaApi(req);
}
