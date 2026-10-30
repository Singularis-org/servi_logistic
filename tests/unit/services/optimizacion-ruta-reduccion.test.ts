import { describe, it, expect, vi } from "vitest";
import { OptimizacionRutaService, type ParadasRepo } from "@/lib/services/OptimizacionRutaService";
import type {
  IRutaOptimizadaRepository,
  ReduccionSecuencia,
  RutaOptimizadaDTO,
  TramoPersistido,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type {
  IRoutesClient,
  TrazarRutaInput,
  TrazarRutaOutcome,
} from "@/lib/interfaces/external/IRoutesClient";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import { codificarPolilinea } from "@/lib/geo/polilinea";

// SLT-59 (R11-R20, design §2.2 y §3.2) — una gestion que solo QUITA paradas reutiliza el orden
// previo sin `optimizeTours` (D6), y el trazado se rehace con los tramos guardados (D7). La
// unica llamada admitida es UN `computeRoutes` para el tramo puente de una entrega fuera de
// orden (D14), y solo en el job, nunca en la peticion de la gestion (R27).

const MENSAJERO = "m-1";
const T0 = new Date("2026-10-29T12:00:00.000Z");
const LNG = -84.09;

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
};

/** Origen y cinco paradas en fila hacia el norte, ~1,1 km entre una y otra. */
const PUNTOS: Record<string, { lat: number; lng: number }> = {
  o: { lat: 9.9, lng: LNG },
  s1: { lat: 9.91, lng: LNG },
  s2: { lat: 9.92, lng: LNG },
  s3: { lat: 9.93, lng: LNG },
  s4: { lat: 9.94, lng: LNG },
  s5: { lat: 9.95, lng: LNG },
};
const IDS = ["s1", "s2", "s3", "s4", "s5"];

function parada(id: string): ParadaRutaRow {
  return { ordenId: id, latitud: PUNTOS[id].lat, longitud: PUNTOS[id].lng, createdAt: T0 };
}

/** Tramo recto de `desde` a `hasta`, con distancia y duracion distinguibles por parada. */
function tramo(desde: string, hasta: string): TramoPersistido {
  const n = Number(hasta.slice(1));
  return {
    encodedPolyline: codificarPolilinea([PUNTOS[desde], PUNTOS[hasta]]),
    distanciaM: 1000 * n,
    duracionS: 100 * n,
  };
}

/**
 * Ruta vigente calculada sobre `ids` en ese orden, con trazado por calles y un tramo por
 * parada (el que LLEGA a ella), como la deja `guardarTrazado` tras un calculo con Routes.
 */
function rutaConTramos(ids: string[], over: Partial<RutaOptimizadaDTO> = {}): RutaOptimizadaDTO {
  const anteriores = ["o", ...ids];
  return {
    id: "r1",
    mensajeroId: MENSAJERO,
    estado: "vigente",
    calculadaAt: new Date(T0.getTime() - 30 * 60_000),
    // GPS fresco sobre la ruta: no desviado.
    origenLat: PUNTOS.s1.lat,
    origenLng: LNG,
    origenAt: T0,
    origenFuente: "gps",
    huellaSet: "huella-previa",
    ultimoError: null,
    secuenciaFuente: "proveedor",
    trazado: {
      encodedPolyline: codificarPolilinea(anteriores.map((id) => PUNTOS[id])),
      distanciaM: 99_999,
      duracionS: 9_999,
      fuente: "routes",
    },
    tramoVivoAt: null,
    secuenciaPorOrden: new Map(ids.map((id, i) => [id, i + 1])),
    tramoPorOrden: new Map(ids.map((id, i) => [id, tramo(anteriores[i], id)])),
    ...over,
  };
}

