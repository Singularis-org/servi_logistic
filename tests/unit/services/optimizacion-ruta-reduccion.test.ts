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
//
// [2026-10-30, SLT-59, D16] Retirados R11, R14, R16 y R27. Solo se reduce un PREFIJO (R41,
// entrega en orden), siempre sin llamadas (R13, R15). Cualquier entrega fuera de orden
// —hueco o «quitar la ultima»— recalcula el conjunto completo desde la posicion del mensajero
// (R42, R43): 1 `optimizar` + 1 `trazar`, como el boton. En la peticion, R44.

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
  RUTA_RECUPERACION_ENFRIAMIENTO_MIN: 5,
  RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80,
  RUTA_PRIMERA_DEBOUNCE_MIN: 5,
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
    actualizadaAt: new Date(T0.getTime() - 60 * 60_000), // SLT-59 (R54): enfriamiento ya pasado
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
  const paradasRepo = { contarAsignadasDelDia: async () => ({ asignadas: 0, recogidas: 0 }), findParadasEnReparto: vi.fn(async () => opts.paradas) };
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
  it("R41/R13: entrega EN ORDEN (prefijo) con tramos -> 0 llamadas, trazado concatenado con sumas", async () => {
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

  // [2026-10-30, SLT-59, D16] Los casos R14 (tramo puente) y PA-1/R13 pasan a R42/R43: fuera de
  // orden ya no se reduce, se recalcula el conjunto completo desde el origen resuelto (aqui, el
  // GPS fresco sobre s1), igual que el boton.
  function esperaRecalculo(
    h: ReturnType<typeof build>,
    restantes: string[],
    conTrazar = true,
  ) {
    expect(h.client.optimizar).toHaveBeenCalledTimes(1);
    const pedidas = (h.client.optimizar.mock.calls[0][0] as { paradas: { ordenId: string }[] }).paradas;
    expect(pedidas.map((p) => p.ordenId).sort()).toEqual([...restantes].sort());
    expect(h.rutas.reducirSecuencia).not.toHaveBeenCalled();
    if (!conTrazar) {
      expect(h.trazar).not.toHaveBeenCalled();
      return;
    }
    expect(h.trazar).toHaveBeenCalledTimes(1);
    const pedido = h.trazar.mock.calls[0][0] as TrazarRutaInput;
    expect({ lat: pedido.origen.lat, lng: pedido.origen.lng }).toEqual(PUNTOS.s1);
    expect(pedido.paradasEnOrden.map((p) => p.ordenId).sort()).toEqual([...restantes].sort());
  }

  it("R43: quitar la ULTIMA (s3 entregada primero) es fuera de orden -> 1 `optimizar` + 1 `trazar`, 0 reducciones", async () => {
    const h = build({
      ruta: rutaConTramos(IDS.slice(0, 3)),
      paradas: [parada("s1"), parada("s2")], // s3 entregada primero
    });
    const r = await h.service.ejecutar(MENSAJERO, JOB);
    esperaRecalculo(h, ["s1", "s2"]);
    expect(r).toMatchObject({ status: "ok" });
  });

  it("R42: entrega fuera de orden, UN hueco -> 1 `optimizar` + 1 `trazar` con todas las restantes, 0 reducciones", async () => {
    const h = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s1"), parada("s3"), parada("s4")], // s2 entregada antes de tiempo
    });
    const r = await h.service.ejecutar(MENSAJERO, JOB);
    esperaRecalculo(h, ["s1", "s3", "s4"]);
    expect(r).toMatchObject({ status: "ok" });
  });

  it("R42: DOS huecos -> 1 `optimizar` + 1 `trazar` con todas las restantes, 0 reducciones", async () => {
    const h = build({
      ruta: rutaConTramos(IDS),
      paradas: [parada("s1"), parada("s3"), parada("s5")],
    });
    await h.service.ejecutar(MENSAJERO, JOB);
    esperaRecalculo(h, ["s1", "s3", "s5"]);
  });

  it("R42: prefijo + un hueco posterior ya no es prefijo -> 1 `optimizar` + 1 `trazar`, 0 reducciones", async () => {
    const h = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s2"), parada("s4")],
    });
    await h.service.ejecutar(MENSAJERO, JOB);
    esperaRecalculo(h, ["s2", "s4"]);
  });

  it("R42: fuera de orden sin cliente de Routes -> 1 `optimizar`, 0 `trazar` y NUNCA una reduccion con rectas", async () => {
    const h = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s1"), parada("s3"), parada("s4")],
      sinRoutes: true,
    });
    await h.service.ejecutar(MENSAJERO, JOB);
    esperaRecalculo(h, ["s1", "s3", "s4"], false);
  });

  it("R42 (rama 92/R35): fuera de orden con UNA restante -> 0 `optimizar` y 1 `trazar`, 0 reducciones", async () => {
    const h = build({
      ruta: rutaConTramos(["s1", "s2"]),
      paradas: [parada("s1")], // s2 entregada antes que s1
    });
    const r = await h.service.ejecutar(MENSAJERO, JOB);
    expect(h.client.optimizar).not.toHaveBeenCalled();
    expect(h.rutas.reducirSecuencia).not.toHaveBeenCalled();
    expect(h.trazar).toHaveBeenCalledTimes(1);
    const pedido = h.trazar.mock.calls[0][0] as TrazarRutaInput;
    expect(pedido.paradasEnOrden.map((p) => p.ordenId)).toEqual(["s1"]);
    expect(h.rutas.reemplazarSecuencia).toHaveBeenCalledTimes(1);
    const [, secuencia] = h.rutas.reemplazarSecuencia.mock.calls[0] as unknown as [string, string[]];
    expect(secuencia).toEqual(["s1"]);
    expect(r).toMatchObject({ status: "omitida", razon: "sin_paradas" });
  });

  it("R42: fuera de orden SIN tramos (trazado `local`) -> recalcula, no reduce", async () => {
    const local = {
      encodedPolyline: codificarPolilinea([PUNTOS.o, PUNTOS.s1, PUNTOS.s2, PUNTOS.s3, PUNTOS.s4]),
      distanciaM: null,
      duracionS: null,
      fuente: "local" as const,
    };
    const h = build({
      ruta: rutaConTramos(IDS.slice(0, 4), { trazado: local, tramoPorOrden: new Map() }),
      paradas: [parada("s1"), parada("s3"), parada("s4")],
    });
    await h.service.ejecutar(MENSAJERO, JOB);
    esperaRecalculo(h, ["s1", "s3", "s4"]);
  });

  it("R15: trazado guardado que no es por calles -> 0 llamadas y reduccion sin trazado", async () => {
    // Sin polilinea la linea de R4 es la recta por las paradas que siguen (s2..s4): el GPS va
    // sobre s2 para no quedar desviado (s1 ya no esta en `paradas`).
    const ruta = rutaConTramos(IDS.slice(0, 4), { trazado: null, origenLat: PUNTOS.s2.lat });
    const { service, client, trazar, reduccion } = build({
      ruta,
      // [2026-10-30, SLT-59, D16] Antes «incluso con hueco» (s1, s3, s4); un hueco ya es R42.
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    expect(reduccion()[2]).toMatchObject({
      trazado: null,
      paradas: [
        { ordenId: "s2", tramo: null },
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

  // [2026-10-30, SLT-59, D16] Los casos R16 (fallo del tramo puente) se borran: R16 esta retirado
  // y la reduccion ya no hace ninguna llamada que pueda fallar.

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

  // [2026-10-31, SLT-59, D19/m3] R49: una reduccion que no se escribio no se informa como
  // `reducida`. Antes estos dos casos devolvian `reducida` sin trazado.
  it("R18/R49: con la huella cambiada la escritura no aplica -> `reduccion_descartada`, sin trazado, sin lanzar", async () => {
    const { service, reduccion, client, trazar } = build({
      ruta: rutaConTramos(IDS.slice(0, 3)),
      paradas: [parada("s2"), parada("s3")],
      reducirDevuelve: false,
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(reduccion()[1]).toBe("huella-previa");
    expect(r).toEqual({ status: "omitida", razon: "reduccion_descartada" });
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
  });

  it("R18/R49: sin huella previa no hay con que condicionar la escritura -> no escribe, `reduccion_descartada`, sin lanzar", async () => {
    const { service, rutas, client, trazar } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { huellaSet: null }),
      paradas: [parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
    expect(r).toEqual({ status: "omitida", razon: "reduccion_descartada" });
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
  });

  it("R49: la rama de UNA parada tambien informa `reduccion_descartada` si la escritura no aplica", async () => {
    const { service, rutas } = build({
      ruta: rutaConTramos(["s1", "s2"]),
      paradas: [parada("s2")],
      reducirDevuelve: false,
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(rutas.reducirSecuencia).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ status: "omitida", razon: "reduccion_descartada" });
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
  });

  // [2026-10-31, SLT-59, D24] R19 retirado: el caso se parte en R52 (manual) y R51 (job).
  it("R52 (antes R19): manual, prefijo con el mensajero desviado -> reoptimiza el conjunto completo, no reduce", async () => {
    const { service, client, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { origenLat: PUNTOS.s2.lat, origenLng: LNG + 0.03 }),
      paradas: [parada("s2"), parada("s3")],
    });
    await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });

  it("R51 (antes R19): job, prefijo con el mensajero desviado -> reduce sin llamar (el desvio no cuenta)", async () => {
    const { service, client, trazar, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { origenLat: PUNTOS.s2.lat, origenLng: LNG + 0.03 }),
      paradas: [parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, JOB);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ status: "omitida", razon: "reducida" });
  });

  it("R56: manual, ruta vigente, prefijo reducido y sin desvio -> reduccion con 0 llamadas y el trazado reducido", async () => {
    const { service, client, trazar, rutas, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4)),
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(rutas.upsertOrigen).not.toHaveBeenCalled();
    expect(reduccion()[2].paradas.map((p) => p.ordenId)).toEqual(["s2", "s3", "s4"]);
    expect(r).toMatchObject({ status: "omitida", razon: "reducida", trazado: { fuente: "routes" } });
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

describe("SLT-59 T2.4/T6.3 — reducirSinLlamadas (R44: solo el prefijo por R13/R15, nunca una llamada)", () => {
  it("R44/R13: entrega en orden (prefijo) con tramos -> persiste la reduccion con el trazado concatenado, 0 llamadas", async () => {
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

  it("R44/R15: prefijo sin trazado por calles -> persiste la reduccion sin trazado, 0 llamadas", async () => {
    const { service, trazar, reduccion } = build({
      ruta: rutaConTramos(IDS.slice(0, 4), { trazado: null, origenLat: PUNTOS.s2.lat }),
      // [2026-10-30, SLT-59, D16] Antes con hueco (s1, s3, s4); un hueco ya no se reduce (R44).
      paradas: [parada("s2"), parada("s3"), parada("s4")],
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(reduccion()[2].trazado).toBeNull();
  });

  it.each([
    ["un hueco (s2 entregada antes que s1)", IDS.slice(0, 4), ["s1", "s3", "s4"]],
    ["«quitar la ultima» (s3 entregada primero, R43)", IDS.slice(0, 3), ["s1", "s2"]],
  ])("R44: fuera de orden con %s -> 0 llamadas y 0 escrituras (lo recalcula el job, R42)", async (_c, previa, ids) => {
    const { service, client, trazar, rutas } = build({
      ruta: rutaConTramos(previa),
      paradas: ids.map(parada),
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(rutas.guardarTrazado).not.toHaveBeenCalled();
    expect(rutas.marcarDesactualizada).not.toHaveBeenCalled();
    expect(rutas.upsertOrigen).not.toHaveBeenCalled();
  });

  // [2026-10-31, SLT-59, D24] Antes «con el mensajero desviado -> no hace nada»: la peticion de la
  // gestion es automatica y ya no mide el desvio (R51), asi que un prefijo se reduce igual.
  it("R51: con el mensajero desviado y un prefijo -> reduce igual, sin llamar a nadie", async () => {
    const { service, client, trazar, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { origenLat: PUNTOS.s2.lat, origenLng: LNG + 0.03 }),
      paradas: [parada("s2"), parada("s3")],
    });
    await service.reducirSinLlamadas(MENSAJERO);
    expect(trazar).not.toHaveBeenCalled();
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).toHaveBeenCalledTimes(1);
  });

  it("R59: con la primera ruta del dia pendiente (calculada ayer) -> no reduce y no llama a nadie", async () => {
    const { service, client, trazar, rutas } = build({
      ruta: rutaConTramos(IDS.slice(0, 3), { calculadaAt: new Date(T0.getTime() - 24 * 3600_000) }),
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
