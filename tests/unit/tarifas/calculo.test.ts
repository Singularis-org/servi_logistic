import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { importeDe, ivaDe } from "@/lib/tarifas/calculo";
import type { ValorCobro, ValorPago } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 T2.3 (R23, R26) — importe e IVA del modelo nuevo. TODOS los esperados son texto escrito
 * a mano con la aritmetica anotada; ninguno se calcula con la funcion probada.
 *
 * Los dos casos de la 204 (589.30 y 657.25) son importes reales medidos en produccion que el
 * navegador pintaba con un centimo de diferencia; aqui fijan que el modelo nuevo redondea igual
 * que el cierre: HALF_UP y el IVA sobre el importe ya redondeado.
 */

const D = (s: string) => new Prisma.Decimal(s);

function cobro(modo: "monto" | "porcentaje", valor: string, ivaPct: string): ValorCobro {
  return { concepto: "tienda_comision_cod", modo, valor, ivaPct, nivel: "zona", tarifaValorId: "tv-1" };
}

function pago(modo: "monto" | "porcentaje", valor: string): ValorPago {
  return { concepto: "mensajero_entregado", modo, valor, nivel: "zona", tarifaValorId: "tv-2" };
}

describe("R26 · importeDe", () => {
  it("monto: el valor tal cual, ignora la base", () => {
    expect(importeDe(cobro("monto", "1500.00", "13.00"), D("99999.99")).toFixed(2)).toBe("1500.00");
    expect(importeDe(pago("monto", "2000.00"), D("0")).toFixed(2)).toBe("2000.00");
  });

  it("porcentaje: base * valor / 100 → 14900.00 * 3.50% = 521.50", () => {
    expect(importeDe(cobro("porcentaje", "3.50", "13.00"), D("14900.00")).toFixed(2)).toBe("521.50");
  });

  it("porcentaje redondea antes de devolver: 16618.40 * 3.50% = 581.644 → 581.64", () => {
    // `toString()` y no `toFixed(2)`: `toFixed` redondea al pintar y taparia un importe que sale
    // de la funcion sin redondear (y que luego se sumaria con sus milesimas).
    expect(importeDe(cobro("porcentaje", "3.50", "13.00"), D("16618.40")).toString()).toBe("581.64");
    expect(importeDe(pago("porcentaje", "5.00"), D("100.10")).toString()).toBe("5.01");
  });

  it("HALF_UP en el medio exacto: 100.10 * 5% = 5.005 → 5.01 (HALF_EVEN daria 5.00)", () => {
    expect(importeDe(cobro("porcentaje", "5.00", "0.00"), D("100.10")).toFixed(2)).toBe("5.01");
    expect(importeDe(pago("porcentaje", "5.00"), D("100.10")).toFixed(2)).toBe("5.01");
  });

  it("R27: porcentaje sobre un pedido sin valor (base 0) → 0.00", () => {
    expect(importeDe(cobro("porcentaje", "3.50", "13.00"), D("0")).toFixed(2)).toBe("0.00");
  });

  it("R28: pago en porcentaje sobre un flete 0.00 (resultado sin flete a la tienda) → 0.00", () => {
    expect(importeDe(pago("porcentaje", "40.00"), D("0.00")).toFixed(2)).toBe("0.00");
  });

  it("un monto con mas de 2 decimales (no deberia llegar: numeric(12,2)) se redondea HALF_UP", () => {
    expect(importeDe(pago("monto", "10.005"), D("0")).toFixed(2)).toBe("10.01");
  });
});

describe("R23 · un cero escrito vale 0, no «sin tarifa»", () => {
  it("monto 0 → importe \"0.00\" (un Decimal, no ausencia)", () => {
    const importe = importeDe(cobro("monto", "0", "13.00"), D("14900.00"));
    expect(importe).toBeInstanceOf(Prisma.Decimal);
    expect(importe.toFixed(2)).toBe("0.00");
  });

  it("porcentaje 0 → \"0.00\"; y su IVA → \"0.00\"", () => {
    const v = cobro("porcentaje", "0.00", "13.00");
    const importe = importeDe(v, D("14900.00"));
    expect(importe.toFixed(2)).toBe("0.00");
    expect(ivaDe(v, importe).toFixed(2)).toBe("0.00");
  });

  it("un pago en monto 0 → \"0.00\"", () => {
    expect(importeDe(pago("monto", "0.00"), D("5000.00")).toFixed(2)).toBe("0.00");
  });
});

describe("R26 · ivaDe (solo cobros a la tienda) sobre el importe redondeado", () => {
  it("204: 14900.00 al 3.50% → 521.50; IVA 13% = 67.795 → HALF_UP 67.80; total 589.30", () => {
    const v = cobro("porcentaje", "3.50", "13.00");
    const importe = importeDe(v, D("14900.00"));
    const iva = ivaDe(v, importe);
    expect(iva.toFixed(2)).toBe("67.80");
    expect(importe.add(iva).toFixed(2)).toBe("589.30");
  });

  it("204: 16618.40 al 3.50% → 581.64; IVA 13% = 75.6132 → 75.61; total 657.25 (no 657.26)", () => {
    const v = cobro("porcentaje", "3.50", "13.00");
    const importe = importeDe(v, D("16618.40"));
    const iva = ivaDe(v, importe);
    expect(iva.toFixed(2)).toBe("75.61");
    expect(importe.add(iva).toFixed(2)).toBe("657.25");
  });

  it("el IVA va sobre el importe REDONDEADO aunque llegue sin redondear: 5.005 → 5.01 → 50% = 2.505 → 2.51", () => {
    // Sobre 5.005 sin redondear daria 2.5025 → 2.50.
    expect(ivaDe(cobro("porcentaje", "5.00", "50.00"), D("5.005")).toFixed(2)).toBe("2.51");
  });

  it("encadenado: 100.10 al 5% → 5.01; IVA 50% → 2.51", () => {
    const v = cobro("porcentaje", "5.00", "50.00");
    expect(ivaDe(v, importeDe(v, D("100.10"))).toFixed(2)).toBe("2.51");
  });

  it("IVA 0 → \"0.00\"; IVA de un monto fijo: 1500.00 * 13% = 195.00", () => {
    expect(ivaDe(cobro("monto", "1500.00", "0.00"), D("1500.00")).toFixed(2)).toBe("0.00");
    expect(ivaDe(cobro("monto", "1500.00", "13.00"), D("1500.00")).toFixed(2)).toBe("195.00");
  });
});
