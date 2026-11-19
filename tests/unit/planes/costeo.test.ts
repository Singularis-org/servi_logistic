import { describe, expect, it } from "vitest";

import { tieneCostoConcreto } from "@/lib/planes/costo-concreto";
import { costeoDelCiclo } from "@/lib/planes/costeo";
import type { PrecioPlan } from "@/lib/types/planes";

// SLT-66 (design §4.3, §9.1) — el total estimado del ciclo: base + órdenes × costo vigente, en decimal
// exacto (R19, R20). SLT-86 (R28): la base llega ya calculada: el costo del período en curso.

const MENSUAL: PrecioPlan = { tipo: "monto", mensual: "50000.00", descuentos: {} };
const DEL_PLAN = { modo: "fijo", monto: "100.00", fuente: "plan" } as const;

/** SLT-66 R28: `costeoDelCiclo` recibe el plan (base y costo por orden), no solo la base. */
const conCosto = (precio: PrecioPlan, costoPorOrden: string | null = "100.00") => ({
  precio,
  costoPorOrden,
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
});

describe("SLT-66 — costeoDelCiclo: total con base «monto» (R19)", () => {
  it("R19: base + órdenes × costo = total, con el costo y la fuente vigentes", () => {
    expect(costeoDelCiclo(conCosto(MENSUAL), "50000.00", DEL_PLAN, 3)).toEqual({
      modo: "fijo", // SLT-83: el costeo pasó a unión por modo
      base: { tipo: "monto", periodo: "50000.00" },
      costoPorOrden: "100.00",
      fuente: "plan",
      ordenes: 3,
      subtotalOrdenes: "300.00",
      total: "50300.00",
      sinCostoConcreto: false,
    });
  });

  it("R19: con cero órdenes el total es la base", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL), "50000.00", DEL_PLAN, 0);
    expect(c.subtotalOrdenes).toBe("0.00");
    expect(c.total).toBe("50000.00");
  });

  it("R19: decimal exacto, sin coma flotante (0.10 × 3 = 0.30, no 0.30000000000000004)", () => {
    const c = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "0.20", descuentos: {} }, "0.10"), "0.20", { modo: "fijo", monto: "0.10", fuente: "plan" }, 3);
    expect(c.subtotalOrdenes).toBe("0.30");
    expect(c.total).toBe("0.50");
  });

  it("R19: importes grandes de DECIMAL(12,2) sin perder céntimos", () => {
    const c = costeoDelCiclo(
      conCosto({ tipo: "monto", mensual: "9999999999.99", descuentos: {} }),
      "9999999999.99",
      { modo: "fijo", monto: "9999999999.99", fuente: "plan" },
      100000,
    );
    expect(c.subtotalOrdenes).toBe("999999999999000.00");
    expect(c.total).toBe("1000009999998999.99");
  });

  it("R19: los importes salen con dos decimales aunque entren sin ellos", () => {
    const c = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "100", descuentos: {} }, "7"), "100", { modo: "fijo", monto: "7", fuente: "plan" }, 2);
    expect(c).toMatchObject({ base: { tipo: "monto", periodo: "100.00" }, costoPorOrden: "7.00", total: "114.00" });
  });
});

