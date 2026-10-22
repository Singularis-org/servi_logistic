import { describe, it, expect } from "vitest";
import { MARCA, EMPRESA } from "@/lib/config/marca";

// R22 (SL-8, D8) y R1 (SL-15): la plataforma y la empresa usuaria son dos cosas distintas.
// Los literales son el contrato: no se comparan contra su propia fuente.
describe("lib/config/marca", () => {
  it("R22: MARCA.nombre es literalmente «Servi Logistic»", () => {
    expect(MARCA.nombre).toBe("Servi Logistic");
  });

  it("R22: EMPRESA tiene el término neutro de transición y sin membrete", () => {
    expect(EMPRESA.enFrase).toBe("la empresa");
    expect(EMPRESA.alInicio).toBe("La empresa");
    expect(EMPRESA.membrete).toBeNull();
  });

  it("R22: ningún valor de EMPRESA es la plataforma ni la contiene", () => {
    const valores = Object.values(EMPRESA).filter((v): v is string => v !== null);
    expect(valores.length).toBeGreaterThan(0);
    for (const valor of valores) {
      expect(valor).not.toBe(MARCA.nombre);
      expect(valor.toLowerCase()).not.toContain("servi logistic");
    }
  });
});
