// SL-36 (T4.1, R17, design §5) — la prueba de WhatsApp lee el número y la WABA con dos GET a
// Graph, token en la cabecera, y un fallo de cualquier tipo es un resultado sin la credencial.
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsappProbador } from "@/lib/clients/probadores/whatsapp-probador";
import {
  afirmarSinSecretos,
  capturarLogs,
  fetchQueNoContesta,
  fetchSinRed,
  llamada,
  respuesta,
} from "./ayuda-probadores";

const TOKEN = "EAAG-token-secreto-whatsapp-123";
const APP_SECRET = "app-secret-que-no-sale-456";
const CREDENCIAL = { token_acceso: TOKEN, app_secret: APP_SECRET };
const DATOS = { numeroId: "1111", wabaId: "2222", nombreVisible: "Mensajería Norte" };
const SECRETOS = [TOKEN, APP_SECRET];

const NUMERO_OK = { display_phone_number: "+57 300 000 0000", verified_name: "Norte SAS", id: "1111" };
const WABA_OK = { id: "2222" };

function crear(fetchImpl: typeof fetch, timeoutMs?: number) {
  const logs = capturarLogs();
  const probador = new WhatsappProbador({ fetchImpl, logger: logs.logger, timeoutMs });
  return { probador, logs };
}

function fetchSecuencia(...respuestas: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of respuestas) fn.mockResolvedValueOnce(r);
  return fn;
}

afterEach(() => vi.restoreAllMocks());

