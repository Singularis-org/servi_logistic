import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConfiguracionBovedaError,
  PRUEBAS_POR_MINUTO_DEFECTO,
  leerAnilloDeClaves,
  pruebasPorMinuto,
} from "@/lib/config/integraciones";

// SL-36 T2.1 (design §3, §6; R4) — la configuracion de la boveda.
//
// Lo que estos casos fijan, y por que con el valor a la vista: un error de configuracion acaba en
// el log de Vercel. Si el mensaje llevara un trozo de la clave o la etiqueta de la entrada, la clave
// maestra viviria en el agregador de logs (QC inv. 13). Por eso cada caso afirma que el mensaje
// NO contiene el valor ni un prefijo de el.

const K1 = Buffer.alloc(32, 0x11).toString("base64");
const K2 = Buffer.alloc(32, 0x22).toString("base64");
const K3 = Buffer.alloc(32, 0x33).toString("base64");

function errorDe(env: Record<string, string | undefined>): ConfiguracionBovedaError {
  try {
    leerAnilloDeClaves(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfiguracionBovedaError);
    return e as ConfiguracionBovedaError;
  }
  throw new Error("leerAnilloDeClaves no lanzo");
}

/** El mensaje no lleva el valor, ni sus primeros 8 caracteres, ni ninguna etiqueta de version. */
function sinValores(mensaje: string, ...valores: string[]): void {
  for (const v of valores) {
    expect(mensaje).not.toContain(v);
    expect(mensaje).not.toContain(v.slice(0, 8));
  }
  expect(mensaje).not.toMatch(/\bv[0-9]+\b/);
}

