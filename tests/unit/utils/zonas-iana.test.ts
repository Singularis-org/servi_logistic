import { describe, expect, it } from "vitest";

import { esZonaIana, zonasIana } from "@/lib/utils/zonas-iana";

// SLT-81 · R8 — la lista de zonas que ofrece el selector y que acepta el servidor.
describe("SLT-81 R8 — zonas IANA del runtime", () => {
  it("contiene las zonas reales y no una inventada", () => {
    expect(zonasIana()).toContain("America/Costa_Rica");
    expect(zonasIana()).toContain("America/Panama");
    expect(zonasIana()).not.toContain("Mars/Olympus");
  });

  it("está ordenada y sin repetidos", () => {
    const lista = zonasIana();
    expect([...lista]).toEqual([...lista].sort());
    expect(new Set(lista).size).toBe(lista.length);
  });

  it("es la misma lista en cada llamada y no se puede modificar", () => {
    expect(zonasIana()).toBe(zonasIana());
    expect(Object.isFrozen(zonasIana())).toBe(true);
  });

  it("esZonaIana acepta solo el nombre exacto", () => {
    expect(esZonaIana("America/Costa_Rica")).toBe(true);
    expect(esZonaIana("america/costa_rica")).toBe(false);
    expect(esZonaIana(" America/Costa_Rica")).toBe(false);
    expect(esZonaIana("Mars/Olympus")).toBe(false);
    expect(esZonaIana("")).toBe(false);
  });
});
