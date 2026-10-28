import { describe, it, expect, vi } from "vitest";
import { DEVICE_HASH_RECUPERACION, PasswordResetService } from "@/lib/services/PasswordResetService";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";
import type { AuthConfig } from "@/lib/config/auth";
import type { EmailOtpChallengeRecord } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";

// Feature 20 / R1, R2, R3, R19: la solicitud. SL-18 (R20): los casos del codigo por email
// (verificar y restablecer: R5, R6, R9-R11, R13, R14 y R20 de la Feature 20) se borraron con el
// paso del codigo; el canje del enlace se prueba en `password-reset-enlace.test.ts` y el correo
// con un enlace por cuenta en `password-reset-por-empresa.test.ts`.

const CONFIG: AuthConfig = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  SESSION_TTL_HOURS: 24,
  OTP_TTL_MINUTES: 10,
  RISK_THRESHOLD: 50,
  CEDULA_TELEFONO_MIN_LENGTH: 7,
  CEDULA_TELEFONO_MAX_LENGTH: 15,
  RESET_REQUEST_WINDOW_MINUTES: 15,
  RESET_MAX_REQUESTS: 3,
  RESET_VERIFY_WINDOW_MINUTES: 10,
  RESET_MAX_VERIFY_ATTEMPTS: 5,
  BIENVENIDA_TTL_HORAS: 72,
};

const USUARIO = {
  id: "usr-1",
  email: "ana@example.com",
  estado: "activo" as const,
  organizacionId: "org-1",
  rol: "maestro" as const,
  empresaNombre: "Mensajeria Rapida",
};

function buildDeps() {
  const userRepo = {
    findCuentasPorEmail: vi.fn(),
    updatePasswordHash: vi.fn().mockResolvedValue(undefined),
  };
  const otpRepo = {
    findLatestActiveByUsuarioId: vi.fn(),
    contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
    create: vi.fn(async (input: Omit<EmailOtpChallengeRecord, "id" | "consumedAt" | "createdAt">) => ({
      ...input,
      id: "otp-1",
      consumedAt: null,
      createdAt: new Date(),
    })),
    findActiveById: vi.fn(),
    consumirSiActivo: vi.fn(),
  };
  const correo = {
    sender: { enviar: vi.fn().mockResolvedValue({ messageId: "id" }) },
    baseUrl: "https://app.example.test",
  };
  const limiter = new ResetRateLimiter(() => 1000);
  return { userRepo, otpRepo, correo, limiter };
}

function buildService(deps: ReturnType<typeof buildDeps>) {
  return new PasswordResetService(
    deps.userRepo,
    deps.otpRepo,
    deps.correo,
    deps.limiter,
    CONFIG,
  );
}

const CTX = { deviceHash: "dh", ipAddress: "1.2.3.4" };

describe("PasswordResetService.solicitar", () => {
  it("R1/R3: email inexistente devuelve respuesta generica y no emite ni envia", async () => {
    const deps = buildDeps();
    deps.userRepo.findCuentasPorEmail.mockResolvedValue([]);
    const service = buildService(deps);

    const result = await service.solicitar({ email: "no@existe.test", ...CTX });

    expect(result).toEqual({ status: "ok" });
    expect(deps.otpRepo.create).not.toHaveBeenCalled();
    expect(deps.correo.sender.enviar).not.toHaveBeenCalled();
  });

  it("R2: email existente emite un enlace de recuperacion y envia el correo", async () => {
    const deps = buildDeps();
    deps.userRepo.findCuentasPorEmail.mockResolvedValue([USUARIO]);
    const service = buildService(deps);

    const result = await service.solicitar({ email: USUARIO.email, ...CTX });

    expect(result).toEqual({ status: "ok" });
    expect(deps.otpRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usr-1", deviceHash: DEVICE_HASH_RECUPERACION }),
    );
    expect(deps.correo.sender.enviar).toHaveBeenCalledTimes(1);
  });

  it("R19: supera RESET_MAX_REQUESTS -> no emite pero responde generico", async () => {
    const deps = buildDeps();
    deps.userRepo.findCuentasPorEmail.mockResolvedValue([USUARIO]);
    deps.otpRepo.contarRecientesPorUsuario.mockResolvedValue(3); // == RESET_MAX_REQUESTS
    const service = buildService(deps);

    const result = await service.solicitar({ email: USUARIO.email, ...CTX });

    expect(result).toEqual({ status: "ok" });
    expect(deps.otpRepo.create).not.toHaveBeenCalled();
    expect(deps.correo.sender.enviar).not.toHaveBeenCalled();
  });
});
