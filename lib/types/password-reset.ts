import { z } from "zod";
import { strongPasswordSchema } from "@/lib/types/password-policy";

// Contratos I/O del flujo de recuperacion de contrasena (Feature 20; SL-18 §4).
// Validacion zod en el borde de las Server Actions. Desde SL-18 (R20) no hay paso
// de codigo: el correo lleva un enlace por cuenta y se canjea con `crearConEnlaceSchema`.

/** Paso 1: solicitud por email (R1). */
export const requestResetSchema = z.object({
  email: z.string().email(),
});
export type RequestResetInput = z.infer<typeof requestResetSchema>;

/**
 * SL-41 (design §7.3): el enlace de bienvenida es `<challengeId>.<secreto>`, un UUID y 43
 * caracteres base64url (256 bits). La forma exacta se exige aqui, en el borde, para que un codigo
 * de 6 digitos o cualquier otro texto no llegue a la base.
 */
export const ENLACE_BIENVENIDA_REGEX = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;

/** SL-41: crear la contrasena con el enlace. Politica fuerte y coincidencia de las dos claves. */
export const crearConEnlaceSchema = z
  .object({
    enlace: z.string().regex(ENLACE_BIENVENIDA_REGEX),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });
export type CrearConEnlaceInput = z.infer<typeof crearConEnlaceSchema>;

// Uniones de resultado (nunca lanzan al cliente). Respuestas genericas: no
// revelan la existencia de la cuenta ni el motivo exacto del rechazo.

/** solicitarRecuperacion: solo ok | validation_error (nunca revela existencia). */
export type PasswordResetRequestResult =
  | { status: "ok" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };

/** crearContrasenaConEnlace. */
export type ResetPasswordResult =
  | { status: "ok" }
  | { status: "invalid_or_expired" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };
