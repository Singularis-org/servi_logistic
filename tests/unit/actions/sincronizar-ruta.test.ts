import { describe, it, expect, vi } from "vitest";
import { calcularRutaAlSalir, sincronizarRuta } from "@/lib/actions/ruta-mensajero";
import {
  OptimizacionRutaService,
  RutaCredencialRechazadaError,
  RutaIntentoFallidoError,
  type ParadasRepo,
} from "@/lib/services/OptimizacionRutaService";
import type {
  IRutaOptimizadaRepository,
  RutaOptimizadaDTO,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type { IRoutesClient } from "@/lib/interfaces/external/IRoutesClient";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import { codificarPolilinea } from "@/lib/geo/polilinea";
import type {
  EjecutarOptimizacionOpts,
  EjecutarOptimizacionResult,
  IOptimizacionRutaService,
} from "@/lib/interfaces/services/IOptimizacionRutaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// Feature 92 (R22/R31/R32/R33/R34) — la Server Action de sincronizacion manual.
//
// La guarda de rol (R33) NO es decoracion aunque la pagina ya haga `notFound()` para roles
// distintos de `mensajero`: una Server Action es un ENDPOINT, invocable directamente con su
// id sin pasar por la pagina. Sin la guarda, cualquier sesion valida podria disparar una
// llamada FACTURADA contra la ruta de otra persona.

const MENSAJERO: Actor = { usuarioId: "m-1", rol: "mensajero" };

function build(
  resultado: EjecutarOptimizacionResult | Error = {
    status: "ok",
    paradas: 3,
    // Feature 265 (R39): el desenlace `ok` del servicio dice quien ordeno. El caso normal es
    // el proveedor; los tests de orden local lo pasan explicito.
    secuenciaFuente: "proveedor",
  },
) {
  const ejecutar = vi.fn<
    (mensajeroId: string, opts: EjecutarOptimizacionOpts) => Promise<EjecutarOptimizacionResult>
  >(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  });
  return { service: { ejecutar } as unknown as IOptimizacionRutaService, ejecutar };
}

const actorDe = (actor: Actor | null) => async () => actor;

describe("R33 — guarda de rol", () => {
  it.each(["maestro", "admin", "adminTienda", "adminSatelite"] as const)(
    "rol %s -> forbidden SIN efectos ni llamada al proveedor",
    async (rol) => {
      const { service, ejecutar } = build();

      const r = await sincronizarRuta(
        {},
        { service, getActor: actorDe({ usuarioId: "u", rol }) },
      );

      expect(r).toEqual({ status: "forbidden" });
      expect(ejecutar).not.toHaveBeenCalled();
    },
  );

  it("sin sesion -> unauthenticated, sin llamar al service", async () => {
    const { service, ejecutar } = build();
    const r = await sincronizarRuta({}, { service, getActor: actorDe(null) });
    expect(r).toEqual({ status: "unauthenticated" });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("el rol se comprueba ANTES de parsear (un payload invalido de un rol ajeno da forbidden)", async () => {
    const { service } = build();
    const r = await sincronizarRuta(
      { ubicacion: { lat: 999, lng: 999 } },
      { service, getActor: actorDe({ usuarioId: "u", rol: "maestro" }) },
    );
    expect(r).toEqual({ status: "forbidden" });
  });
});

describe("R32 — la sincronizacion es SINCRONA y usa el motivo `manual`", () => {
  it("mensajero -> ejecuta el service en el acto con motivo manual", async () => {
    const { service, ejecutar } = build();

    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });

    expect(r).toEqual({ status: "ok", omitida: false, secuenciaFuente: "proveedor" });
    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(ejecutar.mock.calls[0]).toEqual(["m-1", { motivo: "manual", ubicacion: undefined }]);
  });

  it("una guarda de coste que omite la optimizacion sigue siendo `ok`, con omitida=true", async () => {
    const { service } = build({ status: "omitida", razon: "sin_cambios" });
    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
    // Feature 265: `omitida` no recalculo nada, asi que no hay procedencia nueva que contar.
    expect(r).toEqual({ status: "ok", omitida: true, secuenciaFuente: null });
  });

  it("sin argumentos (input por defecto) funciona igual", async () => {
    const { service, ejecutar } = build();
    const r = await sincronizarRuta(undefined, { service, getActor: actorDe(MENSAJERO) });
    expect(r.status).toBe("ok");
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });
});

