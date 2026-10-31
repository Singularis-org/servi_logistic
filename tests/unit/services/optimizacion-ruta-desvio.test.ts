import { describe, it, expect, vi } from "vitest";
import {
  OptimizacionRutaService,
  decidirGuardaRuta,
  posicionDelMensajero,
  type DisparoRuta,
  type ParadasRepo,
} from "@/lib/services/OptimizacionRutaService";
import type {
  IRutaOptimizadaRepository,
  RutaOptimizadaDTO,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type { IRoutesClient } from "@/lib/interfaces/external/IRoutesClient";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import {
  codificarPolilinea,
  decodificarPolilinea,
  distanciaMinimaAPolilineaM,
} from "@/lib/geo/polilinea";

// SLT-59 T6.1 (R42): `decodificarPolilinea` se envuelve en un espia que CONSERVA su
// comportamiento, para poder afirmar que la rama «fuera de orden» no decodifica la polilinea.
vi.mock("@/lib/geo/polilinea", async (original) => {
  const real = await original<typeof import("@/lib/geo/polilinea")>();
  return { ...real, decodificarPolilinea: vi.fn(real.decodificarPolilinea) };
});

// SLT-59 (R1-R10, R19, R20; design §2, §2.1) — la guarda que sustituye a la 92/R36. Lo que
// se vigila aqui es el DINERO: con el mismo conjunto y el mensajero sobre su ruta, cero
// llamadas a `optimizeTours` y a `computeRoutes`, cero escrituras y ninguna lectura de mas.

const MENSAJERO = "m-1";
// [2026-10-31, SLT-59, T7.2] 16:00 de CR: «hace 8 h» (R10) sigue siendo hoy, y la primera ruta del
// dia (R59) no se cruza con los casos que no van de ella.
const T0 = new Date("2026-10-29T22:00:00.000Z");
const UMBRAL_M = 1000;
const LNG = -84.09;

/** Metros por grado de latitud con el radio de Haversine (6371 km). */
const M_POR_GRADO = (6371_000 * Math.PI) / 180;

/** Paradas en fila hacia el norte, ~1,1 km entre una y otra. */
const P = {
  s1: { lat: 9.91, lng: LNG },
  s2: { lat: 9.92, lng: LNG },
  s3: { lat: 9.93, lng: LNG },
};

function parada(id: keyof typeof P): ParadaRutaRow {
  return { ordenId: id, latitud: P[id].lat, longitud: P[id].lng, createdAt: T0 };
}
function conCoords(id: keyof typeof P) {
  return { ordenId: id, latitud: P[id].lat, longitud: P[id].lng };
}

function ruta(over: Partial<RutaOptimizadaDTO> = {}): RutaOptimizadaDTO {
  return {
    id: "r1",
    mensajeroId: MENSAJERO,
    estado: "vigente",
    calculadaAt: new Date(T0.getTime() - 60_000),
    origenLat: null,
    origenLng: null,
    origenAt: null,
    origenFuente: null,
    huellaSet: "huella-previa",
    ultimoError: null,
    secuenciaFuente: "proveedor",
    trazado: null,
    tramoVivoAt: null,
    actualizadaAt: new Date(T0.getTime() - 60 * 60_000), // SLT-59 (R54): enfriamiento ya pasado
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
 * [2026-10-31, SLT-59, T7.2] La tabla mide el desvio, y desde D24 solo lo mide el boton (R52):
 * por defecto `manual`. Los casos automaticos (R7, R51) lo pasan explicito.
 */
function decidir(input: {
  ruta: RutaOptimizadaDTO | null;
  paradas: { ordenId: string; latitud: number; longitud: number }[];
  posicion: { lat: number; lng: number } | null;
  umbralM: number;
  disparo?: DisparoRuta;
}) {
  return decidirGuardaRuta({ ...input, disparo: input.disparo ?? "manual", ahora: T0, enfriamientoMin: 5 });
}

/** Un punto desplazado hacia el ESTE de `base` los metros pedidos (a lo largo del paralelo). */
function alEste(base: { lat: number; lng: number }, metros: number) {
  return { lat: base.lat, lng: base.lng + metros / (M_POR_GRADO * Math.cos((base.lat * Math.PI) / 180)) };
}

// ═══ T2.1 — `decidirGuardaRuta`, pura, con tabla de casos ═══════════════════════════════════

describe("SLT-59 T2.1 — decidirGuardaRuta (tabla de casos)", () => {
  const todas = [conCoords("s1"), conCoords("s2"), conCoords("s3")];
  const sobreLaRuta = { lat: 9.915, lng: LNG };
  const lejos = alEste(sobreLaRuta, 2000);

  it.each([
    {
      caso: "R1: mismo conjunto, sobre la ruta -> omitir",
      ruta: ruta(),
      paradas: todas,
      posicion: sobreLaRuta,
      esperado: { tipo: "omitir" },
    },
    {
      caso: "R5: sin posicion del mensajero -> no desviado -> omitir",
      ruta: ruta(),
      paradas: todas,
      posicion: null,
      esperado: { tipo: "omitir" },
    },
    {
      caso: "R7: automatico, ruta desactualizada con el mismo conjunto -> reoptimizar",
      ruta: ruta({ estado: "desactualizada" }),
      paradas: todas,
      posicion: sobreLaRuta,
      disparo: "automatico" as const,
      esperado: { tipo: "reoptimizar", motivo: "desactualizada" },
    },
    {
      caso: "R7: automatico, ruta desactualizada con un subconjunto -> reoptimizar, nunca reducir",
      ruta: ruta({ estado: "desactualizada" }),
      paradas: [conCoords("s2"), conCoords("s3")],
      posicion: sobreLaRuta,
      disparo: "automatico" as const,
      esperado: { tipo: "reoptimizar", motivo: "desactualizada" },
    },
    {
      caso: "sin ruta guardada -> reoptimizar",
      ruta: null,
      paradas: todas,
      posicion: sobreLaRuta,
      esperado: { tipo: "reoptimizar", motivo: "sin_ruta" },
    },
    // [2026-10-31, SLT-59, D24] R19 retirado: sus casos pasan a R52 (manual) y R51 (automatico).
    {
      caso: "R52: manual, mismo conjunto pero desviado -> reoptimizar",
      ruta: ruta(),
      paradas: todas,
      posicion: lejos,
      esperado: { tipo: "reoptimizar", motivo: "desviado" },
    },
    {
      caso: "R52: manual, prefijo reducido pero desviado -> reoptimizar, no reducir",
      ruta: ruta(),
      paradas: [conCoords("s2"), conCoords("s3")],
      posicion: lejos,
      esperado: { tipo: "reoptimizar", motivo: "desviado" },
    },
    {
      caso: "R51: automatico, mismo conjunto y desviado -> omitir",
      ruta: ruta(),
      paradas: todas,
      posicion: lejos,
      disparo: "automatico" as const,
      esperado: { tipo: "omitir" },
    },
    {
      caso: "R51: automatico, prefijo reducido y desviado -> reducir",
      ruta: ruta(),
      paradas: [conCoords("s2"), conCoords("s3")],
      posicion: lejos,
      disparo: "automatico" as const,
      esperado: { tipo: "reducir", previa: ["s1", "s2", "s3"], restantes: ["s2", "s3"] },
    },
    {
      caso: "R51: salida, mismo conjunto y desviado -> no mide el desvio, omitir",
      ruta: ruta(),
      paradas: todas,
      posicion: lejos,
      disparo: "salida" as const,
      esperado: { tipo: "omitir" },
    },
    {
      caso: "R20: una parada que no esta en la secuencia -> reoptimizar",
      ruta: ruta({ secuenciaPorOrden: new Map([["s1", 1], ["s2", 2]]) }),
      paradas: todas,
      posicion: sobreLaRuta,
      esperado: { tipo: "reoptimizar", motivo: "paradas_nuevas" },
    },
    {
      caso: "R20: quita una y anade otra -> reoptimizar (aunque tambien quite)",
      ruta: ruta({ secuenciaPorOrden: new Map([["s1", 1], ["s2", 2]]) }),
      paradas: [conCoords("s2"), conCoords("s3")],
      posicion: sobreLaRuta,
      esperado: { tipo: "reoptimizar", motivo: "paradas_nuevas" },
    },
    // [2026-10-30, SLT-59, D16] El caso «R11: subconjunto estricto -> reducir» con [s1, s3] es
    // ahora un hueco: R11 esta retirado y ese conjunto es fuera de orden (R42). La reduccion
    // queda solo para el prefijo (R41).
    {
      caso: "R42: hueco en medio (s2 entregada antes que s1) -> reoptimizar por fuera de orden",
      ruta: ruta(),
      paradas: [conCoords("s3"), conCoords("s1")],
      posicion: sobreLaRuta,
      esperado: { tipo: "reoptimizar", motivo: "fuera_de_orden" },
    },
    {
      caso: "R43: quitar la ULTIMA (s3 entregada primero) -> reoptimizar por fuera de orden, sin hueco",
      ruta: ruta(),
      paradas: [conCoords("s1"), conCoords("s2")],
      posicion: sobreLaRuta,
      esperado: { tipo: "reoptimizar", motivo: "fuera_de_orden" },
    },
    {
      caso: "R42: fuera de orden Y desviado -> gana fuera de orden (va antes que el desvio)",
      ruta: ruta(),
      paradas: [conCoords("s1"), conCoords("s3")],
      posicion: lejos,
      esperado: { tipo: "reoptimizar", motivo: "fuera_de_orden" },
    },
    {
      caso: "R41: prefijo (s1 entregada en orden), sobre la ruta -> reducir con el orden previo",
      ruta: ruta(),
      paradas: [conCoords("s3"), conCoords("s2")],
      posicion: sobreLaRuta,
      esperado: { tipo: "reducir", previa: ["s1", "s2", "s3"], restantes: ["s2", "s3"] },
    },
    {
      caso: "R41: prefijo de dos (s1 y s2 entregadas en orden) -> reducir",
      ruta: ruta(),
      paradas: [conCoords("s3")],
      // Sin polilinea la recta de R4 es solo s3: la posicion va sobre ella.
      posicion: P.s3,
      esperado: { tipo: "reducir", previa: ["s1", "s2", "s3"], restantes: ["s3"] },
    },
  ])("$caso", ({ ruta: r, paradas, posicion, esperado, ...resto }) => {
    const disparo = "disparo" in resto ? resto.disparo : undefined;
    expect(decidir({ ruta: r, paradas, posicion, umbralM: UMBRAL_M, disparo })).toEqual(esperado);
  });

  it("R51: automatico NO decodifica la polilinea (ni CPU para el desvio)", () => {
    const conPolilinea = ruta({
      trazado: {
        encodedPolyline: codificarPolilinea([{ lat: 9.9, lng: LNG }, P.s1, P.s2, P.s3]),
        distanciaM: 3300,
        duracionS: 600,
        fuente: "routes",
      },
    });
    vi.mocked(decodificarPolilinea).mockClear();
    expect(
      decidir({ ruta: conPolilinea, paradas: todas, posicion: lejos, umbralM: UMBRAL_M, disparo: "automatico" }),
    ).toEqual({ tipo: "omitir" });
    expect(decodificarPolilinea).not.toHaveBeenCalled();
  });

  it("R47 acotado: polilinea `routes` vacia -> manual reoptimiza, automatico omite", () => {
    const vacia = ruta({
      trazado: { encodedPolyline: "", distanciaM: 0, duracionS: 0, fuente: "routes" },
    });
    const sobreLaRecta = { lat: 9.925, lng: LNG };
    expect(
      decidir({ ruta: vacia, paradas: todas, posicion: sobreLaRecta, umbralM: UMBRAL_M, disparo: "manual" }),
    ).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    expect(
      decidir({ ruta: vacia, paradas: todas, posicion: sobreLaRecta, umbralM: UMBRAL_M, disparo: "automatico" }),
    ).toEqual({ tipo: "omitir" });
  });

  it("R59: primera ruta pendiente (calculada ayer) con el mismo conjunto y sin desvio -> reoptimizar", () => {
    const deAyer = ruta({ calculadaAt: new Date(T0.getTime() - 24 * 3600_000) });
    for (const disparo of ["manual", "automatico", "salida"] as const) {
      expect(
        decidir({ ruta: deAyer, paradas: todas, posicion: sobreLaRuta, umbralM: UMBRAL_M, disparo }),
      ).toEqual({ tipo: "reoptimizar", motivo: "primera_del_dia" });
    }
    // Ni con un prefijo reduce: no hay secuencia de hoy que conservar.
    expect(
      decidir({
        ruta: deAyer,
        paradas: [conCoords("s2"), conCoords("s3")],
        posicion: sobreLaRuta,
        umbralM: UMBRAL_M,
        disparo: "automatico",
      }),
    ).toEqual({ tipo: "reoptimizar", motivo: "primera_del_dia" });
  });

  it("R42: fuera de orden con el mensajero SOBRE la ruta -> reoptimizar SIN decodificar la polilinea", () => {
    const conPolilinea = ruta({
      trazado: {
        encodedPolyline: codificarPolilinea([{ lat: 9.9, lng: LNG }, P.s1, P.s2, P.s3]),
        distanciaM: 3300,
        duracionS: 600,
        fuente: "routes",
      },
    });
    vi.mocked(decodificarPolilinea).mockClear();
    expect(
      decidir({
        ruta: conPolilinea,
        paradas: [conCoords("s1"), conCoords("s3")],
        posicion: sobreLaRuta,
        umbralM: UMBRAL_M,
      }),
    ).toEqual({ tipo: "reoptimizar", motivo: "fuera_de_orden" });
    expect(decodificarPolilinea).not.toHaveBeenCalled();
    // Control: con un prefijo la misma ruta SI decodifica para medir el desvio.
    decidir({
      ruta: conPolilinea,
      paradas: [conCoords("s2"), conCoords("s3")],
      posicion: sobreLaRuta,
      umbralM: UMBRAL_M,
    });
    expect(decodificarPolilinea).toHaveBeenCalledTimes(1);
  });

  it("R10: el mismo conjunto, sobre la ruta y calculada hace 8 h -> omitir (sin criterio de tiempo)", () => {
    const vieja = ruta({ calculadaAt: new Date(T0.getTime() - 8 * 3600_000) });
    expect(
      decidir({ ruta: vieja, paradas: todas, posicion: sobreLaRuta, umbralM: UMBRAL_M }),
    ).toEqual({ tipo: "omitir" });
  });

  describe("R3 — desviado SI Y SOLO SI la distancia supera el umbral (comparacion estricta)", () => {
    const linea = [P.s1, P.s2, P.s3];

    it("a 1000 m justos NO esta desviado; un pelo mas, si", () => {
      const posicion = alEste(P.s2, 1000);
      const d = distanciaMinimaAPolilineaM(posicion, linea);
      expect(d).toBeGreaterThan(990);
      expect(d).toBeLessThan(1010);
      const decidirA = (umbralM: number) =>
        decidir({ ruta: ruta(), paradas: todas, posicion, umbralM });
      expect(decidirA(d)).toEqual({ tipo: "omitir" });
      expect(decidirA(d - 1e-6)).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });

    it("a 990 m de la ruta no esta desviado; a 1010 m si", () => {
      const decidirA = (metros: number) =>
        decidir({
          ruta: ruta(),
          paradas: todas,
          posicion: alEste(P.s2, metros),
          umbralM: UMBRAL_M,
        });
      expect(decidirA(990)).toEqual({ tipo: "omitir" });
      expect(decidirA(1010)).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });

    it("lejos del ORIGEN pero sobre la ruta no cuenta como desvio (la medida es la linea, no el origen)", () => {
      // El mensajero ya recorrio ~2 km de su ruta: esta lejos de donde empezo, no de la ruta.
      expect(
        decidir({ ruta: ruta(), paradas: todas, posicion: P.s3, umbralM: UMBRAL_M }),
      ).toEqual({ tipo: "omitir" });
    });
  });

  describe("R4 — linea de referencia", () => {
    // Polilinea por calles que da un rodeo de ~2 km al este entre s1 y s3: lejos de la recta.
    const rodeo = [P.s1, alEste(P.s1, 2000), alEste(P.s3, 2000), P.s3];
    const sobreElRodeo = alEste({ lat: 9.92, lng: LNG }, 2000);

    it("CON polilinea por calles se mide contra ella, no contra la recta entre paradas", () => {
      const conTrazado = ruta({
        trazado: {
          encodedPolyline: codificarPolilinea(rodeo),
          distanciaM: 6000,
          duracionS: 900,
          fuente: "routes",
        },
      });
      // Sobre el rodeo: a ~2 km de la recta, a 0 de la polilinea -> no desviado.
      expect(
        decidir({ ruta: conTrazado, paradas: todas, posicion: sobreElRodeo, umbralM: UMBRAL_M }),
      ).toEqual({ tipo: "omitir" });
      // Sobre la recta (lejos del rodeo) -> desviado respecto a la ruta DADA.
      expect(
        decidir({
          ruta: conTrazado,
          paradas: todas,
          posicion: { lat: 9.92, lng: LNG },
          umbralM: UMBRAL_M,
        }),
      ).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });

    it("SIN polilinea se usa la recta por las paradas de la secuencia, en su orden", () => {
      expect(
        decidir({ ruta: ruta(), paradas: todas, posicion: sobreElRodeo, umbralM: UMBRAL_M }),
      ).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
      expect(
        decidir({
          ruta: ruta(),
          paradas: todas,
          posicion: { lat: 9.925, lng: LNG },
          umbralM: UMBRAL_M,
        }),
      ).toEqual({ tipo: "omitir" });
    });

    it("una polilinea `local` heredada no es la ruta por calles: se usa la recta", () => {
      const conLocal = ruta({
        trazado: {
          encodedPolyline: codificarPolilinea(rodeo),
          distanciaM: null,
          duracionS: null,
          fuente: "local",
        },
      });
      expect(
        decidir({ ruta: conLocal, paradas: todas, posicion: sobreElRodeo, umbralM: UMBRAL_M }),
      ).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });

    // PA-2 (decision del leader 2026-10-30): una polilinea `routes` que decodifica a 0 puntos
    // sigue "existiendo" para R4; sin linea contra la que medir, la distancia es +Infinity y se
    // reoptimiza, que es el default seguro (no se cae a la recta).
    // [2026-10-31, SLT-59] El humano confirmo PA-2 como D18 (R47); solo cambia el titulo.
    it("D18/R47: polilinea `routes` que decodifica a 0 puntos -> distancia +Infinity -> desviado -> reoptimizar", () => {
      expect(distanciaMinimaAPolilineaM({ lat: 9.92, lng: LNG }, [])).toBe(Number.POSITIVE_INFINITY);
      const vacia = ruta({
        trazado: { encodedPolyline: "", distanciaM: 0, duracionS: 0, fuente: "routes" },
      });
      // Sobre la recta entre paradas: con la recta seria "omitir"; con la polilinea vacia, no.
      expect(
        decidir({
          ruta: vacia,
          paradas: todas,
          posicion: { lat: 9.925, lng: LNG },
          umbralM: UMBRAL_M,
        }),
      ).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });

    it("SIN polilinea y con UNA parada restante, la linea es ese punto", () => {
      const r = ruta({ secuenciaPorOrden: new Map([["s1", 1]]) });
      const decidirA = (metros: number) =>
        decidir({
          ruta: r,
          paradas: [conCoords("s1")],
          posicion: alEste(P.s1, metros),
          umbralM: UMBRAL_M,
        });
      expect(decidirA(500)).toEqual({ tipo: "omitir" });
      expect(decidirA(1500)).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });

    it("SIN polilinea, las paradas que ya no estan se saltan (sus coordenadas no estan cargadas)", () => {
      // [2026-10-30, SLT-59, D16] Antes quedaban s1 y s3 (un hueco), que ahora es fuera de orden
      // (R42) y ya no mide desvio. Con un prefijo: quedan s2 y s3, s1 se gestiono. La recta va
      // de s2 a s3; parado EN s1 estaria sobre la recta si s1 contara, y sin ella queda a ~1,1 km.
      const decision = decidir({
        ruta: ruta(),
        paradas: [conCoords("s2"), conCoords("s3")],
        posicion: P.s1,
        umbralM: UMBRAL_M,
      });
      expect(decision).toEqual({ tipo: "reoptimizar", motivo: "desviado" });
    });
  });

  it("R5: con origen `centroide` no hay posicion del mensajero", () => {
    expect(posicionDelMensajero({ lat: 1, lng: 2, fuente: "centroide" })).toBeNull();
    expect(posicionDelMensajero(null)).toBeNull();
    expect(posicionDelMensajero({ lat: 1, lng: 2, fuente: "gps" })).toEqual({ lat: 1, lng: 2 });
    expect(posicionDelMensajero({ lat: 1, lng: 2, fuente: "ultima_conocida" })).toEqual({
      lat: 1,
      lng: 2,
    });
  });
});

// ═══ T2.2 — la guarda en su sitio, dentro de `ejecutar` ═════════════════════════════════════

const CONFIG: RouteOptimizationConfig = {
  ROUTE_OPT_TIMEOUT_MS: 20_000,
  RUTA_DEBOUNCE_S: 60,
  RUTA_ORIGEN_TTL_MIN: 120,
  RUTA_SYNC_MIN_INTERVALO_S: 10,
  RUTA_MAX_PARADAS: 100,
  RUTA_ORIGEN_MAX_KM: 200,
  ROUTES_ROUTING_PREFERENCE: "TRAFFIC_UNAWARE",
  RUTA_REOPT_DISTANCIA_M: UMBRAL_M,
  RUTA_OPT_MAX_INTENTOS: 3,
  RUTA_RECUPERACION_ENFRIAMIENTO_MIN: 5,
  RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80,
  RUTA_PRIMERA_DEBOUNCE_MIN: 5,
};

function build(opts: { ruta: RutaOptimizadaDTO | null; paradas: ParadaRutaRow[] }) {
  const rutas = {
    findByMensajero: vi.fn(async () => opts.ruta),
    upsertOrigen: vi.fn(async () => {}),
    reemplazarSecuencia: vi.fn(async () => {}),
    guardarTrazado: vi.fn(async () => {}),
    reducirSecuencia: vi.fn(async () => true),
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
  /** Toda escritura posible del repositorio: ninguna debe ocurrir al omitir (R6). */
  const escrituras = () =>
    rutas.upsertOrigen.mock.calls.length +
    rutas.reemplazarSecuencia.mock.calls.length +
    rutas.guardarTrazado.mock.calls.length +
    rutas.reducirSecuencia.mock.calls.length +
    rutas.marcarDesactualizada.mock.calls.length +
    rutas.marcarTramoVivo.mock.calls.length;
  return { service, rutas, paradasRepo, client, routes, escrituras };
}

/** Origen GPS fresco, sobre la recta s1 -> s3. */
const GPS_SOBRE_LA_RUTA = {
  origenLat: 9.915,
  origenLng: LNG,
  origenAt: T0,
  origenFuente: "gps" as const,
};

const TRAZADO_ROUTES = {
  encodedPolyline: codificarPolilinea([{ lat: 9.9, lng: LNG }, P.s1, P.s2, P.s3]),
  distanciaM: 3300,
  duracionS: 600,
  fuente: "routes" as const,
};

describe("SLT-59 T2.2 — la guarda dentro de `ejecutar`", () => {
  it("R1/R6/R9: 2+ paradas, mismo conjunto, GPS nuevo sobre la ruta -> 0 llamadas, 0 escrituras, sin lecturas extra", async () => {
    // El GPS se movio cientos de metros desde el ultimo calculo: con la huella vieja (que
    // mezclaba el origen) esto se pagaba. Ahora el conjunto es el mismo y no hay desvio.
    const { service, rutas, paradasRepo, client, routes, escrituras } = build({
      ruta: ruta({ ...GPS_SOBRE_LA_RUTA, trazado: TRAZADO_ROUTES }),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });

    const r = await service.ejecutar(MENSAJERO, { motivo: "debounce" });

    expect(r).toMatchObject({ status: "omitida", razon: "sin_cambios" });
    expect(r).toHaveProperty("trazado.encodedPolyline", TRAZADO_ROUTES.encodedPolyline);
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(routes.trazar).not.toHaveBeenCalled();
    expect(escrituras()).toBe(0);
    // R9: las mismas dos lecturas que la ejecucion ya hacia antes de la guarda 92/R36.
    expect(rutas.findByMensajero).toHaveBeenCalledTimes(1);
    expect(paradasRepo.findParadasEnReparto).toHaveBeenCalledTimes(1);
  });

  it("R2/R6/R9: UNA parada, la misma, sin desvio -> 0 `computeRoutes`, devuelve el trazado guardado y no escribe nada", async () => {
    const unTramo = {
      encodedPolyline: codificarPolilinea([{ lat: 9.9, lng: LNG }, P.s1]),
      distanciaM: 1100,
      duracionS: 200,
    };
    const trazado = {
      encodedPolyline: unTramo.encodedPolyline,
      distanciaM: 1100,
      duracionS: 200,
      fuente: "routes" as const,
    };
    const { service, rutas, paradasRepo, client, routes, escrituras } = build({
      ruta: ruta({
        origenLat: 9.905,
        origenLng: LNG,
        origenAt: T0,
        origenFuente: "gps",
        secuenciaPorOrden: new Map([["s1", 1]]),
        tramoPorOrden: new Map([["s1", unTramo]]),
        trazado,
      }),
      paradas: [parada("s1")],
    });

    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });

    expect(r).toEqual({
      status: "omitida",
      razon: "sin_paradas",
      trazado: { ...trazado, tramos: [unTramo] },
    });
    expect(routes.trazar).not.toHaveBeenCalled();
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(escrituras()).toBe(0);
    expect(rutas.findByMensajero).toHaveBeenCalledTimes(1);
    expect(paradasRepo.findParadasEnReparto).toHaveBeenCalledTimes(1);
  });

  it("R2: UNA parada sin trazado guardado -> omite igual, sin trazado y sin pagar", async () => {
    const { service, routes, escrituras } = build({
      ruta: ruta({ ...GPS_SOBRE_LA_RUTA, secuenciaPorOrden: new Map([["s1", 1]]) }),
      paradas: [parada("s1")],
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(r).toEqual({ status: "omitida", razon: "sin_paradas" });
    expect(routes.trazar).not.toHaveBeenCalled();
    expect(escrituras()).toBe(0);
  });

  it("R10: calculada hace 8 h, mismo conjunto, sobre la ruta -> 0 llamadas", async () => {
    const { service, client, routes } = build({
      ruta: ruta({ ...GPS_SOBRE_LA_RUTA, calculadaAt: new Date(T0.getTime() - 8 * 3600_000) }),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "debounce" });
    expect(r).toMatchObject({ status: "omitida", razon: "sin_cambios" });
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(routes.trazar).not.toHaveBeenCalled();
  });

  it("R52 (antes R19): manual, mismo conjunto con el mensajero a 2 km de la ruta -> se reoptimiza", async () => {
    const lejos = alEste({ lat: 9.92, lng: LNG }, 2000);
    const { service, client, rutas } = build({
      ruta: ruta({ origenLat: lejos.lat, origenLng: lejos.lng, origenAt: T0, origenFuente: "gps" }),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(r.status).toBe("ok");
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    expect(rutas.reemplazarSecuencia).toHaveBeenCalledTimes(1);
  });

  it("R51: job de la cola, mismo conjunto con el mensajero a 2 km de la ruta -> 0 llamadas y 0 escrituras", async () => {
    const lejos = alEste({ lat: 9.92, lng: LNG }, 2000);
    const { service, client, routes, escrituras } = build({
      ruta: ruta({ origenLat: lejos.lat, origenLng: lejos.lng, origenAt: T0, origenFuente: "gps" }),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "debounce" });
    expect(r).toMatchObject({ status: "omitida", razon: "sin_cambios" });
    expect(client.optimizar).not.toHaveBeenCalled();
    expect(routes.trazar).not.toHaveBeenCalled();
    expect(escrituras()).toBe(0);
  });

  it("R52 (antes R19): manual, UNA parada, la misma, con el mensajero desviado -> si se pide el trazado", async () => {
    const lejos = alEste(P.s1, 3000);
    const { service, routes, client } = build({
      ruta: ruta({
        origenLat: lejos.lat,
        origenLng: lejos.lng,
        origenAt: T0,
        origenFuente: "gps",
        secuenciaPorOrden: new Map([["s1", 1]]),
      }),
      paradas: [parada("s1")],
    });
    await service.ejecutar(MENSAJERO, { motivo: "manual" });
    expect(routes.trazar).toHaveBeenCalledTimes(1);
    expect(client.optimizar).not.toHaveBeenCalled();
  });

  it("R5: origen `centroide` (sin GPS ni ultima conocida) -> no desviado -> 0 llamadas", async () => {
    const { service, client } = build({
      ruta: ruta(),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });
    const r = await service.ejecutar(MENSAJERO, { motivo: "debounce" });
    expect(r).toMatchObject({ status: "omitida", razon: "sin_cambios" });
    expect(client.optimizar).not.toHaveBeenCalled();
  });

  it("R7: ruta `desactualizada` con el mismo conjunto -> se reoptimiza", async () => {
    const { service, client } = build({
      ruta: ruta({ ...GPS_SOBRE_LA_RUTA, estado: "desactualizada" }),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });
    await service.ejecutar(MENSAJERO, { motivo: "debounce" });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
  });

  it("R20: una parada nueva -> se reoptimiza el conjunto completo", async () => {
    const { service, client } = build({
      ruta: ruta({ ...GPS_SOBRE_LA_RUTA, secuenciaPorOrden: new Map([["s1", 1], ["s2", 2]]) }),
      paradas: [parada("s1"), parada("s2"), parada("s3")],
    });
    await service.ejecutar(MENSAJERO, { motivo: "debounce" });
    expect(client.optimizar).toHaveBeenCalledTimes(1);
    const enviadas = (client.optimizar.mock.calls[0][0] as { paradas: { ordenId: string }[] })
      .paradas.map((p) => p.ordenId);
    expect(enviadas).toEqual(["s1", "s2", "s3"]);
  });
});
