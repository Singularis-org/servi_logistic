import { describe, it, expect, vi } from "vitest";
import {
  OptimizacionRutaService,
  primeraRutaPendiente,
  puntoDeRecogida,
  type ParadasRepo,
} from "@/lib/services/OptimizacionRutaService";
import type {
  IRutaOptimizadaRepository,
  OrigenUbicacion,
  ReemplazarSecuenciaMeta,
  RutaOptimizadaDTO,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type { IRoutesClient } from "@/lib/interfaces/external/IRoutesClient";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import { distanciaHaversineKm } from "@/lib/geo/polilinea";
import { primeraRutaPendiente as primeraRutaPendienteDeLosWriters } from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

// SLT-59 revision 4 (D23, D25; design §12.1, §12.5, §12.6) — la primera ruta del dia.
//   R59  con la primera pendiente se recalcula siempre (ni omitir ni reducir).
//   R64  el boton con la primera pendiente exige el % minimo recogido; si no, 0 llamadas.
//   R67  la lectura de conteo solo ocurre con la primera pendiente y en manual.
//   R63  el disparo de salida se vuelve a comprobar en el servidor; si no aplica, 0 llamadas.
//   R66  una sola vez: con la primera ya calculada, la salida no vuelve a pagar.

const MENSAJERO = "m-1";
// 16:00 de CR del 29. «Ayer» es cualquier instante anterior a 2026-10-29T06:00:00Z.
const T0 = new Date("2026-10-29T22:00:00.000Z");
const AYER = new Date("2026-10-28T20:00:00.000Z");
const MIN = 60_000;
const LNG = -84.09;
const M_POR_GRADO = (6371_000 * Math.PI) / 180;

/** Donde recogio: la bodega, al sur de las paradas. */
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
  RUTA_PRIMERA_DEBOUNCE_MIN: 10,
};

/** Un punto `metros` al OESTE de `base`, a lo largo del paralelo (lejos de la fila de paradas). */
function alOeste(base: { lat: number; lng: number }, metros: number) {
  return { lat: base.lat, lng: base.lng - metros / (M_POR_GRADO * Math.cos((base.lat * Math.PI) / 180)) };
}
/** Un punto `metros` al SUR de `base`, sobre el meridiano: Haversine da la distancia exacta. */
function alSur(base: { lat: number; lng: number }, metros: number) {
  return { lat: base.lat - metros / M_POR_GRADO, lng: base.lng };
}

function parada(id: keyof typeof P): ParadaRutaRow {
  return { ordenId: id, latitud: P[id].lat, longitud: P[id].lng, createdAt: T0 };
}
const TODAS = () => [parada("s1"), parada("s2"), parada("s3")];

/**
 * La ruta de AYER (primera de hoy pendiente), con la secuencia de ayer de las mismas paradas y
 * el GPS de la recogida de hoy como origen: el punto de recogida.
 */
function rutaDeAyer(over: Partial<RutaOptimizadaDTO> = {}): RutaOptimizadaDTO {
  return {
    id: "r1",
    mensajeroId: MENSAJERO,
    estado: "vigente",
    calculadaAt: AYER,
    origenLat: RECOGIDA.lat,
    origenLng: RECOGIDA.lng,
    origenAt: new Date(T0.getTime() - 30 * MIN),
    origenFuente: "gps",
    huellaSet: "huella-de-ayer",
    ultimoError: null,
    secuenciaFuente: "proveedor",
    trazado: null,
    tramoVivoAt: null,
    actualizadaAt: new Date(T0.getTime() - 30 * MIN),
    secuenciaPorOrden: new Map([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
    ]),
    tramoPorOrden: new Map(),
    ...over,
  };
}

/**
 * Repositorio con estado: `reemplazarSecuencia` mueve `calculada_at`, como la fila real. Es lo
 * que hace que el segundo disparo de salida ya no encuentre la primera pendiente (R66).
 */
