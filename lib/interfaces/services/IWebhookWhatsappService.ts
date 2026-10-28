import type { IngestaResumen } from "@/lib/services/ChatWhatsappService";

// SL-36 (design §10; R19-R22) — el webhook de WhatsApp con una sola URL para todas las empresas.
// El route (Controller) solo traduce estos resultados a HTTP: ni la empresa ni la firma se deciden
// alli.

/** Los parametros del handshake GET de Meta, tal como llegan (`null` si faltan). */
export interface VerificacionWebhook {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}

export type ResultadoVerificacionWebhook = { status: "ok"; challenge: string } | { status: "forbidden" };

/** Un POST tal como llega: el cuerpo CRUDO (lo que se firma) y la cabecera `X-Hub-Signature-256`. */
export interface EventoWebhook {
  cuerpoCrudo: string;
  firma: string | null;
}

/**
 * `ok` con al menos una empresa cuya firma valido (R20); `unauthorized` si ninguna lo hizo, sin
 * ningun efecto (R21). Los conteos son agregados y sin PII.
 */
export type ResultadoEventoWebhook = { status: "ok"; resumen: IngestaResumen } | { status: "unauthorized" };

export interface IWebhookWhatsappService {
  /** GET (R19): el `challenge` solo si el token es el de alguna integracion de WhatsApp. */
  verificar(entrada: VerificacionWebhook): Promise<ResultadoVerificacionWebhook>;
  /** POST (R20, R21): empresa por numero, firma con SU App Secret, ingesta en SU contexto. */
  recibir(evento: EventoWebhook): Promise<ResultadoEventoWebhook>;
}
