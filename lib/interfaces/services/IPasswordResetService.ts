// Contrato del servicio de recuperacion de contrasena (Feature 20; SL-18 §4: un enlace por cuenta).
// La capa Service no conoce Next.js: recibe contexto ya resuelto (deviceHash/ip) y
// devuelve resultados de dominio genericos (no enumeracion de usuarios).

export interface SolicitarResetInput {
  email: string;
  /**
   * El del navegador que pide. Desde SL-18 la fila no lo guarda (lleva la marca
   * `DEVICE_HASH_RECUPERACION`); se conserva porque es la firma de design §4.1.
   */
  deviceHash: string;
  ipAddress: string;
}

/** Respuesta generica de solicitud: nunca revela si la cuenta existe (R1/R3). */
export type SolicitarResetResult = { status: "ok" };

/** Resultado del canje de un enlace (SL-41 R18-R20; SL-18 R18, R19). */
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
  /**
   * SL-18 (R16, R17): un correo con un enlace por cada cuenta del email que no supero el limite.
   * No hay `verificarCodigo` ni `restablecer` por email y codigo (SL-18 R20).
   */
  solicitar(input: SolicitarResetInput): Promise<SolicitarResetResult>;
  /** SL-41 (R15, R17): crea el desafio de bienvenida y devuelve el enlace. Solo el hash se guarda. */
  emitirEnlaceBienvenida(input: EmitirEnlaceBienvenidaInput): Promise<EnlaceBienvenidaEmitido>;
  /**
   * SL-41 (revisión, m2): deja sin valor un enlace recién emitido cuyo correo no salió. Como el
   * canje exige que el enlace sea el último activo (R22), anular el nuevo devuelve el valor al
   * anterior: un «Reenviar» que falla no rompe la bienvenida que ya había salido.
   */
  anularEnlaceBienvenida(enlace: string): Promise<void>;
  /**
   * SL-41 (R18-R20, R22) y SL-18 (R18, R19): canjea un enlace de bienvenida o de recuperacion por
   * una contrasena, solo la de la cuenta del enlace. No abre sesion.
   */
  crearContrasenaConEnlace(input: CrearContrasenaConEnlaceInput): Promise<ResetOutcome>;
}
