import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "@/lib/services/AuthService";
import { hashPassword } from "@/lib/utils/password";
import type { CuentaConHash, IUserRepository, UsuarioPublico } from "@/lib/interfaces/repositories/IUserRepository";
import type { ILoginAttemptRepository } from "@/lib/interfaces/repositories/ILoginAttemptRepository";
import type { ITrustedDeviceRepository } from "@/lib/interfaces/repositories/ITrustedDeviceRepository";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { ISessionRepository } from "@/lib/interfaces/repositories/ISessionRepository";
import type { IRiskEngine } from "@/lib/interfaces/services/IRiskEngine";
import type { IEmailProvider } from "@/lib/interfaces/external/IEmailProvider";

const REQUEST_CONTEXT = { ipAddress: "1.2.3.4", userAgent: "vitest-agent" };

// SL-18 T1.3: la cuenta que devuelve `findCuentasPorEmailConHash` y, en `findCuentaPorId` (SLT-32),
// la del desafio OTP.
// Aqui el email tiene UNA cuenta (el login de siempre); con varias empresas, ver
// `auth-service-empresas.test.ts` (SL-18 T2.2).
type UsuarioDeTest = UsuarioPublico & CuentaConHash;

async function buildUsuario(overrides: Partial<UsuarioDeTest> = {}): Promise<UsuarioDeTest> {
  return {
    id: "usr-1",
    nombre: "Ana",
    email: "ana@example.com",
    telefono: "0991234567",
    passwordHash: await hashPassword("clave-correcta"),
    estado: "activo",
    cedula: "1710034065",
    tipoIdentificacionId: "tipo-1",
    rolId: "rol-1",
    fulfillment: false,
    organizacionId: "org-1",
    rol: "maestro",
    empresaNombre: "Empresa A",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildMocks() {
  const userRepo: IUserRepository = {
    findCuentasPorEmailConHash: vi.fn(),
    findById: vi.fn(),
    findCuentaPorId: vi.fn(), // SLT-32: la cuenta del desafio OTP, con estado, empresa y rol
    findCuentasPorEmail: vi.fn(),
    create: vi.fn(),
    listMensajeros: vi.fn().mockResolvedValue([]),
    listMensajerosParaFiltro: vi.fn().mockResolvedValue([]),
    listByRol: vi.fn().mockResolvedValue([]), // exigido por IUserRepository; no ejercitado aqui
    listCuentasTienda: vi.fn().mockResolvedValue([]), // exigido por IUserRepository (feature 144); no ejercitado aqui
    obtenerCuentaTienda: vi.fn().mockResolvedValue(null), // exigido por IUserRepository (ficha 381); no ejercitado aqui
    updatePasswordHash: vi.fn(),
    restablecerContrasena: vi.fn(), // ficha 362: el reset POR UN ADMIN, con su fila de registro
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
    findByUsuarioAndDevice: vi.fn().mockResolvedValue({ id: "td-1" }),
    upsert: vi.fn(),
  };
  const otpRepo: IEmailOtpChallengeRepository = {
    create: vi.fn().mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-1",
      codeHash: "hash",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    }),
    findActiveById: vi.fn(),
    markConsumed: vi.fn(),
    findLatestActiveByUsuarioId: vi.fn(),
    contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
    consumirSiActivo: vi.fn(),
  };
  const sessionRepo: ISessionRepository = {
    create: vi.fn().mockResolvedValue({
      id: "sess-1",
      userId: "usr-1",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    }),
    findValidById: vi.fn(),
    deleteById: vi.fn(),
    // Feature 287/R16: exigido por `ISessionRepository`; el login no lo ejercita.
    deleteAllByUserId: vi.fn().mockResolvedValue(0),
  };
  const riskEngine: IRiskEngine = {
    evaluate: vi.fn().mockResolvedValue({ score: 0, reasons: [], isHigh: false }),
  };
  const emailProvider: IEmailProvider = { sendOtpCode: vi.fn() };

  const authService = new AuthService(
    userRepo,
    loginAttemptRepo,
    trustedDeviceRepo,
    otpRepo,
    sessionRepo,
    riskEngine,
    emailProvider,
  );

  return {
    authService,
    userRepo,
    loginAttemptRepo,
    trustedDeviceRepo,
    otpRepo,
    sessionRepo,
    riskEngine,
    emailProvider,
  };
}

