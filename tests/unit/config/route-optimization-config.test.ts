import { describe, it, expect, afterEach } from "vitest";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";

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
      "RUTA_ORIGEN_MAX_KM",
      "RUTA_ORIGEN_TTL_MIN",
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
