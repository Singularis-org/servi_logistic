// SL-36 (design §5, §9.1; R23, R27, R29, R30) — la clave del asistente de la empresa de la sesion.
//
// Es la unica puerta por la que el borde del asistente obtiene una clave de Anthropic: la plataforma
// ya no presta la suya. Sin cache a proposito (R28): el cliente se arma por peticion con lo que se
// acaba de leer.
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import {
  credencialesIntegracionReales,
  empresaEnCurso,
  fetchQueAvisaRechazo,
} from "@/lib/services/integraciones/credencial-de-la-empresa";

export interface AsistenteDeLaEmpresa {
  organizacionId: string;
  claveApi: string;
  /**
   * El `fetch` con que se construye el cliente de Anthropic: un 401 deja la integracion en
   * `asistente.credencial_rechazada` (R30). Con el `fetch` global no quedaria la marca.
   */
  fetchImpl: typeof fetch;
}

export interface AsistenteDeLaEmpresaDeps {
  credenciales?: ICredencialesIntegracion;
  /** La empresa de la sesion cuando no hay contexto explicito. Inyectable en tests. */
  empresaDeLaSesion?: () => Promise<string | null>;
  fetchBase?: typeof fetch;
  log?: { warn(mensaje: string): void };
}

/** R30 (design §5): Anthropic responde 401 a una clave invalida o revocada. */
const esRechazoDeAnthropic = (respuesta: Response) => respuesta.status === 401;

/**
 * `null` si no hay empresa (el superadmin), si la empresa no configuro el asistente o si su clave no
 * se lee (R29: ya quedo marcada). En los tres casos no se llama al proveedor (R27). Cualquier otro
 * error (base caida, boveda sin configurar) se propaga: no es «no configurado».
 */
export async function asistenteDeLaEmpresa(
  deps: AsistenteDeLaEmpresaDeps = {},
): Promise<AsistenteDeLaEmpresa | null> {
  let organizacionId: string;
  try {
    organizacionId = await empresaEnCurso("asistente", deps.empresaDeLaSesion);
  } catch (error) {
    if (error instanceof EmpresaNoResuelta) return null;
    throw error;
  }
  const credenciales = deps.credenciales ?? credencialesIntegracionReales();
  const lectura = await conEmpresa(organizacionId, () => credenciales.leer("asistente"));
  if (lectura.estado !== "lista") return null;

  // La marca captura la empresa: la respuesta llega por trozos fuera de cualquier `conEmpresa`.
  const marcarRechazo = () =>
    conEmpresa(organizacionId, () => credenciales.marcarRechazo("asistente", "asistente.credencial_rechazada"));
  return {
    organizacionId,
    claveApi: lectura.credencial.clave_api,
    fetchImpl: fetchQueAvisaRechazo(deps.fetchBase ?? fetch, esRechazoDeAnthropic, marcarRechazo, "asistente", deps.log),
  };
}