describe("AuthService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("R12: devuelve invalid_credentials si el email no existe, sin revelar el motivo", async () => {
    const mocks = buildMocks();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await mocks.authService.login({
      email: "no-existe@example.com",
      password: "cualquiera",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "invalid_credentials" });
    expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: null, exitoso: false }),
    );
  });

  it("R11, R12: devuelve invalid_credentials si la contrasena no coincide", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);

    const result = await mocks.authService.login({
      email: usuario.email,
      password: "clave-incorrecta",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "invalid_credentials" });
  });

  it("R13: rechaza con account_unavailable si el estado no es activo aunque la contrasena sea correcta", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario({ estado: "inactivo" });
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);

    const result = await mocks.authService.login({
      email: usuario.email,
      password: "clave-correcta",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "account_unavailable" });
  });

  it("R14, R16: concede sesion directa cuando el riesgo es bajo", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);
    (mocks.riskEngine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      score: 0,
      reasons: [],
      isHigh: false,
    });

    const result = await mocks.authService.login({
      email: usuario.email,
      password: "clave-correcta",
      ...REQUEST_CONTEXT,
    });

    expect(result.status).toBe("ok");
    expect(mocks.sessionRepo.create).toHaveBeenCalledWith({ userId: usuario.id, ttlHours: 24 });
    expect(mocks.trustedDeviceRepo.upsert).toHaveBeenCalled();
    expect(mocks.otpRepo.create).not.toHaveBeenCalled();
  });

  it("R17: exige challenge_required cuando el riesgo es alto", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);
    (mocks.riskEngine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      score: 90,
      reasons: ["dispositivo_no_reconocido"],
      isHigh: true,
    });

    const result = await mocks.authService.login({
      email: usuario.email,
      password: "clave-correcta",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "challenge_required", challengeId: "challenge-1" });
    expect(mocks.otpRepo.create).toHaveBeenCalledTimes(1);
    expect(mocks.emailProvider.sendOtpCode).toHaveBeenCalledTimes(1);
    expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
  });

  it("R21, R21a: el 6to intento dentro de la ventana devuelve account_locked aun con credenciales correctas", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);
    (mocks.loginAttemptRepo.contarFallosConsecutivosRecientes as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const result = await mocks.authService.login({
      email: usuario.email,
      password: "clave-correcta",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "account_locked", retryAfterMinutes: 15 });
    expect(mocks.riskEngine.evaluate).not.toHaveBeenCalled();
  });

  it("R21: el bloqueo caduca pasados 15 minutos (ventana ya no reporta 5 fallos)", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);
    // Simula que, tiempo despues, la ventana de 15 min ya no contiene los fallos.
    (mocks.loginAttemptRepo.contarFallosConsecutivosRecientes as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await mocks.authService.login({
      email: usuario.email,
      password: "clave-correcta",
      ...REQUEST_CONTEXT,
    });

    expect(result.status).toBe("ok");
  });

  it("R22: un intento exitoso registra el intento como exitoso (base del reinicio de contador)", async () => {
    const mocks = buildMocks();
    const usuario = await buildUsuario();
    (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);

    await mocks.authService.login({
      email: usuario.email,
      password: "clave-correcta",
      ...REQUEST_CONTEXT,
    });

    expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: usuario.id, exitoso: true }),
    );
  });

  describe("SLT-32: usuario sin empresa", () => {
    it.each([
      ["null", null],
      ["vacia", ""],
    ])(
      "rechaza con account_unavailable y registra intento fallido sin_empresa cuando la empresa es %s",
      async (_caso, organizacionId) => {
        const mocks = buildMocks();
        const usuario = await buildUsuario({ organizacionId });
        (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);

        const result = await mocks.authService.login({
          email: usuario.email,
          password: "clave-correcta",
          ...REQUEST_CONTEXT,
        });

        expect(result).toEqual({ status: "account_unavailable" });
        expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledTimes(1);
        expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
          expect.objectContaining({
            usuarioId: usuario.id,
            exitoso: false,
            riskReason: "sin_empresa",
          }),
        );
        expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
        expect(mocks.trustedDeviceRepo.upsert).not.toHaveBeenCalled();
        expect(mocks.otpRepo.create).not.toHaveBeenCalled();
        expect(mocks.emailProvider.sendOtpCode).not.toHaveBeenCalled();
        expect(mocks.riskEngine.evaluate).not.toHaveBeenCalled();
      },
    );

    it("no emite OTP a un usuario sin empresa aunque el riesgo sea alto", async () => {
      const mocks = buildMocks();
      const usuario = await buildUsuario({ organizacionId: null });
      (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);
      (mocks.riskEngine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
        score: 90,
        reasons: ["dispositivo_no_reconocido"],
        isHigh: true,
      });

      const result = await mocks.authService.login({
        email: usuario.email,
        password: "clave-correcta",
        ...REQUEST_CONTEXT,
      });

      expect(result).toEqual({ status: "account_unavailable" });
      expect(mocks.otpRepo.create).not.toHaveBeenCalled();
      expect(mocks.emailProvider.sendOtpCode).not.toHaveBeenCalled();
    });

    it("SL-32: la cuenta de plataforma (superadmin, sin empresa) SI inicia sesion", async () => {
      const mocks = buildMocks();
      const usuario = await buildUsuario({
        organizacionId: null,
        rol: "superadmin",
        empresaNombre: null,
      });
      (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);

      const result = await mocks.authService.login({
        email: usuario.email,
        password: "clave-correcta",
        ...REQUEST_CONTEXT,
      });

      expect(result).toEqual({ status: "ok", sessionId: "sess-1", expiresAt: expect.any(Date) });
      expect(mocks.sessionRepo.create).toHaveBeenCalledWith({ userId: usuario.id, ttlHours: 24 });
      expect(mocks.loginAttemptRepo.registrar).not.toHaveBeenCalledWith(
        expect.objectContaining({ riskReason: "sin_empresa" }),
      );
    });

    it("con empresa concede la sesion igual que antes y no registra sin_empresa", async () => {
      const mocks = buildMocks();
      const usuario = await buildUsuario({ organizacionId: "org-1" });
      (mocks.userRepo.findCuentasPorEmailConHash as ReturnType<typeof vi.fn>).mockResolvedValue([usuario]);

      const result = await mocks.authService.login({
        email: usuario.email,
        password: "clave-correcta",
        ...REQUEST_CONTEXT,
      });

      expect(result).toEqual({
        status: "ok",
        sessionId: "sess-1",
        expiresAt: expect.any(Date),
      });
      expect(mocks.sessionRepo.create).toHaveBeenCalledWith({ userId: usuario.id, ttlHours: 24 });
      expect(mocks.trustedDeviceRepo.upsert).toHaveBeenCalled();
      expect(mocks.loginAttemptRepo.registrar).not.toHaveBeenCalledWith(
        expect.objectContaining({ riskReason: "sin_empresa" }),
      );
    });
  });
});

