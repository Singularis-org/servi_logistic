// SL-36 (T4.2, R17, design §5) — la prueba de Maps es una geocodificación de una dirección fija.
// La clave viaja en `?key=` porque la API no acepta cabecera: por eso la URL nunca va al log.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleMapsProbador } from "@/lib/clients/probadores/google-maps-probador";
import {
  afirmarSinSecretos,
  capturarLogs,
  fetchQueNoContesta,
  fetchSinRed,
  llamada,
  respuesta,
} from "./ayuda-probadores";

const CLAVE = "AIza-clave-maps-secreta-789";
const CREDENCIAL = { clave_api: CLAVE };

const OK = {
  status: "OK",
  results: [{ geometry: { location: { lat: 37.42, lng: -122.08 }, location_type: "ROOFTOP" } }],
};

function crear(fetchImpl: typeof fetch, timeoutMs?: number) {
  const logs = capturarLogs();
  const probador = new GoogleMapsProbador({ fetchImpl, logger: logs.logger, timeoutMs });
  return { probador, logs };
}

function fetchUna(r: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(r);
}

/** Lo que nunca puede aparecer: la clave, la URL con la clave y el parámetro `key=`. */
function afirmarSinClaveNiUrl(resultado: unknown, log: string): void {
  afirmarSinSecretos(resultado, log, [CLAVE]);
  expect(log).not.toContain("maps.googleapis.com");
  expect(log).not.toContain("key=");
}

afterEach(() => vi.restoreAllMocks());

describe("SL-36/R17 — Maps prueba con una geocodificación de una dirección fija", () => {
  it("hace un solo GET al endpoint de Geocoding con la dirección fija y la clave", async () => {
    const fetchImpl = fetchUna(respuesta(200, OK));
    const { probador } = crear(fetchImpl);
    await probador.probar(CREDENCIAL);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, init } = llamada(fetchImpl);
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    // Literal a propósito: la dirección fija ES el contrato; compararla con la constante que la
    // genera dejaría pasar cualquier cambio.
    expect(u.searchParams.get("address")).toBe("1600 Amphitheatre Parkway, Mountain View, CA");
    expect(u.searchParams.get("key")).toBe(CLAVE);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("SL-36/R12-R13 — resultado de la prueba de Maps", () => {
  it("OK es prueba buena, sin datos públicos", async () => {
    const { probador, logs } = crear(fetchUna(respuesta(200, OK)));
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: true, datosPublicos: {} });
    afirmarSinClaveNiUrl(r, logs.texto());
  });

  it("ZERO_RESULTS también es buena: la clave fue aceptada", async () => {
    const { probador } = crear(fetchUna(respuesta(200, { status: "ZERO_RESULTS", results: [] })));
    expect(await probador.probar(CREDENCIAL)).toEqual({ ok: true, datosPublicos: {} });
  });

  it("REQUEST_DENIED es `credencial_rechazada` y ni la clave ni la URL van al log", async () => {
    const { probador, logs } = crear(
      fetchUna(
        respuesta(200, {
          status: "REQUEST_DENIED",
          error_message: `The provided API key ${CLAVE} is invalid.`,
        }),
      ),
    );
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "credencial_rechazada" });
    expect(logs.texto()).toContain("REQUEST_DENIED");
    afirmarSinClaveNiUrl(r, logs.texto());
  });

  it("HTTP 500 es `proveedor`", async () => {
    const { probador, logs } = crear(fetchUna(respuesta(503, "caído")));
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "proveedor" });
    expect(logs.texto()).toContain("HTTP 503");
    afirmarSinClaveNiUrl(r, logs.texto());
  });

  it("fallo de red es `sin_respuesta`, sin lanzar", async () => {
    const { probador, logs } = crear(fetchSinRed);
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("(red)");
    afirmarSinClaveNiUrl(r, logs.texto());
  });

  it("timeout es `sin_respuesta` y el log dice `tiempo_agotado`", async () => {
    const { probador, logs } = crear(fetchQueNoContesta, 20);
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("tiempo_agotado");
    afirmarSinClaveNiUrl(r, logs.texto());
  });

  it("respuesta que no es JSON o sin `status` es `respuesta_invalida`", async () => {
    const a = crear(fetchUna(respuesta(200, "<html>")));
    expect(await a.probador.probar(CREDENCIAL)).toEqual({ ok: false, motivo: "respuesta_invalida" });
    const b = crear(fetchUna(respuesta(200, { results: [] })));
    const r = await b.probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "respuesta_invalida" });
    afirmarSinClaveNiUrl(r, b.logs.texto());
  });
});
