import { describe, it, expect, vi } from "vitest";
import {
  GOOGLE_API_LOG_EVENTO,
  GOOGLE_API_LOG_PREFIJO,
  registrarLlamadaGoogle,
  resultadoDeFalloDeRed,
  type ContextoLlamadaGoogle,
  type ContextoLlamadaRuta,
} from "@/lib/clients/registro-llamada-google";
import { GoogleRouteOptimizationClient } from "@/lib/clients/google-route-optimization";
import { GoogleRoutesClient } from "@/lib/clients/google-routes";
import { GoogleGeocodeClient } from "@/lib/clients/google-geocode";
import { FallbackRouteOptimizationClient } from "@/lib/clients/fallback-route-optimization";
import { HaversineRouteOptimizationClient } from "@/lib/clients/haversine-route-optimization";
import { RutaNoConfiguradoError } from "@/lib/auth/google-token-shared";
import { conEmpresa } from "@/lib/db/contexto-empresa";

// SLT-59 (D27; R68-R72; design §13.0) — la línea `[google-api]` de cada petición facturada.
// `fetch` y el logger son dobles: sin red, sin credencial y sin consola. El prefijo y el `evento`
// se importan de la constante: el test no repite el literal (adenda de D27).

const TOKEN = "tok-secreto-123";
const PROYECTO = "proyecto-gcp-x";
const CLAVE = "clave-api-secreta";
const DIRECCION = "Av. Central 100, Carmen, San José";
const ORIGEN = { lat: 9.9312, lng: -84.0791 };
const PARADAS = [
  { ordenId: "o-1", lat: 9.9401, lng: -84.0802 },
  { ordenId: "o-2", lat: 9.9502, lng: -84.0703 },
  { ordenId: "o-3", lat: 9.9603, lng: -84.0604 },
];
const CTX_RUTA: ContextoLlamadaRuta = {
  motivo: "entrega_fuera_de_orden",
  mensajeroId: "m-1",
  intento: 2,
  maxIntentos: 3,
};