describe("SL-36 R4 — ausente, mal formada o repetida nombran variable y posición; se lee por llamada", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("control: un anillo bueno da la activa y las claves de 32 bytes", () => {
    const anillo = leerAnilloDeClaves({
      INTEGRACIONES_CLAVES_CIFRADO: ` v1:${K1} , v2:${K2} `,
      INTEGRACIONES_CLAVE_ACTIVA: "v2",
    });
    expect(anillo.activa).toBe("v2");
    expect([...anillo.claves.keys()]).toEqual(["v1", "v2"]);
    expect(anillo.claves.get("v1")).toEqual(Buffer.alloc(32, 0x11));
    expect(anillo.claves.get("v2")).toEqual(Buffer.alloc(32, 0x22));
  });

  it.each([
    ["ausente", undefined],
    ["vacia", ""],
    ["solo espacios", "   "],
  ])("anillo %s: nombra INTEGRACIONES_CLAVES_CIFRADO", (_caso, valor) => {
    const e = errorDe({ INTEGRACIONES_CLAVES_CIFRADO: valor, INTEGRACIONES_CLAVE_ACTIVA: "v1" });
    expect(e.message).toBe("INTEGRACIONES_CLAVES_CIFRADO no esta definida");
  });

  it("activa ausente o vacia: nombra INTEGRACIONES_CLAVE_ACTIVA", () => {
    for (const activa of [undefined, ""]) {
      const e = errorDe({ INTEGRACIONES_CLAVES_CIFRADO: `v1:${K1}`, INTEGRACIONES_CLAVE_ACTIVA: activa });
      expect(e.message).toBe("INTEGRACIONES_CLAVE_ACTIVA no esta definida");
      sinValores(e.message, K1);
    }
  });

  // La entrada mala va SIEMPRE en la posicion 2, con una buena delante: el mensaje tiene que decir
  // «entrada 2» y no «entrada 1», o la posicion no se esta contando.
  it.each([
    ["sin separador", K2],
    ["version con cero a la izquierda", `v02:${K2}`],
    ["version cero", `v0:${K2}`],
    ["etiqueta que no es v<n>", `clave:${K2}`],
    ["base64 con un caracter fuera del alfabeto", `v2:${K2.slice(0, -2)}*=`],
    ["base64url en vez de estandar", `v2:${Buffer.alloc(32, 0xfb).toString("base64url")}=`],
    ["clave de 16 bytes", `v2:${Buffer.alloc(16, 0x22).toString("base64")}`],
    ["clave de 33 bytes", `v2:${Buffer.alloc(33, 0x22).toString("base64")}`],
    ["entrada vacia (coma de mas)", ""],
  ])("entrada mal formada (%s): nombra la variable y la entrada 2, sin el valor", (_caso, entrada) => {
    const e = errorDe({ INTEGRACIONES_CLAVES_CIFRADO: `v1:${K1},${entrada}`, INTEGRACIONES_CLAVE_ACTIVA: "v1" });
    expect(e.message).toMatch(/^INTEGRACIONES_CLAVES_CIFRADO: la entrada 2 /);
    sinValores(e.message, K1, K2);
  });

  it("una version repetida falla en la posicion de la repeticion, sin nombrar la version", () => {
    const e = errorDe({
      INTEGRACIONES_CLAVES_CIFRADO: `v1:${K1},v2:${K2},v1:${K3}`,
      INTEGRACIONES_CLAVE_ACTIVA: "v2",
    });
    expect(e.message).toBe("INTEGRACIONES_CLAVES_CIFRADO: la entrada 3 repite una version anterior");
    sinValores(e.message, K1, K2, K3);
  });

  it("activa mal formada o fuera del anillo: nombra la variable, no la etiqueta", () => {
    const malFormada = errorDe({ INTEGRACIONES_CLAVES_CIFRADO: `v1:${K1}`, INTEGRACIONES_CLAVE_ACTIVA: "2" });
    expect(malFormada.message).toBe("INTEGRACIONES_CLAVE_ACTIVA no tiene la forma v<n>");
    const fuera = errorDe({ INTEGRACIONES_CLAVES_CIFRADO: `v1:${K1}`, INTEGRACIONES_CLAVE_ACTIVA: "v7" });
    expect(fuera.message).toBe(
      "INTEGRACIONES_CLAVE_ACTIVA no corresponde a ninguna entrada de INTEGRACIONES_CLAVES_CIFRADO",
    );
    sinValores(fuera.message, K1);
  });

  it("se lee por llamada: sin argumento lee process.env de ese momento, no el del import", () => {
    vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", `v1:${K1},v2:${K2}`);
    vi.stubEnv("INTEGRACIONES_CLAVE_ACTIVA", "v1");
    expect(leerAnilloDeClaves().activa).toBe("v1");
    vi.stubEnv("INTEGRACIONES_CLAVE_ACTIVA", "v2");
    expect(leerAnilloDeClaves().activa).toBe("v2");
    vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", "");
    expect(() => leerAnilloDeClaves()).toThrow(ConfiguracionBovedaError);
  });

  it("el modulo se importa sin las variables: la app arranca sin ellas", async () => {
    vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", undefined);
    vi.stubEnv("INTEGRACIONES_CLAVE_ACTIVA", undefined);
    vi.resetModules();
    const config = await import("@/lib/config/integraciones");
    const boveda = await import("@/lib/crypto/boveda-integraciones");
    expect(typeof config.leerAnilloDeClaves).toBe("function");
    expect(() => new boveda.BovedaIntegraciones()).not.toThrow();
  });
});

describe("SL-36 design §6 — límite de pruebas por minuto", () => {
  it("ausente, vacio, cero, negativo o no entero: el defecto (5)", () => {
    expect(PRUEBAS_POR_MINUTO_DEFECTO).toBe(5);
    for (const valor of [undefined, "", "0", "-3", "2.5", "cinco", "07"]) {
      expect(pruebasPorMinuto({ INTEGRACIONES_PRUEBAS_POR_MINUTO: valor }), String(valor)).toBe(5);
    }
  });

  it("un entero positivo se respeta, y se lee por llamada", () => {
    expect(pruebasPorMinuto({ INTEGRACIONES_PRUEBAS_POR_MINUTO: " 12 " })).toBe(12);
    vi.stubEnv("INTEGRACIONES_PRUEBAS_POR_MINUTO", "3");
    expect(pruebasPorMinuto()).toBe(3);
    vi.stubEnv("INTEGRACIONES_PRUEBAS_POR_MINUTO", "8");
    expect(pruebasPorMinuto()).toBe(8);
    vi.unstubAllEnvs();
  });
});
