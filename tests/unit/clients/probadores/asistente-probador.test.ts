// SL-36 (T4.4, R17, design §5) — la prueba del asistente lista los modelos de Anthropic: solo
// lectura, sin consumo de tokens, con la clave en `x-api-key`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsistenteProbador } from "@/lib/clients/probadores/asistente-probador";
import {
  afirmarSinSecretos,
  capturarLogs,
  fetchQueNoContesta,
  fetchSinRed,
  llamada,
  respuesta,
} from "./ayuda-probadores";

const CLAVE = "clave-secreta-del-asistente-000";
const CREDENCIAL = { clave_api: CLAVE };
const LISTADO = { data: [{ id: "claude-x", type: "model" }], has_more: false };

function crear(fetchImpl: typeof fetch, timeoutMs?: number) {
  const logs = capturarLogs();
  const probador = new AsistenteProbador({ fetchImpl, logger: logs.logger, timeoutMs });
  return { probador, logs };
}

function fetchUna(r: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(r);
}

afterEach(() => vi.restoreAllMocks());

describe("SL-36/R17 — el asistente prueba con el listado de modelos", () => {
  it("hace un solo GET a /v1/models con x-api-key y anthropic-version, sin la clave en la URL", async () => {
    const fetchImpl = fetchUna(respuesta(200, LISTADO));
    const { probador } = crear(fetchImpl);
    await probador.probar(CREDENCIAL);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, init } = llamada(fetchImpl);
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    const cabeceras = init.headers as Record<string, string>;
    expect(cabeceras["x-api-key"]).toBe(CLAVE);
    expect(cabeceras["anthropic-version"]).toBe("2023-06-01");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("SL-36/R12-R13 — resultado de la prueba del asistente", () => {
  it("200 con listado es prueba buena", async () => {
    const { probador, logs } = crear(fetchUna(respuesta(200, LISTADO)));
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: true, datosPublicos: {} });
    afirmarSinSecretos(r, logs.texto(), [CLAVE]);
  });

  it("HTTP 401 es `credencial_rechazada` (señal de R30) y no filtra la clave", async () => {
    const { probador, logs } = crear(
      fetchUna(
        respuesta(401, {
          type: "error",
          error: { type: "authentication_error", message: `invalid x-api-key ${CLAVE}` },
        }),
      ),
    );
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "credencial_rechazada" });
    expect(logs.texto()).toContain("HTTP 401");
    afirmarSinSecretos(r, logs.texto(), [CLAVE]);
  });

  it("HTTP 403 también es `credencial_rechazada`", async () => {
    const { probador } = crear(fetchUna(respuesta(403, {})));
    expect(await probador.probar(CREDENCIAL)).toEqual({ ok: false, motivo: "credencial_rechazada" });
  });

  it.each([429, 500, 529])("HTTP %i es `proveedor`", async (status) => {
    const { probador } = crear(fetchUna(respuesta(status, {})));
    expect(await probador.probar(CREDENCIAL)).toEqual({ ok: false, motivo: "proveedor" });
  });

  it("fallo de red es `sin_respuesta`, sin lanzar", async () => {
    const { probador, logs } = crear(fetchSinRed);
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("red");
    afirmarSinSecretos(r, logs.texto(), [CLAVE]);
  });

  it("timeout es `sin_respuesta` y el log dice `tiempo_agotado`", async () => {
    const { probador, logs } = crear(fetchQueNoContesta, 20);
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("tiempo_agotado");
    afirmarSinSecretos(r, logs.texto(), [CLAVE]);
  });

  it("200 que no es JSON o sin `data` es `respuesta_invalida`", async () => {
    const a = crear(fetchUna(respuesta(200, "<html>")));
    expect(await a.probador.probar(CREDENCIAL)).toEqual({ ok: false, motivo: "respuesta_invalida" });
    const b = crear(fetchUna(respuesta(200, { modelos: [] })));
    const r = await b.probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "respuesta_invalida" });
    afirmarSinSecretos(r, b.logs.texto(), [CLAVE]);
  });
});