function respuesta(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function capturador() {
  const lineas: string[] = [];
  return { lineas, registro: { info: (l: string) => lineas.push(l) } };
}

function campos(linea: string): Record<string, unknown> {
  expect(linea.startsWith(`${GOOGLE_API_LOG_PREFIJO} `)).toBe(true);
  return JSON.parse(linea.slice(GOOGLE_API_LOG_PREFIJO.length + 1)) as Record<string, unknown>;
}

/** R71: nada de credencial, URL, dirección ni coordenadas en la línea. */
function sinPii(linea: string): void {
  for (const prohibido of [TOKEN, PROYECTO, CLAVE, DIRECCION, "googleapis", "http"]) {
    expect(linea).not.toContain(prohibido);
  }
  for (const p of [ORIGEN, ...PARADAS]) {
    expect(linea).not.toContain(String(p.lat));
    expect(linea).not.toContain(String(p.lng));
  }
}

const OPT_OK = { routes: [{ visits: [{}, { shipmentIndex: 1 }, { shipmentIndex: 2 }] }] };
const ROUTES_OK = { routes: [{ polyline: { encodedPolyline: "abc" }, distanceMeters: 10 }] };
const GEO_OK = {
  status: "OK",
  results: [{ geometry: { location: { lat: 9.93, lng: -84.08 }, location_type: "ROOFTOP" } }],
};

function optimizador(fetchImpl: typeof fetch, registro: { info: (l: string) => void }) {
  return new GoogleRouteOptimizationClient({
    projectId: PROYECTO,
    getToken: async () => TOKEN,
    fetchImpl,
    registro,
    empresaId: () => "org-1",
  });
}

describe("T8.1 — registrarLlamadaGoogle (R69, R71)", () => {
  it("la línea empieza por el prefijo y lleva el evento, con todos los campos de R69", () => {
    const { lineas, registro } = capturador();
    registrarLlamadaGoogle(registro, {
      api: "routes",
      contexto: CTX_RUTA,
      empresaId: "org-1",
      paradas: 3,
      resultado: "ok",
    });
    expect(lineas).toHaveLength(1);
    expect(campos(lineas[0])).toEqual({
      evento: GOOGLE_API_LOG_EVENTO,
      api: "routes",
      motivo: "entrega_fuera_de_orden",
      empresaId: "org-1",
      mensajeroId: "m-1",
      ordenId: null,
      paradas: 3,
      intento: 2,
      maxIntentos: 3,
      resultado: "ok",
    });
  });

  it("sin mensajero ni orden, los dos van a null; la empresa ausente también", () => {
    const { lineas, registro } = capturador();
    registrarLlamadaGoogle(registro, {
      api: "geocoding",
      contexto: { motivo: "prueba_integracion", intento: 1, maxIntentos: 1 },
      empresaId: null,
      paradas: null,
      resultado: "500",
    });
    const c = campos(lineas[0]);
    expect(c.mensajeroId).toBeNull();
    expect(c.ordenId).toBeNull();
    expect(c.empresaId).toBeNull();
    expect(c.paradas).toBeNull();
  });

  it("R71: un campo de más colgado del contexto NO llega a la línea", () => {
    const { lineas, registro } = capturador();
    const contaminado = {
      ...CTX_RUTA,
      direccion: DIRECCION,
      token: TOKEN,
      lat: ORIGEN.lat,
    } as unknown as ContextoLlamadaGoogle;
    registrarLlamadaGoogle(registro, {
      api: "route_optimization",
      contexto: contaminado,
      empresaId: "org-1",
      paradas: 3,
      resultado: "ok",
    });
    sinPii(lineas[0]);
  });

  it("un rechazo de fetch por AbortSignal.timeout es `timeout`; cualquier otro, `red`", () => {
    expect(resultadoDeFalloDeRed(new DOMException("t", "TimeoutError"))).toBe("timeout");
    expect(resultadoDeFalloDeRed(new TypeError("fetch failed"))).toBe("red");
    expect(resultadoDeFalloDeRed("raro")).toBe("red");
  });
});

describe("T8.2 — route_optimization: una línea por petición optimizeTours (R69, R70)", () => {
  it("ok: api, motivo, intento y paradas = envíos enviados", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta(OPT_OK)) as unknown as typeof fetch;
    const r = await optimizador(fetchImpl, registro).optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA);
    expect(r.status).toBe("ok");
    expect(lineas).toHaveLength(1);
    const c = campos(lineas[0]);
    expect(c).toMatchObject({
      evento: GOOGLE_API_LOG_EVENTO,
      api: "route_optimization",
      motivo: "entrega_fuera_de_orden",
      empresaId: "org-1",
      mensajeroId: "m-1",
      paradas: 3,
      intento: 2,
      maxIntentos: 3,
      resultado: "ok",
    });
    sinPii(lineas[0]);
  });

  it.each([
    [500, "500"],
    [401, "401"],
    [429, "429"],
  ])("con HTTP %i la línea sale igual, con resultado %s", async (status, esperado) => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta({}, status)) as unknown as typeof fetch;
    await optimizador(fetchImpl, registro).optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA);
    expect(lineas).toHaveLength(1);
    expect(campos(lineas[0]).resultado).toBe(esperado);
  });

  it("un 400 lanza, pero su línea ya salió", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta({}, 400)) as unknown as typeof fetch;
    await expect(
      optimizador(fetchImpl, registro).optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA),
    ).rejects.toThrow();
    expect(campos(lineas[0]).resultado).toBe("400");
  });

  it("timeout y red dejan su línea con `timeout` / `red`", async () => {
    const t = capturador();
    const porTiempo = vi.fn(async () => {
      throw new DOMException("agotado", "TimeoutError");
    }) as unknown as typeof fetch;
    await optimizador(porTiempo, t.registro).optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA);
    expect(campos(t.lineas[0]).resultado).toBe("timeout");

    const r = capturador();
    const porRed = vi.fn(async () => {
      throw new TypeError("fetch failed https://routeoptimization.googleapis.com");
    }) as unknown as typeof fetch;
    await optimizador(porRed, r.registro).optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA);
    expect(campos(r.lineas[0]).resultado).toBe("red");
    sinPii(r.lineas[0]);
  });

  it("R72: la petición del token OAuth no deja línea; solo optimizeTours", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta(OPT_OK)) as unknown as typeof fetch;
    const cliente = new GoogleRouteOptimizationClient({
      projectId: PROYECTO,
      // Simula el intercambio OAuth con el MISMO fetch: es una petición HTTP, pero no se factura.
      getToken: async () => {
        await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST" });
        return TOKEN;
      },
      fetchImpl,
      registro,
      empresaId: () => "org-1",
    });
    await cliente.optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(lineas).toHaveLength(1);
    expect(campos(lineas[0]).api).toBe("route_optimization");
  });

  it("R72: si el token falla no hay petición facturada ni línea", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const cliente = new GoogleRouteOptimizationClient({
      projectId: PROYECTO,
      getToken: async () => {
        throw new RutaNoConfiguradoError("sin_configurar");
      },
      fetchImpl,
      registro,
    });
    await expect(cliente.optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA)).rejects.toThrow();
    expect(lineas).toHaveLength(0);
  });

  it("R72: el cálculo local (sin credencial -> Haversine) no deja línea", async () => {
    const { lineas, registro } = capturador();
    const google = new GoogleRouteOptimizationClient({
      projectId: PROYECTO,
      getToken: async () => {
        throw new RutaNoConfiguradoError("sin_configurar");
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
      registro,
    });
    const compuesto = new FallbackRouteOptimizationClient(google, new HaversineRouteOptimizationClient(), {
      warn: () => {},
    });
    const r = await compuesto.optimizar({ origen: ORIGEN, paradas: PARADAS }, CTX_RUTA);
    expect(r.status).toBe("ok");
    expect(lineas).toHaveLength(0);
  });
});

