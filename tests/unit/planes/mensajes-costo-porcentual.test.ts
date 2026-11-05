import { describe, expect, it } from "vitest";

import { money } from "@/lib/config/moneda";
import {
  lineasDelCosteoPorcentual,
  NOTA_COBRO_PORCENTUAL,
  textoDelCobroVigente,
  textoDelCostoPorOrden,
  textoDelCostoPorOrdenPorcentual,
} from "@/lib/planes/mensajes";
import type { CosteoDelCiclo } from "@/lib/types/consumo-plan";

// SLT-83 (design §4.4; R21, R22, R23) — los textos del modo porcentual, en un solo sitio para el
// catálogo, el detalle, el modal, la columna «Cobro por orden» y «Mi plan». Sin moneda y con dos
// decimales en el porcentaje y el mínimo (SLT-66 §2.5).

describe("SLT-83 R21 — textoDelCostoPorOrdenPorcentual (catálogo, detalle y modal)", () => {
  it("con mínimo: «{p} % del valor del paquete, mínimo {m}»", () => {
    expect(textoDelCostoPorOrdenPorcentual({ porcentaje: "2.00", minimo: "500.00" })).toBe(
      "2.00 % del valor del paquete, mínimo 500.00",
    );
  });

  it("sin mínimo: «{p} % del valor del paquete»", () => {
    expect(textoDelCostoPorOrdenPorcentual({ porcentaje: "2.35", minimo: null })).toBe("2.35 % del valor del paquete");
  });

  it("con dos decimales aunque llegue de una versión sin guardar («2», «500»)", () => {
    expect(textoDelCostoPorOrdenPorcentual({ porcentaje: "2", minimo: "500" })).toBe("2.00 % del valor del paquete, mínimo 500.00");
    expect(textoDelCostoPorOrdenPorcentual({ porcentaje: "0.5", minimo: "0" })).toBe("0.50 % del valor del paquete, mínimo 0.00");
  });

  it("el modo fijo y el vacío se pintan como en SLT-66 R24", () => {
    expect(textoDelCostoPorOrden("100.00")).toBe("100.00 por orden");
    expect(textoDelCostoPorOrden(null)).toBe("se aplica el valor global");
  });
});

describe("SLT-83 R22 — textoDelCobroVigente (columna «Cobro por orden» de «Empresas»)", () => {
  it("porcentual con mínimo: «{p} % (mín. {m})»", () => {
    expect(textoDelCobroVigente({ modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" })).toBe(
      "2.00 % (mín. 500.00)",
    );
  });

  it("porcentual sin mínimo: «{p} %»", () => {
    expect(textoDelCobroVigente({ modo: "porcentual", porcentaje: "2.35", minimo: null, fuente: "plan" })).toBe("2.35 %");
  });

  it.each(["empresa", "plan", "global", "sin_configurar"] as const)("fijo (%s): el importe de hoy, con money", (fuente) => {
    expect(textoDelCobroVigente({ modo: "fijo", monto: "80.00", fuente })).toBe(money("80.00"));
  });
});

describe("SLT-83 R23 — las líneas de «Mi plan» con un plan porcentual", () => {
  const COSTEO: Extract<CosteoDelCiclo, { modo: "porcentual" }> = {
    modo: "porcentual",
    base: { tipo: "monto", periodo: "50000.00" },
    porcentaje: "2.00",
    minimo: "500.00",
    cobrado: "2000.00",
    pendientes: 0,
    total: "52000.00",
    sinCostoConcreto: false,
  };

  it("costo por orden con su nota, lo cobrado, las pendientes (solo el conteo) y el total base + cobrado", () => {
    expect(lineasDelCosteoPorcentual(COSTEO)).toEqual({
      costoPorOrden: "Costo por orden: 2.00 % del valor del paquete, mínimo 500.00",
      nota: "se cobra cuando la orden llega a un estado final",
      cobrado: "Cobrado en el ciclo: 2000.00",
      pendientes: "Órdenes del ciclo sin estado final: 0",
      total: "Total del ciclo hasta hoy: 50000.00 + 2000.00 = 52000.00",
    });
    expect(NOTA_COBRO_PORCENTUAL).toBe("se cobra cuando la orden llega a un estado final");
  });

  it("sin mínimo y con órdenes pendientes", () => {
    const l = lineasDelCosteoPorcentual({ ...COSTEO, minimo: null, cobrado: "290.11", pendientes: 3, total: "50290.11" });
    expect(l.costoPorOrden).toBe("Costo por orden: 2.00 % del valor del paquete");
    expect(l.pendientes).toBe("Órdenes del ciclo sin estado final: 3");
    expect(l.total).toBe("Total del ciclo hasta hoy: 50000.00 + 290.11 = 50290.11");
  });

  // Texto aprobado por el humano el 2026-11-04: un cobrado negativo se resta, con U+2212.
  it("un cobrado negativo se pinta como resta con su valor absoluto, nunca «+ -»", () => {
    const l = lineasDelCosteoPorcentual({ ...COSTEO, cobrado: "-500.00", total: "49500.00" });
    expect(l.total).toBe("Total del ciclo hasta hoy: 50000.00 − 500.00 = 49500.00");
    expect(l.total).not.toContain("+ -");
  });

  it("con cobrado 0 sigue «base + c = t»", () => {
    const l = lineasDelCosteoPorcentual({ ...COSTEO, cobrado: "0.00", total: "50000.00" });
    expect(l.total).toBe("Total del ciclo hasta hoy: 50000.00 + 0.00 = 50000.00");
  });

  it("con la base por definir no hay total (SLT-66 R20)", () => {
    const l = lineasDelCosteoPorcentual({ ...COSTEO, base: { tipo: "por_definir" }, total: null, sinCostoConcreto: true });
    expect(l.total).toBeNull();
    expect(l.cobrado).toBe("Cobrado en el ciclo: 2000.00");
  });
});
