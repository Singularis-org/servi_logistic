// Configuracion de la integracion con WhatsApp Cloud API (Meta Graph API).
//
// SL-36 (design §9.1, R23): las credenciales ya NO viven en el entorno. Son de cada empresa y se
// leen de su integracion (`ICredencialesIntegracion.leer("whatsapp")`, ver
// `lib/services/whatsapp/whatsapp-de-la-empresa.ts`). Este modulo solo arma la config a partir de
// esa credencial (`whatsappConfigDe`, puro) y conserva del entorno lo que NO es una clave: la
// version de la Graph API y la categoria e idioma con que se crean las plantillas.
//
// INVARIANTE DE SEGURIDAD: el token nunca aparece en un mensaje de error ni en un log.

import type { CredencialPorServicio, DatosPublicosPorServicio } from "@/lib/types/integraciones";

/** Version de la Graph API. Sobreescribible; default estable a fecha de la feature. */
const DEFAULT_API_VERSION = "v21.0";

/** Categoria por defecto al crear un template en Meta (MARKETING | UTILITY | AUTHENTICATION). */
const DEFAULT_TEMPLATE_CATEGORY = "UTILITY";

/** Idioma por defecto del template al crearlo en Meta. */
const DEFAULT_TEMPLATE_LANG = "es";

/**
 * Maximo de reintentos del job `whatsapp_template_sync` cuando la propagacion sincrona a
 * Meta falla. FIJADO = 5 (decision humana). Override por-fila en el `enqueue`.
 */
export const MAX_INTENTOS_WHATSAPP_TEMPLATE = 5;

/** R24: lo que se le dice a la empresa sin WhatsApp; la pantalla lo acompana del enlace. */
export const TEXTO_WHATSAPP_NO_CONFIGURADO = "WhatsApp no está configurado en tu empresa.";

/** R24: a donde lleva el enlace del aviso (la pantalla de T7). */
export const RUTA_CONFIGURAR_INTEGRACIONES = "/configuracion/integraciones";

/**
 * La empresa en curso no tiene una credencial de WhatsApp que se pueda usar. Se lanza ANTES de
 * cualquier llamada de red. `ilegible` ya dejo la integracion en `error` (R29); para quien consume
 * las dos son lo mismo: no hay con que llamar a Meta.
 */
export class WhatsappNoConfiguradoError extends Error {
  constructor(readonly motivo: "sin_configurar" | "ilegible" = "sin_configurar") {
    super(`whatsapp: no esta configurado en la empresa (${motivo})`);
    this.name = "WhatsappNoConfiguradoError";
  }
}

export interface WhatsappConfig {
  /** Token de acceso (Bearer) de la app de WhatsApp Cloud de la empresa. */
  token: string;
  /** ID del numero de telefono emisor (Phone Number ID de Meta). Envio de mensajes. */
  numeroId: string;
  /**
   * ID de la WhatsApp Business Account (WABA). Necesario para el CRUD de plantillas:
   * las plantillas cuelgan de la cuenta, no del numero.
   */
  wabaId: string;
  /** Version de la Graph API contra la que se llama. */
  apiVersion: string;
  /** Categoria con la que se crean los templates en Meta. */
  templateCategoria: string;
  /** Idioma con el que se crean los templates en Meta. */
  templateIdioma: string;
}

/** Version de la Graph API: un parametro de la plataforma, no una credencial. */
export function versionApiWhatsapp(): string {
  return process.env.WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION;
}

/** Idioma con que se crean las plantillas; tambien el de reserva al enviar una sin idioma propio. */
export function idiomaPlantillasWhatsapp(): string {
  return process.env.WHATSAPP_TEMPLATE_LANG?.trim() || DEFAULT_TEMPLATE_LANG;
}

/**
 * La config de envio a partir de la credencial de la empresa. Pura salvo los tres parametros de
 * producto del entorno, que son iguales para todas las empresas.
 */
export function whatsappConfigDe(
  credencial: CredencialPorServicio["whatsapp"],
  datosPublicos: Pick<DatosPublicosPorServicio["whatsapp"], "numeroId" | "wabaId">,
): WhatsappConfig {
  return {
    token: credencial.token_acceso,
    numeroId: datosPublicos.numeroId,
    wabaId: datosPublicos.wabaId,
    apiVersion: versionApiWhatsapp(),
    templateCategoria: process.env.WHATSAPP_TEMPLATE_CATEGORY?.trim() || DEFAULT_TEMPLATE_CATEGORY,
    templateIdioma: idiomaPlantillasWhatsapp(),
  };
}
