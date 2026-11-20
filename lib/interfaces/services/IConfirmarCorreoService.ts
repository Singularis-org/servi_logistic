import type { ConfirmarCambioCorreoResult } from "@/lib/types/usuario";

export interface EnlaceDeCambioCorreoInput {
  /** `<id>.<secreto>`, con la forma ya validada por zod. */
  enlace: string;
  ipAddress: string;
}

/**
 * SLT-221 (design §3.4, §4.3): el canje del enlace que confirma un cambio de correo, sin sesión ni
 * actor (R1628). Dos pasos, porque la acción los corre en dos contextos distintos:
 *   1. `empresaDelEnlace`, dentro de `comoPlataforma`: el limitador (R1629) y la empresa del
 *      pendiente; nada más se lee sin empresa;
 *   2. `confirmar`, dentro de `conEmpresa(org)`: el secreto y el cambio, bajo la RLS de esa empresa.
 * Toda salida inválida es la misma respuesta (R1623).
 */
export interface IConfirmarCorreoService {
  /** `null` = enlace roto, inexistente o con el límite de intentos superado. */
  empresaDelEnlace(input: EnlaceDeCambioCorreoInput): Promise<string | null>;
  confirmar(input: EnlaceDeCambioCorreoInput): Promise<ConfirmarCambioCorreoResult>;
}