describe("SLT-66 — costeoDelCiclo: base 0.00 y plan sin costo concreto (R20)", () => {
  it("R20: una base de 0.00 es un monto y suma 0", () => {
    const c = costeoDelCiclo(conCosto({ tipo: "monto", mensual: "0.00", descuentos: {} }, "0.00"), "0.00", { modo: "fijo", monto: "0.00", fuente: "plan" }, 4);
    expect(c.base).toEqual({ tipo: "monto", periodo: "0.00" });
    expect(c.total).toBe("0.00");
    expect(c.sinCostoConcreto).toBe(false);
  });

  it.each([
    { caso: "sin precio", precio: { tipo: "sin_precio" } as const },
  ])("R20: base $caso → «por definir», sin total, pero con subtotal", ({ precio }) => {
    const c = costeoDelCiclo(conCosto(precio), null, DEL_PLAN, 3);
    expect(c.base).toEqual({ tipo: "por_definir" });
    expect(c.total).toBeNull();
    expect(c.subtotalOrdenes).toBe("300.00");
    expect(c.sinCostoConcreto).toBe(true);
  });

  it("R20: plan sin costo por orden → el global, con total, y el aviso de sin costo concreto", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, null), "50000.00", { modo: "fijo", monto: "500.00", fuente: "global" }, 2);
    expect(c).toMatchObject({ costoPorOrden: "500.00", fuente: "global", subtotalOrdenes: "1000.00", total: "51000.00" });
    expect(c.sinCostoConcreto).toBe(true);
  });

  // SLT-126: fuera los casos de la excepción de la empresa (R11: la regla vigente ya no la da).
  it("R28/R20: plan con costo por orden 0.00 → se cobra 0.00 del plan y sin aviso", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, "0.00"), "50000.00", { modo: "fijo", monto: "0.00", fuente: "plan" }, 1);
    expect(c).toMatchObject({ costoPorOrden: "0.00", fuente: "plan", subtotalOrdenes: "0.00" });
    expect(c.sinCostoConcreto).toBe(false);
    expect(c.total).toBe("50000.00");
  });

  it("R20: sin plan de costo ni global → 0.00 sin_configurar, con total", () => {
    const c = costeoDelCiclo(conCosto(MENSUAL, null), "50000.00", { modo: "fijo", monto: "0.00", fuente: "sin_configurar" }, 5);
    expect(c).toMatchObject({ costoPorOrden: "0.00", subtotalOrdenes: "0.00", total: "50000.00", sinCostoConcreto: true });
  });
});

// SLT-86 (R28): el aviso «el anual no aplica al costo» se va; la base es la del período y la calcula
// `cobroDelPlan` con su descuento (`costeo-periodo.test.ts`). Un descuento no toca el costo por orden (R13).
describe("SLT-86 — un descuento del período no toca el costo por orden (R13)", () => {
  it("con descuentos en el plan, el costo por orden y el subtotal son los mismos; solo cambia la base que llega", () => {
    const conDescuento = conCosto({ tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "20" } } });
    const c = costeoDelCiclo(conDescuento, "480000.00", DEL_PLAN, 3);
    expect(c).toMatchObject({ costoPorOrden: "100.00", subtotalOrdenes: "300.00", total: "480300.00" });
    expect(c).not.toHaveProperty("anualNoAplicaAlCosto");
  });
});

describe("SLT-66 — tieneCostoConcreto: la forma del plan, no el importe (R28)", () => {
  const BASES: readonly { caso: string; precio: PrecioPlan; monto: boolean }[] = [
    { caso: "sin precio", precio: { tipo: "sin_precio" }, monto: false },
    { caso: "monto sin descuentos", precio: { tipo: "monto", mensual: "50000.00", descuentos: {} }, monto: true },
    {
      caso: "monto con descuento anual de monto",
      precio: { tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "monto", monto: "100000.00" } } },
      monto: true,
    },
    {
      caso: "monto con descuento anual en porcentaje",
      precio: { tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
      monto: true,
    },
  ];

  it.each(BASES)("R28: base $caso con costo por orden → concreto solo si la base es monto", ({ precio, monto }) => {
    expect(tieneCostoConcreto({ precio, costoPorOrden: "100.00", costoPorOrdenPorcentual: null })).toBe(monto);
  });

  it.each(BASES)("R28: base $caso sin costo por orden → nunca concreto", ({ precio }) => {
    expect(tieneCostoConcreto({ precio, costoPorOrden: null, costoPorOrdenPorcentual: null })).toBe(false);
  });

  it("R28: costo por orden 0.00 cuenta como concreto", () => {
    expect(tieneCostoConcreto({ precio: { tipo: "monto", mensual: "50000.00", descuentos: {} }, costoPorOrden: "0.00", costoPorOrdenPorcentual: null })).toBe(true);
  });

  it("R28: base 0.00 cuenta como concreta", () => {
    expect(tieneCostoConcreto({ precio: { tipo: "monto", mensual: "0.00", descuentos: {} }, costoPorOrden: "100.00", costoPorOrdenPorcentual: null })).toBe(true);
    expect(tieneCostoConcreto({ precio: { tipo: "monto", mensual: "0.00", descuentos: {} }, costoPorOrden: "0.00", costoPorOrdenPorcentual: null })).toBe(true);
  });
});
