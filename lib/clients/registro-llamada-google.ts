// SLT-59 (D27; R68-R74; design §13.0) — la pieza común del registro de cada llamada pagada a
// Google. Única fuente del prefijo, del `evento` y de los motivos: los tres clientes
// (`google-route-optimization.ts`, `google-routes.ts`, `google-geocode.ts`) la usan y ninguno
// repite el literal.
//
// Una línea por petición HTTP facturada, incluido cada reintento de la cola (R69, R70). No hay
// línea sin petición: ni el token OAuth, ni el cálculo local, ni la recta de respaldo, ni una
// guarda que corta antes de llamar (R72).
//
// Sin PII ni secretos (R71): solo ids, conteos, el número de intento y el código del resultado.
// Nunca el token, la URL, una dirección ni una coordenada.
import { contextoActual } from "@/lib/db/contexto-empresa";
import {
  registroGoogleApiEnConsola,
  type RegistroLlamadaLogger,
} from "@/lib/logging/google-api-log";

export type { RegistroLlamadaLogger } from "@/lib/logging/google-api-log";

export const GOOGLE_API_LOG_PREFIJO = "[google-api]";
export const GOOGLE_API_LOG_EVENTO = "google_api_llamada";

export type ApiGoogle = "route_optimization" | "routes" | "geocoding";

/** Design §13.1. Un recálculo da su `optimizeTours` y su `computeRoutes` con el mismo motivo. */
export const MOTIVOS_LLAMADA_RUTA = [
  "primera_ruta_recogida_completa",
  "primera_ruta_debounce_recogida",
  "primera_ruta_primera_gestion",
  "primera_ruta_salida",
  "primera_ruta_boton",
  "entrega_fuera_de_orden",
  "paradas_nuevas_gestion",
  "paradas_nuevas_traspaso",
  "reintento_ruta_desactualizada",
  "sincronizacion_manual_desvio",
  "sincronizacion_manual_paradas",
  "recuperacion_ruta_caida",
  "trayecto_vivo",
  "prueba_integracion",
  "job_sin_origen",
] as const;
export type MotivoLlamadaRuta = (typeof MOTIVOS_LLAMADA_RUTA)[number];

/** Design §13.2. Viaja en `payload.motivo` del job de geocodificación. */
export const MOTIVOS_LLAMADA_GEOCODE = [
  "orden_creada",
  "carga_masiva",
  "direccion_cambiada",
  "asignacion_sin_coordenadas",
  "revivido_por_salud",
  "prueba_integracion",
  "job_sin_motivo",
] as const;
export type MotivoLlamadaGeocode = (typeof MOTIVOS_LLAMADA_GEOCODE)[number];

export interface ContextoLlamadaGoogle<
  M extends MotivoLlamadaRuta | MotivoLlamadaGeocode = MotivoLlamadaRuta | MotivoLlamadaGeocode,
> {
  motivo: M;
  mensajeroId?: string;
  ordenId?: string;
  intento: number;
  /** 1 fuera de la cola (R70). */
  maxIntentos: number;
}

export type ContextoLlamadaRuta = ContextoLlamadaGoogle<MotivoLlamadaRuta>;
export type ContextoLlamadaGeocode = ContextoLlamadaGoogle<MotivoLlamadaGeocode>;

/** R70: una llamada que no viene de la cola es el intento 1 de 1. */
export const FUERA_DE_COLA = { intento: 1, maxIntentos: 1 } as const;

/** De dónde sale la empresa de la línea. Por defecto, el contexto de empresa activo. */
export type EmpresaDeLaLlamada = () => string | null;

/** La empresa del contexto activo (`conEmpresa`), o `null` si no hay ninguna fijada. */
export const empresaDelContextoActual: EmpresaDeLaLlamada = () => {
  const contexto = contextoActual();
  return contexto?.tipo === "empresa" ? contexto.organizacionId : null;
};

/** Lo que cada cliente acepta en su constructor para registrar sus llamadas. */
export interface OpcionesRegistroLlamada {
  registro?: RegistroLlamadaLogger;
  empresaId?: EmpresaDeLaLlamada;
}

/**
 * Código de un fallo de `fetch` sin respuesta. `AbortSignal.timeout` rechaza con un
 * `TimeoutError`; cualquier otro rechazo es de red. Nunca se lee el mensaje (puede traer la URL).
 */
export function resultadoDeFalloDeRed(error: unknown): "timeout" | "red" {
  const nombre =
    typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  return nombre === "TimeoutError" || nombre === "AbortError" ? "timeout" : "red";
}

/** Código de una respuesta HTTP: `ok` para 2xx; si no, el estado. */
export function resultadoDeRespuesta(status: number): string {
  return status >= 200 && status < 300 ? "ok" : String(status);
}

export interface LineaLlamadaGoogle {
  api: ApiGoogle;
  contexto: ContextoLlamadaGoogle;
  empresaId: string | null;
  /** Envíos en `optimizeTours`, paradas pedidas en `computeRoutes`, `null` en geocode. */
  paradas: number | null;
  /** `ok`, el estado HTTP, `red` o `timeout`. */
  resultado: string;
}

/**
 * Emite la línea de R69. Los campos se copian uno a uno a propósito: el contexto podría crecer
 * y nada que no esté en esta lista debe llegar al log (R71).
 */
export function registrarLlamadaGoogle(
  logger: RegistroLlamadaLogger,
  linea: LineaLlamadaGoogle,
): void {
  const { contexto } = linea;
  const campos = {
    evento: GOOGLE_API_LOG_EVENTO,
    api: linea.api,
    motivo: contexto.motivo,
    empresaId: linea.empresaId,
    mensajeroId: contexto.mensajeroId ?? null,
    ordenId: contexto.ordenId ?? null,
    paradas: linea.paradas,
    intento: contexto.intento,
    maxIntentos: contexto.maxIntentos,
    resultado: linea.resultado,
  };
  logger.info(`${GOOGLE_API_LOG_PREFIJO} ${JSON.stringify(campos)}`);
}

/** Resuelve las opciones de registro de un cliente con sus valores reales por defecto. */
export function resolverRegistro(opts: OpcionesRegistroLlamada): {
  registro: RegistroLlamadaLogger;
  empresaId: EmpresaDeLaLlamada;
} {
  return {
    registro: opts.registro ?? registroGoogleApiEnConsola,
    empresaId: opts.empresaId ?? empresaDelContextoActual,
  };
}