function build(opts: {
  ruta: RutaOptimizadaDTO | null;
  paradas?: ParadaRutaRow[];
  conteo?: { asignadas: number; recogidas: number };
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
    marcarDesactualizada: vi.fn(async () => {}),
    marcarTramoVivo: vi.fn(async () => {}),
  };
  const paradasRepo = {
    findParadasEnReparto: vi.fn(async () => opts.paradas ?? TODAS()),
    contarAsignadasDelDia: vi.fn(async () => opts.conteo ?? { asignadas: 0, recogidas: 0 }),
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
  const llamadas = () => client.optimizar.mock.calls.length + routes.trazar.mock.calls.length;
  return { service, rutas, paradasRepo, client, routes, escrituras, llamadas };
}

describe("SLT-59 — glosario: primera ruta pendiente y punto de recogida (puras)", () => {
  it("primera pendiente: sin ruta, `calculadaAt` nula o anterior al inicio del dia de CR", () => {
    expect(primeraRutaPendiente(null, T0)).toBe(true);
    expect(primeraRutaPendiente({ calculadaAt: null }, T0)).toBe(true);
    expect(primeraRutaPendiente({ calculadaAt: AYER }, T0)).toBe(true);
    // 05:59 de CR del 29 es todavia el 28; 06:00 UTC es la medianoche de CR (timestamp, no `date`).
    expect(primeraRutaPendiente({ calculadaAt: new Date("2026-10-29T05:59:59.999Z") }, T0)).toBe(true);
    expect(primeraRutaPendiente({ calculadaAt: new Date("2026-10-29T06:00:00.000Z") }, T0)).toBe(false);
  });

  it("m8: el predicado del servicio y el de los writers dan lo mismo en los bordes del dia de CR", () => {
    // Una sola regla (review m8): el servicio delega en el de `optimizacion-ruta-encolado.ts`.
    // Si alguien vuelve a duplicarlo, los bordes son donde dos copias empiezan a discrepar.
    const ahoras = [
      new Date("2026-10-29T05:59:59.999Z"), // aun el 28 en CR
      new Date("2026-10-29T06:00:00.000Z"), // medianoche de CR del 29
      T0,
      new Date("2026-10-30T05:59:59.999Z"), // ultimo instante del 29 en CR
    ];
    const calculadas: (Date | null)[] = [
      null,
      AYER,
      new Date("2026-10-28T05:59:59.999Z"),
      new Date("2026-10-29T05:59:59.999Z"),
      new Date("2026-10-29T06:00:00.000Z"),
      T0,
    ];
    for (const ahora of ahoras) {
      for (const calculadaAt of calculadas) {
        expect(primeraRutaPendiente({ calculadaAt }, ahora)).toBe(
          primeraRutaPendienteDeLosWriters(calculadaAt, fechaCalendarioCR(ahora)),
        );
      }
    }
  });

  it("punto de recogida: solo un `gps` capturado hoy", () => {
    const base = rutaDeAyer();
    expect(puntoDeRecogida(base, T0)).toEqual(RECOGIDA);
    expect(puntoDeRecogida({ ...base, origenFuente: "ultima_conocida" }, T0)).toBeNull();
    expect(puntoDeRecogida({ ...base, origenFuente: "centroide" }, T0)).toBeNull();
    expect(puntoDeRecogida({ ...base, origenAt: AYER }, T0)).toBeNull();
    expect(puntoDeRecogida(null, T0)).toBeNull();
  });
});

describe("SLT-59 T7.4 — R59: con la primera ruta pendiente se recalcula", () => {
  it("R59: job `debounce` con la primera pendiente, el mismo conjunto y sin desvio -> recalcula", async () => {
    const { service, client, routes, rutas } = build({ ruta: rutaDeAyer() });
    const r = await service.ejecutar(MENSAJERO, { motivo: "debounce", jobCreatedAt: T0 });
    expect(r.status).toBe("ok");
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(routes.trazar).toHaveBeenCalledTimes(1);
    expect(rutas.reemplazarSecuencia).toHaveBeenCalledTimes(1);
  });

  it("R67: un job con la primera pendiente no lee el conteo (solo el boton lo lee)", async () => {
    const { service, paradasRepo } = build({ ruta: rutaDeAyer() });
    await service.ejecutar(MENSAJERO, { motivo: "debounce", jobCreatedAt: T0 });
    expect(paradasRepo.contarAsignadasDelDia).not.toHaveBeenCalled();
  });
});

describe("SLT-59 T7.5 — R64/R67: el boton con la primera ruta pendiente", () => {
  it("R64: 3 de 4 (75 %) -> `recogida_insuficiente`, 0 llamadas, 0 escrituras y sin leer paradas", async () => {
    const { service, paradasRepo, escrituras, llamadas } = build({
      ruta: rutaDeAyer(),
      conteo: { asignadas: 4, recogidas: 3 },
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: alSur(RECOGIDA, 10) });
    expect(r).toEqual({ status: "omitida", razon: "recogida_insuficiente", recogidas: 3, asignadas: 4 });
    expect(llamadas()).toBe(0);
    expect(escrituras()).toBe(0);
    expect(paradasRepo.findParadasEnReparto).not.toHaveBeenCalled();
  });

  it("R64: el conteo se pide con el dia de CR en la convencion `date` (la de `fecha_reparto`)", async () => {
    const { service, paradasRepo } = build({ ruta: rutaDeAyer(), conteo: { asignadas: 4, recogidas: 3 } });
    await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(paradasRepo.contarAsignadasDelDia).toHaveBeenCalledTimes(1);
    expect(paradasRepo.contarAsignadasDelDia).toHaveBeenCalledWith(
      MENSAJERO,
      new Date("2026-10-29T00:00:00.000Z"),
    );
  });

  it("R64: 4 de 5 (80 % justo) -> recalcula con lo recogido, aunque no haya desvio", async () => {
    const { service, client, routes } = build({
      ruta: rutaDeAyer(),
      conteo: { asignadas: 5, recogidas: 4 },
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: alSur(RECOGIDA, 10) });
    expect(r.status).toBe("ok");
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(routes.trazar).toHaveBeenCalledTimes(1);
  });

  it("R64: `asignadas = 0` no corta", async () => {
    const { service, client } = build({ ruta: rutaDeAyer(), conteo: { asignadas: 0, recogidas: 0 } });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(r.status).toBe("ok");
    expect(client.optimizar).toHaveBeenCalledTimes(1);
  });

  it("R64: sin ruta todavia (nunca calculada) tambien aplica el minimo", async () => {
    const { service, client } = build({ ruta: null, conteo: { asignadas: 10, recogidas: 1 } });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(r).toMatchObject({ status: "omitida", razon: "recogida_insuficiente" });
    expect(client.optimizar).not.toHaveBeenCalled();
  });

  it("R67: con la primera ya hecha, `contarAsignadasDelDia` no se llama", async () => {
    const { service, paradasRepo, client } = build({
      ruta: rutaDeAyer({ calculadaAt: new Date(T0.getTime() - 60 * MIN) }),
      conteo: { asignadas: 10, recogidas: 1 },
    });
    // Sobre s1: no desviado de la recta por las paradas (la bodega queda a ~1,1 km de ella).
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual", ubicacion: P.s1 });
    expect(paradasRepo.contarAsignadasDelDia).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: "omitida", razon: "sin_cambios" });
    expect(client.optimizar).not.toHaveBeenCalled();
  });
});

