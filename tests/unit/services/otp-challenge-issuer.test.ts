import { describe, it, expect, vi, afterEach } from "vitest";
import { OtpChallengeIssuer } from "@/lib/services/OtpChallengeIssuer";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { IEmailProvider } from "@/lib/interfaces/external/IEmailProvider";
import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { EmailNotificacionProvider } from "@/lib/services/EmailProvider";
import { PasswordResetService } from "@/lib/services/PasswordResetService";

describe("OtpChallengeIssuer", () => {
  it("nunca persiste el codigo en claro, solo codeHash", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "otp-1",
      usuarioId: "usr-1",
      codeHash: "irrelevante-para-el-assert",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    const otpRepo: IEmailOtpChallengeRepository = {
      create,
      findActiveById: vi.fn(),
      markConsumed: vi.fn(),
      consumirSiActivo: vi.fn(),
      findLatestActiveByUsuarioId: vi.fn(),
      contarRecientesPorUsuario: vi.fn(),
    };
    const emailProvider: IEmailProvider = { sendOtpCode: vi.fn() };
    const issuer = new OtpChallengeIssuer(otpRepo, emailProvider);

    await issuer.emitir({
      usuarioId: "usr-1",
      email: "ana@example.com",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
    });

    const dataPersistida = create.mock.calls[0][0];
    expect(dataPersistida).not.toHaveProperty("code");
    expect(typeof dataPersistida.codeHash).toBe("string");
    expect(dataPersistida.codeHash.length).toBeGreaterThan(0);
  });

  it("invoca al proveedor de email con el codigo en claro para el envio", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "otp-1",
      usuarioId: "usr-1",
      codeHash: "hash",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
      expiresAt: new Date(),
      consumedAt: null,
      createdAt: new Date(),
    });
    const sendOtpCode = vi.fn().mockResolvedValue(undefined);
    const otpRepo: IEmailOtpChallengeRepository = {
      create,
      findActiveById: vi.fn(),
      markConsumed: vi.fn(),
      consumirSiActivo: vi.fn(),
      findLatestActiveByUsuarioId: vi.fn(),
      contarRecientesPorUsuario: vi.fn(),
    };
    const emailProvider: IEmailProvider = { sendOtpCode };
    const issuer = new OtpChallengeIssuer(otpRepo, emailProvider);

    const result = await issuer.emitir({
      usuarioId: "usr-1",
      email: "ana@example.com",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
    });

    expect(sendOtpCode).toHaveBeenCalledTimes(1);
    const callArgs = sendOtpCode.mock.calls[0][0];
    expect(callArgs.to).toBe("ana@example.com");
    expect(typeof callArgs.code).toBe("string");
    expect(callArgs.code).toMatch(/^\d{6}$/);
    expect(result.challengeId).toBe("otp-1");
  });
});

// Feature 80 — regresion: `emitir` llego a hacer `console.log("Codigo OTP
// generado:", code)`, que dejaba un secreto en los logs del servidor. El assert
// mira la consola, no el comentario que lo documenta.
describe("OtpChallengeIssuer (feature 80)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("no escribe el codigo en claro por consola", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    const otpRepo: IEmailOtpChallengeRepository = {
      create: vi.fn().mockResolvedValue({
        id: "otp-1",
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
      consumirSiActivo: vi.fn(),
      findLatestActiveByUsuarioId: vi.fn(),
      contarRecientesPorUsuario: vi.fn(),
    };
    const sendOtpCode = vi.fn();
    const issuer = new OtpChallengeIssuer(otpRepo, { sendOtpCode });

    await issuer.emitir({
      usuarioId: "usr-1",
      email: "ana@example.com",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
    });

    const code: string = sendOtpCode.mock.calls[0][0].code;
    const escrito = [log, info, warn, debug]
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((arg) => String(arg))
      .join(" ");
    expect(escrito).not.toContain(code);
  });
});

// SL-41 (R9) — login y «recuperar contraseña» mandan EL MISMO correo. Se recorre el camino real de
// cada uno hasta el transporte: el login llama a `OtpChallengeIssuer.emitir` (AuthService) y la
// recuperación entra por `PasswordResetService.solicitar`. Con la plantilla real detrás, los dos
// mensajes solo pueden diferir en el código.
describe("OtpChallengeIssuer (SL-41 R9)", () => {
  afterEach(() => vi.restoreAllMocks());

  function otpRepoDoble(): IEmailOtpChallengeRepository {
    return {
      create: vi.fn().mockResolvedValue({
        id: "otp-1",
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
      consumirSiActivo: vi.fn(),
      findLatestActiveByUsuarioId: vi.fn(),
      contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
    };
  }

  function emisorConPlantillaReal() {
    const enviados: EmailMessage[] = [];
    const sender: IEmailSender = {
      enviar: async (m) => {
        enviados.push(m);
        return { messageId: "id" };
      },
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    return { enviados, provider: new EmailNotificacionProvider(sender) };
  }

  /** El código es aleatorio: se sustituye por un marcador para comparar lo demás. */
  function sinCodigo(m: EmailMessage): EmailMessage {
    const code = /\n(\d{6})\n/.exec(m.text)?.[1];
    expect(code, "el texto plano no lleva un código de 6 dígitos en su línea").toBeDefined();
    const fuera = (s: string | undefined) => s?.split(code!).join("<CODIGO>");
    return { to: m.to, subject: m.subject, text: fuera(m.text)!, html: fuera(m.html) };
  }

  it("el login y la recuperación envían el mismo correo, con el asunto del OTP", async () => {
    const login = emisorConPlantillaReal();
    await new OtpChallengeIssuer(otpRepoDoble(), login.provider).emitir({
      usuarioId: "usr-1",
      email: "ana@example.com",
      deviceHash: "hash-device",
      ipAddress: "1.2.3.4",
    });

    const recuperacion = emisorConPlantillaReal();
    const otpRepo = otpRepoDoble();
    const servicio = new PasswordResetService(
      {
        findByEmail: vi.fn().mockResolvedValue({ id: "usr-1", email: "ana@example.com" }),
        updatePasswordHash: vi.fn(),
      },
      otpRepo,
      new OtpChallengeIssuer(otpRepo, recuperacion.provider),
    );
    await servicio.solicitar({ email: "ana@example.com", deviceHash: "hash-device", ipAddress: "1.2.3.4" });

    expect(login.enviados).toHaveLength(1);
    expect(recuperacion.enviados).toHaveLength(1);
    expect(login.enviados[0].subject).toBe("Tu código de verificación de Servi Logistic");
    expect(sinCodigo(recuperacion.enviados[0])).toEqual(sinCodigo(login.enviados[0]));
  });
});
