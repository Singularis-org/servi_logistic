import { describe, it, expect } from "vitest";

import { buildPaqueteUrl, leerGuia } from "@/lib/utils/paquete-url";

// SLT-157: `leerGuia` es la única lectura de guía (cámara y pistola). Los literales
// van escritos a mano, nunca contra la función que los genera.

describe("buildPaqueteUrl", () => {
  it("construye la URL absoluta con el num_guia y el origin inyectado", () => {
    expect(buildPaqueteUrl(1234, "https://ejemplo.app")).toBe(
      "https://ejemplo.app/paquete/1234",
    );
  });
});

describe("leerGuia", () => {
  it("R560: lee los dígitos del CODE128", () => {
    expect(leerGuia("1024")).toBe(1024);
    expect(leerGuia("34991060")).toBe(34991060);
  });

  it("R561: lee la URL del QR con cualquier origen, con o sin barra final", () => {
    expect(leerGuia("https://app.ejemplo.test/paquete/1024")).toBe(1024);
    expect(leerGuia("https://otra.test/paquete/1024/")).toBe(1024);
  });

  it("R561: rechaza una URL con otra ruta", () => {
    expect(leerGuia("https://app.ejemplo.test/ordenes/1024")).toBeNull();
    expect(leerGuia("https://app.ejemplo.test/paquete/abc")).toBeNull();
  });

  it.each([
    [" 1024\r\n"],
    ["\t1024"],
    ["\u001d1024"],
    ["#1024"],
  ])("R562: ignora el relleno de los extremos en %j", (texto) => {
    expect(leerGuia(texto)).toBe(1024);
  });

  it("R562: el # solo vale delante de dígitos, no delante de una URL", () => {
    expect(leerGuia("#https://app.ejemplo.test/paquete/1024")).toBeNull();
  });

  it.each([
    [""],
    ["   "],
    ["abc"],
    ["10 24"],
    ["1024abc"],
    ["-1"],
    ["1.5"],
    ["0"],
    ["##1024"],
    ["9007199254740993"],
    ["3f1c7c2e-9a1a-4f0e-9d4a-2b6a1c9e5d33"],
  ])("R563: %j no es una guía", (texto) => {
    expect(leerGuia(texto)).toBeNull();
  });

  describe("R568: ida y vuelta con lo que imprime la etiqueta", () => {
    const guias = [1, 1024, 34991060, Number.MAX_SAFE_INTEGER];
    const origenes = ["https://app.ejemplo.test", "http://localhost:3000"];

    it.each(guias)("el CODE128 String(%i) se lee como la misma guía", (n) => {
      expect(leerGuia(String(n))).toBe(n);
    });

    it.each(origenes.flatMap((origen) => guias.map((n) => [n, origen] as const)))(
      "el QR de la guía %i con origen %s se lee como la misma guía",
      (n, origen) => {
        expect(leerGuia(buildPaqueteUrl(n, origen))).toBe(n);
      },
    );
  });
});