/** Doble de Routes: devuelve tramos rectos entre los puntos pedidos (bastan para medir). */
function routesRecto() {
  return vi.fn(async (input: TrazarRutaInput): Promise<TrazarRutaOutcome> => {
    const puntos = [input.origen, ...input.paradasEnOrden.map((p) => ({ lat: p.lat, lng: p.lng }))];
    const tramos = input.paradasEnOrden.map((p, i) => ({
      encodedPolyline: codificarPolilinea([puntos[i], puntos[i + 1]]),
      distanciaM: 7,
      duracionS: 3,
    }));
    return {
      status: "ok",
      encodedPolyline: codificarPolilinea(puntos),
      distanciaM: 7 * tramos.length,
      duracionS: 3 * tramos.length,
      tramos,
    };
  });
}

function build(opts: {
  ruta: RutaOptimizadaDTO | null;
  paradas: ParadaRutaRow[];
  trazar?: ReturnType<typeof routesRecto> | ReturnType<typeof vi.fn>;
  sinRoutes?: boolean;
  reducirDevuelve?: boolean;
}) {
  const rutas = {
    findByMensajero: vi.fn(async () => opts.ruta),
    upsertOrigen: vi.fn(async () => {}),
    reemplazarSecuencia: vi.fn(async () => {}),
    guardarTrazado: vi.fn(async () => {}),
    reducirSecuencia: vi.fn<(m: string, h: string, r: ReduccionSecuencia) => Promise<boolean>>(
      async () => opts.reducirDevuelve ?? true,
    ),
    marcarDesactualizada: vi.fn(async () => {}),
    marcarTramoVivo: vi.fn(async () => {}),
  };
  const paradasRepo = { findParadasEnReparto: vi.fn(async () => opts.paradas) };
  const client = {
    optimizar: vi.fn(async (input: { paradas: { ordenId: string }[] }) => ({
      status: "ok" as const,
      secuencia: input.paradas.map((p) => p.ordenId),
      fuente: "proveedor" as const,
    })),
  };
  const trazar = opts.trazar ?? routesRecto();
  const service = new OptimizacionRutaService(
    rutas as unknown as IRutaOptimizadaRepository,
    paradasRepo as ParadasRepo,
    client as unknown as IRouteOptimizationClient,
    CONFIG,
    () => T0,
    undefined,
    opts.sinRoutes ? null : ({ trazar } as unknown as IRoutesClient),
  );
  const reduccion = () => rutas.reducirSecuencia.mock.calls[0];
  return { service, rutas, paradasRepo, client, trazar, reduccion };
}

const JOB = { motivo: "debounce" as const, jobCreatedAt: T0 };

// ═══ T2.3 — la reduccion dentro de `ejecutar` ═══════════════════════════════════════════════

