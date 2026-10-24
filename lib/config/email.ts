// Configuracion del canal de correo saliente (SMTP via nodemailer).
//
// Las credenciales viven SOLO en variables de entorno (docs/architecture.md:
// "Sin hardcode de contexto"); este modulo las lee y valida en un unico sitio,
// igual que lib/config/whatsapp.ts hace con la Graph API.
//
// INVARIANTE DE SEGURIDAD: si falta una pieza se cita el NOMBRE de la variable,
// jamas su valor. La contrasena SMTP no aparece nunca en un error ni en un log.

// Valores que los pone el PROVEEDOR, no el negocio: el canal es Brevo (SL-41, D8), asi que
// host, puerto y modo TLS son constantes conocidas y no piezas de configuracion que alguien deba
// averiguar. Se dejan igualmente sobreescribibles por env para no clavar el proveedor en el
// codigo: mudarse a otro relay es cambiar SMTP_HOST, nada mas.

import { z } from "zod";

import { MARCA } from "@/lib/config/marca";

/** Relay SMTP de Brevo. */
const DEFAULT_SMTP_HOST = "smtp-relay.brevo.com";

/** Puerto SMTP por defecto: submission con STARTTLS, el que Brevo documenta para su relay. */
const DEFAULT_SMTP_PORT = 587;

/** Nombre visible del remitente cuando no se configura uno. */
const DEFAULT_FROM_NAME = MARCA.nombre;

/** Timeout (ms) de cada fase de la conexion SMTP. Evita colgar una Server Action. */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Falta alguna pieza de la configuracion SMTP. Se lanza ANTES de abrir la
 * conexion. Cita QUE falta (nombre de la variable), nunca el valor.
 */
export class EmailNoConfiguradoError extends Error {
  constructor(pieza: string) {
    super(`email: configuracion SMTP incompleta (falta ${pieza})`);
    this.name = "EmailNoConfiguradoError";
  }
}

export interface EmailConfig {
  /** Host del servidor SMTP. */
  host: string;
  /** Puerto SMTP. 465 implica TLS implicito; 587/25 usan STARTTLS. */
  port: number;
  /** TLS implicito desde el saludo. Derivado del puerto salvo override explicito. */
  secure: boolean;
  /**
   * Login SMTP de Brevo (el que da su panel en «SMTP y API»). No es una direccion desde la
   * que se pueda enviar: por eso conviene declarar SMTP_FROM.
   */
  user: string;
  /**
   * Clave SMTP de Brevo. NO es la contrasena de la cuenta de Brevo ni una clave de su API REST.
   * Solo se pasa a nodemailer; nunca se loguea ni se serializa.
   */
  password: string;
  /**
   * Direccion remitente (From): un remitente verificado en Brevo. Si falta SMTP_FROM cae en el
   * login SMTP para no romper el envio en un entorno que aun no lo declara (SL-41, P2); Brevo
   * rechaza un From que no este verificado, asi que en produccion se declara.
   */
  from: string;
  /** Nombre visible del remitente. */
  fromName: string;
  /** Timeout por fase (conexion, saludo, socket) en milisegundos. */
  timeoutMs: number;
  /**
   * Validacion del certificado del servidor. `false` SOLO para un relay local de
   * pruebas (Mailpit/MailHog); en produccion jamas se desactiva.
   */
  rejectUnauthorized: boolean;
}

function leerTexto(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  return raw.trim();
}

function leerRequerido(name: string): string {
  const valor = leerTexto(name);
  if (valor === null) throw new EmailNoConfiguradoError(name);
  return valor;
}

function leerBooleano(name: string, fallback: boolean): boolean {
  const raw = leerTexto(name);
  if (raw === null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function leerEnteroPositivo(name: string, fallback: number): number {
  const raw = leerTexto(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Quita los espacios de la clave SMTP. Una clave pegada desde un panel o un gestor de claves
 * arrastra a veces espacios o un salto de linea, y el servidor la espera sin ellos: sin esto el
 * fallo es un 535 opaco. Ninguna clave SMTP de Brevo lleva espacios, asi que no estorba.
 */
function normalizarPassword(valor: string): string {
  return valor.replace(/\s+/g, "");
}

/**
 * Hay SMTP utilizable. Es la condicion que decide, en el borde, si se instancia
 * el emisor real o el de consola. Se mira la CREDENCIAL y no el host, porque el
 * host ya trae default de proveedor: sin login ni clave SMTP no
 * hay envio posible, y el flujo debe degradar en vez de reventar en dev y en
 * los tests.
 */
export function emailSmtpConfigurado(): boolean {
  return leerTexto("SMTP_USER") !== null && leerTexto("SMTP_PASSWORD") !== null;
}

/**
 * Lee y valida la configuracion SMTP. Lanza EmailNoConfiguradoError citando el
 * NOMBRE de la variable ausente. Llamar en el borde, antes de abrir la conexion:
 * asi un fallo de configuracion se detecta sin tocar la red.
 */
export function loadEmailConfig(): EmailConfig {
  const port = leerEnteroPositivo("SMTP_PORT", DEFAULT_SMTP_PORT);
  const user = leerRequerido("SMTP_USER");
  return {
    host: leerTexto("SMTP_HOST") ?? DEFAULT_SMTP_HOST,
    port,
    secure: leerBooleano("SMTP_SECURE", port === 465),
    user,
    password: normalizarPassword(leerRequerido("SMTP_PASSWORD")),
    from: leerTexto("SMTP_FROM") ?? user,
    fromName: leerTexto("SMTP_FROM_NAME") ?? DEFAULT_FROM_NAME,
    timeoutMs: leerEnteroPositivo("SMTP_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    rejectUnauthorized: leerBooleano("SMTP_TLS_REJECT_UNAUTHORIZED", true),
  };
}

/**
 * Volcado del codigo OTP en claro por consola. SOLO para desarrollo local sin
 * SMTP: sin esto el flujo de recuperacion no se puede completar en una maquina
 * sin relay. Mismo patron que WHATSAPP_DEBUG_LOG. Vacio en produccion, y apagado alli aunque
 * se encienda.
 */
export function otpDebugLogHabilitado(): boolean {
  // SL-44 (R1, design.md > D1): en produccion el codigo del OTP no se escribe nunca, aunque alguien
  // encienda la variable: los logs de Vercel los ve todo el equipo y se conservan. Se mira
  // VERCEL_ENV y no NODE_ENV porque el E2E de CI corre `next start`, que es NODE_ENV=production.
  if (process.env.VERCEL_ENV === "production") return false;
  return leerBooleano("AUTH_OTP_DEBUG_LOG", false);
}

/**
 * SL-41 (R39, P4) — direccion de contacto que el pie de cada correo muestra, o `null`.
 *
 * Es un lector APARTE de `loadEmailConfig()` a proposito: aquel lanza si falta SMTP, y el OTP por
 * consola (dev, CI, entornos sin relay) tiene que seguir componiendo su correo sin SMTP. Un valor
 * que no es un email se descarta en vez de pintarse: un pie con «Escribenos a xyz» seria peor que
 * un pie sin direccion.
 */
export function emailContacto(): string | null {
  const valor = leerTexto("EMAIL_CONTACTO");
  if (valor === null) return null;
  return z.email().safeParse(valor).success ? valor : null;
}