describe("SLT-59 T7.6 — R63/R66: el disparo de salida", () => {
  it("R63: a 1001 m del punto de recogida con la primera pendiente -> recalcula, y `upsertOrigen` va antes de llamar", async () => {
    const lejos = alSur(RECOGIDA, 1001);
    const { service, client, routes, rutas } = build({ ruta: rutaDeAyer() });
    const r = await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: lejos });
    expect(r.status).toBe("ok");
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(routes.trazar).toHaveBeenCalledTimes(1);
    expect(rutas.upsertOrigen).toHaveBeenCalledTimes(1);
    expect(rutas.upsertOrigen.mock.calls[0][1]).toMatchObject({ lat: lejos.lat, lng: lejos.lng, fuente: "gps" });
    expect(rutas.upsertOrigen.mock.invocationCallOrder[0]).toBeLessThan(
      client.optimizar.mock.invocationCallOrder[0],
    );
  });

  it("R63: a 1000 m justos -> `salida_no_aplica`, 0 llamadas, 0 escrituras y sin leer paradas", async () => {
    const borde = alSur(RECOGIDA, 1000);
    expect(distanciaHaversineKm(borde, RECOGIDA) * 1000).toBeLessThanOrEqual(1000);
    const { service, paradasRepo, escrituras, llamadas } = build({ ruta: rutaDeAyer() });
    const r = await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: borde });
    expect(r).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(llamadas()).toBe(0);
    expect(escrituras()).toBe(0);
    expect(paradasRepo.findParadasEnReparto).not.toHaveBeenCalled();
  });

  it("R63: con la primera ruta ya hecha -> `salida_no_aplica`", async () => {
    const { service, escrituras, llamadas } = build({
      ruta: rutaDeAyer({ calculadaAt: new Date(T0.getTime() - 60 * MIN) }),
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: alOeste(RECOGIDA, 3000) });
    expect(r).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(llamadas()).toBe(0);
    expect(escrituras()).toBe(0);
  });

  it.each([
    ["origen `ultima_conocida`", { origenFuente: "ultima_conocida" as const }],
    ["origen `centroide`", { origenFuente: "centroide" as const }],
    ["origen GPS de ayer", { origenAt: AYER }],
  ])("R63: sin punto de recogida (%s) -> `salida_no_aplica`", async (_c, over) => {
    const { service, escrituras, llamadas } = build({ ruta: rutaDeAyer(over) });
    const r = await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: alOeste(RECOGIDA, 3000) });
    expect(r).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(llamadas()).toBe(0);
    expect(escrituras()).toBe(0);
  });

  it("R63: sin ruta (nunca hubo recogida con GPS) -> `salida_no_aplica`", async () => {
    const { service, llamadas } = build({ ruta: null });
    const r = await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: alOeste(RECOGIDA, 3000) });
    expect(r).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(llamadas()).toBe(0);
  });

  it("R63: ruta `desactualizada` dentro del enfriamiento -> `salida_no_aplica`; pasado, recalcula", async () => {
    const dentro = build({
      ruta: rutaDeAyer({ estado: "desactualizada", actualizadaAt: new Date(T0.getTime() - 2 * MIN) }),
    });
    const r = await dentro.service.ejecutar(MENSAJERO, {
      motivo: "salida",
      ubicacion: alOeste(RECOGIDA, 3000),
    });
    expect(r).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(dentro.llamadas()).toBe(0);
    expect(dentro.escrituras()).toBe(0);

    const pasado = build({
      ruta: rutaDeAyer({ estado: "desactualizada", actualizadaAt: new Date(T0.getTime() - 5 * MIN) }),
    });
    await pasado.service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: alOeste(RECOGIDA, 3000) });
    expect(pasado.client.optimizar).toHaveBeenCalledTimes(1);
  });

  it("R66: dos disparos de salida seguidos -> la segunda vez, 0 llamadas", async () => {
    const { service, client, routes } = build({ ruta: rutaDeAyer() });
    const lejos = alOeste(RECOGIDA, 3000);
    await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: lejos });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(routes.trazar).toHaveBeenCalledTimes(1);

    const segunda = await service.ejecutar(MENSAJERO, { motivo: "salida", ubicacion: lejos });
    expect(segunda).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(routes.trazar).toHaveBeenCalledTimes(1);
  });

  it("R63: la salida sin ubicacion no aplica (la accion siempre la exige)", async () => {
    const { service, llamadas } = build({ ruta: rutaDeAyer() });
    const r = await service.ejecutar(MENSAJERO, { motivo: "salida" });
    expect(r).toEqual({ status: "omitida", razon: "salida_no_aplica" });
    expect(llamadas()).toBe(0);
  });
});
