import type { EstadoUsuario, RolValue } from "@prisma/client";
import { esPlataforma } from "@/lib/auth/plataforma";

// SLT-32 — quien puede tener sesion. Es la UNICA definicion: el login (cada cuenta candidata,
// SL-18 design §3.2 paso 6), el OTP, la resolucion del actor y el guard del middleware
// (`isSessionActive`) la consultan, para que la regla no se desvie.
//
// Contrato de SL-18 design §9: la cuenta esta `activo` y tiene empresa, o es de plataforma
// (`esPlataforma(rol)`, SL-32). Un usuario de empresa sin empresa no puede operar: toda consulta
// de negocio filtra por `organizacion_id` y sin ella falla cerrado.
//
// Solo pide los tres campos que decide: sirve igual a `CuentaConHash` (login), `CuentaPublica`
// (OTP) y a la fila Prisma que leen `resolve-actor` y `session-guard` (con `rol` ya aplanado).
export interface SujetoDeSesion {
  estado: EstadoUsuario;
  organizacionId: string | null;
  rol: RolValue;
}

export function puedeIniciarSesion({ estado, organizacionId, rol }: SujetoDeSesion): boolean {
  if (estado !== "activo") return false;
  // Vacio cuenta como ausente: un id en blanco no identifica ninguna empresa.
  const tieneEmpresa = typeof organizacionId === "string" && organizacionId.trim() !== "";
  return tieneEmpresa || esPlataforma(rol);
}
