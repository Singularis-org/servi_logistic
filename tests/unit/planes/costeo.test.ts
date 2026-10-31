import { describe, expect, it } from "vitest";

import { tieneCostoConcreto } from "@/lib/planes/costo-concreto";
import { costeoDelCiclo } from "@/lib/planes/costeo";
import type { PrecioPlan } from "@/lib/types/planes";

// SLT-66 (design §4.3, §9.1) — el total estimado del ciclo: base + órdenes × costo vigente, en decimal
// exacto y sin el anual (R19, R20, R10).

const MENSUAL: PrecioPlan = { tipo: "monto", mensual: "50000.00", anual: null };
const DEL_PLAN = { monto: "100.00", fuente: "plan" } as const;

/** SLT-66 R28: `costeoDelCiclo` recibe el plan (base y costo por orden), no solo la base. */
const conCosto = (precio: PrecioPlan, costoPorOrden: string | null = "100.00") => ({ precio, costoPorOrden });

describe("SLT-66 — costeoDelCiclo: total con base «monto» (R19)", () => {
  it("R19: base + órdenes × costo = total, con el costo y la fuente vigentes", () => {
    expect(costeoDelCiclo(conCosto(MENSUAL), DEL_PLAN, 3)).toEqual({
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
    const c = costeoDelCiclo(conCosto(MENSUAL), DEL_PLAN, 0);
    expect(c.subtotalOrdenes).toBe("0.00");
    expect(c.total).toBe("50000.00");
  });

  it("R19: decimal exacto, sin coma flotante (0.10 × 3 = 0.30, no 0.30000000000000004)", () => {
    const c = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "0.20", anual: null }, "0.10"), { monto: "0.10", fuente: "plan" }, 3);
    expect(c.subtotalOrdenes).toBe("0.30");
    expect(c.total).toBe("0.50");
  });

  it("R19: importes grandes de DECIMAL(12,2) sin perder céntimos", () => {
    const c = costeoDelCiclo(
      conCosto({ tipo: "monto", mensual: "9999999999.99", anual: null }),
      { monto: "9999999999.99", fuente: "empresa" },
      100000,
    );
    expect(c.subtotalOrdenes).toBe("999999999999000.00");
    expect(c.total).toBe("1000009999998999.99");
  });

  it("R19: los importes salen con dos decimales aunque entren sin ellos", () => {
    const c = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "100", anual: null }, "7"), { monto: "7", fuente: "plan" }, 2);
    expect(c).toMatchObject({ base: { tipo: "monto", mensual: "100.00" }, costoPorOrden: "7.00", total: "114.00" });
  });

  it("R18: con excepción de la empresa el costo y la fuente son los de la excepción", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL), { monto: "80.00", fuente: "empresa" }, 2);
    expect(c).toMatchObject({ costoPorOrden: "80.00", fuente: "empresa", subtotalOrdenes: "160.00", total: "50160.00" });
    expect(c.sinCostoConcreto).toBe(false);
  });
});

