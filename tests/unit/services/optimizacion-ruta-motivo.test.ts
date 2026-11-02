import { describe, it, expect, vi } from "vitest";
import {
  OptimizacionRutaService,
  motivoLlamadaRuta,
  type ParadasRepo,
} from "@/lib/services/OptimizacionRutaService";
import { crearOptimizacionRutaHandler } from "@/lib/services/jobs/optimizacion-ruta-handler";
import { GoogleRouteOptimizationClient } from "@/lib/clients/google-route-optimization";
import { GoogleRoutesClient } from "@/lib/clients/google-routes";
import {
  GOOGLE_API_LOG_PREFIJO,
  MOTIVOS_LLAMADA_RUTA,
} from "@/lib/clients/registro-llamada-google";
import type {
  IRutaOptimizadaRepository,
  OrigenUbicacion,
  ReemplazarSecuenciaMeta,
  RutaOptimizadaDTO,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import type { EjecutarOptimizacionOpts } from "@/lib/interfaces/services/IOptimizacionRutaService";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { OrigenJobRuta } from "@/lib/services/jobs/optimizacion-ruta-encolado";

// SLT-59 (D27, D28, D29; R70, R73, R76; design §13.1) — el motivo de cada llamada de rutas lo
// decide el servicio con la rama de la guarda y quien disparo. Se usan los clientes REALES de
// Google con `fetch` simulado: lo que se afirma son las líneas `[google-api]` que salen de verdad.

const MENSAJERO = "m-1";
// 16:00 de CR del 29. «Ayer» es cualquier instante anterior a 2026-10-29T06:00:00Z.
const T0 = new Date("2026-10-29T22:00:00.000Z");
const AYER = new Date("2026-10-28T20:00:00.000Z");
const HOY = new Date(T0.getTime() - 30 * 60_000);
const MIN = 60_000;
const LNG = -84.09;
const M_POR_GRADO = (6371_000 * Math.PI) / 180;

const RECOGIDA = { lat: 9.9, lng: LNG };
const P = {
  s1: { lat: 9.91, lng: LNG },
  s2: { lat: 9.92, lng: LNG },
  s3: { lat: 9.93, lng: LNG },
};

const CONFIG: RouteOptimizationConfig = {
  ROUTE_OPT_TIMEOUT_MS: 20_000,
  RUTA_DEBOUNCE_S: 60,
  RUTA_ORIGEN_TTL_MIN: 120,
  RUTA_SYNC_MIN_INTERVALO_S: 10,
  RUTA_MAX_PARADAS: 100,
  RUTA_ORIGEN_MAX_KM: 200,
  ROUTES_ROUTING_PREFERENCE: "TRAFFIC_UNAWARE",
  RUTA_REOPT_DISTANCIA_M: 1000,
  RUTA_OPT_MAX_INTENTOS: 3,
  RUTA_RECUPERACION_ENFRIAMIENTO_MIN: 5,
  RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80,
  RUTA_PRIMERA_DEBOUNCE_MIN: 5,
};

function alOeste(base: { lat: number; lng: number }, metros: number) {
  return { lat: base.lat, lng: base.lng - metros / (M_POR_GRADO * Math.cos((base.lat * Math.PI) / 180)) };
}
function alSur(base: { lat: number; lng: number }, metros: number) {
  return { lat: base.lat - metros / M_POR_GRADO, lng: base.lng };
}

type Id = keyof typeof P;
function parada(id: Id): ParadaRutaRow {
  return { ordenId: id, latitud: P[id].lat, longitud: P[id].lng, createdAt: T0 };
}
const paradas = (...ids: Id[]) => ids.map(parada);

/** Ruta de AYER: la primera de hoy está pendiente. Origen = GPS de la recogida de hoy. */
function rutaDeAyer(over: Partial<RutaOptimizadaDTO> = {}): RutaOptimizadaDTO {
  return {
    id: "r1",
    mensajeroId: MENSAJERO,
    estado: "vigente",
    calculadaAt: AYER,
    origenLat: RECOGIDA.lat,
    origenLng: RECOGIDA.lng,
    origenAt: HOY,
    origenFuente: "gps",
    huellaSet: "huella",
    ultimoError: null,
    secuenciaFuente: "proveedor",
    trazado: null,
    tramoVivoAt: null,
    actualizadaAt: HOY,
    secuenciaPorOrden: new Map([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
    ]),
    tramoPorOrden: new Map(),
    ...over,
  };
}

/** Ruta ya calculada HOY, con el origen sobre la primera parada (sin desvío). */
function rutaDeHoy(ids: Id[], over: Partial<RutaOptimizadaDTO> = {}): RutaOptimizadaDTO {
  return rutaDeAyer({
    calculadaAt: HOY,
    origenLat: P.s1.lat,
    origenLng: P.s1.lng,
    secuenciaPorOrden: new Map(ids.map((id, i) => [id, i + 1])),
    ...over,
  });
}

function respuesta(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** `fetch` de los dos extremos: optimizeTours devuelve el orden enviado; computeRoutes, una línea. */
function fetchGoogle(opts: { optStatus?: number[]; routesStatus?: number } = {}) {
  const estados = [...(opts.optStatus ?? [])];
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("optimizeTours")) {
      const status = estados.shift() ?? 200;
      if (status !== 200) return respuesta({}, status);
      const body = JSON.parse(String(init?.body)) as { model: { shipments: unknown[] } };
      return respuesta({
        routes: [{ visits: body.model.shipments.map((_s, i) => (i === 0 ? {} : { shipmentIndex: i })) }],
      });
    }
    const status = opts.routesStatus ?? 200;
    return status === 200
      ? respuesta({ routes: [{ polyline: { encodedPolyline: "abc" } }] })
      : respuesta({}, status);
  }) as unknown as typeof fetch;
}

