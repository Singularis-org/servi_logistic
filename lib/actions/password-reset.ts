"use server";

import {
  requestResetSchema,
  crearConEnlaceSchema,
  type PasswordResetRequestResult,
  type ResetPasswordResult,
} from "@/lib/types/password-reset";
import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { computeDeviceHash } from "@/lib/utils/device";
import {
  buildPasswordResetService,
  requestContextFromHeaders,
  type RequestContext,
} from "@/lib/actions/_shared/contexto-peticion";

// SL-41 (design §7.1): el composition root y la lectura de cabeceras viven en `_shared/`, fuera de
// este archivo "use server", porque aqui todo export de funcion es un endpoint publico. El tipo
// `RequestContext` NO se reexporta desde aqui: Turbopack trata `export type { X };` como un export
// de runtime y el modulo entero falla al cargar (guardia use-server-sin-reexport-de-tipos).

export interface PasswordResetDeps {
  service?: IPasswordResetService;
  getContext?: () => Promise<RequestContext>;
}

/**
 * Server Action del paso 1 (R1/R12/R19; SL-18 R16, R17). Valida el email y delega en el
 * servicio, que manda un correo con un enlace por cuenta. SIEMPRE responde `ok` generico cuando
 * la validacion pasa: nunca revela si la cuenta existe.
 *
 * Reactivada el 2026-10-22 por SL-32 (R38): el correo sale por SMTP (Brevo en
 * Vercel) y sin SMTP degrada a `ConsoleEmailSender`.
 */
export async function solicitarRecuperacion(
  input: unknown,
  deps: PasswordResetDeps = {},
): Promise<PasswordResetRequestResult> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const getContext = deps.getContext ?? requestContextFromHeaders;
  const service = deps.service ?? buildPasswordResetService();
  const context = await getContext();

  // SL-17 (design §7): quien pide recuperar su clave no tiene sesion ni empresa. SL-18: el email
  // ya no es unico global; el servicio busca TODAS sus cuentas y emite un enlace por cada una.
  await comoPlataforma("SL-17", "login", () =>
    service.solicitar({
      email: parsed.data.email,
      deviceHash: computeDeviceHash(context.userAgent),
      ipAddress: context.ipAddress,
    }),
  );
  return { status: "ok" };
}

/**
 * SL-41 (design §7.3, R18-R20): el maestro crea su contrasena con el enlace de la bienvenida.
 * SL-18 (R18, R19): tambien canjea el enlace de «recuperar contrasena»; cambia solo la cuenta del
 * enlace. No abre sesion: se entra despues por `/login`.
 */
export async function crearContrasenaConEnlace(
  input: unknown,
  deps: PasswordResetDeps = {},
): Promise<ResetPasswordResult> {
  const parsed = crearConEnlaceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const getContext = deps.getContext ?? requestContextFromHeaders;
  const service = deps.service ?? buildPasswordResetService();
  const context = await getContext();

  // Quien abre el enlace no tiene sesion ni empresa; el desafio lleva al usuario por su id. La
  // escritura es la del propio `usuario.password_hash` y no cambia `organizacion_id`.
  return comoPlataforma("SL-41", "login", () =>
    service.crearContrasenaConEnlace({
      enlace: parsed.data.enlace,
      newPassword: parsed.data.password,
      ipAddress: context.ipAddress,
    }),
  );
}
