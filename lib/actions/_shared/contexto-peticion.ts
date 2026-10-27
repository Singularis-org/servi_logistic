import { headers } from "next/headers";

import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { EmailOtpChallengeRepository } from "@/lib/repositories/EmailOtpChallengeRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { baseUrlDeLaApp } from "@/lib/config/app-url";
import { emailContacto } from "@/lib/config/email";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { PasswordResetService } from "@/lib/services/PasswordResetService";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";

// SL-41 (design §7.1) — lo comparten `password-reset.ts` y `organizaciones.ts`. Vive fuera de un
// archivo "use server" a proposito: ahi, toda funcion exportada se convierte en un endpoint publico,
// y ni construir el servicio ni leer las cabeceras deben poder llamarse desde el navegador.

export interface RequestContext {
  ipAddress: string;
  userAgent: string;
}

// Limitador de intentos de verificacion (R20 de la Feature 20): unico por proceso para que la
// ventana deslizante persista entre invocaciones de las Server Actions. Lo usa el canje del enlace,
// de bienvenida o de recuperacion (SL-18).
const verifyLimiter = new ResetRateLimiter();

/** El composition root de la recuperacion de contrasena, tambien el del enlace de bienvenida. */
export function buildPasswordResetService(): IPasswordResetService {
  const prisma = getPrismaClient();
  const userRepo = new UserRepository(prisma);
  const otpRepo = new EmailOtpChallengeRepository(prisma);
  // El emisor de correo se elige por entorno (feature 80): con SMTP configurado se envia de verdad
  // por nodemailer; sin el —dev o CI— se degrada a consola. Ver lib/services/EmailProvider.ts y
  // lib/config/email.ts. SL-18 (design §4.2): el correo de recuperacion lleva enlaces, asi que el
  // servicio recibe el emisor y la URL base, leidos aqui en cada llamada, como en la bienvenida.
  const correo = { sender: crearEmailSender(), baseUrl: baseUrlDeLaApp(), contacto: emailContacto() };
  return new PasswordResetService(userRepo, otpRepo, correo, verifyLimiter);
}

/** La IP y el agente de la peticion en curso, desde las cabeceras que pone el proxy. */
export async function requestContextFromHeaders(): Promise<RequestContext> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor
    ? forwardedFor.split(",")[0].trim()
    : (requestHeaders.get("x-real-ip") ?? "unknown");
  const userAgent = requestHeaders.get("user-agent") ?? "unknown";
  return { ipAddress, userAgent };
}
