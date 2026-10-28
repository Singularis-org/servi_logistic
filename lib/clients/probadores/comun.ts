// SL-36 (design §5) — piezas comunes de los cuatro probadores.
//
// Por qué existe: los cuatro comparten la misma disciplina (fetch inyectado, 10 s, un fallo es
// un resultado y el log nunca lleva la URL ni la credencial). Escribirla una vez evita que un
// probador se quede sin timeout o con un `catch` que deja escapar la excepción.

/** QC inv. 18: una prueba que no contesta en 10 s no puede colgar la Server Action. */
export const TIMEOUT_PRUEBA_MS = 10_000;

export interface LoggerProbador {
  warn(mensaje: string): void;
}

export interface OpcionesProbador {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  logger?: LoggerProbador;
}

export interface OpcionesResueltas {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  logger: LoggerProbador;
}

export function resolverOpciones(opts: OpcionesProbador): OpcionesResueltas {
  return {
    fetchImpl: opts.fetchImpl ?? fetch,
    timeoutMs: opts.timeoutMs ?? TIMEOUT_PRUEBA_MS,
    // `console.warn` y no `console.log`: la guardia `credenciales-sin-consola-cruda` prohíbe el
    // segundo en `lib/clients/`, y el mensaje que llega aquí ya viene saneado.
    logger: opts.logger ?? { warn: (m) => console.warn(m) },
  };
}

export type Llamada =
  | { tipo: "respuesta"; respuesta: Response }
  | { tipo: "red" }
  | { tipo: "tiempo_agotado" };

function esTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Hace la petición con timeout y convierte la excepción de red en un valor. */
export async function llamar(
  opts: OpcionesResueltas,
  url: string,
  init: RequestInit,
): Promise<Llamada> {
  try {
    const respuesta = await opts.fetchImpl(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    return { tipo: "respuesta", respuesta };
  } catch (error) {
    return esTimeout(error) ? { tipo: "tiempo_agotado" } : { tipo: "red" };
  }
}

/** Lee el cuerpo como JSON sin lanzar; `undefined` si no lo es. */
export async function jsonSinLanzar(respuesta: Response): Promise<unknown> {
  try {
    return (await respuesta.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Lo último que vio un `fetch` envuelto. Sirve para clasificar el fallo de un cliente existente
 * que solo lanza un error de texto (`GoogleServiceAccountToken`, `GoogleGeocodeClient`) sin
 * parsear su mensaje, que puede cambiar sin avisar.
 */
export type Observado =
  | { tipo: "sin_llamar" }
  | { tipo: "red" }
  | { tipo: "tiempo_agotado" }
  | { tipo: "respuesta"; status: number };

export function fetchObservado(fetchImpl: typeof fetch): {
  fetchImpl: typeof fetch;
  visto: () => Observado;
} {
  let ultimo: Observado = { tipo: "sin_llamar" };
  const envuelto: typeof fetch = async (input, init) => {
    try {
      const respuesta = await fetchImpl(input, init);
      ultimo = { tipo: "respuesta", status: respuesta.status };
      return respuesta;
    } catch (error) {
      ultimo = esTimeout(error) ? { tipo: "tiempo_agotado" } : { tipo: "red" };
      throw error;
    }
  };
  return { fetchImpl: envuelto, visto: () => ultimo };
}

/** Una línea de log por prueba fallida: servicio, motivo y detalle técnico, nunca la URL. */
export function registrarFallo(
  logger: LoggerProbador,
  servicio: string,
  motivo: string,
  detalle: string,
): void {
  logger.warn(`[integraciones] prueba ${servicio}: ${motivo} (${detalle})`);
}

/** Nombre del error, sin su mensaje: el de una librería puede arrastrar la petición entera. */
export function nombreDeError(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
