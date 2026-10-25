// Feature 92 — piezas COMPARTIDAS del token de Route Optimization: las clases de error, el scope y
// el contrato del proveedor de token.
//
// POR QUE SIGUE EN SU PROPIO ARCHIVO (SL-36 retiro los modos WIF y ADC, que eran el motivo original):
// `FallbackRouteOptimizationClient` decide por `instanceof RutaNoConfiguradoError`, y `instanceof`
// compara IDENTIDAD DE CLASE. Con una sola declaracion aqui, quien lanza (el token de la empresa) y
// quien decide (el fallback) no pueden acabar comparando dos clases distintas con el mismo nombre.
//
// INVARIANTE DE SEGURIDAD (R14): ninguna de las clases de error de aqui admite el valor de una
// credencial. Solo la operacion y el estado (motivo cerrado, status HTTP).

/** Scope minimo que exige `optimizeTours`. */
export const SCOPE_CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";

/** Nombre de la operacion citado en los errores. Sin credencial, sin token, sin URL. */
export const OPERACION_TOKEN = "token de service account";

/** Contrato UNICO que consume el handler. */
export interface TokenProvider {
  /** Devuelve un `access_token` valido para las APIs de Google Cloud. */
  obtener(): Promise<string>;
}

/**
 * SL-36 — por que la empresa no tiene una credencial de rutas usable. Lista CERRADA a proposito:
 * antes el mensaje citaba el nombre de una variable de entorno, y desde SL-36 la credencial no vive
 * en el entorno; un nombre de variable en el log mandaria a buscarla donde no esta.
 *  - `sin_configurar`: la empresa no dio de alta la optimizacion de rutas.
 *  - `ilegible`: la credencial guardada no se descifra (R29; ya quedo marcada).
 *  - `clave_mal_formada`: se descifra, pero no es el JSON de una cuenta de servicio.
 *  - `sin_empresa`: no hay empresa en curso (plataforma, superadmin).
 */
export type MotivoRutaNoConfigurada = "sin_configurar" | "ilegible" | "clave_mal_formada" | "sin_empresa";

/**
 * R12/R26: no hay credencial usable de Route Optimization. Se lanza ANTES de cualquier llamada de
 * red, y `FallbackRouteOptimizationClient` lo traduce en el orden local aproximado: la ruta se
 * ordena igual y el job no muere.
 */
export class RutaNoConfiguradoError extends Error {
  readonly motivo: MotivoRutaNoConfigurada;
  constructor(motivo: MotivoRutaNoConfigurada) {
    super(`optimizacion de ruta: la empresa no tiene la integracion de rutas lista (${motivo})`);
    this.name = "RutaNoConfiguradoError";
    this.motivo = motivo;
  }
}

/** El proveedor de identidad rechazo la credencial o no respondio. */
export class RutaTokenError extends Error {
  constructor(detalle: string) {
    super(`${OPERACION_TOKEN}: ${detalle}`);
    this.name = "RutaTokenError";
  }
}