describe("AuthService.verifyChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("R19: OTP valido concede sesion y confia el dispositivo", async () => {
    const mocks = buildMocks();
    const code = "654321";
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash(code, 10);
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-1",
      codeHash,
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    (mocks.userRepo.findCuentaPorId as ReturnType<typeof vi.fn>).mockResolvedValue(await buildUsuario());

    const result = await mocks.authService.verifyChallenge({
      challengeId: "challenge-1",
      code,
      ...REQUEST_CONTEXT,
    });

    expect(result.status).toBe("ok");
    expect(mocks.otpRepo.markConsumed).toHaveBeenCalledWith("challenge-1");
    expect(mocks.trustedDeviceRepo.upsert).toHaveBeenCalledWith({
      usuarioId: "usr-1",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
    });
  });

  it("R20: OTP invalido no concede sesion", async () => {
    const mocks = buildMocks();
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash("111111", 10);
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-1",
      codeHash,
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });

    const result = await mocks.authService.verifyChallenge({
      challengeId: "challenge-1",
      code: "999999",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "invalid_or_expired" });
    expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
  });

  it("R20: OTP expirado (challenge inactivo) no concede sesion", async () => {
    const mocks = buildMocks();
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await mocks.authService.verifyChallenge({
      challengeId: "challenge-vencido",
      code: "123456",
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "invalid_or_expired" });
    expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
  });

  it("SLT-32: OTP valido de un usuario sin empresa no concede sesion ni confia el dispositivo", async () => {
    const mocks = buildMocks();
    const code = "654321";
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash(code, 10);
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-1",
      codeHash,
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    (mocks.userRepo.findCuentaPorId as ReturnType<typeof vi.fn>).mockResolvedValue(
      await buildUsuario({ organizacionId: null }),
    );

    const result = await mocks.authService.verifyChallenge({
      challengeId: "challenge-1",
      code,
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "invalid_or_expired" });
    expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
    expect(mocks.trustedDeviceRepo.upsert).not.toHaveBeenCalled();
    expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usr-1", exitoso: false, riskReason: "sin_empresa" }),
    );
    expect(mocks.loginAttemptRepo.registrar).not.toHaveBeenCalledWith(
      expect.objectContaining({ exitoso: true }),
    );
  });

  it("SLT-32: OTP valido de una cuenta que dejo de estar activa registra estado_no_activo", async () => {
    const mocks = buildMocks();
    const code = "654321";
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash(code, 10);
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-1",
      codeHash,
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    (mocks.userRepo.findCuentaPorId as ReturnType<typeof vi.fn>).mockResolvedValue(
      await buildUsuario({ estado: "bloqueado" }),
    );

    const result = await mocks.authService.verifyChallenge({ challengeId: "challenge-1", code, ...REQUEST_CONTEXT });

    expect(result).toEqual({ status: "invalid_or_expired" });
    expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
    expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usr-1", exitoso: false, riskReason: "estado_no_activo:bloqueado" }),
    );
  });

  it("SL-32: OTP valido de la cuenta de plataforma (superadmin, sin empresa) concede sesion", async () => {
    const mocks = buildMocks();
    const code = "654321";
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash(code, 10);
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-1",
      codeHash,
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    (mocks.userRepo.findCuentaPorId as ReturnType<typeof vi.fn>).mockResolvedValue(
      await buildUsuario({ organizacionId: null, rol: "superadmin", empresaNombre: null }),
    );

    const result = await mocks.authService.verifyChallenge({ challengeId: "challenge-1", code, ...REQUEST_CONTEXT });

    expect(result.status).toBe("ok");
    expect(mocks.sessionRepo.create).toHaveBeenCalledWith({ userId: "usr-1", ttlHours: 24 });
    expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usr-1", exitoso: true, riskReason: "otp_verificado" }),
    );
  });

  it("SLT-32: OTP valido cuyo usuario ya no existe no concede sesion y registra usuario_no_encontrado", async () => {
    const mocks = buildMocks();
    const code = "654321";
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash(code, 10);
    (mocks.otpRepo.findActiveById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "challenge-1",
      usuarioId: "usr-borrado",
      codeHash,
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    (mocks.userRepo.findCuentaPorId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await mocks.authService.verifyChallenge({
      challengeId: "challenge-1",
      code,
      ...REQUEST_CONTEXT,
    });

    expect(result).toEqual({ status: "invalid_or_expired" });
    expect(mocks.sessionRepo.create).not.toHaveBeenCalled();
    expect(mocks.trustedDeviceRepo.upsert).not.toHaveBeenCalled();
    expect(mocks.loginAttemptRepo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usr-borrado", exitoso: false, riskReason: "usuario_no_encontrado" }),
    );
    expect(mocks.loginAttemptRepo.registrar).not.toHaveBeenCalledWith(
      expect.objectContaining({ exitoso: true }),
    );
  });
});

describe("AuthService.logout", () => {
  it("R24: elimina el registro de sesion", async () => {
    const mocks = buildMocks();
    await mocks.authService.logout("sess-1");
    expect(mocks.sessionRepo.deleteById).toHaveBeenCalledWith("sess-1");
  });
});