describe("R22 — zod de la ubicacion en el borde", () => {
  it("una ubicacion valida se propaga al service", async () => {
    const { service, ejecutar } = build();

    await sincronizarRuta(
      { ubicacion: { lat: 9.9281, lng: -84.0907 } },
      { service, getActor: actorDe(MENSAJERO) },
    );

    expect(ejecutar.mock.calls[0][1]).toEqual({
      motivo: "manual",
      ubicacion: { lat: 9.9281, lng: -84.0907 },
    });
  });

  it.each([
    ["lat > 90", { lat: 91, lng: 0 }],
    ["lat < -90", { lat: -91, lng: 0 }],
    ["lng > 180", { lat: 0, lng: 181 }],
    ["lng < -180", { lat: 0, lng: -181 }],
    ["lat no numerica", { lat: "9.9", lng: 0 }],
    ["lng ausente", { lat: 9.9 }],
  ])("%s -> validation_error SIN llamar al proveedor", async (_caso, ubicacion) => {
    // Una coordenada absurda llegaria hasta `optimizeTours` y produciria una llamada
    // FACTURADA que solo puede fallar, o peor: una ruta calculada desde un punto imposible.
    const { service, ejecutar } = build();

    const r = await sincronizarRuta({ ubicacion }, { service, getActor: actorDe(MENSAJERO) });

    expect(r.status).toBe("validation_error");
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("SIN ubicacion (permiso denegado) ejecuta igual: R25 prohibe bloquear por geolocalizacion", async () => {
    const { service, ejecutar } = build();
    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
    expect(r.status).toBe("ok");
    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(ejecutar.mock.calls[0][1].ubicacion).toBeUndefined();
  });

  it("los limites EXACTOS del sistema de coordenadas se aceptan", async () => {
    const { service } = build();
    for (const ubicacion of [
      { lat: 90, lng: 180 },
      { lat: -90, lng: -180 },
      { lat: 0, lng: 0 },
    ]) {
      const r = await sincronizarRuta({ ubicacion }, { service, getActor: actorDe(MENSAJERO) });
      expect(r.status).toBe("ok");
    }
  });
});

describe("R34 — intervalo minimo -> conflict, no un `ok` mentiroso", () => {
  it("el service omite por intervalo_minimo y la action lo traduce a conflict", async () => {
    const { service } = build({ status: "omitida", razon: "intervalo_minimo" });

    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });

    expect(r.status).toBe("conflict");
    if (r.status === "conflict") expect(r.motivo).toMatch(/hace muy poco/);
  });
});