function build(opts: {
  ruta: RutaOptimizadaDTO | null;
  paradas?: ParadaRutaRow[];
  conteo?: { asignadas: number; recogidas: number };
  fetchImpl?: typeof fetch;
  sinRoutes?: boolean;
}) {
  let ruta = opts.ruta;
  const rutas = {
    findByMensajero: vi.fn(async () => (ruta === null ? null : { ...ruta })),
    upsertOrigen: vi.fn(async (_m: string, u: OrigenUbicacion) => {
      if (ruta !== null) {
        ruta = { ...ruta, origenLat: u.lat, origenLng: u.lng, origenAt: u.capturadaAt, origenFuente: u.fuente };
      }
    }),
    reemplazarSecuencia: vi.fn(async (_m: string, secuencia: string[], meta: ReemplazarSecuenciaMeta) => {
      ruta = {
        ...(ruta ?? rutaDeAyer()),
        estado: "vigente",
        calculadaAt: meta.calculadaAt,
        huellaSet: meta.huellaSet,
        secuenciaPorOrden: new Map(secuencia.map((id, i) => [id, i + 1])),
      };
    }),
    guardarTrazado: vi.fn(async () => {}),
    reducirSecuencia: vi.fn(async () => true),
    marcarDesactualizada: vi.fn(async () => {
      if (ruta !== null) ruta = { ...ruta, estado: "desactualizada" };
    }),
    marcarTramoVivo: vi.fn(async () => {}),
  };
  const paradasRepo = {
    findParadasEnReparto: vi.fn(async () => opts.paradas ?? paradas("s1", "s2", "s3")),
    contarAsignadasDelDia: vi.fn(async () => opts.conteo ?? { asignadas: 3, recogidas: 3 }),
  };
  const lineas: string[] = [];
  const registro = { info: (l: string) => lineas.push(l) };
  const fetchImpl = opts.fetchImpl ?? fetchGoogle();
  const client = new GoogleRouteOptimizationClient({
    projectId: "p",
    getToken: async () => "tok",
    fetchImpl,
    registro,
    empresaId: () => "org-1",
  });
  const routes = new GoogleRoutesClient({
    getToken: async () => "tok",
    fetchImpl,
    registro,
    empresaId: () => "org-1",
  });
  const service = new OptimizacionRutaService(
    rutas as unknown as IRutaOptimizadaRepository,
    paradasRepo as ParadasRepo,
    client,
    CONFIG,
    () => T0,
    { warn: () => {} },
    opts.sinRoutes === true ? null : routes,
  );
  const leidas = () =>
    lineas.map((l) => JSON.parse(l.slice(GOOGLE_API_LOG_PREFIJO.length + 1)) as Record<string, unknown>);
  return { service, lineas, leidas };
}

/** Las líneas como `api:motivo`, en orden. */
const resumen = (l: Record<string, unknown>[]) => l.map((x) => `${x.api}:${x.motivo}`);
const recalculo = (motivo: string) => [`route_optimization:${motivo}`, `routes:${motivo}`];

const job = (origen: OrigenJobRuta | null, intento = 1): EjecutarOptimizacionOpts => ({
  motivo: "debounce",
  job: { origen, intento, maxIntentos: 3 },
});

