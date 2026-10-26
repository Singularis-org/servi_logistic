// Ficha 474 (design §5.2.1, R48/D2) — el ID de la APP de Meta, obtenido del token de WhatsApp.
//
// Hace falta para la subida reanudable del documento de ejemplo de una plantilla con cabecera
// DOCUMENT (`POST /{api}/{APP_ID}/uploads`). No se le pide a nadie (D2): Graph devuelve la app
// duena del token con `GET /<apiVersion>/app`.
//
// SL-36 (design §9.1, §9.2; R28): el token es de cada empresa, y por eso tambien la app. La cache es
// POR EMPRESA: con una sola cache de proceso, la primera empresa que resolviera le prestaria su app
// a todas las demas, y la subida de B iria a la app de A. Desaparece la anulacion del id por entorno:
// era una app de la plataforma.
//
// Las tres invariantes de los clientes de Meta de este repo:
//   1. `fetch` INYECTABLE (los tests no tocan la red ni usan una credencial real);
//   2. TIMEOUT (10 s): un Graph lento no cuelga la server action;
//   3. el token va SOLO en `Authorization: Bearer`, NUNCA en la URL (`?access_token=` acabaria en
//      los logs). Por eso NO se usa `debug_token`, que exige el token en la query (design §5.2.1).
// Nunca se loguea ni se devuelve el token ni el cuerpo de la respuesta: el log lleva operacion,
// estado y codigo.
import { createHash } from "node:crypto";
import { z } from "zod";
import { WhatsappNoConfiguradoError, type WhatsappConfig } from "@/lib/config/whatsapp";

const GRAPH_BASE = "https://graph.facebook.com";
const OPERACION = "identificar la app de meta";
const TIMEOUT_MS = 10_000;

export type MotivoFalloAppId = "sin_credencial" | "http" | "red" | "timeout" | "respuesta_invalida";

export type ResultadoAppId =
  | { ok: true; appId: string; origen: "meta" }
  | {
      ok: false;
      motivo: MotivoFalloAppId;
      /** Codigo HTTP o de error de Meta; nunca el cuerpo crudo. */
      codigo?: number;
    };

/** Contrato que consumen el service de plantillas (R9) y la accion `estadoAppMeta` (R48). */
export interface IResolutorAppIdMeta {
  resolver(): Promise<ResultadoAppId>;
}

/** Lo que el resolutor necesita de la empresa en curso (lo da `whatsappDeLaEmpresa`). */
export interface CredencialAppId {
  organizacionId: string;
  integracionId: string;
  config: Pick<WhatsappConfig, "token" | "apiVersion">;
  /** El `fetch` de la empresa, que marca la integracion si Meta rechaza el token (R30). */
  fetchImpl?: typeof fetch;
}

/**
 * Cache del EXITO por empresa (R28). Se guarda tambien la integracion: si el maestro desconecta y
 * conecta otra cuenta, el token nuevo puede ser de otra app y la entrada vieja ya no vale.
 * Y la huella del token (review SL-36 m2): el maestro puede EDITAR el token sin cambiar de
 * integracion, y el token nuevo puede ser de otra app de Meta.
 */
export type CacheAppId = Map<string, { integracionId: string; huellaToken: string; appId: string }>;

/**
 * Identifica el token sin guardarlo en la cache: un sha256 no se revierte a un token de Meta (alta
 * entropia), y asi la cache no es una segunda copia del secreto en memoria. Mismo criterio que
 * `RutasPorEmpresa` con la clave de la cuenta de servicio. Nunca se loguea.
 */
function huellaDelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const CACHE_PROCESO: CacheAppId = new Map();

export interface LoggerAppId {
  warn(mensaje: string): void;
}

export interface ResolutorAppIdMetaOpts {
  /** La credencial de la empresa en curso. Lanza `WhatsappNoConfiguradoError` si no la tiene. */
  leerWhatsapp: () => Promise<CredencialAppId>;
  /** Por defecto, el de la credencial (y si no trae, el global). */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cache?: CacheAppId;
  logger?: LoggerAppId;
}

const respuestaSchema = z.object({ id: z.string() });

