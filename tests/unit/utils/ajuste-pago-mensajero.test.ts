import { describe, it, expect } from "vitest";

import { validarAjustePago } from "@/lib/utils/ajuste-pago-mensajero";

// SLT-56 / T3 (R8, R9, R16) — el modulo puro que decide si un ajuste del pago al mensajero se aplica.
// Los casos que importan son los que un `===` sobre texto o un `Number` resolverian MAL: la misma
// cantidad escrita distinto, y un centimo de diferencia.

describe("SLT-56 — validarAjustePago compara importes en decimal exacto", () => {
  it("R8 — el valor nuevo igual al vigente es `sin_cambio`, aunque se escriba distinto (1500 vs 1500.00)", () => {
    expect(validarAjustePago("1500.00", "1500.00", "1500")).toBe("sin_cambio");
    expect(validarAjustePago("1500.00", "1500.00", "1500.0")).toBe("sin_cambio");
    expect(validarAjustePago("0.00", "0.00", "0")).toBe("sin_cambio");
  });

  it("R9 — el anterior que mostro la pantalla es el vigente escrito distinto: no es desfase", () => {
    expect(validarAjustePago("1500.00", "1500", "2000.00")).toBe("ok");
  });

  it("R16 — un centimo de diferencia cuenta, en los dos sentidos", () => {
    // Nuevo a un centimo del vigente: es un cambio, se aplica.
    expect(validarAjustePago("1500.00", "1500.00", "1500.01")).toBe("ok");
    expect(validarAjustePago("1500.00", "1500.00", "1499.99")).toBe("ok");
    // Anterior a un centimo del vigente: la pantalla vio otro valor.
    expect(validarAjustePago("1500.01", "1500.00", "2000.00")).toBe("desfasado");
  });

  it("R16 — importes que en coma flotante se confunden siguen siendo distintos", () => {
    // 0.1 + 0.2 en `number` no es 0.3; en Decimal, 0.30 es 0.30 y 0.31 es otro importe.
    expect(validarAjustePago("0.30", "0.30", "0.31")).toBe("ok");
    expect(validarAjustePago("9999999999.99", "9999999999.99", "9999999999.98")).toBe("ok");
    expect(validarAjustePago("9999999999.99", "9999999999.98", "1.00")).toBe("desfasado");
  });

  it("R9 — si el vigente cambio entre medias (otro ajuste), es `desfasado`", () => {
    expect(validarAjustePago("1800.00", "1500.00", "2000.00")).toBe("desfasado");
  });

  it("R9 — sin pago congelado (vigente NULL) es `desfasado`, nunca `ok`", () => {
    expect(validarAjustePago(null, "0.00", "1000.00")).toBe("desfasado");
    expect(validarAjustePago(null, "1500.00", "1500.00")).toBe("desfasado");
  });

  it("R6 — una gestion que hoy paga 0 se puede subir a un valor", () => {
    expect(validarAjustePago("0.00", "0.00", "1000.00")).toBe("ok");
  });

  it("un ajuste a 0 desde un valor es valido", () => {
    expect(validarAjustePago("1500.00", "1500.00", "0.00")).toBe("ok");
  });
});
