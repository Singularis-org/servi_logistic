import { describe, expect, it } from "vitest";

import { costeoDelCiclo } from "@/lib/planes/costeo";
import type { PrecioPlan } from "@/lib/types/planes";

// SLT-66 (design §4.3, §9.1) — el total estimado del ciclo: base + órdenes × costo vigente, en decimal
// exacto y sin el anual (R19, R20, R10).

const MENSUAL: PrecioPlan = { tipo: "monto", mensual: "50000.00", anual: null };
const DEL_PLAN = { monto: "100.00", fuente: "plan" } as const;

describe("SLT-66 — costeoDelCiclo: total con base «monto» (R19)", () => {
  it("R19: base + órdenes × costo = total, con el costo y la fuente vigentes", () => {
    expect(costeoDelCiclo(MENSUAL, DEL_PLAN, 3)).toEqual({
      base: { tipo: "monto", mensual: "50000.00" },
      costoPorOrden: "100.00",
      fuente: "plan",
      ordenes: 3,
      subtotalOrdenes: "300.00",
      total: "50300.00",
      sinCostoConcreto: false,
      anualNoAplicaAlCosto: false,
    });
  });

  it("R19: con cero órdenes el total es la base", () => {
    const c = costeoDelCiclo(MENSUAL, DEL_PLAN, 0);
    expect(c.subtotalOrdenes).toBe("0.00");
    expect(c.total).toBe("50000.00");
  });

  it("R19: decimal exacto, sin coma flotante (0.10 × 3 = 0.30, no 0.30000000000000004)", () => {
    const c = costeoDelCiclo({ tipo: "monto", mensual: "0.20", anual: null }, { monto: "0.10", fuente: "plan" }, 3);
    expect(c.subtotalOrdenes).toBe("0.30");
    expect(c.total).toBe("0.50");
  });

  it("R19: importes grandes de DECIMAL(12,2) sin perder céntimos", () => {
    const c = costeoDelCiclo(
      { tipo: "monto", mensual: "9999999999.99", anual: null },
      { monto: "9999999999.99", fuente: "empresa" },
      100000,
    );
    expect(c.subtotalOrdenes).toBe("999999999999000.00");
    expect(c.total).toBe("1000009999998999.99");
  });

  it("R19: los importes salen con dos decimales aunque entren sin ellos", () => {
    const c = costeoDelCiclo({ tipo: "monto", mensual: "100", anual: null }, { monto: "7", fuente: "plan" }, 2);
    expect(c).toMatchObject({ base: { tipo: "monto", mensual: "100.00" }, costoPorOrden: "7.00", total: "114.00" });
  });

  it("R18: con excepción de la empresa el costo y la fuente son los de la excepción", () => {
    const c = costeoDelCiclo(MENSUAL, { monto: "80.00", fuente: "empresa" }, 2);
    expect(c).toMatchObject({ costoPorOrden: "80.00", fuente: "empresa", subtotalOrdenes: "160.00", total: "50160.00" });
    expect(c.sinCostoConcreto).toBe(false);
  });
});

describe("SLT-66 — costeoDelCiclo: base 0.00 y plan sin costo concreto (R20)", () => {
  it("R20: una base de 0.00 es un monto y suma 0", () => {
    const c = costeoDelCiclo({ tipo: "monto", mensual: "0.00", anual: null }, { monto: "0.00", fuente: "plan" }, 4);
    expect(c.base).toEqual({ tipo: "monto", mensual: "0.00" });
    expect(c.total).toBe("0.00");
    expect(c.sinCostoConcreto).toBe(false);
  });

  it.each([
    { caso: "sin precio", precio: { tipo: "sin_precio" } as const },
    { caso: "negociable", precio: { tipo: "negociable" } as const },
  ])("R20: base $caso → «por definir», sin total, pero con subtotal", ({ precio }) => {
    const c = costeoDelCiclo(precio, DEL_PLAN, 3);
    expect(c.base).toEqual({ tipo: "por_definir" });
    expect(c.total).toBeNull();
    expect(c.subtotalOrdenes).toBe("300.00");
    expect(c.sinCostoConcreto).toBe(true);
    expect(c.anualNoAplicaAlCosto).toBe(false);
  });

  it("R20: plan sin costo por orden → el global, con total, y el aviso de sin costo concreto", () => {
    const c = costeoDelCiclo(MENSUAL, { monto: "500.00", fuente: "global" }, 2);
    expect(c).toMatchObject({ costoPorOrden: "500.00", fuente: "global", subtotalOrdenes: "1000.00", total: "51000.00" });
    expect(c.sinCostoConcreto).toBe(true);
  });

  it("R20: sin plan de costo ni global → 0.00 sin_configurar, con total", () => {
    const c = costeoDelCiclo(MENSUAL, { monto: "0.00", fuente: "sin_configurar" }, 5);
    expect(c).toMatchObject({ costoPorOrden: "0.00", subtotalOrdenes: "0.00", total: "50000.00", sinCostoConcreto: true });
  });
});

describe("SLT-66 — costeoDelCiclo: el anual no toca el costo ni el total (R10)", () => {
  it.each([
    { caso: "descuento del 20 %", anual: { tipo: "descuento", porcentaje: "20" } as const },
    { caso: "anual fijo", anual: { tipo: "fijo", monto: "400000.00" } as const },
  ])("R10: con $caso el total es el mismo que sin él y se marca que no aplica al costo", ({ anual }) => {
    const sin = costeoDelCiclo(MENSUAL, DEL_PLAN, 3);
    const con = costeoDelCiclo({ tipo: "monto", mensual: "50000.00", anual }, DEL_PLAN, 3);
    expect(con.total).toBe(sin.total);
    expect(con.total).toBe("50300.00");
    expect(con.costoPorOrden).toBe("100.00");
    expect(con.anualNoAplicaAlCosto).toBe(true);
    expect(sin.anualNoAplicaAlCosto).toBe(false);
  });
});