describe("T8.2 — routes: una línea por petición computeRoutes (R69)", () => {
  function trazador(fetchImpl: typeof fetch, registro: { info: (l: string) => void }) {
    return new GoogleRoutesClient({
      getToken: async () => TOKEN,
      fetchImpl,
      registro,
      empresaId: () => "org-1",
    });
  }

  it("ok: api routes, paradas = las pedidas, mismo motivo que recibe", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta(ROUTES_OK)) as unknown as typeof fetch;
    const r = await trazador(fetchImpl, registro).trazar({ origen: ORIGEN, paradasEnOrden: PARADAS }, CTX_RUTA);
    expect(r.status).toBe("ok");
    expect(lineas).toHaveLength(1);
    expect(campos(lineas[0])).toMatchObject({
      evento: GOOGLE_API_LOG_EVENTO,
      api: "routes",
      motivo: "entrega_fuera_de_orden",
      paradas: 3,
      resultado: "ok",
    });
    sinPii(lineas[0]);
  });

  it.each([
    [500, "500"],
    [403, "403"],
  ])("con HTTP %i la línea sale con resultado %s", async (status, esperado) => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta({}, status)) as unknown as typeof fetch;
    await trazador(fetchImpl, registro).trazar({ origen: ORIGEN, paradasEnOrden: PARADAS }, CTX_RUTA);
    expect(campos(lineas[0]).resultado).toBe(esperado);
  });

  it("timeout -> `timeout`", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("agotado", "TimeoutError");
    }) as unknown as typeof fetch;
    await trazador(fetchImpl, registro).trazar({ origen: ORIGEN, paradasEnOrden: PARADAS }, CTX_RUTA);
    expect(campos(lineas[0]).resultado).toBe("timeout");
  });

  it("R72: la guarda sin paradas corta antes de llamar y no deja línea", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await trazador(fetchImpl, registro).trazar({ origen: ORIGEN, paradasEnOrden: [] }, CTX_RUTA);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lineas).toHaveLength(0);
  });
});

