// SL-36 (T4) — piezas comunes de los tests de probadores: respuestas falsas, un fetch que no
// contesta nunca, uno sin red, y la captura de TODO lo que sale por log (logger inyectado y
// `console.*`) para afirmar que ningún secreto aparece.
import { expect, vi } from "vitest";
import type { LoggerProbador } from "@/lib/clients/probadores/comun";

export function respuesta(status: number, cuerpo: unknown): Response {
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status });
}

/** No contesta hasta que la señal aborta: así se ejerce el timeout real del probador. */
export const fetchQueNoContesta: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const senal = init?.signal;
    senal?.addEventListener("abort", () => reject(senal.reason));
  });

export const fetchSinRed: typeof fetch = async () => {
  throw new TypeError("fetch failed");
};

const METODOS_CONSOLA = ["log", "warn", "error", "info", "debug"] as const;

/** Logger inyectable + espías de consola. `texto()` junta todo lo que se escribió. */
export function capturarLogs(): { logger: LoggerProbador; texto: () => string; lineas: string[] } {
  const lineas: string[] = [];
  // Se restauran con `vi.restoreAllMocks()` en el `afterEach` de cada archivo.
  for (const m of METODOS_CONSOLA) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      lineas.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
  return {
    logger: { warn: (m) => lineas.push(m) },
    texto: () => lineas.join("\n"),
    lineas,
  };
}

/** Ni el resultado ni el log pueden contener ninguno de los valores secretos. */
export function afirmarSinSecretos(resultado: unknown, log: string, secretos: string[]): void {
  const serializado = JSON.stringify(resultado);
  for (const secreto of secretos) {
    expect(serializado).not.toContain(secreto);
    expect(log).not.toContain(secreto);
  }
}

/** URL e init de la llamada `n` de un `vi.fn` usado como fetch. */
export function llamada(
  fetchMock: { mock: { calls: unknown[][] } },
  n = 0,
): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url: String(url), init };
}
