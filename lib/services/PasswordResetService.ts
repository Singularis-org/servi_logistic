import { randomBytes } from "node:crypto";

import type { CuentaPublica, IUserRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { OtpChallengeIssuer } from "@/lib/services/OtpChallengeIssuer";
import type { AuthConfig } from "@/lib/config/auth";
import { authConfig } from "@/lib/config/auth";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { ResetRateLimiter, buildResetRateKey } from "@/lib/utils/reset-rate-limit";
import type {
  CrearContrasenaConEnlaceInput,
  EmitirEnlaceBienvenidaInput,
  EnlaceBienvenidaEmitido,
  IPasswordResetService,
  RestablecerInput,
  ResetOutcome,
  SolicitarResetInput,
  SolicitarResetResult,
  VerificarCodigoInput,
} from "@/lib/interfaces/services/IPasswordResetService";

/** Dependencias del servicio, todas inyectables para test. */
type ResetUserRepo = Pick<IUserRepository, "findCuentasPorEmail" | "updatePasswordHash">;
type ResetOtpRepo = Pick<
  IEmailOtpChallengeRepository,
  | "findLatestActiveByUsuarioId"
  | "contarRecientesPorUsuario"
  | "markConsumed"
  | "create"
  | "findActiveById"
  | "consumirSiActivo"
>;

/**
 * SL-41 (design §5.1): el `device_hash` de una fila de bienvenida. No es un sha256 hex, asi que
 * nunca coincide con el de un dispositivo real: marca el proposito de la fila, y el canje solo
 * acepta filas con esta marca (un codigo de login o de recuperacion no se canjea por enlace).
 */
export const DEVICE_HASH_BIENVENIDA = "bienvenida";

/** 32 bytes = 256 bits (R15); en base64url son 43 caracteres, por debajo de los 72 de bcrypt. */
const BYTES_SECRETO_ENLACE = 32;

/** Separa `<challengeId>.<secreto>`. El formato ya lo valido zod; aqui solo se rechaza lo roto. */
function partirEnlace(enlace: string): { challengeId: string; secreto: string } | null {
  const punto = enlace.indexOf(".");
  if (punto <= 0 || punto === enlace.length - 1) return null;
  return { challengeId: enlace.slice(0, punto), secreto: enlace.slice(punto + 1) };
}
type ResetOtpIssuer = Pick<OtpChallengeIssuer, "emitir">;

/**
 * Logica de negocio del reset de contrasena (Feature 20). Servicio dedicado
 * (design.md decision 1): solo depende de usuario + OTP + emisor + limitador.
 * No crea sesion, no evalua riesgo, no confia dispositivos, no escribe en
 * `login_attempt` y nunca bloquea la cuenta (R20). Respuestas genericas para
 * no filtrar existencia de cuentas (R1/R3/R6). No loguea email ni codigo (R14).
 */
export class PasswordResetService implements IPasswordResetService {
  constructor(
    private readonly userRepo: ResetUserRepo,
    private readonly otpRepo: ResetOtpRepo,
    private readonly otpIssuer: ResetOtpIssuer,
    private readonly verifyLimiter: ResetRateLimiter = new ResetRateLimiter(),
    private readonly config: AuthConfig = authConfig,
  ) {}

  /**
   * R1/R2/R3/R19: si el email existe y no supero el limite de solicitudes,
   * emite un OTP; en cualquier otro caso no hace nada. SIEMPRE devuelve la
   * misma respuesta generica.
   */
  async solicitar(input: SolicitarResetInput): Promise<SolicitarResetResult> {
    const usuario = await this.cuentaProvisional(input.email);
    if (usuario) {
      const recientes = await this.otpRepo.contarRecientesPorUsuario(
        usuario.id,
        this.config.RESET_REQUEST_WINDOW_MINUTES,
      );
      if (recientes < this.config.RESET_MAX_REQUESTS) {
        await this.otpIssuer.emitir({
          usuarioId: usuario.id,
          email: usuario.email,
          deviceHash: input.deviceHash,
          ipAddress: input.ipAddress,
        });
      }
    }
    return { status: "ok" };
  }

  /**
   * R5/R6/R20: verifica el codigo contra el desafio activo del usuario. No
   * consume el desafio (design.md decision 3). Aplica el limitador por email/IP.
   */
  async verificarCodigo(input: VerificarCodigoInput): Promise<ResetOutcome> {
    if (this.limiteVerificacionSuperado(input.email, input.ipAddress)) {
      return { status: "invalid_or_expired" };
    }
    this.registrarIntento(input.email, input.ipAddress);

    const valido = await this.codigoCoincideConDesafioActivo(input.email, input.code);
    return valido ? { status: "ok" } : { status: "invalid_or_expired" };
  }

  /**
   * R9/R10/R11/R13/R20: re-verifica el desafio activo y, si es valido, hashea
   * la nueva contrasena, la persiste y marca el desafio como consumido. Si el
   * desafio ya no esta activo, no toca la contrasena.
   */
  async restablecer(input: RestablecerInput): Promise<ResetOutcome> {
    if (this.limiteVerificacionSuperado(input.email, input.ipAddress)) {
      return { status: "invalid_or_expired" };
    }
    this.registrarIntento(input.email, input.ipAddress);

    const usuario = await this.cuentaProvisional(input.email);
    if (!usuario) return { status: "invalid_or_expired" };

    const challenge = await this.otpRepo.findLatestActiveByUsuarioId(usuario.id);
    if (!challenge) return { status: "invalid_or_expired" };

    const codigoValido = await verifyPassword(input.code, challenge.codeHash);
    if (!codigoValido) return { status: "invalid_or_expired" };

    const nuevoHash = await hashPassword(input.newPassword);
    await this.userRepo.updatePasswordHash(usuario.id, nuevoHash); // R9
    await this.otpRepo.markConsumed(challenge.id); // R10
    return { status: "ok" };
  }

  /**
   * SL-41 (R15, R17, design §6.1): crea la fila de bienvenida y devuelve `<challengeId>.<secreto>`.
   * Solo el hash del secreto llega a la base. El secreto no se registra ni viaja en un error: si
   * `create` falla, lo que se propaga es el error del repositorio, que no lo lleva.
   */
  async emitirEnlaceBienvenida(input: EmitirEnlaceBienvenidaInput): Promise<EnlaceBienvenidaEmitido> {
    const secreto = randomBytes(BYTES_SECRETO_ENLACE).toString("base64url");
    const ttlHoras = this.config.BIENVENIDA_TTL_HORAS;
    const challenge = await this.otpRepo.create({
      usuarioId: input.usuarioId,
      codeHash: await hashPassword(secreto),
      deviceHash: DEVICE_HASH_BIENVENIDA,
      ipAddress: input.ipAddress,
      expiresAt: new Date(Date.now() + ttlHoras * 3_600_000),
    });
    return { enlace: `${challenge.id}.${secreto}`, ttlHoras };
  }

  /**
   * SL-41 (revisión, m2): consume el desafío del enlace para que deje de ser el último activo. Solo
   * lo llama `BienvenidaMaestroService` con el enlace que acaba de emitir y cuyo envío falló.
   */
  async anularEnlaceBienvenida(enlace: string): Promise<void> {
    const partes = partirEnlace(enlace);
    if (!partes) return;
    await this.otpRepo.consumirSiActivo(partes.challengeId);
  }

  /**
   * SL-41 (R18-R20, R22, design §6.1): los 8 pasos del canje, en ese orden. Toda salida temprana
   * es la misma respuesta generica (R19), para no decir si el enlace existe, vencio o fue sustituido.
   *
   * Se consume ANTES de guardar la contrasena: si el proceso muere entre los dos pasos, el enlace
   * queda gastado y la contrasena sin poner (el maestro pide otro y nadie gana acceso). Al reves,
   * el mismo enlace se podria canjear dos veces. Es el criterio de `UsuarioService.restablecerContrasena`.
   */
  async crearContrasenaConEnlace(input: CrearContrasenaConEnlaceInput): Promise<ResetOutcome> {
    const invalido: ResetOutcome = { status: "invalid_or_expired" };
    const partes = partirEnlace(input.enlace); // 1
    if (!partes) return invalido;
    const { challengeId, secreto } = partes;

    // 2. Con 256 bits la fuerza bruta no es el riesgo; el limitador evita aceptar rafagas.
    if (this.limiteVerificacionSuperado(challengeId, input.ipAddress)) return invalido;
    this.registrarIntento(challengeId, input.ipAddress);

    const challenge = await this.otpRepo.findActiveById(challengeId); // 3: no existe, consumido o vencido
    if (!challenge) return invalido;
    if (challenge.deviceHash !== DEVICE_HASH_BIENVENIDA) return invalido; // 4

    // 5 (R22): un enlace nuevo o un codigo de «recuperar contrasena» posterior lo sustituye.
    const ultimo = await this.otpRepo.findLatestActiveByUsuarioId(challenge.usuarioId);
    if (!ultimo || ultimo.id !== challenge.id) return invalido;

    if (!(await verifyPassword(secreto, challenge.codeHash))) return invalido; // 6

    // 7 (R20): si otro canje gano la carrera, este no guarda nada.
    if (!(await this.otpRepo.consumirSiActivo(challenge.id))) return invalido;

    // 8 (R18)
    await this.userRepo.updatePasswordHash(challenge.usuarioId, await hashPassword(input.newPassword));
    return { status: "ok" };
  }

  /** `sujeto` es el email en el flujo del codigo y el `challengeId` en el del enlace (SL-41). */
  private limiteVerificacionSuperado(sujeto: string, ip: string): boolean {
    return this.verifyLimiter.superaLimite(
      buildResetRateKey(sujeto, ip),
      this.config.RESET_MAX_VERIFY_ATTEMPTS,
      this.config.RESET_VERIFY_WINDOW_MINUTES * 60_000,
    );
  }

  /**
   * PROVISIONAL (SL-18 T1.3) hasta T3.2: el email ya puede repetirse entre empresas y el
   * repositorio devuelve todas sus cuentas. Hasta que la recuperacion mande un enlace por cuenta
   * (design §4.1), se toma la PRIMERA en su orden: con una sola cuenta, el comportamiento de hoy.
   */
  private async cuentaProvisional(email: string): Promise<CuentaPublica | null> {
    const [cuenta = null] = await this.userRepo.findCuentasPorEmail(email);
    return cuenta;
  }

  private registrarIntento(sujeto: string, ip: string): void {
    this.verifyLimiter.registrar(buildResetRateKey(sujeto, ip));
  }

  private async codigoCoincideConDesafioActivo(
    email: string,
    code: string,
  ): Promise<boolean> {
    const usuario = await this.cuentaProvisional(email);
    if (!usuario) return false;
    const challenge = await this.otpRepo.findLatestActiveByUsuarioId(usuario.id);
    if (!challenge) return false;
    return verifyPassword(code, challenge.codeHash);
  }
}
