import {
  ProveedorCobroError,
  type CodigoErrorProveedor,
  type OperacionProveedor,
  type ProveedorCobroId,
} from "@/lib/types/cobro";

// SLT-227 (design §5) — el transporte de los proveedores de cobro: tiempo máximo por intento (R20), reintentos solo
// en lo idempotente (R21–R23) y la traducción de toda falla a `ProveedorCobroError` (R24). No depende de Rebill:
// Wompi y Global66 lo reutilizan.

export interface TransporteDeps {
  fetchImpl: typeof fetch;
  /** `setTimeout` en la app; en los tests, un doble que anota y no espera. */
  esperar: (ms: number) => Promise<void>;
  tiempoMaximoMs: number;
  /** Solo las usa `pedirIdempotente`: n esperas son n + 1 intentos. */
  esperasReintentoMs: readonly number[];
}

/** Una respuesta `2xx` con su cuerpo ya parseado como JSON. Las demás salen como `ProveedorCobroError`. */
export interface RespuestaCruda {
  estado: number;
  cuerpo: unknown;
}

/** Lo que pasó en una llamada fallida, antes de traducirlo. Nunca lleva el cuerpo ni el mensaje de `fetch` (R25). */
export type FallaProveedor =
  | { tipo: "http"; estadoHttp: number }
  | { tipo: "tiempo_agotado" }
  | { tipo: "sin_conexion" }
  | { tipo: "respuesta_invalida"; estadoHttp?: number }
  | { tipo: "credencial_ilegible" };

/** Lo que pudo tener efecto en el proveedor aunque no llegara la respuesta (R22). La consulta nunca lo es. */
const OPERACIONES_CON_EFECTO: ReadonlySet<OperacionProveedor> = new Set(["crearEnlace", "devolver"]);

function codigoDeEstadoHttp(estadoHttp: number): CodigoErrorProveedor {
  if (estadoHttp === 401 || estadoHttp === 403) return "credencial_rechazada";
  if (estadoHttp === 404) return "no_encontrado";
  if (estadoHttp === 429) return "limite_de_peticiones";
  if (estadoHttp >= 500 && estadoHttp <= 599) return "proveedor_caido";
  if (estadoHttp >= 400 && estadoHttp <= 499) return "solicitud_rechazada";
  // Un 1xx o 3xx que `fetch` no resolvió no es ninguna de las respuestas que documenta el proveedor.
  return "respuesta_invalida";
}

/** La tabla de R24, pura. */
export function traducirFalla(
  proveedor: ProveedorCobroId,
  operacion: OperacionProveedor,
  falla: FallaProveedor,
): ProveedorCobroError {
  const codigo = falla.tipo === "http" ? codigoDeEstadoHttp(falla.estadoHttp) : falla.tipo;
  const reintentable =
    codigo === "limite_de_peticiones" ||
    codigo === "proveedor_caido" ||
    codigo === "tiempo_agotado" ||
    codigo === "sin_conexion";
  const incierto =
    OPERACIONES_CON_EFECTO.has(operacion) &&
    (codigo === "tiempo_agotado" || codigo === "sin_conexion" || codigo === "proveedor_caido");
  const estadoHttp = "estadoHttp" in falla ? (falla.estadoHttp ?? null) : null;
  return new ProveedorCobroError(codigo, proveedor, { operacion, estadoHttp, reintentable, incierto });
}

/** `AbortSignal.timeout` rechaza con `TimeoutError`; nunca se lee el mensaje, que puede traer la URL (R25). */
function fallaDeExcepcion(error: unknown): FallaProveedor {
  const nombre = error instanceof Error ? error.name : "";
  return nombre === "TimeoutError" || nombre === "AbortError" ? { tipo: "tiempo_agotado" } : { tipo: "sin_conexion" };
}

function parsearJson(texto: string): { ok: true; valor: unknown } | { ok: false } {
  try {
    return { ok: true, valor: JSON.parse(texto) as unknown };
  } catch {
    return { ok: false };
  }
}

type Intento = { tipo: "ok"; respuesta: RespuestaCruda } | { tipo: "falla"; error: ProveedorCobroError };

async function intentar(
  deps: TransporteDeps,
  proveedor: ProveedorCobroId,
  operacion: OperacionProveedor,
  url: string,
  init: RequestInit,
): Promise<Intento> {
  const falla = (f: FallaProveedor): Intento => ({ tipo: "falla", error: traducirFalla(proveedor, operacion, f) });
  const signal = AbortSignal.timeout(deps.tiempoMaximoMs);
  let respuesta: Response;
  try {
    respuesta = await deps.fetchImpl(url, { ...init, cache: "no-store", signal });
  } catch (error) {
    return falla(fallaDeExcepcion(error));
  }
  if (respuesta.status < 200 || respuesta.status > 299) {
    // El cuerpo de una respuesta de error se descarta sin leerlo: puede repetir la API key o traer datos del pagador.
    await respuesta.body?.cancel().catch(() => undefined);
    return falla({ tipo: "http", estadoHttp: respuesta.status });
  }
  let texto: string;
  try {
    // La misma señal corta también la lectura del cuerpo: el tiempo máximo es del intento entero (R20).
    texto = await respuesta.text();
  } catch (error) {
    return falla(fallaDeExcepcion(error));
  }
  const json = parsearJson(texto);
  if (!json.ok) return falla({ tipo: "respuesta_invalida", estadoHttp: respuesta.status });
  return { tipo: "ok", respuesta: { estado: respuesta.status, cuerpo: json.valor } };
}

/** Exactamente una petición (R22): la usan `crearEnlace` y `devolver`, que el proveedor no hace idempotentes. */
export async function pedirUnaVez(
  deps: TransporteDeps,
  proveedor: ProveedorCobroId,
  operacion: OperacionProveedor,
  url: string,
  init: RequestInit,
): Promise<RespuestaCruda> {
  const intento = await intentar(deps, proveedor, operacion, url, init);
  if (intento.tipo === "falla") throw intento.error;
  return intento.respuesta;
}

/**
 * Hasta `esperasReintentoMs.length + 1` intentos, solo ante una falla reintentable (`429`, `5xx`, tiempo agotado,
 * sin conexión; R21). Un `4xx` distinto de `429` o una respuesta inválida salen al primer intento (R23).
 */
export async function pedirIdempotente(
  deps: TransporteDeps,
  proveedor: ProveedorCobroId,
  operacion: OperacionProveedor,
  url: string,
  init: RequestInit,
): Promise<RespuestaCruda> {
  const metodo = (init.method ?? "GET").toUpperCase();
  if (metodo !== "GET") {
    // Error de programación: reintentar algo con efecto podría crear dos enlaces o devolver dos veces (R22).
    throw new Error(`pedirIdempotente solo admite GET (recibió ${metodo} en ${proveedor} ${operacion})`);
  }
  for (let i = 0; ; i++) {
    const intento = await intentar(deps, proveedor, operacion, url, init);
    if (intento.tipo === "ok") return intento.respuesta;
    const espera = deps.esperasReintentoMs[i];
    if (!intento.error.reintentable || espera === undefined) throw intento.error;
    await deps.esperar(espera);
  }
}

/** El `esperar` de la app. */
export function esperarConTemporizador(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