describe("SLT-59 T2.3 — reduccion dentro de `ejecutar`", () => {
  it("R11/R13: entrega EN ORDEN (prefijo) con tramos -> 0 llamadas, trazado concatenado con sumas", async () => {
    const ruta = rutaConTramos(IDS.slice(0, 4));
    const { service, client, trazar, reduccion } = build({
      ruta,
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });

    const r = await service.ejecutar(MENSAJERO, JOB);

    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    const [mensajero, huellaPrevia, red] = reduccion();
    expect(mensajero).toBe(MENSAJERO);
    expect(huellaPrevia).toBe("huella-previa");
    // Orden relativo conservado y cada parada con el tramo que ya tenia.
    expect(red.paradas).toEqual([
      { ordenId: "s2", tramo: tramo("s1", "s2") },
      { ordenId: "s3", tramo: tramo("s2", "s3") },
      { ordenId: "s4", tramo: tramo("s3", "s4") },
    ]);
    // Cabecera = tramos unidos sin el punto repetido de cada union; sumas exactas.
    const esperado = {
      encodedPolyline: codificarPolilinea([PUNTOS.s1, PUNTOS.s2, PUNTOS.s3, PUNTOS.s4]),
      distanciaM: 2000 + 3000 + 4000,
      duracionS: 200 + 300 + 400,
      fuente: "routes",
    };
    expect(red.trazado).toEqual(esperado);
    expect(red.huellaSet).not.toBe("huella-previa");
    expect(r).toEqual({
      status: "omitida",
      razon: "reducida",
      trazado: { ...esperado, tramos: red.paradas.map((p) => p.tramo) },
    });
  });

  it("R13: si un tramo no trae distancia, la suma de la cabecera es desconocida (null), no menor", async () => {
    const ruta = rutaConTramos(IDS.slice(0, 3));
    ruta.tramoPorOrden.set("s3", { ...tramo("s2", "s3"), distanciaM: null });
    const { service, reduccion } = build({ ruta, paradas: [parada("s2"), parada("s3")] });
    await service.ejecutar(MENSAJERO, JOB);
    expect(reduccion()[2].trazado).toMatchObject({ distanciaM: null, duracionS: 200 + 300 });
  });

  it("R13: queda UNA parada (rama de una parada) -> reduccion con su tramo, 0 llamadas", async () => {
    const { service, client, trazar, reduccion, rutas } = build({
      ruta: rutaConTramos(["s1", "s2"]),
      paradas: [parada("s2")],
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(reduccion()[2].paradas).toEqual([{ ordenId: "s2", tramo: tramo("s1", "s2") }]);
    expect(r).toMatchObject({ status: "omitida", razon: "reducida" });
  });

  it("R14: entrega fuera de orden, UN hueco -> 1 `computeRoutes` de 2 puntos (anterior -> siguiente)", async () => {
    const { service, client, trazar, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s1"), parada("s3"), parada("s4")], // s2 entregada antes de tiempo
    });

    const r = await service.ejecutar(MENSAJERO, JOB);

    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).toHaveBeenCalledTimes(1);
    const pedido = trazar.mock.calls[0][0] as TrazarRutaInput;
    expect(pedido.origen).toEqual(PUNTOS.s1);
    expect(pedido.paradasEnOrden.map((p) => p.ordenId)).toEqual(["s3"]);
    const red = reduccion()[2];
    expect(red.paradas.map((p) => p.ordenId)).toEqual(["s1", "s3", "s4"]);
    // s1 y s4 conservan su tramo; s3 recibe el puente s1 -> s3.
    expect(red.paradas[0].tramo).toEqual(tramo("o", "s1"));
    expect(red.paradas[1].tramo).toEqual({
      encodedPolyline: codificarPolilinea([PUNTOS.s1, PUNTOS.s3]),
      distanciaM: 7,
      duracionS: 3,
    });
    expect(red.paradas[2].tramo).toEqual(tramo("s3", "s4"));
    expect(red.trazado).toMatchObject({ fuente: "routes", distanciaM: 1000 + 7 + 4000 });
    expect(r).toMatchObject({ status: "omitida", razon: "reducida" });
  });

  it("R14: DOS huecos -> 1 `computeRoutes` desde la primera restante con todas las demas", async () => {
    const { service, client, trazar, reduccion } = build({
      ruta: rutaConTramos(IDS),
      paradas: [parada("s1"), parada("s3"), parada("s5")],
    });

    await service.ejecutar(MENSAJERO, JOB);

    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).toHaveBeenCalledTimes(1);
    const pedido = trazar.mock.calls[0][0] as TrazarRutaInput;
    expect(pedido.origen).toEqual(PUNTOS.s1);
    expect(pedido.paradasEnOrden.map((p) => p.ordenId)).toEqual(["s3", "s5"]);
    const red = reduccion()[2];
    expect(red.paradas[0].tramo).toEqual(tramo("o", "s1"));
    expect(red.paradas[1].tramo?.encodedPolyline).toBe(codificarPolilinea([PUNTOS.s1, PUNTOS.s3]));
    expect(red.paradas[2].tramo?.encodedPolyline).toBe(codificarPolilinea([PUNTOS.s3, PUNTOS.s5]));
  });

  it("R14: prefijo + un hueco posterior cuenta como un hueco -> 1 llamada desde la anterior al hueco", async () => {
    const { service, trazar } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s2"), parada("s4")],
    });
    await service.ejecutar(MENSAJERO, JOB);
    expect(trazar).toHaveBeenCalledTimes(1);
    const pedido = trazar.mock.calls[0][0] as TrazarRutaInput;
    expect(pedido.origen).toEqual(PUNTOS.s2);
    expect(pedido.paradasEnOrden.map((p) => p.ordenId)).toEqual(["s4"]);
  });

  it("R14: sin cliente de Routes NUNCA se rellena el hueco con una recta: se persiste sin trazado", async () => {
    const { service, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s1"), parada("s3"), parada("s4")],
      sinRoutes: true,
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(reduccion()[2].trazado).toBeNull();
    expect(reduccion()[2].paradas.every((p) => p.tramo === null)).toBe(true);
    expect(r).toEqual({ status: "omitida", razon: "reducida" });
  });

  it("R15: trazado guardado que no es por calles -> 0 llamadas y reduccion sin trazado", async () => {
    const ruta = rutaConTramos(IDS.slice(0, 4), { trazado: null });
    const { service, client, trazar, reduccion } = build({
      ruta,
      paradas: [parada("s1"), parada("s3"), parada("s4")], // incluso con hueco
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    expect(reduccion()[2]).toMatchObject({
      trazado: null,
      paradas: [
        { ordenId: "s1", tramo: null },
        { ordenId: "s3", tramo: null },
        { ordenId: "s4", tramo: null },
      ],
    });
    expect(r).toEqual({ status: "omitida", razon: "reducida" });
  });

  it("R15: falta el tramo de una parada restante -> 0 llamadas y sin trazado", async () => {
    const ruta = rutaConTramos(IDS.slice(0, 4));
    ruta.tramoPorOrden.delete("s4");
    const { service, trazar, reduccion } = build({
      ruta,
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });
    await service.ejecutar(MENSAJERO, JOB);
    expect(trazar).not.toHaveBeenCalled();
    expect(reduccion()[2].trazado).toBeNull();
  });

  it.each([
    ["lanza", vi.fn(async () => Promise.reject(new Error("routes caido")))],
    [
      "no da ok",
      vi.fn(async (): Promise<TrazarRutaOutcome> => ({ status: "transitorio", detalle: "HTTP 503" })),
    ],
  ])("R16: el tramo puente %s -> reduccion persistida sin trazado, sin lanzar y sin reintento", async (_c, trazar) => {
    const { service, client, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s1"), parada("s3"), parada("s4")],
      trazar,
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(r).toEqual({ status: "omitida", razon: "reducida" });
    expect(trazar).toHaveBeenCalledTimes(1);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(reduccion()[2].trazado).toBeNull();
    expect(reduccion()[2].paradas.map((p) => p.ordenId)).toEqual(["s1", "s3", "s4"]);
  });

  it("R12/R17: la reduccion no reescribe la secuencia completa ni lleva `calculada_at`, origen ni procedencia", async () => {
    // `reducirSecuencia` es la escritura que conserva `calculada_at`, el origen y
    // `secuencia_fuente` (probado en ruta-optimizada-repo.test.ts); `reemplazarSecuencia`
    // los pisaria.
    const { service, rutas, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 3)),
      paradas: [parada("s2"), parada("s3")],
    });
    await service.ejecutar(MENSAJERO, JOB);
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(rutas.guardarTrazado).not.toHaveBeenCalled();
    expect(rutas.marcarDesactualizada).not.toHaveBeenCalled();
    expect(Object.keys(reduccion()[2]).sort()).toEqual(["huellaSet", "paradas", "trazado"]);
  });

  it("R18: con la huella cambiada la escritura no aplica -> no lanza y no devuelve trazado", async () => {
    const { service, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 3)),
      paradas: [parada("s2"), parada("s3")],
      reducirDevuelve: false,
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(reduccion()[1]).toBe("huella-previa");
    expect(r).toEqual({ status: "omitida", razon: "reducida" });
  });

  it("R18: sin huella previa no hay con que condicionar la escritura -> no escribe y no lanza", async () => {
    const { service, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { huellaSet: null }),
      paradas: [parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
    expect(r).toEqual({ status: "omitida", razon: "reducida" });
  });

  it("R19: subconjunto con el mensajero desviado -> reoptimiza el conjunto completo, no reduce", async () => {
    const { service, client, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { origenLat: PUNTOS.s2.lat, origenLng: LNG + 0.03 }),
      paradas: [parada("s2"), parada("s3")],
    });
    await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });

  it("R20: quita una y anade otra -> reoptimiza el conjunto completo, no reduce", async () => {
    const { service, client, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3)),
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });
    await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });

  it("R7: ruta desactualizada con un subconjunto -> reoptimiza, no reduce", async () => {
    const { service, client, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { estado: "desactualizada" }),
      paradas: [parada("s2"), parada("s3")],
    });
    await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });
});

