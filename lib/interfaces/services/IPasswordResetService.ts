// Contrato del servicio de recuperacion de contrasena (Feature 20). La capa
// Service no conoce Next.js: recibe contexto ya resuelto (deviceHash/ip) y
// devuelve resultados de dominio genericos (no enumeracion de usuarios).

export interface SolicitarResetInput {
  email: string;
  deviceHash: string;
  ipAddress: string;
}

export interface VerificarCodigoInput {
  email: string;
  code: string;
  ipAddress: string;
}

export interface RestablecerInput {
  email: string;
  code: string;
  newPassword: string;
  ipAddress: string;
}

/** Respuesta generica de solicitud: nunca revela si la cuenta existe (R1/R3). */
export type SolicitarResetResult = { status: "ok" };

/** Resultado de verificacion/restablecimiento (R5/R6/R9/R10/R11). */
export type ResetOutcome = { status: "ok" } | { status: "invalid_or_expired" };

/** SL-41 (design §6.1): emision del enlace de bienvenida del primer maestro. */
export interface EmitirEnlaceBienvenidaInput {
  usuarioId: string;
  /** IP de quien dio el alta o pidio el reenvio (el superadmin), no la del maestro. */
  ipAddress: string;
}

/**
 * `enlace` es `<challengeId>.<secreto>`, lo que va detras de `#enlace=` en la URL. Es una
 * credencial: quien lo recibe lo mete en el correo y no lo registra en ningun log (R34).
 */
export interface EnlaceBienvenidaEmitido {
  enlace: string;
  ttlHoras: number;
}

/** SL-41 (design §6.1): canje del enlace. `enlace` ya llega validado de formato en el borde. */
export interface CrearContrasenaConEnlaceInput {
  enlace: string;
  newPassword: string;
  ipAddress: string;
}

export interface IPasswordResetService {
  solicitar(input: SolicitarResetInput): Promise<SolicitarResetResult>;
  verificarCodigo(input: VerificarCodigoInput): Promise<ResetOutcome>;
  restablecer(input: RestablecerInput): Promise<ResetOutcome>;
  /** SL-41 (R15, R17): crea el desafio de bienvenida y devuelve el enlace. Solo el hash se guarda. */
  emitirEnlaceBienvenida(input: EmitirEnlaceBienvenidaInput): Promise<EnlaceBienvenidaEmitido>;
  /**
   * SL-41 (revisión, m2): deja sin valor un enlace recién emitido cuyo correo no salió. Como el
   * canje exige que el enlace sea el último activo (R22), anular el nuevo devuelve el valor al
   * anterior: un «Reenviar» que falla no rompe la bienvenida que ya había salido.
   */
  anularEnlaceBienvenida(enlace: string): Promise<void>;
  /** SL-41 (R18-R20, R22): canjea el enlace por una contrasena. No abre sesion. */
  crearContrasenaConEnlace(input: CrearContrasenaConEnlaceInput): Promise<ResetOutcome>;
}