describe("T8.2 — geocoding: una línea por petición, sin dirección ni clave (R69, R71)", () => {
  function geocoder(fetchImpl: typeof fetch, registro: { info: (l: string) => void }) {
    return new GoogleGeocodeClient({ apiKey: CLAVE, fetchImpl, registro, empresaId: () => "org-1" });
  }
  const CTX_GEO = { motivo: "carga_masiva", ordenId: "o-9", intento: 1, maxIntentos: 8 } as const;

  it("ok: api geocoding, ordenId, paradas null", async () => {
    const { lineas, registro } = capturador();
    const fetchImpl = vi.fn(async () => respuesta(GEO_OK)) as unknown as typeof fetch;
    await geocoder(fetchImpl, registro).geocodificar(DIRECCION, CTX_GEO);
    expect(lineas).toHaveLength(1);
    expect(campos(lineas[0])).toEqual({
      evento: GOOGLE_API_LOG_EVENTO,
      api: "geocoding",
      motivo: "carga_masiva",
      empresaId: "org-1",
      mensajeroId: null,
      ordenId: "o-9",
      paradas: null,
      intento: 1,
      maxIntentos: 8,
      resultado: "ok",
    });
    sinPii(lineas[0]);
  });

  it("HTTP 500 y red también dejan su línea", async () => {
    const a = capturador();
    await geocoder(vi.fn(async () => respuesta({}, 500)) as unknown as typeof fetch, a.registro).geocodificar(
      DIRECCION,
      CTX_GEO,
    );
    expect(campos(a.lineas[0]).resultado).toBe("500");

    const b = capturador();
    const porRed = vi.fn(async () => {
      throw new TypeError(`fetch failed ?address=${DIRECCION}&key=${CLAVE}`);
    }) as unknown as typeof fetch;
    await geocoder(porRed, b.registro).geocodificar(DIRECCION, CTX_GEO);
    expect(campos(b.lineas[0]).resultado).toBe("red");
    sinPii(b.lineas[0]);
  });
});

describe("T8.2 — los tres clientes emiten la MISMA constante (adenda de D27)", () => {
  it("las tres líneas comparten prefijo y evento y solo difieren en `api`", async () => {
    const { lineas, registro } = capturador();
    await optimizador(vi.fn(async () => respuesta(OPT_OK)) as unknown as typeof fetch, registro).optimizar(
      { origen: ORIGEN, paradas: PARADAS },
      CTX_RUTA,
    );
    await new GoogleRoutesClient({
      getToken: async () => TOKEN,
      fetchImpl: vi.fn(async () => respuesta(ROUTES_OK)) as unknown as typeof fetch,
      registro,
    }).trazar({ origen: ORIGEN, paradasEnOrden: PARADAS }, CTX_RUTA);
    await new GoogleGeocodeClient({
      apiKey: CLAVE,
      fetchImpl: vi.fn(async () => respuesta(GEO_OK)) as unknown as typeof fetch,
      registro,
    }).geocodificar(DIRECCION, { motivo: "prueba_integracion", intento: 1, maxIntentos: 1 });

    expect(lineas.map((l) => campos(l).evento)).toEqual([
      GOOGLE_API_LOG_EVENTO,
      GOOGLE_API_LOG_EVENTO,
      GOOGLE_API_LOG_EVENTO,
    ]);
    expect(lineas.map((l) => campos(l).api)).toEqual(["route_optimization", "routes", "geocoding"]);
  });

  it("sin `empresaId` inyectado, la empresa sale del contexto activo (`conEmpresa`)", async () => {
    const { lineas, registro } = capturador();
    const cliente = new GoogleGeocodeClient({
      apiKey: CLAVE,
      fetchImpl: vi.fn(async () => respuesta(GEO_OK)) as unknown as typeof fetch,
      registro,
    });
    await conEmpresa("org-del-contexto", () =>
      cliente.geocodificar(DIRECCION, { motivo: "prueba_integracion", intento: 1, maxIntentos: 1 }),
    );
    await cliente.geocodificar(DIRECCION, { motivo: "prueba_integracion", intento: 1, maxIntentos: 1 });
    expect(campos(lineas[0]).empresaId).toBe("org-del-contexto");
    expect(campos(lineas[1]).empresaId).toBeNull();
  });
});