describe("SLT-66 — costeoDelCiclo: base 0.00 y plan sin costo concreto (R20)", () => {
  it("R20: una base de 0.00 es un monto y suma 0", () => {
    const c = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "0.00", anual: null }, "0.00"), { monto: "0.00", fuente: "plan" }, 4);
    expect(c.base).toEqual({ tipo: "monto", mensual: "0.00" });
    expect(c.total).toBe("0.00");
    expect(c.sinCostoConcreto).toBe(false);
  });

  it.each([
    { caso: "sin precio", precio: { tipo: "sin_precio" } as const },
    { caso: "negociable", precio: { tipo: "negociable" } as const },
  ])("R20: base $caso → «por definir», sin total, pero con subtotal", ({ precio }) => {
    const c = costeoDelCiclo(conCosto(precio), DEL_PLAN, 3);
    expect(c.base).toEqual({ tipo: "por_definir" });
    expect(c.total).toBeNull();
    expect(c.subtotalOrdenes).toBe("300.00");
    expect(c.sinCostoConcreto).toBe(true);
    expect(c.anualNoAplicaAlCosto).toBe(false);
  });

  it("R20: plan sin costo por orden → el global, con total, y el aviso de sin costo concreto", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, null), { monto: "500.00", fuente: "global" }, 2);
    expect(c).toMatchObject({ costoPorOrden: "500.00", fuente: "global", subtotalOrdenes: "1000.00", total: "51000.00" });
    expect(c.sinCostoConcreto).toBe(true);
  });

  it("R28/R20: excepción en la empresa + plan sin costo por orden → aviso, y el total con lo que paga", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, null), { monto: "80.00", fuente: "empresa" }, 2);
    expect(c).toMatchObject({ costoPorOrden: "80.00", fuente: "empresa", subtotalOrdenes: "160.00", total: "50160.00" });
    expect(c.sinCostoConcreto).toBe(true);
  });

  it("R28/R20: plan con costo por orden 0.00 y excepción en la empresa → sin aviso", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, "0.00"), { monto: "80.00", fuente: "empresa" }, 1);
    expect(c.sinCostoConcreto).toBe(false);
    expect(c.total).toBe("50080.00");
  });

  it("R20: sin plan de costo ni global → 0.00 sin_configurar, con total", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, null), { monto: "0.00", fuente: "sin_configurar" }, 5);
    expect(c).toMatchObject({ costoPorOrden: "0.00", subtotalOrdenes: "0.00", total: "50000.00", sinCostoConcreto: true });
  });
});

describe("SLT-66 — costeoDelCiclo: el anual no toca el costo ni el total (R10)", () => {
  it.each([
    { caso: "descuento del 20 %", anual: { tipo: "descuento", porcentaje: "20" } as const },
    { caso: "anual fijo", anual: { tipo: "fijo", monto: "400000.00" } as const },
  ])("R10: con $caso el total es el mismo que sin él y se marca que no aplica al costo", ({ anual }) => {
    const sin = costeoDelCiclo(conCosto(MENSUAL), DEL_PLAN, 3);
    const con = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "50000.00", anual }), DEL_PLAN, 3);
    expect(con.total).toBe(sin.total);
    expect(con.total).toBe("50300.00");
    expect(con.costoPorOrden).toBe("100.00");
    expect(con.anualNoAplicaAlCosto).toBe(true);
    expect(sin.anualNoAplicaAlCosto).toBe(false);
  });
});

describe("SLT-66 — tieneCostoConcreto: la forma del plan, no el importe (R28)", () => {
  const BASES: readonly { caso: string; precio: PrecioPlan; monto: boolean }[] = [
    { caso: "sin precio", precio: { tipo: "sin_precio" }, monto: false },
    { caso: "negociable", precio: { tipo: "negociable" }, monto: false },
    { caso: "monto sin anual", precio: { tipo: "monto", mensual: "50000.00", anual: null }, monto: true },
    {
      caso: "monto con anual fijo",
      precio: { tipo: "monto", mensual: "50000.00", anual: { tipo: "fijo", monto: "500000.00" } },
      monto: true,
    },
    {
      caso: "monto con descuento",
      precio: { tipo: "monto", mensual: "50000.00", anual: { tipo: "descuento", porcentaje: "10" } },
      monto: true,
    },
  ];

  it.each(BASES)("R28: base $caso con costo por orden → concreto solo si la base es monto", ({ precio, monto }) => {
    expect(tieneCostoConcreto({ precio, costoPorOrden: "100.00" })).toBe(monto);
  });

  it.each(BASES)("R28: base $caso sin costo por orden → nunca concreto", ({ precio }) => {
    expect(tieneCostoConcreto({ precio, costoPorOrden: null })).toBe(false);
  });

  it("R28: costo por orden 0.00 cuenta como concreto", () => {
    expect(tieneCostoConcreto({ precio: { tipo: "monto", mensual: "50000.00", anual: null }, costoPorOrden: "0.00" })).toBe(true);
  });

  it("R28: base 0.00 cuenta como concreta", () => {
    expect(tieneCostoConcreto({ precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "100.00" })).toBe(true);
    expect(tieneCostoConcreto({ precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "0.00" })).toBe(true);
  });
});