describe("R27 — fallo del proveedor: conflict accionable, sin filtrar el detalle", () => {
  it("un RutaIntentoFallidoError se traduce a conflict citando que se conserva el orden", async () => {
    const { service } = build(new RutaIntentoFallidoError("optimizar ruta: HTTP 503"));

    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });

    expect(r.status).toBe("conflict");
    if (r.status === "conflict") {
      expect(r.motivo).toMatch(/se conserva el ultimo orden/);
      // El detalle interno del proveedor NO se reenvia al cliente.
      expect(r.motivo).not.toContain("HTTP 503");
    }
  });

  it("un error DESCONOCIDO no se disfraza de conflict (se propaga como fallo real)", async () => {
    const { service } = build(new Error("caida de DB"));
    await expect(sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) })).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Feature 265 (R25, R39) — LA PANTALLA DEJA DE ROMPERSE, Y EL TOAST DEJA DE MENTIR
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe("265/R25 — un fallo del proveedor llega como DOMINIO, no como excepcion sin tipar", () => {
  it("el error tipado del servicio se traduce a `conflict` y la action NO lanza", async () => {
    // ⚠️ ESTA ES LA ASERCION CONTRARIA a los `rejects.toThrow(/AppErrorCode inesperado/)` que
    // existen en otros bordes: aqui ese `throw` ERA EL DEFECTO. Medido en produccion: una
    // excepcion del cliente atravesaba el servicio, caia en el `default:` de
    // `toRutaActionError` y salia como «ruta-mensajero: AppErrorCode inesperado INTERNAL»
    // —pantalla rota, 6 veces sobre 2 usuarios—. Con la 265, el servicio la tipa antes.
    const { service } = build(
      new RutaIntentoFallidoError("optimizar ruta: respuesta del proveedor con forma inesperada"),
    );

    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });

    expect(r.status).toBe("conflict");
    expect(r.status === "conflict" && r.motivo).toMatch(/se conserva el ultimo orden/);
  });

  it("y el detalle interno del proveedor NO viaja al cliente", async () => {
    const { service } = build(
      new RutaIntentoFallidoError("optimizar ruta: paradas saltadas por el proveedor (servidas 0 de 6)"),
    );
    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
    expect(r.status === "conflict" && r.motivo).not.toMatch(/servidas|proveedor/);
  });
});

