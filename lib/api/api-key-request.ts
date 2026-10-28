// Feature 106 — helpers compartidos por los endpoints del canal integrador (API por key).
// Extraidos para que los route handlers no dupliquen la extraccion del Bearer ni el armado del
// autenticador. Mismo comportamiento que `app/api/ordenes/api-key/carga/route.ts` (feature 88).
//
// SL-17 (design §7, R13) — la empresa de una peticion por API key es la de la fila `api_key`,
// nunca un dato de la peticion. `buildAutenticar` la resuelve junto con la key, y cada ruta
// ejecuta su cuerpo dentro de `conEmpresaDeLaKey`. No se fija con `enterWith` dentro del
// autenticador: ese contexto no llega de forma fiable a la continuacion del llamador (§11 F).
import type {
  ApiKeyAuthResult,
  IApiKeyAuthService,
} from "@/lib/interfaces/services/IApiKeyAuthService";
import { ApiKeyAuthService } from "@/lib/services/ApiKeyAuthService";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";

type AutenticacionOk = Extract<ApiKeyAuthResult, { status: "ok" }>;

/** Lo que devuelve el autenticador real: el `ok` siempre trae la empresa de la key. */
export type AutenticacionConEmpresa =
  | Exclude<ApiKeyAuthResult, { status: "ok" }>
  | (AutenticacionOk & { organizacionId: string });

/**
 * Lo que aceptan las rutas por inyeccion. La empresa es opcional en el tipo solo para que los
 * dobles de antes de SL-17 sigan valiendo; el autenticador real nunca devuelve `ok` sin ella.
 */
export type AutenticadorApiKey = (
  rawKey: string | null,
) => Promise<ApiKeyAuthResult & { organizacionId?: string }>;

/**
 * R1: extrae el secreto del header `Authorization: Bearer <key>`. `null` si el header esta
 * ausente o no usa el esquema `Bearer` o el token esta vacio (-> el autenticador lo trata como
 * sin key, R2). La key NUNCA se loguea (R5).
 */
export function extraerBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() === "" ? null : token;
}

/** Factory del autenticador por key real (prod). En tests se inyecta un fake por `deps`. */
export function buildAutenticar(): (rawKey: string | null) => Promise<AutenticacionConEmpresa> {
  const prisma = getPrismaClient();
  const auth: IApiKeyAuthService = new ApiKeyAuthService(new ApiKeyRepository(prisma));
  // `api_key` y `usuario` son de negocio y todavia no hay empresa: es justo lo que se averigua.
  return (rawKey) =>
    comoPlataforma("SL-17", "resolver la API key", async (): Promise<AutenticacionConEmpresa> => {
      const resultado = await auth.autenticar(rawKey);
      if (resultado.status !== "ok") return resultado;
      const fila = await prisma.apiKey.findUnique({
        where: { id: resultado.apiKeyId },
        select: { organizacionId: true },
      });
      // Una key sin empresa no puede operar en ninguna: se responde como una key desconocida
      // (401) y no como prohibida, para no revelar que la credencial existe.
      const organizacionId = fila?.organizacionId?.trim();
      if (!organizacionId) return { status: "unauthenticated" };
      return { ...resultado, organizacionId };
    });
}

/**
 * Ejecuta el cuerpo de una ruta con la empresa de la key en contexto (R13).
 *
 * Sin `organizacionId` solo puede llegar un doble inyectado de antes de SL-17 (el autenticador
 * real devuelve 401 en ese caso): el cuerpo corre sin contexto explicito y cualquier lectura de
 * negocio falla cerrado igual (R11), asi que no se abre nada.
 */
export function conEmpresaDeLaKey<T>(
  auth: { organizacionId?: string },
  cuerpo: () => Promise<T>,
): Promise<T> {
  if (auth.organizacionId === undefined) return cuerpo();
  return conEmpresa(auth.organizacionId, cuerpo);
}
