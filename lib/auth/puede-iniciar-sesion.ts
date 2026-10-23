// SLT-32 — quien puede tener sesion. Es la UNICA definicion: el login, el OTP y la resolucion del
// actor la consultan, para que la regla no se desvie entre caminos de entrada.
//
// Un usuario sin empresa no puede operar: toda consulta de negocio filtra por `organizacion_id` y
// sin ella falla cerrado. `organizacion_id` NULL esta reservado al superadmin, pero ese rol aun no
// existe en `dev`; hasta que llegue (SL-32) se bloquea a TODO usuario sin empresa. SL-32 amplia
// este predicado con `|| esPlataforma(rol)`; para eso, quien lo llame debera pasar tambien el rol.
export interface SujetoDeSesion {
  organizacionId?: string | null;
}

export function puedeIniciarSesion({ organizacionId }: SujetoDeSesion): boolean {
  // Vacio cuenta como ausente: un id en blanco no identifica ninguna empresa.
  return typeof organizacionId === "string" && organizacionId.trim() !== "";
}