describe("T8.3 — un caso por cada motivo de §13.1 (R73), con sus dos líneas", () => {
  it("primera_ruta_recogida_completa: job de la ultima recogida (R58)", async () => {
    const h = build({ ruta: rutaDeAyer() });
    await h.service.ejecutar(MENSAJERO, job("recogida"));
    expect(resumen(h.leidas())).toEqual(recalculo("primera_ruta_recogida_completa"));
  });

  it("T7.9 — primera_ruta_debounce_recogida: el job de la espera de RUTA_PRIMERA_DEBOUNCE_MIN (origen recogida_parcial, R76)", async () => {
    const h = build({ ruta: rutaDeAyer() });
    await h.service.ejecutar(MENSAJERO, job("recogida_parcial"));
    expect(resumen(h.leidas())).toEqual(recalculo("primera_ruta_debounce_recogida"));
  });

  it("primera_ruta_primera_gestion: job de gestion con la primera pendiente (R59)", async () => {
    const h = build({ ruta: rutaDeAyer() });
    await h.service.ejecutar(MENSAJERO, job("gestion"));
    expect(resumen(h.leidas())).toEqual(recalculo("primera_ruta_primera_gestion"));
  });

  it("primera_ruta_salida: disparo de salida (R62, R63)", async () => {
    const h = build({ ruta: rutaDeAyer() });
    await h.service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: alSur(RECOGIDA, 1500) });
    expect(resumen(h.leidas())).toEqual(recalculo("primera_ruta_salida"));
  });

  it("primera_ruta_boton: manual con la primera pendiente y el % recogido (R64)", async () => {
    const h = build({ ruta: rutaDeAyer(), conteo: { asignadas: 3, recogidas: 3 } });
    await h.service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(resumen(h.leidas())).toEqual(recalculo("primera_ruta_boton"));
  });

  it("entrega_fuera_de_orden: job con lo quitado que no es un prefijo (R42)", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2", "s3"]), paradas: paradas("s1", "s3") });
    await h.service.ejecutar(MENSAJERO, job("gestion"));
    expect(resumen(h.leidas())).toEqual(recalculo("entrega_fuera_de_orden"));
  });

  it("paradas_nuevas_gestion: job de gestion con una parada nueva", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2"]) });
    await h.service.ejecutar(MENSAJERO, job("gestion"));
    expect(resumen(h.leidas())).toEqual(recalculo("paradas_nuevas_gestion"));
  });

  it("paradas_nuevas_traspaso: job de traspaso con una parada nueva (R60)", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2"]) });
    await h.service.ejecutar(MENSAJERO, job("traspaso"));
    expect(resumen(h.leidas())).toEqual(recalculo("paradas_nuevas_traspaso"));
  });

  it("reintento_ruta_desactualizada: job sobre una ruta desactualizada (R7)", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2", "s3"], { estado: "desactualizada" }) });
    await h.service.ejecutar(MENSAJERO, job("gestion"));
    expect(resumen(h.leidas())).toEqual(recalculo("reintento_ruta_desactualizada"));
  });

  it("sincronizacion_manual_desvio: el boton con el mensajero desviado (R52)", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2", "s3"]) });
    await h.service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: alOeste(P.s2, 2000) });
    expect(resumen(h.leidas())).toEqual(recalculo("sincronizacion_manual_desvio"));
  });

  it("sincronizacion_manual_paradas: el boton con paradas nuevas o fuera de orden", async () => {
    const nuevas = build({ ruta: rutaDeHoy(["s1", "s2"]) });
    await nuevas.service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(resumen(nuevas.leidas())).toEqual(recalculo("sincronizacion_manual_paradas"));

    const fuera = build({ ruta: rutaDeHoy(["s1", "s2", "s3"]), paradas: paradas("s1", "s3") });
    await fuera.service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(resumen(fuera.leidas())).toEqual(recalculo("sincronizacion_manual_paradas"));
  });

  it("recuperacion_ruta_caida: el boton sobre una ruta caida tras el enfriamiento (R53)", async () => {
    const h = build({
      ruta: rutaDeHoy(["s1", "s2", "s3"], {
        estado: "desactualizada",
        actualizadaAt: new Date(T0.getTime() - 6 * MIN),
      }),
    });
    await h.service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(resumen(h.leidas())).toEqual(recalculo("recuperacion_ruta_caida"));
  });

  it("trayecto_vivo: solo computeRoutes, intento 1 de 1", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2", "s3"]) });
    await h.service.trazarTramoVivo(MENSAJERO, { ubicacion: P.s1, ordenId: "s2" });
    expect(h.leidas()).toEqual([
      expect.objectContaining({ api: "routes", motivo: "trayecto_vivo", intento: 1, maxIntentos: 1, paradas: 1 }),
    ]);
  });

  it("job_sin_origen: un job encolado antes del despliegue, sin `origen`", async () => {
    const h = build({ ruta: rutaDeAyer() });
    await h.service.ejecutar(MENSAJERO, job(null));
    expect(resumen(h.leidas())).toEqual(recalculo("job_sin_origen"));
  });

  it("la tabla pura cubre cada motivo de rutas salvo los de cliente (trayecto y prueba)", () => {
    const decisiones = [
      "sin_ruta",
      "primera_del_dia",
      "desactualizada",
      "recuperacion",
      "paradas_nuevas",
      "fuera_de_orden",
      "desviado",
    ] as const;
    const disparos = ["debounce", "manual", "salida"] as const;
    const origenes = [null, "recogida", "recogida_parcial", "gestion", "traspaso"] as const;
    const vistos = new Set<string>();
    for (const d of decisiones)
      for (const disp of disparos) for (const o of origenes) vistos.add(motivoLlamadaRuta(d, disp, o));
    const esperados = MOTIVOS_LLAMADA_RUTA.filter((m) => m !== "trayecto_vivo" && m !== "prueba_integracion");
    expect([...vistos].sort()).toEqual([...esperados].sort());
  });
});

