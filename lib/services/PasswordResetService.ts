import { randomBytes } from "node:crypto";

import type { CuentaPublica, IUserRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { AuthConfig } from "@/lib/config/auth";
import { authConfig } from "@/lib/config/auth";
import { urlDelEnlace } from "@/lib/services/BienvenidaMaestroService";
import {
  plantillaRecuperarContrasena,
  type EnlaceDeCuenta,
} from "@/lib/services/email/plantillas/recuperar-contrasena";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { ResetRateLimiter, buildResetRateKey } from "@/lib/utils/reset-rate-limit";
import type {
  CrearContrasenaConEnlaceInput,
  EmitirEnlaceBienvenidaInput,
  EnlaceBienvenidaEmitido,
  IPasswordResetService,
  ResetOutcome,
  SolicitarResetInput,
  SolicitarResetResult,
} from "@/lib/interfaces/services/IPasswordResetService";

/** Dependencias del servicio, todas inyectables para test. */
type ResetUserRepo = Pick<IUserRepository, "findCuentasPorEmail" | "updatePasswordHash">;
type ResetOtpRepo = Pick<
  IEmailOtpChallengeRepository,
  | "findLatestActiveByUsuarioId"
  | "contarRecientesPorUsuario"
  | "create"
  | "findActiveById"
  | "consumirSiActivo"
>;

/**
 * SL-18 (design §4.1-§4.2): con qué sale el correo de «recuperar contraseña». Lo arma el
 * composition root; la URL base y el contacto se leen allí, del entorno, y no aquí.
 */
export interface CorreoDeRecuperacion {
  sender: IEmailSender;
  /** `null`: sin URL base no hay enlace que mandar, y no se emite nada. */
  baseUrl: string | null;
  contacto?: string | null;
}

/**
 * SL-41 (design §5.1): el `device_hash` de una fila de bienvenida. No es un sha256 hex, así que
 * nunca coincide con el de un dispositivo real: marca el propósito de la fila, y el canje solo
 * acepta filas con una marca de enlace (un código de login no se canjea por enlace).
 */
export const DEVICE_HASH_BIENVENIDA = "bienvenida";

/** SL-18 (design §4.1): la marca de una fila de «recuperar contraseña». Tampoco es un sha256 hex. */
export const DEVICE_HASH_RECUPERACION = "recuperacion";

/** Las marcas que acepta el canje (SL-18 R19): las dos filas que se abren con un enlace. */
const MARCAS_DE_ENLACE: readonly string[] = [DEVICE_HASH_BIENVENIDA, DEVICE_HASH_RECUPERACION];

/** 32 bytes = 256 bits (R15); en base64url son 43 caracteres, por debajo de los 72 de bcrypt. */
const BYTES_SECRETO_ENLACE = 32;

/** Separa `<challengeId>.<secreto>`. El formato ya lo validó zod; aquí solo se rechaza lo roto. */
function partirEnlace(enlace: string): { challengeId: string; secreto: string } | null {
  const punto = enlace.indexOf(".");
  if (punto <= 0 || punto === enlace.length - 1) return null;
  return { challengeId: enlace.slice(0, punto), secreto: enlace.slice(punto + 1) };
}

/**
 * Solo el nombre del error. El `message` no: el de `EmailEnvioError` lleva el destinatario (como
 * `causaDe` en `BienvenidaMaestroService`).
 */
function causaDe(error: unknown): string {
  return error instanceof Error ? error.name : "desconocido";
}

/**
 * Lógica de negocio del reset de contraseña (Feature 20, rehecha en SL-18 §4). Solo depende de
 * usuario + desafíos + emisor de correo + limitador. No crea sesión, no evalúa riesgo, no confía
 * dispositivos, no escribe en `login_attempt` y nunca bloquea la cuenta. Respuestas genéricas para
 * no filtrar la existencia de cuentas. No registra email, secreto ni contraseña.
 *
 * SL-18 (R20): no hay restablecimiento por email y código. Con el email repetido entre empresas,
 * «el desafío activo del usuario con este email» es ambiguo; la recuperación va por un enlace por
 * cuenta, y el enlace lleva a la cuenta por el id de su desafío.
 */
export class PasswordResetService implements IPasswordResetService {
  constructor(
    private readonly userRepo: ResetUserRepo,
    private readonly otpRepo: ResetOtpRepo,
    private readonly correo: CorreoDeRecuperacion,
    private readonly verifyLimiter: ResetRateLimiter = new ResetRateLimiter(),
    private readonly config: AuthConfig = authConfig,
  ) {}

  /**
   * SL-18 (R16, R17, R21): un enlace por cada cuenta del email que no superó el límite de
   * solicitudes, y UN solo correo con todos. Sin cuentas, o sin ningún enlace, no hay correo. La
   * respuesta es SIEMPRE la misma, para no decir si el email existe.
   */
  async solicitar(input: SolicitarResetInput): Promise<SolicitarResetResult> {
    const { baseUrl } = this.correo;
    // Sin URL base el enlace no lleva a ninguna parte: se corta ANTES de emitir, para no dejar
    // desafíos vivos que nadie puede abrir. El aviso nombra la variable y no el email.
    if (baseUrl === null) {
      console.warn("[recuperar-contrasena] no se envio: falta NEXT_PUBLIC_APP_URL");
      return { status: "ok" };
    }

    const cuentas = await this.userRepo.findCuentasPorEmail(input.email);
    const emitidos: string[] = [];
    const lineas: EnlaceDeCuenta[] = [];
    for (const cuenta of cuentas) {
      if (!(await this.dentroDelLimite(cuenta))) continue; // R16: la que superó el límite se omite
      const enlace = await this.emitirEnlace(
        cuenta.id,
        DEVICE_HASH_RECUPERACION,
        this.config.OTP_TTL_MINUTES * 60_000,
        input.ipAddress,
      );
      emitidos.push(enlace);
      lineas.push({ empresaNombre: cuenta.empresaNombre, url: urlDelEnlace(baseUrl, enlace) });
    }
    if (lineas.length === 0) return { status: "ok" }; // R17

    try {
      await this.correo.sender.enviar(
        plantillaRecuperarContrasena({
          to: input.email,
          enlaces: lineas,
          ttlMinutos: this.config.OTP_TTL_MINUTES,
          contacto: this.correo.contacto ?? null,
        }),
      );
    } catch (error) {
      // Como la m2 de SL-41: el correo no salió, así que los enlaces nuevos no los tiene nadie. Se
      // anulan para que el anterior de cada cuenta, si lo había, vuelva a ser el último activo. Si
      // anular también falla, se registra el error del envío, que es el que importa.
      for (const enlace of emitidos) await this.anularEnlace(enlace).catch(() => undefined);
      console.error(`[recuperar-contrasena] no se envio causa=${causaDe(error)}`);
    }
    return { status: "ok" };
  }

  /**
   * SL-41 (R15, R17, design §6.1): crea la fila de bienvenida y devuelve `<challengeId>.<secreto>`.
   * SL-18: es un envoltorio de `emitirEnlace`, así `BienvenidaMaestroService` no cambia.
   */
  async emitirEnlaceBienvenida(input: EmitirEnlaceBienvenidaInput): Promise<EnlaceBienvenidaEmitido> {
    const ttlHoras = this.config.BIENVENIDA_TTL_HORAS;
    const enlace = await this.emitirEnlace(
      input.usuarioId,
      DEVICE_HASH_BIENVENIDA,
      ttlHoras * 3_600_000,
      input.ipAddress,
    );
    return { enlace, ttlHoras };
  }

  /**
   * SL-41 (revisión, m2): consume el desafío del enlace para que deje de ser el último activo. Solo
   * lo llama `BienvenidaMaestroService` con el enlace que acaba de emitir y cuyo envío falló.
   */
  async anularEnlaceBienvenida(enlace: string): Promise<void> {
    await this.anularEnlace(enlace);
  }

  /**
   * SL-41 (R18-R20, R22, design §6.1) y SL-18 (R18, R19): los 8 pasos del canje, en ese orden.
   * Toda salida temprana es la misma respuesta genérica, para no decir si el enlace existe, venció
   * o fue sustituido.
   *
   * Se consume ANTES de guardar la contraseña: si el proceso muere entre los dos pasos, el enlace
   * queda gastado y la contraseña sin poner (se pide otro y nadie gana acceso). Al revés, el mismo
   * enlace se podría canjear dos veces. Es el criterio de `UsuarioService.restablecerContrasena`.
   */
  async crearContrasenaConEnlace(input: CrearContrasenaConEnlaceInput): Promise<ResetOutcome> {
    const invalido: ResetOutcome = { status: "invalid_or_expired" };
    const partes = partirEnlace(input.enlace); // 1
    if (!partes) return invalido;
    const { challengeId, secreto } = partes;

    // 2. Con 256 bits la fuerza bruta no es el riesgo; el limitador evita aceptar ráfagas.
    if (this.limiteVerificacionSuperado(challengeId, input.ipAddress)) return invalido;
    this.registrarIntento(challengeId, input.ipAddress);

    const challenge = await this.otpRepo.findActiveById(challengeId); // 3: no existe, consumido o vencido
    if (!challenge) return invalido;
    if (!MARCAS_DE_ENLACE.includes(challenge.deviceHash)) return invalido; // 4 (SL-18 R19)

    // 5 (SL-41 R22, SL-18 R19): un desafío posterior de la misma cuenta lo sustituye, sea un
    // enlace de bienvenida, uno de recuperación o un código de login.
    const ultimo = await this.otpRepo.findLatestActiveByUsuarioId(challenge.usuarioId);
    if (!ultimo || ultimo.id !== challenge.id) return invalido;

    if (!(await verifyPassword(secreto, challenge.codeHash))) return invalido; // 6

    // 7 (SL-41 R20): si otro canje ganó la carrera, este no guarda nada.
    if (!(await this.otpRepo.consumirSiActivo(challenge.id))) return invalido;

    // 8 (SL-41 R18, SL-18 R18): solo la cuenta del desafío; las demás del email no cambian.
    await this.userRepo.updatePasswordHash(challenge.usuarioId, await hashPassword(input.newPassword));
    return { status: "ok" };
  }

  /**
   * Crea la fila con la marca de su propósito y devuelve `<challengeId>.<secreto>`. Solo el hash
   * del secreto llega a la base (SL-18 R21). El secreto no se registra ni viaja en un error: si
   * `create` falla, lo que se propaga es el error del repositorio, que no lo lleva.
   */
  private async emitirEnlace(
    usuarioId: string,
    marca: string,
    ttlMs: number,
    ipAddress: string,
  ): Promise<string> {
    const secreto = randomBytes(BYTES_SECRETO_ENLACE).toString("base64url");
    const challenge = await this.otpRepo.create({
      usuarioId,
      codeHash: await hashPassword(secreto),
      deviceHash: marca,
      ipAddress,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return `${challenge.id}.${secreto}`;
  }

  private async anularEnlace(enlace: string): Promise<void> {
    const partes = partirEnlace(enlace);
    if (!partes) return;
    await this.otpRepo.consumirSiActivo(partes.challengeId);
  }

  private async dentroDelLimite(cuenta: CuentaPublica): Promise<boolean> {
    const recientes = await this.otpRepo.contarRecientesPorUsuario(
      cuenta.id,
      this.config.RESET_REQUEST_WINDOW_MINUTES,
    );
    return recientes < this.config.RESET_MAX_REQUESTS;
  }

  /** `sujeto` es el `challengeId` del enlace (SL-41). */
  private limiteVerificacionSuperado(sujeto: string, ip: string): boolean {
    return this.verifyLimiter.superaLimite(
      buildResetRateKey(sujeto, ip),
      this.config.RESET_MAX_VERIFY_ATTEMPTS,
      this.config.RESET_VERIFY_WINDOW_MINUTES * 60_000,
    );
  }

  private registrarIntento(sujeto: string, ip: string): void {
    this.verifyLimiter.registrar(buildResetRateKey(sujeto, ip));
  }
}
