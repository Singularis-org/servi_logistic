import { describe, it, expect, vi } from "vitest";
import { AuthService } from "@/lib/services/AuthService";
import { hashPassword } from "@/lib/utils/password";
import type { CuentaConHash, IUserRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type { ILoginAttemptRepository } from "@/lib/interfaces/repositories/ILoginAttemptRepository";
import type { ITrustedDeviceRepository } from "@/lib/interfaces/repositories/ITrustedDeviceRepository";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { ISessionRepository } from "@/lib/interfaces/repositories/ISessionRepository";
import type { IRiskEngine } from "@/lib/interfaces/services/IRiskEngine";
import type { IEmailProvider } from "@/lib/interfaces/external/IEmailProvider";

// Feature 21 / R23 (regresion, NO reimplementa): una cuenta recien postulada
// queda en estado `pendiente` y el login existente la rechaza como
// `account_unavailable` (no puede iniciar sesion hasta ser aprobada en la f22).

async function buildPendiente(): Promise<CuentaConHash> {
  return {
    id: "usr-pend",
    email: "nuevo@example.com",
    passwordHash: await hashPassword("Abcdef1!"),
    estado: "pendiente",
    organizacionId: "org-1",
    rol: "mensajero",
    empresaNombre: "Empresa A",
  };
}

describe("R23: login de cuenta pendiente", () => {
  it("devuelve account_unavailable y no concede sesion", async () => {
    const usuario = await buildPendiente();
    const userRepo: IUserRepository = {
      findCuentasPorEmailConHash: vi.fn().mockResolvedValue([usuario]),
      findById: vi.fn(),
      findCuentasPorEmail: vi.fn(),
      findCuentaPorId: vi.fn(), // SLT-32: exigido por IUserRepository; no ejercitado aqui
      create: vi.fn(),
      listMensajeros: vi.fn().mockResolvedValue([]),
      listMensajerosParaFiltro: vi.fn().mockResolvedValue([]),
      listByRol: vi.fn().mockResolvedValue([]), // exigido por IUserRepository; no ejercitado aqui
      listCuentasTienda: vi.fn().mockResolvedValue([]), // exigido por IUserRepository (feature 144); no ejercitado aqui
      obtenerCuentaTienda: vi.fn().mockResolvedValue(null), // exigido por IUserRepository (ficha 381); no ejercitado aqui
      updatePasswordHash: vi.fn(),
      restablecerContrasena: vi.fn(), // ficha 362
      list: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      setEstado: vi.fn(),
      listTiposIdentificacion: vi.fn(),
      listRoles: vi.fn(),
      contarAdminSatelitesActivos: vi.fn().mockResolvedValue(0), // ficha 379: exigido por IUserRepository
    };
    const loginAttemptRepo: ILoginAttemptRepository = {
      registrar: vi.fn(),
      contarFallosConsecutivosRecientes: vi.fn().mockResolvedValue(0),
      ipReconocida: vi.fn().mockResolvedValue(true),
    };
    const trustedDeviceRepo: ITrustedDeviceRepository = {
      findByUsuarioAndDevice: vi.fn(),
      upsert: vi.fn(),
    };
    const otpRepo: IEmailOtpChallengeRepository = {
      create: vi.fn(),
      findActiveById: vi.fn(),
      markConsumed: vi.fn(),
      findLatestActiveByUsuarioId: vi.fn(),
      contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
      consumirSiActivo: vi.fn(),
    };
    const sessionRepo: ISessionRepository = {
      create: vi.fn(),
      findValidById: vi.fn(),
      deleteById: vi.fn(),
      // Feature 287/R16: exigido por `ISessionRepository`; esta regresion no lo ejercita.
      deleteAllByUserId: vi.fn().mockResolvedValue(0),
    };
    const riskEngine: IRiskEngine = {
      evaluate: vi.fn().mockResolvedValue({ score: 0, reasons: [], isHigh: false }),
    };
    const emailProvider: IEmailProvider = { sendOtpCode: vi.fn() };

    const auth = new AuthService(
      userRepo,
      loginAttemptRepo,
      trustedDeviceRepo,
      otpRepo,
      sessionRepo,
      riskEngine,
      emailProvider,
    );

    const result = await auth.login({
      email: usuario.email,
      password: "Abcdef1!",
      ipAddress: "1.2.3.4",
      userAgent: "vitest",
    });

    expect(result).toEqual({ status: "account_unavailable" });
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });
});
