import bcrypt from "bcryptjs";
import type { CuentaConHash, IUserRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type {
  ILoginAttemptRepository,
  RegistrarIntentoInput,
} from "@/lib/interfaces/repositories/ILoginAttemptRepository";
import type { ITrustedDeviceRepository } from "@/lib/interfaces/repositories/ITrustedDeviceRepository";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { ISessionRepository } from "@/lib/interfaces/repositories/ISessionRepository";
import type { IRiskEngine } from "@/lib/interfaces/services/IRiskEngine";
import type { IEmailProvider } from "@/lib/interfaces/external/IEmailProvider";
import type {
  IAuthService,
  LoginCommandInput,
  LoginCommandResult,
  VerifyChallengeCommandInput,
  VerifyChallengeCommandResult,
} from "@/lib/interfaces/services/IAuthService";
import { verifyPassword } from "@/lib/utils/password";
import { computeDeviceHash } from "@/lib/utils/device";
import { OtpChallengeIssuer } from "@/lib/services/OtpChallengeIssuer";
import { authConfig } from "@/lib/config/auth";
import { puedeIniciarSesion } from "@/lib/auth/puede-iniciar-sesion";
import { NOMBRE_EMPRESA_PLATAFORMA } from "@/lib/types/auth";

export class AuthService implements IAuthService {
  private readonly otpIssuer: OtpChallengeIssuer;

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly loginAttemptRepo: ILoginAttemptRepository,
    private readonly trustedDeviceRepo: ITrustedDeviceRepository,
    private readonly otpRepo: IEmailOtpChallengeRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly riskEngine: IRiskEngine,
    private readonly emailProvider: IEmailProvider,
  ) {
    this.otpIssuer = new OtpChallengeIssuer(this.otpRepo, this.emailProvider);
  }

  /**
   * Registra un intento de login rellenando el contexto comun (email, IP,
   * userAgent) y aceptando solo las partes que varian entre call sites.
   */
  private registrarIntento(
    contexto: Pick<RegistrarIntentoInput, "emailUsado" | "ipAddress" | "userAgent">,
    variable: Pick<
      RegistrarIntentoInput,
      "usuarioId" | "exitoso" | "riskScore" | "riskReason"
    >,
  ): Promise<void> {
    return this.loginAttemptRepo.registrar({ ...contexto, ...variable });
  }

  async login(input: LoginCommandInput): Promise<LoginCommandResult> {
    const deviceHash = computeDeviceHash(input.userAgent);
    const contexto = {
      emailUsado: input.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    // SL-18 (design §3.2, paso 1): el email puede tener una cuenta por empresa mas la de
    // plataforma. Si la persona ya eligio, solo cuenta la de esa empresa (`null` = plataforma).
    const todas = await this.userRepo.findCuentasPorEmailConHash(input.email);
    const cuentas =
      input.organizacionId === undefined
        ? todas
        : todas.filter((c) => c.organizacionId === input.organizacionId);

    if (cuentas.length === 0) {
      // R12 (feature de login) / SL-18 R9, R11: la misma respuesta que una contrasena mala, para
      // no revelar si el email existe ni en que empresas.
      await this.registrarIntento(contexto, {
        usuarioId: null,
        exitoso: false,
        riskScore: 0,
        riskReason: "usuario_no_encontrado",
      });
      return { status: "invalid_credentials" };
    }

    // R21/R21a: el bloqueo temporal duro se evalua antes que credenciales o riesgo, cuenta a cuenta.
    const noBloqueadas: CuentaConHash[] = [];
    for (const cuenta of cuentas) {
      const fallos = await this.loginAttemptRepo.contarFallosConsecutivosRecientes({
        usuarioId: cuenta.id,
        ventanaMinutos: authConfig.LOCKOUT_MINUTES,
      });
      if (fallos < authConfig.MAX_FAILED_ATTEMPTS) noBloqueadas.push(cuenta);
    }
    if (noBloqueadas.length === 0) {
      return { status: "account_locked", retryAfterMinutes: authConfig.LOCKOUT_MINUTES }; // SL-18 R12
    }

    // Un bcrypt por cuenta: N es el numero de empresas del email, en la practica 1 o 2 (design §12).
    const validas: CuentaConHash[] = [];
    for (const cuenta of noBloqueadas) {
      if (await verifyPassword(input.password, cuenta.passwordHash)) validas.push(cuenta);
    }

    if (validas.length === 0) {
      // SL-18 R9: quien no sabe ninguna contrasena no dice a que cuenta apuntaba; el fallo cuenta
      // en todas. Si vale en alguna, NO se registra nada en las demas (R10): quien siempre entra en
      // A no debe acabar bloqueado en B.
      for (const cuenta of noBloqueadas) {
        await this.registrarIntento(contexto, {
          usuarioId: cuenta.id,
          exitoso: false,
          riskScore: 0,
          riskReason: "password_incorrecta",
        });
      }
      return { status: "invalid_credentials" };
    }

    const elegibles = validas.filter(puedeIniciarSesion);
    if (elegibles.length === 0) {
      const primera = validas[0];
      // SL-18 R15 / SLT-32 (design §3.2 paso 6): una cuenta activa sin empresa fallaria con
      // `estado_no_activo:activo`, que no dice por que se rechazo; el motivo debe nombrar la causa.
      const riskReason =
        primera.estado !== "activo" ? `estado_no_activo:${primera.estado}` : "sin_empresa";
      await this.registrarIntento(contexto, {
        usuarioId: primera.id,
        exitoso: false,
        riskScore: 0,
        riskReason,
      });
      return { status: "account_unavailable" }; // R13 (feature de login) / SL-18 R12, R15
    }

    if (elegibles.length > 1) {
      // SL-18 R7, R8: la contrasena ya se comprobo, asi que ofrecer estas empresas no filtra nada a
      // quien no la sabe. Nada se escribe aqui: el intento, el dispositivo, el OTP y la sesion
      // llegan cuando la persona elige y se vuelve a comprobar la contrasena en esa cuenta.
      return {
        status: "elegir_empresa",
        empresas: elegibles.map((c) => ({
          organizacionId: c.organizacionId,
          nombre: c.empresaNombre ?? NOMBRE_EMPRESA_PLATAFORMA,
        })),
      };
    }

    const usuario = elegibles[0];

    // R14: credenciales validas y cuenta activa -> evaluacion de riesgo (RBA).
    const risk = await this.riskEngine.evaluate({
      usuarioId: usuario.id,
      deviceHash,
      ipAddress: input.ipAddress,
    });

    if (!risk.isHigh) {
      // R16/R22: riesgo bajo -> sesion directa, se confia el dispositivo y se
      // reinicia el contador de fallos (implicito: el intento se registra exitoso).
      await this.trustedDeviceRepo.upsert({
        usuarioId: usuario.id,
        deviceHash,
        ipAddress: input.ipAddress,
      });
      await this.registrarIntento(contexto, {
        usuarioId: usuario.id,
        exitoso: true,
        riskScore: risk.score,
        riskReason: risk.reasons.join(",") || "ninguno",
      });
      const session = await this.sessionRepo.create({
        userId: usuario.id,
        ttlHours: authConfig.SESSION_TTL_HOURS,
      });
      return { status: "ok", sessionId: session.id, expiresAt: session.expiresAt };
    }

    // R17: riesgo alto -> exige OTP por email antes de conceder sesion.
    const { challengeId } = await this.otpIssuer.emitir({
      usuarioId: usuario.id,
      email: usuario.email,
      deviceHash,
      ipAddress: input.ipAddress,
    });
    await this.registrarIntento(contexto, {
      usuarioId: usuario.id,
      exitoso: false,
      riskScore: risk.score,
      riskReason: risk.reasons.join(","),
    });
    return { status: "challenge_required", challengeId };
  }

  async verifyChallenge(
    input: VerifyChallengeCommandInput,
  ): Promise<VerifyChallengeCommandResult> {
    const challenge = await this.otpRepo.findActiveById(input.challengeId);
    if (!challenge) {
      return { status: "invalid_or_expired" }; // R20
    }

    const codigoValido = await bcrypt.compare(input.code, challenge.codeHash);
    if (!codigoValido) {
      return { status: "invalid_or_expired" }; // R20
    }

    await this.otpRepo.markConsumed(challenge.id);

    const usuario = await this.userRepo.findCuentaPorId(challenge.usuarioId);
    const contexto = {
      emailUsado: usuario?.email ?? "",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    // SLT-32: el desafio pudo emitirse antes de que la cuenta perdiera su empresa o su estado; se
    // revalida aqui con el mismo predicado que el login. Se responde con el fallo generico del
    // OTP: el contrato de este paso no tiene otro, y la UI ya lo maneja.
    if (!usuario || !puedeIniciarSesion(usuario)) {
      await this.registrarIntento(contexto, {
        usuarioId: challenge.usuarioId,
        exitoso: false,
        riskScore: 0,
        riskReason: !usuario
          ? "usuario_no_encontrado"
          : usuario.estado !== "activo"
            ? `estado_no_activo:${usuario.estado}`
            : "sin_empresa",
      });
      return { status: "invalid_or_expired" };
    }

    // R19: OTP superado -> concede sesion y confia el dispositivo/IP.
    await this.trustedDeviceRepo.upsert({
      usuarioId: challenge.usuarioId,
      deviceHash: challenge.deviceHash,
      ipAddress: challenge.ipAddress,
    });

    await this.registrarIntento(
      contexto,
      {
        usuarioId: challenge.usuarioId,
        exitoso: true,
        riskScore: 0,
        riskReason: "otp_verificado",
      },
    );

    const session = await this.sessionRepo.create({
      userId: challenge.usuarioId,
      ttlHours: authConfig.SESSION_TTL_HOURS,
    });
    return { status: "ok", sessionId: session.id, expiresAt: session.expiresAt };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionRepo.deleteById(sessionId); // R24
  }
}
