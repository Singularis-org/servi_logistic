import { describe, it, expect } from "vitest";
import { PAIS_DE_OPERACION } from "@/lib/config/pais";

// SL-13 R16 — configuracion minima del pais de operacion.
describe("PAIS_DE_OPERACION (R16)", () => {
  it("R16: el literal es el contrato (Costa Rica, centro en San José)", () => {
    // Literal escrito a mano a proposito: es el contrato, no se compara contra su propia fuente.
    expect(PAIS_DE_OPERACION).toEqual({ codigo: "CR", centroMapa: [9.9281, -84.0907] });
  });

  it("R16: el codigo es ISO 3166-1 alfa-2 (dos letras mayusculas)", () => {
    expect(PAIS_DE_OPERACION.codigo).toMatch(/^[A-Z]{2}$/);
  });

  it("R16: centroMapa es [lat, lng] con lat en [-90, 90] y lng en [-180, 180]", () => {
    expect(PAIS_DE_OPERACION.centroMapa).toHaveLength(2);
    const [lat, lng] = PAIS_DE_OPERACION.centroMapa;
    expect(Number.isFinite(lat)).toBe(true);
    expect(Number.isFinite(lng)).toBe(true);
    expect(lat).toBeGreaterThanOrEqual(-90);
    expect(lat).toBeLessThanOrEqual(90);
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThanOrEqual(180);
  });
});