/** Extrae `error.code` de un cuerpo de error sin lanzar. */
function codigoMeta(texto: string): number | undefined {
  try {
    const json: unknown = JSON.parse(texto);
    const code = (json as { error?: { code?: unknown } })?.error?.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

export class ResolutorAppIdMeta implements IResolutorAppIdMeta {
  private readonly leerWhatsapp: () => Promise<CredencialAppId>;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeoutMs: number;
  private readonly cache: CacheAppId;
  private readonly logger: LoggerAppId;

  constructor(opts: ResolutorAppIdMetaOpts) {
    this.leerWhatsapp = opts.leerWhatsapp;
    this.fetchImpl = opts.fetchImpl;
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    this.cache = opts.cache ?? CACHE_PROCESO;
    this.logger = opts.logger ?? { warn: (m) => console.warn(m) };
  }

  async resolver(): Promise<ResultadoAppId> {
    // 1. La credencial de la empresa: sin ella no hay app que identificar, y la cache no se mira
    //    (una empresa sin WhatsApp no tiene app aunque antes la tuviera).
    let credencial: CredencialAppId;
    try {
      credencial = await this.leerWhatsapp();
    } catch (error) {
      if (error instanceof WhatsappNoConfiguradoError) return { ok: false, motivo: "sin_credencial" };
      throw error;
    }

    // 2. Cache de la empresa: SOLO del exito. Un fallo transitorio no deja la funcion rota.
    const huellaToken = huellaDelToken(credencial.config.token);
    const enCache = this.cache.get(credencial.organizacionId);
    if (
      enCache !== undefined &&
      enCache.integracionId === credencial.integracionId &&
      enCache.huellaToken === huellaToken
    ) {
      return { ok: true, appId: enCache.appId, origen: "meta" };
    }

    // 3. Consulta a Graph con el token en la cabecera.
    const url = `${GRAPH_BASE}/${credencial.config.apiVersion}/app`;
    const fetchImpl = this.fetchImpl ?? credencial.fetchImpl ?? fetch;
    let respuesta: Response;
    try {
      respuesta = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${credencial.config.token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const esTimeout =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const motivo: MotivoFalloAppId = esTimeout ? "timeout" : "red";
      this.logger.warn(`[whatsapp] ${OPERACION}: ${motivo}`);
      return { ok: false, motivo };
    }

    if (respuesta.status < 200 || respuesta.status >= 300) {
      const cuerpo = await respuesta.text().catch(() => "");
      const codigo = codigoMeta(cuerpo) ?? respuesta.status;
      this.logger.warn(`[whatsapp] ${OPERACION}: HTTP ${respuesta.status} (codigo ${codigo})`);
      return { ok: false, motivo: "http", codigo };
    }

    let json: unknown;
    try {
      json = await respuesta.json();
    } catch {
      this.logger.warn(`[whatsapp] ${OPERACION}: respuesta no es JSON`);
      return { ok: false, motivo: "respuesta_invalida" };
    }
    const parsed = respuestaSchema.safeParse(json);
    if (!parsed.success || !/^\d+$/.test(parsed.data.id)) {
      this.logger.warn(`[whatsapp] ${OPERACION}: respuesta sin id numerico`);
      return { ok: false, motivo: "respuesta_invalida" };
    }
    this.cache.set(credencial.organizacionId, {
      integracionId: credencial.integracionId,
      huellaToken,
      appId: parsed.data.id,
    });
    return { ok: true, appId: parsed.data.id, origen: "meta" };
  }
}

/**
 * Texto de §3 (R9/R48) para un fallo. Nombra el codigo; nunca un valor secreto ni, desde SL-36, una
 * variable de entorno: la credencial la configura el maestro en su pantalla (R24).
 */
export function mensajeAppIdNoResuelto(r: Extract<ResultadoAppId, { ok: false }>): string {
  if (r.motivo === "sin_credencial") {
    return "WhatsApp no está configurado en tu empresa. Las plantillas con documento no se pueden enviar a aprobación hasta configurarlo; el resto sigue funcionando.";
  }
  const codigo =
    r.codigo !== undefined ? `código ${r.codigo}` : r.motivo === "timeout" ? "tiempo agotado" : r.motivo === "red" ? "sin conexión" : "respuesta inesperada";
  return `No se pudo identificar la app de Meta con el token de WhatsApp configurado (${codigo}). Las plantillas con documento no se pueden enviar a aprobación hasta resolverlo; el resto sigue funcionando.`;
}
