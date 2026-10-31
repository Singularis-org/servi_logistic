import { describe, it, expect, vi } from "vitest";
import { OptimizacionRutaService, type ParadasRepo } from "@/lib/services/OptimizacionRutaService";
import type {
  IRutaOptimizadaRepository,
  RutaOptimizadaDTO,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type { IRoutesClient } from "@/lib/interfaces/external/IRoutesClient";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import { codificarPolilinea } from "@/lib/geo/polilinea";

// SLT-59 T7.2 (R53, R54; design §12.1, D21) — recuperar a mano una ruta `desactualizada`. Con el
// mismo conjunto, sin fuera de orden y sin desvio, el boton solo paga cuando han pasado
// `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` desde `updated_at` (cota del instante del fallo, R54).
// Antes devuelve la ruta actual con 0 llamadas y sin escribir nada, ni siquiera el origen (R46).

const MENSAJERO = "m-1";
// 16:00 de CR: la ruta calculada esta mañana es de hoy (la primera ruta ya no esta pendiente).
const T0 = new Date("2026-10-29T22:00:00.000Z");
const LNG = -84.09;
const MIN = 60_000;

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
  RUTA_PRIMERA_DEBOUNCE_MIN: 10,
};

const TRAZADO = {
  encodedPolyline: codificarPolilinea([{ lat: 9.9, lng: LNG }, P.s1, P.s2, P.s3]),
  distanciaM: 3300,
  duracionS: 600,
  fuente: "routes" as const,
};

function parada(id: keyof typeof P): ParadaRutaRow {
  return { ordenId: id, latitud: P[id].lat, longitud: P[id].lng, createdAt: T0 };
}

/** Ruta `desactualizada` de hoy, con su ultimo fallo `haceMs` antes de T0 y el GPS sobre la ruta. */
function rutaCaida(haceMs: number, over: Partial<RutaOptimizadaDTO> = {}): RutaOptimizadaDTO {
  return {
    id: "r1",
    mensajeroId: MENSAJERO,
    estado: "desactualizada",
    calculadaAt: new Date(T0.getTime() - 3 * 3600_000),
    origenLat: 9.915,
    origenLng: LNG,
    origenAt: new Date(T0.getTime() - 30 * MIN),
    origenFuente: "gps",
    huellaSet: "huella-previa",
    ultimoError: "optimizar ruta: HTTP 500",
    secuenciaFuente: "proveedor",
    trazado: TRAZADO,
    tramoVivoAt: null,
    actualizadaAt: new Date(T0.getTime() - haceMs),
    secuenciaPorOrden: new Map([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
    ]),
    tramoPorOrden: new Map(),
    ...over,
  };
}

function build(ruta: RutaOptimizadaDTO, paradas: ParadaRutaRow[]) {
  const rutas = {
    findByMensajero: vi.fn(async () => ruta),
    upsertOrigen: vi.fn(async () => {}),
    reemplazarSecuencia: vi.fn(async () => {}),
    guardarTrazado: vi.fn(async () => {}),
    reducirSecuencia: vi.fn(async () => true),
    marcarDesactualizada: vi.fn(async () => {}),
    marcarTramoVivo: vi.fn(async () => {}),
  };
  const paradasRepo = {
    findParadasEnReparto: vi.fn(async () => paradas),
    contarAsignadasDelDia: vi.fn(async () => ({ asignadas: 0, recogidas: 0 })),
  };
  const client = {
    optimizar: vi.fn(async (input: { paradas: { ordenId: string }[] }) => ({
      status: "ok" as const,
      secuencia: input.paradas.map((p) => p.ordenId),
      fuente: "proveedor" as const,
    })),
  };
  const routes = {
    trazar: vi.fn(async () => ({
      status: "ok" as const,
      encodedPolyline: "x",
      distanciaM: 1,
      duracionS: 1,
      tramos: [],
    })),
  };
  const service = new OptimizacionRutaService(
    rutas as unknown as IRutaOptimizadaRepository,
    paradasRepo as ParadasRepo,
    client as unknown as IRouteOptimizationClient,
    CONFIG,
    () => T0,
    undefined,
    routes as unknown as IRoutesClient,
  );
  const escrituras = () =>
    rutas.upsertOrigen.mock.calls.length +
    rutas.reemplazarSecuencia.mock.calls.length +
    rutas.guardarTrazado.mock.calls.length +
    rutas.reducirSecuencia.mock.calls.length +
    rutas.marcarDesactualizada.mock.calls.length +
    rutas.marcarTramoVivo.mock.calls.length;
  return { service, rutas, paradasRepo, client, routes, escrituras };
}

const TODAS = () => [parada("s1"), parada("s2"), parada("s3")];
/** La ubicacion que manda el boton, sobre la ruta: no desviado. */
const UBICACION = { lat: 9.916, lng: LNG };

describe("SLT-59 T7.2 — R53/R54: recuperacion manual de una ruta `desactualizada`", () => {
  it("R53: a 4 min 59 s del fallo -> `omitida/enfriamiento`, 0 llamadas y 0 escrituras (tampoco `upsertOrigen`)", async () => {
    const { service, client, routes, rutas, escrituras } = build(
      rutaCaida(4 * MIN + 59_000),
      TODAS(),
    );
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: UBICACION });
    expect(r).toMatchObject({ status: "omitida", razon: "enfriamiento" });
    // Devuelve el trazado en cache, como la forma de R45.
    expect(r).toHaveProperty("trazado.encodedPolyline", TRAZADO.encodedPolyline);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(routes.trazar).not.toHaveBeenCalled();
    expect(rutas.upsertOrigen).not.toHaveBeenCalled();
    expect(escrituras()).toBe(0);
  });

  it("R53/R54: a 5 min justos de `actualizadaAt` -> recalcula el conjunto completo", async () => {
    const { service, client, routes, rutas } = build(rutaCaida(5 * MIN), TODAS());
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: UBICACION });
    expect(r.status).toBe("ok");
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(routes.trazar).toHaveBeenCalledTimes(1);
    expect(rutas.reemplazarSecuencia).toHaveBeenCalledTimes(1);
  });

  it("R53: con paradas nuevas a 1 min del fallo -> recalcula sin esperar el enfriamiento", async () => {
    const { service, client } = build(
      rutaCaida(MIN, { secuenciaPorOrden: new Map([["s1", 1], ["s2", 2]]) }),
      TODAS(),
    );
    await service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: UBICACION });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
  });

  it("R53: desviado a 1 min del fallo -> recalcula sin esperar el enfriamiento", async () => {
    const { service, client } = build(rutaCaida(MIN), TODAS());
    await service.ejecutar(MENSAJERO, {
      motivo: "manual",
      ubicacion: { lat: 9.92, lng: LNG + 0.03 }, // ~3 km al este de la ruta
    });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
  });

  it("R7 sin cambio: un job sobre la ruta `desactualizada` a 1 min del fallo -> recalcula", async () => {
    const { service, client } = build(rutaCaida(MIN), TODAS());
    await service.ejecutar(MENSAJERO, { motivo: "debounce", jobCreatedAt: T0 });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
  });

  it("R54: la cota es `updated_at` de la fila, no `calculada_at`: calculada hace 3 h y escrita hace 1 min -> enfriamiento", async () => {
    const { service, client } = build(rutaCaida(MIN), TODAS());
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(r).toMatchObject({ status: "omitida", razon: "enfriamiento" });
    expect(client.optimizar).not.toHaveBeenCalled();
  });
});
