import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadGeocodeConfig } from "@/lib/config/geocode";

// Feature 91 (R33) — la config del proveedor NUNCA lanza: es la propiedad que impide que una
// variable mal puesta tumbe el drenado de la cola, que comparte cron con `liberar_reprogramadas`.
//
// SL-36 (R23): la clave de Google Maps es de cada empresa y ya no sale del entorno. Lo que antes se
// probaba aqui («ausente -> null», «presente -> se devuelve») ahora es lo contrario: aunque el
// entorno traiga la variable retirada, la config no la expone.

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GEOCODE_TIMEOUT_MS;
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

describe("SL-36/R23 — la config no lleva credencial", () => {
  it("con la variable retirada en el entorno, la config sigue siendo solo el timeout", () => {
    process.env.GOOGLE_MAPS_API_KEY = "clave-de-prueba";
    expect(() => loadGeocodeConfig()).not.toThrow();
    expect(loadGeocodeConfig()).toEqual({ GEOCODE_TIMEOUT_MS: 10_000 });
    expect(JSON.stringify(loadGeocodeConfig())).not.toContain("clave-de-prueba");
  });

  it("sin entorno tampoco lanza", () => {
    expect(() => loadGeocodeConfig()).not.toThrow();
  });
});

describe("R33 — timeout con default sensato", () => {
  it("ausente -> 10_000 ms", () => {
    expect(loadGeocodeConfig().GEOCODE_TIMEOUT_MS).toBe(10_000);
  });

  it("valor invalido o no positivo -> cae al default sin lanzar", () => {
    process.env.GEOCODE_TIMEOUT_MS = "no-es-un-numero";
    expect(loadGeocodeConfig().GEOCODE_TIMEOUT_MS).toBe(10_000);
    process.env.GEOCODE_TIMEOUT_MS = "0";
    expect(loadGeocodeConfig().GEOCODE_TIMEOUT_MS).toBe(10_000);
  });

  it("valor valido -> se respeta", () => {
    process.env.GEOCODE_TIMEOUT_MS = "2500";
    expect(loadGeocodeConfig().GEOCODE_TIMEOUT_MS).toBe(2500);
  });
});