describe("SL-36/R17 — WhatsApp prueba con su operación de solo lectura", () => {
  it("hace exactamente dos GET a Graph, número y WABA, con el token en Authorization y fuera de la URL", async () => {
    const fetchImpl = fetchSecuencia(respuesta(200, NUMERO_OK), respuesta(200, WABA_OK));
    const { probador } = crear(fetchImpl);
    await probador.probar(CREDENCIAL, DATOS);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const numero = llamada(fetchImpl, 0);
    expect(numero.url).toBe(
      "https://graph.facebook.com/v21.0/1111?fields=display_phone_number,verified_name",
    );
    const waba = llamada(fetchImpl, 1);
    expect(waba.url).toBe("https://graph.facebook.com/v21.0/2222?fields=id");
    for (const { url, init } of [numero, waba]) {
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
      expect(url).not.toContain(TOKEN);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("escapa los ids en la ruta: un id con barras no cambia de endpoint", async () => {
    const fetchImpl = fetchSecuencia(respuesta(200, NUMERO_OK), respuesta(200, { id: "../x" }));
    const { probador } = crear(fetchImpl);
    await probador.probar(CREDENCIAL, { ...DATOS, numeroId: "../me" });
    expect(llamada(fetchImpl, 0).url).toBe(
      "https://graph.facebook.com/v21.0/..%2Fme?fields=display_phone_number,verified_name",
    );
  });
});

describe("SL-36/R12 — prueba buena devuelve los datos públicos del proveedor", () => {
  it("suma teléfono visible y nombre verificado a lo que escribió el maestro", async () => {
    const { probador, logs } = crear(
      fetchSecuencia(respuesta(200, NUMERO_OK), respuesta(200, WABA_OK)),
    );
    const r = await probador.probar(CREDENCIAL, DATOS);
    expect(r).toEqual({
      ok: true,
      datosPublicos: {
        numeroId: "1111",
        wabaId: "2222",
        nombreVisible: "Mensajería Norte",
        telefonoVisible: "+57 300 000 0000",
        nombreVerificado: "Norte SAS",
      },
    });
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });
});

describe("SL-36/R13 — prueba fallida: motivo del catálogo, sin credencial en resultado ni log", () => {
  it("HTTP 401 del número es `credencial_rechazada` y no llega a probar la WABA", async () => {
    const fetchImpl = fetchSecuencia(
      respuesta(401, { error: { code: 190, message: `token ${TOKEN} inválido` } }),
    );
    const { probador, logs } = crear(fetchImpl);
    const r = await probador.probar(CREDENCIAL, DATOS);
    expect(r).toEqual({ ok: false, motivo: "credencial_rechazada" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logs.texto()).toContain("HTTP 401, código 190");
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("`error.code` 190 con HTTP 400 también es `credencial_rechazada` (señal de R30)", async () => {
    const { probador } = crear(fetchSecuencia(respuesta(400, { error: { code: 190 } })));
    expect(await probador.probar(CREDENCIAL, DATOS)).toEqual({ ok: false, motivo: "credencial_rechazada" });
  });

  it("número inexistente (código 100) es `numero_no_encontrado`", async () => {
    const { probador } = crear(fetchSecuencia(respuesta(400, { error: { code: 100 } })));
    expect(await probador.probar(CREDENCIAL, DATOS)).toEqual({
      ok: false,
      motivo: "numero_no_encontrado",
    });
  });

  it("número bueno y WABA inexistente es `waba_no_encontrada`", async () => {
    const { probador, logs } = crear(
      fetchSecuencia(respuesta(200, NUMERO_OK), respuesta(400, { error: { code: 100 } })),
    );
    const r = await probador.probar(CREDENCIAL, DATOS);
    expect(r).toEqual({ ok: false, motivo: "waba_no_encontrada" });
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("HTTP 403 o código de permiso es `sin_permiso`", async () => {
    const a = crear(fetchSecuencia(respuesta(403, {})));
    expect(await a.probador.probar(CREDENCIAL, DATOS)).toEqual({ ok: false, motivo: "sin_permiso" });
    const b = crear(fetchSecuencia(respuesta(400, { error: { code: 200 } })));
    expect(await b.probador.probar(CREDENCIAL, DATOS)).toEqual({ ok: false, motivo: "sin_permiso" });
  });

  it("HTTP 500 es `proveedor`", async () => {
    const { probador } = crear(fetchSecuencia(respuesta(500, "caído")));
    expect(await probador.probar(CREDENCIAL, DATOS)).toEqual({ ok: false, motivo: "proveedor" });
  });

  it("fallo de red es `sin_respuesta`, sin lanzar", async () => {
    const { probador, logs } = crear(fetchSinRed);
    const r = await probador.probar(CREDENCIAL, DATOS);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("red");
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("timeout es `sin_respuesta` y el log dice `tiempo_agotado`", async () => {
    const { probador, logs } = crear(fetchQueNoContesta, 20);
    const r = await probador.probar(CREDENCIAL, DATOS);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("tiempo_agotado");
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("respuesta 200 que no es JSON, o sin los campos del número, es `respuesta_invalida`", async () => {
    const a = crear(fetchSecuencia(respuesta(200, "<html>")));
    expect(await a.probador.probar(CREDENCIAL, DATOS)).toEqual({
      ok: false,
      motivo: "respuesta_invalida",
    });
    const b = crear(fetchSecuencia(respuesta(200, { id: "1111" })));
    expect(await b.probador.probar(CREDENCIAL, DATOS)).toEqual({
      ok: false,
      motivo: "respuesta_invalida",
    });
  });

  it("una WABA que responde con otro id es `respuesta_invalida`", async () => {
    const { probador } = crear(
      fetchSecuencia(respuesta(200, NUMERO_OK), respuesta(200, { id: "9999" })),
    );
    expect(await probador.probar(CREDENCIAL, DATOS)).toEqual({
      ok: false,
      motivo: "respuesta_invalida",
    });
  });

  it("un fetch que lanza algo inesperado sigue siendo un resultado", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      throw new Error(`explota con ${TOKEN}`);
    });
    const { probador, logs } = crear(fetchImpl);
    const r = await probador.probar(CREDENCIAL, DATOS);
    expect(r.ok).toBe(false);
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });
});
