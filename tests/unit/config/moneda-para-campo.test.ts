import { describe, expect, it } from "vitest";

import { montoParaCampo } from "@/lib/config/moneda";
import { codigoSinComentarios } from "../../fixtures/money-safe";

/**
 * SLT-67 — el valor inicial de un campo de monto editable. El servidor manda
 * `Prisma.Decimal.toFixed(2)` y el formulario del plan mostraba `500.00`.
 */
describe("montoParaCampo — valor editable de un monto (SLT-67)", () => {
  it("un importe entero se muestra sin la cola de ceros", () => {
    expect(montoParaCampo("500")).toBe("500");
    expect(montoParaCampo("500.00")).toBe("500");
    expect(montoParaCampo("500.000")).toBe("500");
    expect(montoParaCampo("1.000000")).toBe("1");
  });

  it("un importe con cola se muestra con al menos dos digitos de cola", () => {
    expect(montoParaCampo("500.5")).toBe("500.50");
    expect(montoParaCampo("500.50")).toBe("500.50");
    expect(montoParaCampo("500.05")).toBe("500.05");
    expect(montoParaCampo("0.5")).toBe("0.50");
  });

  it("NO redondea: con mas de dos decimales significativos solo recorta ceros a la derecha", () => {
    expect(montoParaCampo("500.505")).toBe("500.505");
    expect(montoParaCampo("500.5000")).toBe("500.50");
    expect(montoParaCampo("12.345600")).toBe("12.3456");
    expect(montoParaCampo("9.999")).toBe("9.999");
  });

  it("el cero se muestra como 0, tambien el negativo", () => {
    expect(montoParaCampo("0")).toBe("0");
    expect(montoParaCampo("0.00")).toBe("0");
    expect(montoParaCampo("-0.00")).toBe("0");
    expect(montoParaCampo("-0")).toBe("0");
  });

  it("conserva el signo de un negativo distinto de cero", () => {
    expect(montoParaCampo("-500.00")).toBe("-500");
    expect(montoParaCampo("-500.5")).toBe("-500.50");
    expect(montoParaCampo("-0.50")).toBe("-0.50");
  });

  it("usa el punto del contrato, sin simbolo ni separador de miles", () => {
    expect(montoParaCampo("9999999999.99")).toBe("9999999999.99");
    expect(montoParaCampo("9999999999.00")).toBe("9999999999");
    expect(montoParaCampo("1234567.80")).toBe("1234567.80");
  });

  it("una cadena vacia o en blanco da cadena vacia", () => {
    expect(montoParaCampo("")).toBe("");
    expect(montoParaCampo("   ")).toBe("");
  });

  it("recorta espacios alrededor de un importe con forma decimal", () => {
    expect(montoParaCampo(" 500.00 ")).toBe("500");
  });

  it("lo que no tiene forma de importe decimal se devuelve verbatim (el usuario esta escribiendo)", () => {
    expect(montoParaCampo("500.")).toBe("500.");
    expect(montoParaCampo(".5")).toBe(".5");
    expect(montoParaCampo("-")).toBe("-");
    expect(montoParaCampo("500,50")).toBe("500,50");
    expect(montoParaCampo("abc")).toBe("abc");
  });

  it("es exacto con importes que un number no representa", () => {
    expect(montoParaCampo("99999999999999.10")).toBe("99999999999999.10");
    expect(montoParaCampo("99999999999999.00")).toBe("99999999999999");
  });

  it("el modulo sigue sin convertir el monto a numero", () => {
    const codigo = codigoSinComentarios("lib/config/moneda.ts");
    expect(codigo).toContain("montoParaCampo");
    expect(codigo).not.toMatch(/\bNumber\s*\(/);
    expect(codigo).not.toMatch(/\bparseFloat\s*\(/);
  });
});
