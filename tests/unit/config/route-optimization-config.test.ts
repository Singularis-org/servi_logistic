import { describe, it, expect, afterEach } from "vitest";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";
import { GEOCODIFICACION_MAX_INTENTOS } from "@/lib/services/jobs/geocodificacion-encolado";

// Feature 92 (R10) — la carga de configuracion del proveedor de optimizacion NUNCA lanza.
// No es un detalle estetico: el drenador de la cola comparte proceso con
// `liberar_reprogramadas` (feature 46, en produccion) y `geocodificacion` (91). Si esta
// funcion lanzara al faltar una variable, un despliegue sin el SKU de Route Optimization
// tumbaria TODO el drenado, no solo esta feature.

const VARS = [
  "GOOGLE_ROUTE_OPT_PROJECT_ID",
  "GOOGLE_ROUTE_OPT_SA_EMAIL",
  "GOOGLE_ROUTE_OPT_SA_PRIVATE_KEY",
  "GOOGLE_WIF_PROJECT_NUMBER",
  "GOOGLE_WIF_POOL_ID",
  "GOOGLE_WIF_PROVIDER_ID",
  "GOOGLE_CLOUD_PROJECT_NUMBER",
  "GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID",
  "GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GOOGLE_ROUTE_OPT_USE_ADC",
  "ROUTE_OPT_TIMEOUT_MS",
  "RUTA_DEBOUNCE_S",
  "RUTA_ORIGEN_TTL_MIN",
  "RUTA_SYNC_MIN_INTERVALO_S",
  "RUTA_MAX_PARADAS",
  // Feature 265 (R21): umbral de coherencia del origen, en km.
  "RUTA_ORIGEN_MAX_KM",
  "ROUTES_ROUTING_PREFERENCE",
  // SLT-59 (R36): umbral de desvio y tope de intentos de la reoptimizacion.
  "RUTA_REOPT_DISTANCIA_M",
  "RUTA_OPT_MAX_INTENTOS",
  // SLT-59 (R55): enfriamiento de la recuperacion (D21) y umbral de la primera ruta (D25).
  "RUTA_RECUPERACION_ENFRIAMIENTO_MIN",
  "RUTA_PRIMERA_MIN_RECOGIDO_PCT",
] as const;

const original = new Map(VARS.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const [k, v] of original) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function limpiar() {
  for (const v of VARS) delete process.env[v];
}

describe("SL-36/R23 — la config no lleva credencial ni modo de autenticacion", () => {
  // Antes estos casos fijaban como se LEIAN la clave, las piezas WIF y el flag de ADC. SL-36 los
  // retiro (design §9.2): la credencial es la clave JSON de cada empresa. Lo que se fija ahora es
  // que, aunque el entorno siga trayendo las variables retiradas, la config no las expone.
  const RETIRADAS = VARS.filter((v) => v.startsWith("GOOGLE_"));

  it("con TODAS las variables retiradas puestas, ninguna llega a la config", () => {
    limpiar();
    for (const v of RETIRADAS) process.env[v] = `valor-de-${v}`;
    const config = loadRouteOptimizationConfig();
    const texto = JSON.stringify(config);
    for (const v of RETIRADAS) {
      expect(Object.keys(config)).not.toContain(v);
      expect(texto).not.toContain(`valor-de-${v}`);
    }
  });

  it("las claves de la config son exactamente los parametros de la feature", () => {
    // LITERAL a proposito: es el contrato de lo que queda en el entorno (design §9.1).
    limpiar();
    expect(Object.keys(loadRouteOptimizationConfig()).sort()).toEqual([
      "ROUTES_ROUTING_PREFERENCE",
      "ROUTE_OPT_TIMEOUT_MS",
      "RUTA_DEBOUNCE_S",
      "RUTA_MAX_PARADAS",
      "RUTA_OPT_MAX_INTENTOS",
      "RUTA_ORIGEN_MAX_KM",
      "RUTA_ORIGEN_TTL_MIN",
      "RUTA_PRIMERA_MIN_RECOGIDO_PCT",
      "RUTA_RECUPERACION_ENFRIAMIENTO_MIN",
      "RUTA_REOPT_DISTANCIA_M",
      "RUTA_SYNC_MIN_INTERVALO_S",
    ]);
  });
});