describe("T8.3 — reintentos de la cola (R70)", () => {
  it("intento 1 de 3 recibe un 500 y el 2 de 3 paga: cada intento deja su línea con su número", async () => {
    const h = build({ ruta: rutaDeAyer(), fetchImpl: fetchGoogle({ optStatus: [500] }) });
    await expect(h.service.ejecutar(MENSAJERO, job("recogida", 1))).rejects.toThrow();
    await h.service.ejecutar(MENSAJERO, job("recogida", 2));
    expect(h.leidas().map((l) => [l.api, l.intento, l.maxIntentos, l.resultado, l.motivo])).toEqual([
      ["route_optimization", 1, 3, "500", "primera_ruta_recogida_completa"],
      ["route_optimization", 2, 3, "ok", "primera_ruta_recogida_completa"],
      ["routes", 2, 3, "ok", "primera_ruta_recogida_completa"],
    ]);
  });

  it("fuera de la cola (boton) registra intento 1 de 1", async () => {
    const h = build({ ruta: rutaDeAyer() });
    await h.service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(h.leidas().every((l) => l.intento === 1 && l.maxIntentos === 1)).toBe(true);
  });

  it("el handler pasa el `origen` del payload y el intento/max_intentos de la fila", async () => {
    const ejecutar = vi.fn(async () => ({ status: "omitida" as const, razon: "obsoleta" as const }));
    const handler = crearOptimizacionRutaHandler({ ejecutar } as unknown as OptimizacionRutaService);
    const fila = {
      id: "j1",
      tipo: "optimizacion_ruta",
      payload: { mensajeroId: MENSAJERO, origen: "recogida_parcial" },
      estado: "processing",
      intentos: 2,
      maxIntentos: 3,
      runAfter: T0,
      lockedAt: T0,
      lastError: null,
      dedupeKey: null,
      createdAt: T0,
      updatedAt: T0,
    } as JobDTO;
    await handler(fila);
    await handler({ ...fila, payload: { mensajeroId: MENSAJERO }, intentos: 1 });
    expect(ejecutar.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      { motivo: "debounce", jobCreatedAt: T0, job: { origen: "recogida_parcial", intento: 2, maxIntentos: 3 } },
      { motivo: "debounce", jobCreatedAt: T0, job: { origen: null, intento: 1, maxIntentos: 3 } },
    ]);
  });
});

describe("T8.3 — R72 y la rama de una parada", () => {
  it("una sola parada (92/R35) produce solo el computeRoutes, con el motivo del recalculo", async () => {
    const h = build({ ruta: null, paradas: paradas("s1") });
    await h.service.ejecutar(MENSAJERO, job("gestion"));
    expect(resumen(h.leidas())).toEqual(["routes:primera_ruta_primera_gestion"]);
  });

  it("una guarda que omite (sin cambios) no deja ninguna línea", async () => {
    const h = build({ ruta: rutaDeHoy(["s1", "s2", "s3"]) });
    const r = await h.service.ejecutar(MENSAJERO, job("gestion"));
    expect(r.status).toBe("omitida");
    expect(h.lineas).toHaveLength(0);
  });

  it("la recta de respaldo tras un fallo de Routes no deja línea propia", async () => {
    const h = build({ ruta: rutaDeAyer(), fetchImpl: fetchGoogle({ routesStatus: 500 }) });
    const r = await h.service.ejecutar(MENSAJERO, job("recogida"));
    expect(r.status === "ok" && r.trazado?.fuente).toBe("local");
    expect(h.leidas().map((l) => `${l.api}:${l.resultado}`)).toEqual(["route_optimization:ok", "routes:500"]);
  });

  it("sin cliente de Routes, solo la línea de optimizeTours", async () => {
    const h = build({ ruta: rutaDeAyer(), sinRoutes: true });
    await h.service.ejecutar(MENSAJERO, job("recogida"));
    expect(resumen(h.leidas())).toEqual(["route_optimization:primera_ruta_recogida_completa"]);
  });
});
