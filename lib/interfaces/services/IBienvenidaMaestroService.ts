// SL-41 (design §6.3) — el correo de bienvenida del primer maestro de una empresa.

/**
 * Lo que el superadmin necesita saber del correo. `sin_correo` se separa de `no_enviada` porque
 * el remedio es otro: en el primero falta configurar el SMTP del entorno, y reintentar no sirve
 * de nada hasta entonces (R24).
 */
export type EstadoBienvenida = "enviada" | "no_enviada" | "sin_correo";

export interface EnviarBienvenidaInput {
  organizacionId: string;
  /** IP de quien dio el alta o pidio el reenvio: queda en el desafio del enlace. */
  ipAddress: string;
}

/**
 * Lleva el email del maestro para que la pantalla diga a quien fue. En `no_enviada` puede ser
 * `null`: si falla la lectura del propio maestro, no hay email que dar. Nunca lleva el enlace: la
 * respuesta llega al navegador del superadmin (R28).
 */
export type EnviarBienvenidaResultado =
  | { estado: "enviada" | "sin_correo"; email: string }
  | { estado: "no_enviada"; email: string | null }
  | { estado: "sin_maestro" };

export interface IBienvenidaMaestroService {
  /** Nunca lanza (D4): cualquier fallo es `no_enviada`, y el alta que lo llama sigue en pie. */
  enviar(input: EnviarBienvenidaInput): Promise<EnviarBienvenidaResultado>;
}