// ═══ T2.4 — `reducirSinLlamadas`, la que corre en la peticion de la gestion ════════════════

describe("SLT-59 T2.4 — reducirSinLlamadas (R27: solo R13/R15, nunca una llamada)", () => {
  it("R13: entrega en orden con tramos -> persiste la reduccion con el trazado concatenado, 0 llamadas", async () => {
    const { service, client, trazar, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    expect(reduccion()[2].paradas.map((p) => p.ordenId)).toEqual(["s2", "s3", "s4"]);
    expect(reduccion()[2].trazado).toMatchObject({ fuente: "routes", distanciaM: 9000 });
  });

  it("R15: sin trazado por calles -> persiste la reduccion sin trazado, 0 llamadas", async () => {
    const { service, trazar, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4), { trazado: null }),
      paradas: [parada("s1"), parada("s3"), parada("s4")],
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(reduccion()[2].trazado).toBeNull();
  });

  it("con un hueco que pide tramo puente -> no hace nada y no llama a nadie (lo hace el job)", async () => {
    const { service, client, trazar, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s1"), parada("s3"), parada("s4")],
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });

  it("con el mensajero desviado -> no hace nada y no llama a nadie", async () => {
    const { service, client, trazar, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { origenLat: PUNTOS.s2.lat, origenLng: LNG + 0.03 }),
      paradas: [parada("s2"), parada("s3")],
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });

  it.each([
    ["el mismo conjunto (nada que reducir)", rutaConTramos(IDS.slice(0, 2)), ["s1", "s2"]],
    ["una parada nueva (R20)", rutaConTramos(IDS.slice(0, 2)), ["s1", "s2", "s3"]],
    ["ruta desactualizada (R7)", rutaConTramos(IDS.slice(0, 3), { estado: "desactualizada" }), ["s2", "s3"]],
    ["cero paradas (lo limpia el job, 92/R35)", rutaConTramos(IDS.slice(0, 2)), []],
  ])("con %s -> no escribe nada y no llama a nadie", async (_c, ruta, ids) => {
    const { service, client, trazar, rutas } = build({ ruta, paradas: ids.map(parada) });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(rutas.upsertOrigen).not.toHaveBeenCalled();
  });

  it("sin ruta o con ruta desactualizada ni siquiera lee las paradas", async () => {
    for (const ruta of [null, rutaConTramos(["s1", "s2"], { estado: "desactualizada" })]) {
      const { service, paradasRepo } = build({ ruta, paradas: [parada("s2")] });
      await service.reducirSinLlamadas(MENSAJERO);
      expect(paradasRepo.findParadasEnReparto).not.toHaveBeenCalled();
    }
  });
});