describe("265/R39 — la action devuelve QUIEN ordeno la secuencia", () => {
  it.each(["proveedor", "local"] as const)("orden %s -> se reenvia tal cual", async (fuente) => {
    const { service } = build({ status: "ok", paradas: 3, secuenciaFuente: fuente });
    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
    expect(r).toEqual({ status: "ok", omitida: false, secuenciaFuente: fuente });
  });

  it.each(["obsoleta", "sin_cambios", "sin_paradas"] as const)(
    "omitida por %s -> `null`: no se recalculo nada que contar",
    async (razon) => {
      const { service } = build({ status: "omitida", razon });
      const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
      expect(r).toEqual({ status: "ok", omitida: true, secuenciaFuente: null });
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SLT-59 (R31) — la credencial rechazada tiene tipo propio para la cola, pero la pantalla no
// debe notar la diferencia: es una subclase del fallo de proveedor que este borde ya traduce.
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe("SLT-59 R31 — 401/403 en la sincronizacion manual: el mismo resultado que cualquier fallo del proveedor", () => {
  it.each([401, 403])(
    "HTTP %i -> `conflict` identico al de un fallo transitorio, sin lanzar ni filtrar el detalle",
    async (http) => {
      const transitorio = build(new RutaIntentoFallidoError("optimizar ruta: HTTP 503"));
      const rechazada = build(
        new RutaCredencialRechazadaError(`optimizar ruta: credencial rechazada (HTTP ${http})`),
      );

      const esperado = await sincronizarRuta({}, { service: transitorio.service, getActor: actorDe(MENSAJERO) });
      const r = await sincronizarRuta({}, { service: rechazada.service, getActor: actorDe(MENSAJERO) });

      expect(r).toEqual(esperado);
      expect(r.status).toBe("conflict");
      expect(JSON.stringify(r)).not.toMatch(/credencial|HTTP/);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SLT-59 (R45, R49) — la sincronizacion manual que no recalcula
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe("SLT-59 R49 — una reduccion que no se escribio llega como `omitida`", () => {
  it("`reduccion_descartada` -> { ok, omitida: true, secuenciaFuente: null }, sin trazado", async () => {
    const { service } = build({ status: "omitida", razon: "reduccion_descartada" });
    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
    expect(r).toEqual({ status: "ok", omitida: true, secuenciaFuente: null });
    expect(r).not.toHaveProperty("trazado");
  });
});

describe("SLT-59 R45 — ruta vigente, mismo conjunto y sin desvio: la ruta actual con 0 llamadas", () => {
  // Con el servicio REAL detras de la accion: es la unica forma de afirmar a la vez la forma
  // de la respuesta y que no se llamo ni a `optimizeTours` ni a `computeRoutes`.
  const T0 = new Date("2026-10-31T12:00:00.000Z");
  const LNG = -84.09;
  const P = {
    o: { lat: 9.9, lng: LNG },
    s1: { lat: 9.91, lng: LNG },
    s2: { lat: 9.92, lng: LNG },
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
  const tramoS1 = { encodedPolyline: codificarPolilinea([P.o, P.s1]), distanciaM: 1000, duracionS: 100 };
  const tramoS2 = { encodedPolyline: codificarPolilinea([P.s1, P.s2]), distanciaM: 1100, duracionS: 110 };
  const RUTA: RutaOptimizadaDTO = {
    id: "r1",
    mensajeroId: MENSAJERO.usuarioId,
    estado: "vigente",
    calculadaAt: new Date(T0.getTime() - 30 * 60_000),
    origenLat: P.o.lat,
    origenLng: LNG,
    origenAt: new Date(T0.getTime() - 30 * 60_000),
    origenFuente: "gps",
    huellaSet: "huella-previa",
    ultimoError: null,
    secuenciaFuente: "proveedor",
    trazado: {
      encodedPolyline: codificarPolilinea([P.o, P.s1, P.s2]),
      distanciaM: 2100,
      duracionS: 210,
      fuente: "routes",
    },
    tramoVivoAt: null,
    actualizadaAt: new Date(T0.getTime() - 60 * 60_000), // SLT-59 (R54): enfriamiento ya pasado
    secuenciaPorOrden: new Map([
      ["s1", 1],
      ["s2", 2],
    ]),
    tramoPorOrden: new Map([
      ["s1", tramoS1],
      ["s2", tramoS2],
    ]),
  };

  it("devuelve `omitida` con el trazado guardado; 0 `optimizar`, 0 `trazar` y el origen sin tocar", async () => {
    const rutas = {
      findByMensajero: vi.fn(async () => RUTA),
      upsertOrigen: vi.fn(async () => {}),
      reemplazarSecuencia: vi.fn(async () => {}),
      guardarTrazado: vi.fn(async () => {}),
      reducirSecuencia: vi.fn(async () => true),
      marcarDesactualizada: vi.fn(async () => {}),
      marcarTramoVivo: vi.fn(async () => {}),
    };
    const paradasRepo: ParadasRepo = {
      contarAsignadasDelDia: async () => ({ asignadas: 0, recogidas: 0 }), findParadasEnReparto: vi.fn(async () =>
        (["s1", "s2"] as const).map((id) => ({
          ordenId: id,
          latitud: P[id].lat,
          longitud: P[id].lng,
          createdAt: T0,
        })),
      ),
    };
    const optimizar = vi.fn();
    const trazar = vi.fn();
    const service = new OptimizacionRutaService(
      rutas as unknown as IRutaOptimizadaRepository,
      paradasRepo,
      { optimizar } as unknown as IRouteOptimizationClient,
      CONFIG,
      () => T0,
      undefined,
      { trazar } as unknown as IRoutesClient,
    );

    // Ubicacion recibida sobre la linea de la ruta, entre el origen y s1: no desviado.
    const r = await sincronizarRuta(
      { ubicacion: { lat: 9.905, lng: LNG } },
      { service, getActor: actorDe(MENSAJERO) },
    );

    expect(r).toEqual({
      status: "ok",
      omitida: true,
      secuenciaFuente: null,
      trazado: { ...RUTA.trazado, tramos: [tramoS1, tramoS2] },
    });
    expect(optimizar).not.toHaveBeenCalled();
    expect(trazar).not.toHaveBeenCalled();
    // R46: no recalculo, asi que la ubicacion recibida no pisa el origen guardado.
    expect(rutas.upsertOrigen).not.toHaveBeenCalled();
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
  });
});

// ═══ SLT-59 T7.5 — R64: el boton con poco recogido ════════════════════════════════════════

describe("SLT-59 R64 / SLT-74 — `recogida_insuficiente` se traduce a `conflict` con el minimo en paquetes", () => {
  it("el motivo lleva lo recogido, lo asignado y el minimo derivado del % de la config, no un literal", async () => {
    const { service } = build({ status: "omitida", razon: "recogida_insuficiente", recogidas: 3, asignadas: 4 });
    const r = await sincronizarRuta(
      {},
      { service, getActor: actorDe(MENSAJERO), config: { RUTA_PRIMERA_MIN_RECOGIDO_PCT: 70 } },
    );
    expect(r).toEqual({
      status: "conflict",
      motivo: "Todavía no se calcula la ruta: recoge al menos 3 de tus 4 paquetes (llevas 3).",
    });
  });

  // SLT-74: minimo = ceil(asignadas * pct / 100), el mismo umbral que la guarda del service.
  it.each([
    { asignadas: 15, recogidas: 10, minimo: 12 },
    { asignadas: 7, recogidas: 5, minimo: 6 }, // 5,6 redondea hacia arriba
    { asignadas: 10, recogidas: 7, minimo: 8 },
  ])("SLT-74: $asignadas asignadas al 80 % piden $minimo", async ({ asignadas, recogidas, minimo }) => {
    const { service } = build({ status: "omitida", razon: "recogida_insuficiente", recogidas, asignadas });
    const r = await sincronizarRuta(
      {},
      { service, getActor: actorDe(MENSAJERO), config: { RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80 } },
    );
    expect(r).toEqual({
      status: "conflict",
      motivo: `Todavía no se calcula la ruta: recoge al menos ${minimo} de tus ${asignadas} paquetes (llevas ${recogidas}).`,
    });
  });

  // SLT-74: con el job de la primera ruta pendiente, el aviso dice cuanto falta (lo mide el service).
  it.each([
    [
      158_000,
      "Todavía no se calcula la ruta: recoge al menos 12 de tus 15 paquetes (llevas 10) o espera 2 min 38 s y se calculará con los que llevas.",
    ],
    [
      0,
      "Todavía no se calcula la ruta: recoge al menos 12 de tus 15 paquetes (llevas 10) o espera unos segundos: ya se está calculando con los que llevas.",
    ],
    [
      -45_000,
      "Todavía no se calcula la ruta: recoge al menos 12 de tus 15 paquetes (llevas 10) o espera unos segundos: ya se está calculando con los que llevas.",
    ],
  ])("SLT-74: esperaMs = %i -> «%s»", async (esperaMs, motivo) => {
    const { service } = build({
      status: "omitida",
      razon: "recogida_insuficiente",
      recogidas: 10,
      asignadas: 15,
      esperaMs,
    });
    const r = await sincronizarRuta(
      {},
      { service, getActor: actorDe(MENSAJERO), config: { RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80 } },
    );
    expect(r).toEqual({ status: "conflict", motivo });
  });

  it("sin config inyectada usa la del entorno (default 80)", async () => {
    const previo = process.env.RUTA_PRIMERA_MIN_RECOGIDO_PCT;
    delete process.env.RUTA_PRIMERA_MIN_RECOGIDO_PCT;
    try {
      const { service } = build({ status: "omitida", razon: "recogida_insuficiente", recogidas: 1, asignadas: 5 });
      const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
      expect(r).toEqual({
        status: "conflict",
        motivo: "Todavía no se calcula la ruta: recoge al menos 4 de tus 5 paquetes (llevas 1).",
      });
    } finally {
      if (previo !== undefined) process.env.RUTA_PRIMERA_MIN_RECOGIDO_PCT = previo;
    }
  });

  it("`enfriamiento` (R53) llega como `ok/omitida` con el trazado en cache, igual que R45", async () => {
    const trazado = {
      encodedPolyline: "abc",
      distanciaM: 10,
      duracionS: 5,
      fuente: "routes" as const,
      tramos: [],
    };
    const { service } = build({ status: "omitida", razon: "enfriamiento", trazado });
    const r = await sincronizarRuta({}, { service, getActor: actorDe(MENSAJERO) });
    expect(r).toEqual({ status: "ok", omitida: true, secuenciaFuente: null, trazado });
  });
});

// ═══ SLT-59 T7.6 — R62/R63: `calcularRutaAlSalir` ═══════════════════════════════════════════

describe("SLT-59 R62/R63 — `calcularRutaAlSalir`, el disparo de salida", () => {
  const UBICACION = { lat: 9.93, lng: -84.08 };

  it.each(["maestro", "admin", "adminTienda", "adminSatelite"] as const)(
    "rol %s -> forbidden sin construir el service ni llamarlo",
    async (rol) => {
      const { service, ejecutar } = build();
      const r = await calcularRutaAlSalir(
        { ubicacion: UBICACION },
        { service, getActor: actorDe({ usuarioId: "u", rol }) },
      );
      expect(r).toEqual({ status: "forbidden" });
      expect(ejecutar).not.toHaveBeenCalled();
    },
  );

  it("el rol se comprueba ANTES de parsear: un payload invalido de un rol ajeno da forbidden", async () => {
    const { service } = build();
    const r = await calcularRutaAlSalir(
      { ubicacion: { lat: 999, lng: 0 } },
      { service, getActor: actorDe({ usuarioId: "u", rol: "maestro" }) },
    );
    expect(r).toEqual({ status: "forbidden" });
  });

  it("sin sesion -> unauthenticated", async () => {
    const { service, ejecutar } = build();
    const r = await calcularRutaAlSalir({ ubicacion: UBICACION }, { service, getActor: actorDe(null) });
    expect(r).toEqual({ status: "unauthenticated" });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it.each([
    ["sin ubicacion", {}],
    ["latitud fuera de rango", { ubicacion: { lat: 91, lng: 0 } }],
    ["longitud no numerica", { ubicacion: { lat: 9.9, lng: "x" } }],
  ])("ubicacion invalida (%s) -> validation_error, sin llamar al service", async (_c, input) => {
    const { service, ejecutar } = build();
    const r = await calcularRutaAlSalir(input, { service, getActor: actorDe(MENSAJERO) });
    expect(r.status).toBe("validation_error");
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("llama al service con `motivo: \"salida\"` y la ubicacion recibida", async () => {
    const { service, ejecutar } = build();
    const r = await calcularRutaAlSalir({ ubicacion: UBICACION }, { service, getActor: actorDe(MENSAJERO) });
    expect(ejecutar).toHaveBeenCalledWith("m-1", { motivo: "salida", ubicacion: UBICACION });
    expect(r).toEqual({ status: "ok", omitida: false, secuenciaFuente: "proveedor" });
  });

  it.each(["salida_no_aplica", "sin_cambios", "obsoleta"] as const)(
    "cualquier `omitida` (%s) -> `ok` con `omitida: true`",
    async (razon) => {
      const { service } = build({ status: "omitida", razon });
      const r = await calcularRutaAlSalir({ ubicacion: UBICACION }, { service, getActor: actorDe(MENSAJERO) });
      expect(r).toEqual({ status: "ok", omitida: true, secuenciaFuente: null });
    },
  );

  it("fallo del proveedor -> conflict con el texto fijo, sin filtrar el detalle", async () => {
    const { service } = build(new RutaIntentoFallidoError("optimizar ruta: HTTP 500 en https://x?token=1"));
    const r = await calcularRutaAlSalir({ ubicacion: UBICACION }, { service, getActor: actorDe(MENSAJERO) });
    expect(r).toEqual({
      status: "conflict",
      motivo: "no se pudo recalcular la ruta ahora; se conserva el ultimo orden",
    });
  });

  it("un error desconocido no se disfraza de conflict", async () => {
    const { service } = build(new Error("bug"));
    await expect(
      calcularRutaAlSalir({ ubicacion: UBICACION }, { service, getActor: actorDe(MENSAJERO) }),
    ).rejects.toThrow();
  });
});