describe("R10 — enteros: default ante ausente, vacio o invalido", () => {
  it("sin variables, cada entero toma su default documentado", () => {
    limpiar();
    const config = loadRouteOptimizationConfig();
    expect(config.ROUTE_OPT_TIMEOUT_MS).toBe(20_000);
    expect(config.RUTA_DEBOUNCE_S).toBe(60);
    expect(config.RUTA_ORIGEN_TTL_MIN).toBe(120);
    expect(config.RUTA_SYNC_MIN_INTERVALO_S).toBe(10);
    expect(config.RUTA_MAX_PARADAS).toBe(100);
  });

  it("valores no numericos, cero y negativos caen al default (no a NaN ni a 0)", () => {
    // Un `RUTA_MAX_PARADAS = 0` mal tipeado dejaria la feature optimizando cero paradas
    // para siempre, en silencio. Un NaN haria lo mismo de forma aun mas opaca.
    limpiar();
    process.env.ROUTE_OPT_TIMEOUT_MS = "abc";
    process.env.RUTA_DEBOUNCE_S = "0";
    process.env.RUTA_ORIGEN_TTL_MIN = "-5";
    process.env.RUTA_SYNC_MIN_INTERVALO_S = "";
    process.env.RUTA_MAX_PARADAS = "1.9";
    const config = loadRouteOptimizationConfig();
    expect(config.ROUTE_OPT_TIMEOUT_MS).toBe(20_000);
    expect(config.RUTA_DEBOUNCE_S).toBe(60);
    expect(config.RUTA_ORIGEN_TTL_MIN).toBe(120);
    expect(config.RUTA_SYNC_MIN_INTERVALO_S).toBe(10);
    expect(config.RUTA_MAX_PARADAS).toBe(1); // parseInt trunca; 1 es positivo, se acepta
  });

  it("valores validos se respetan", () => {
    limpiar();
    process.env.RUTA_MAX_PARADAS = "40";
    process.env.RUTA_DEBOUNCE_S = "30";
    const config = loadRouteOptimizationConfig();
    expect(config.RUTA_MAX_PARADAS).toBe(40);
    expect(config.RUTA_DEBOUNCE_S).toBe(30);
  });

  describe("ROUTES_ROUTING_PREFERENCE — enum con lista blanca", () => {
    it("ausente -> TRAFFIC_UNAWARE (el SKU barato es el default)", () => {
      limpiar();
      expect(loadRouteOptimizationConfig().ROUTES_ROUTING_PREFERENCE).toBe("TRAFFIC_UNAWARE");
    });

    it("acepta los tres valores validos, sin distinguir mayusculas", () => {
      for (const [entrada, esperado] of [
        ["TRAFFIC_AWARE", "TRAFFIC_AWARE"],
        ["traffic_aware_optimal", "TRAFFIC_AWARE_OPTIMAL"],
        ["TRAFFIC_UNAWARE", "TRAFFIC_UNAWARE"],
      ] as const) {
        limpiar();
        process.env.ROUTES_ROUTING_PREFERENCE = entrada;
        expect(loadRouteOptimizationConfig().ROUTES_ROUTING_PREFERENCE).toBe(esperado);
      }
    });

    it("un valor invalido cae al lado BARATO, no al caro", () => {
      // Lo que importa aqui no es que se sanee, sino HACIA DONDE: un typo jamas debe subir
      // de SKU y ponerse a facturar tarifa Advanced sin que nadie lo haya pedido.
      for (const basura of ["TRAFFIC_AWERE", "si", "1", "TRAFFIC"]) {
        limpiar();
        process.env.ROUTES_ROUTING_PREFERENCE = basura;
        expect(loadRouteOptimizationConfig().ROUTES_ROUTING_PREFERENCE).toBe("TRAFFIC_UNAWARE");
      }
    });
  });

  describe("265/R21 — RUTA_ORIGEN_MAX_KM: configurable y sin lanzar NUNCA", () => {
    it("ausente -> 200 km, el valor 🧭 declarado sin calibrar", () => {
      limpiar();
      expect(loadRouteOptimizationConfig().RUTA_ORIGEN_MAX_KM).toBe(200);
    });

    it.each([
      ["vacia", ""],
      ["no numerica", "abc"],
      ["cero", "0"],
      ["negativa", "-1"],
      ["NaN", "NaN"],
      ["solo unidades", "200km"],
    ])("%s -> cae al default SIN lanzar", (_caso, valor) => {
      // Un umbral en 0 haria que TODO origen se considerara incoherente y toda ruta se
      // calculara desde el centroide, en silencio y para siempre. Un NaN haria lo mismo de
      // forma aun mas opaca: `km > NaN` es `false`, o sea la guarda apagada sin avisar.
      limpiar();
      process.env.RUTA_ORIGEN_MAX_KM = valor;
      expect(() => loadRouteOptimizationConfig()).not.toThrow();
      expect(loadRouteOptimizationConfig().RUTA_ORIGEN_MAX_KM).toBe(200);
    });

    it("un valor valido se respeta (es configurable de verdad, no un adorno)", () => {
      limpiar();
      process.env.RUTA_ORIGEN_MAX_KM = "50";
      expect(loadRouteOptimizationConfig().RUTA_ORIGEN_MAX_KM).toBe(50);
    });
  });

  describe.each([
    ["RUTA_REOPT_DISTANCIA_M", 1000, "750"],
    ["RUTA_OPT_MAX_INTENTOS", 3, "2"],
    ["RUTA_RECUPERACION_ENFRIAMIENTO_MIN", 5, "15"],
    ["RUTA_PRIMERA_MIN_RECOGIDO_PCT", 80, "60"],
  ] as const)("SLT-59/R36, R55 — %s: un unico punto de lectura, sin lanzar nunca", (nombre, porDefecto, override) => {
    it(`ausente -> ${porDefecto}, el valor decidido por el humano`, () => {
      limpiar();
      expect(loadRouteOptimizationConfig()[nombre]).toBe(porDefecto);
    });

    it("un valor valido se respeta (es configurable de verdad)", () => {
      limpiar();
      process.env[nombre] = override;
      expect(loadRouteOptimizationConfig()[nombre]).toBe(Number(override));
    });

    it.each([
      ["vacia", ""],
      ["no numerica", "abc"],
      ["cero", "0"],
      ["negativa", "-5"],
      ["NaN", "NaN"],
    ])("%s -> cae al default SIN lanzar", (_caso, valor) => {
      // Un umbral en 0 haria «desviado» a todo mensajero y pagaria una reoptimizacion por
      // disparo; un tope de 0 intentos dejaria la ruta sin recalcular. Por eso un valor que no
      // es un entero positivo vuelve al default en vez de colarse.
      limpiar();
      process.env[nombre] = valor;
      expect(() => loadRouteOptimizationConfig()).not.toThrow();
      expect(loadRouteOptimizationConfig()[nombre]).toBe(porDefecto);
    });
  });

  describe("SLT-59/R55 — RUTA_PRIMERA_MIN_RECOGIDO_PCT es un porcentaje: 1-100", () => {
    it.each([
      ["101", "101"],
      ["muy por encima", "250"],
    ])("%s -> cae al default 80 SIN lanzar", (_caso, valor) => {
      // Un umbral por encima de 100 nunca se cumple: el boton de la primera ruta quedaria
      // bloqueado para siempre. Se trata como cualquier otro valor invalido.
      limpiar();
      process.env.RUTA_PRIMERA_MIN_RECOGIDO_PCT = valor;
      expect(() => loadRouteOptimizationConfig()).not.toThrow();
      expect(loadRouteOptimizationConfig().RUTA_PRIMERA_MIN_RECOGIDO_PCT).toBe(80);
    });

    it.each([
      ["el minimo", "1", 1],
      ["el maximo", "100", 100],
    ])("%s del rango se respeta", (_caso, valor, esperado) => {
      limpiar();
      process.env.RUTA_PRIMERA_MIN_RECOGIDO_PCT = valor;
      expect(loadRouteOptimizationConfig().RUTA_PRIMERA_MIN_RECOGIDO_PCT).toBe(esperado);
    });

    it("el enfriamiento NO tiene tope: 101 minutos es un valor valido", () => {
      // El rango 1-100 es propio del porcentaje; el enfriamiento sigue la regla de R36.
      limpiar();
      process.env.RUTA_RECUPERACION_ENFRIAMIENTO_MIN = "101";
      expect(loadRouteOptimizationConfig().RUTA_RECUPERACION_ENFRIAMIENTO_MIN).toBe(101);
    });
  });

  it("SLT-59/R38 — RUTA_SYNC_MIN_INTERVALO_S sigue en 10 aunque los campos nuevos cambien", () => {
    // La ficha cuenta llamadas, pero el intervalo de los botones manuales quedo fuera de
    // alcance (D4): ningun ajuste de los campos nuevos puede arrastrarlo.
    limpiar();
    process.env.RUTA_REOPT_DISTANCIA_M = "5000";
    process.env.RUTA_OPT_MAX_INTENTOS = "9";
    expect(loadRouteOptimizationConfig().RUTA_SYNC_MIN_INTERVALO_S).toBe(10);
  });

  it("SLT-59/R38 — el tope de intentos de la geocodificacion no se mueve con el de la ruta", () => {
    // `RUTA_OPT_MAX_INTENTOS` es solo de la reoptimizacion; la geocodificacion (91) conserva su 8.
    limpiar();
    process.env.RUTA_OPT_MAX_INTENTOS = "1";
    loadRouteOptimizationConfig();
    expect(GEOCODIFICACION_MAX_INTENTOS).toBe(8);
  });

  it("NINGUNA combinacion de entorno hace lanzar a loadRouteOptimizationConfig", () => {
    const combinaciones: Record<string, string>[] = [
      {},
      { GOOGLE_ROUTE_OPT_PROJECT_ID: "p" },
      { GOOGLE_ROUTE_OPT_SA_EMAIL: "sa@x.iam.gserviceaccount.com" },
      { GOOGLE_ROUTE_OPT_SA_PRIVATE_KEY: "no-es-una-pem" },
      { ROUTE_OPT_TIMEOUT_MS: "NaN", RUTA_MAX_PARADAS: "-1", RUTA_DEBOUNCE_S: "x" },
    ];
    for (const combo of combinaciones) {
      limpiar();
      Object.assign(process.env, combo);
      expect(() => loadRouteOptimizationConfig()).not.toThrow();
    }
  });
});
