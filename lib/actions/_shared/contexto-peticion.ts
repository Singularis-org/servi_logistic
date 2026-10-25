import { headers } from "next/headers";

import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { EmailOtpChallengeRepository } from "@/lib/repositories/EmailOtpChallengeRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { crearEmailProvider } from "@/lib/services/EmailProvider";
import { OtpChallengeIssuer } from "@/lib/services/OtpChallengeIssuer";
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
// ventana deslizante persista entre invocaciones de las Server Actions. Lo usan el canje del codigo
// y el del enlace de bienvenida.
const verifyLimiter = new ResetRateLimiter();

/** El composition root de la recuperacion de contrasena, tambien el del enlace de bienvenida. */
export function buildPasswordResetService(): IPasswordResetService {
  const prisma = getPrismaClient();
  const userRepo = new UserRepository(prisma);
  const otpRepo = new EmailOtpChallengeRepository(prisma);
  // El proveedor de correo se elige por entorno (feature 80): con SMTP configurado se envia de
  // verdad por nodemailer; sin el —dev o CI— se degrada a consola. Ver lib/services/EmailProvider.ts
  // y lib/config/email.ts.
  const emailProvider = crearEmailProvider();
  const otpIssuer = new OtpChallengeIssuer(otpRepo, emailProvider);
  return new PasswordResetService(userRepo, otpRepo, otpIssuer, verifyLimiter);
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
