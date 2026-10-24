"use server";

import {
  requestResetSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
  crearConEnlaceSchema,
  type PasswordResetRequestResult,
  type VerifyResetCodeResult,
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
// este archivo "use server", porque aqui todo export de funcion es un endpoint publico.
export type { RequestContext };

export interface PasswordResetDeps {
  service?: IPasswordResetService;
  getContext?: () => Promise<RequestContext>;
}

/**
 * Server Action del paso 1 (R1/R12/R19). Valida el email y delega en el
 * servicio. SIEMPRE responde `ok` generico cuando la validacion pasa: nunca
 * revela si la cuenta existe.
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

  // SL-17 (design §7): quien pide recuperar su clave no tiene sesion ni empresa; el usuario se
  // busca por email, unico global (R36).
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
 * Server Action del paso 2 (R5/R6/R20). Verifica el codigo sin consumir el
 * desafio. Error generico `invalid_or_expired` ante cualquier fallo.
 */
export async function verificarCodigoRecuperacion(
  input: unknown,
  deps: PasswordResetDeps = {},
): Promise<VerifyResetCodeResult> {
  const parsed = verifyResetCodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const getContext = deps.getContext ?? requestContextFromHeaders;
  const service = deps.service ?? buildPasswordResetService();
  const context = await getContext();

  return comoPlataforma("SL-17", "login", () =>
    service.verificarCodigo({
      email: parsed.data.email,
      code: parsed.data.code,
      ipAddress: context.ipAddress,
    }),
  );
}

/**
 * Server Action del paso 3 (R7/R8/R9/R10/R11/R20). Valida coincidencia y
 * politica fuerte; delega el restablecimiento. Si el desafio ya no esta activo
 * responde `invalid_or_expired` sin tocar la contrasena.
 */
export async function restablecerContrasena(
  input: unknown,
  deps: PasswordResetDeps = {},
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const getContext = deps.getContext ?? requestContextFromHeaders;
  const service = deps.service ?? buildPasswordResetService();
  const context = await getContext();

  // SL-17: este paso SI escribe una fila de negocio, `usuario.password_hash`, en plataforma. Es
  // la del propio usuario hallado por email (unico global, R36) y validado por su codigo: no
  // cruza empresas, y la escritura no cambia `organizacion_id`.
  return comoPlataforma("SL-17", "login", () =>
    service.restablecer({
      email: parsed.data.email,
      code: parsed.data.code,
      newPassword: parsed.data.password,
      ipAddress: context.ipAddress,
    }),
  );
}

/**
 * SL-41 (design §7.3, R18-R20): el maestro crea su contrasena con el enlace de la bienvenida.
 * Responde con el mismo tipo que el paso 3 para que el formulario lo pinte con el codigo que ya
 * tiene. No abre sesion: el maestro entra despues por `/login`.
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

  // Quien abre el enlace no tiene sesion ni empresa; el desafio lleva al usuario por su id. Como en
  // el paso 3, la escritura es la del propio `usuario.password_hash` y no cambia `organizacion_id`.
  return comoPlataforma("SL-41", "login", () =>
    service.crearContrasenaConEnlace({
      enlace: parsed.data.enlace,
      newPassword: parsed.data.password,
      ipAddress: context.ipAddress,
    }),
  );
}
