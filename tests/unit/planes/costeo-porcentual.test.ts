import { describe, expect, it } from "vitest";

import { aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import { costeoDelCiclo, costoVigenteDeLaTarifa } from "@/lib/planes/costeo";
import type { CostoVigente } from "@/lib/types/consumo-plan";
import type { PrecioPlan, VersionPlan } from "@/lib/types/planes";

// SLT-83 (design §4.3; R23) — el costeo del ciclo con un plan porcentual: costo base, porcentaje y
// mínimo, lo cobrado en el ciclo, las órdenes sin estado final (solo el conteo) y el total = base +
// cobrado, en decimal exacto. Con la base por definir no hay total (SLT-66 R20).

const MENSUAL: PrecioPlan = { tipo: "monto", mensual: "50000.00", descuentos: {} };
const PORCENTUAL: CostoVigente = { modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" };

function plan(precio: PrecioPlan, costoPorOrdenPorcentual: VersionPlan["costoPorOrdenPorcentual"] = { porcentaje: "2.00", minimo: "500.00" }) {
  return { precio, costoPorOrden: null, costoPorOrdenPorcentual };
}

describe("SLT-83 R23 — costeoDelCiclo en modo porcentual", () => {
  it("base + lo cobrado = total; porcentaje, mínimo y pendientes tal cual", () => {
    expect(costeoDelCiclo(plan(MENSUAL), "50000.00", PORCENTUAL, 7, { cobrado: "2500.00", pendientes: 3 })).toEqual({
      modo: "porcentual",
      base: { tipo: "monto", periodo: "50000.00" },
      porcentaje: "2.00",
      minimo: "500.00",
      cobrado: "2500.00",
      pendientes: 3,
      total: "52500.00",
      sinCostoConcreto: false,
    });
  });

  it("las órdenes del ciclo no multiplican nada: el total no depende de su número", () => {
    const pocas = costeoDelCiclo(plan(MENSUAL), "50000.00", PORCENTUAL, 1, { cobrado: "100.00", pendientes: 0 });
    const muchas = costeoDelCiclo(plan(MENSUAL), "50000.00", PORCENTUAL, 900, { cobrado: "100.00", pendientes: 899 });
    expect(pocas.total).toBe("50100.00");
    expect(muchas.total).toBe("50100.00");
  });

  it("sin mínimo, el mínimo es null", () => {
    const sinMinimo: CostoVigente = { modo: "porcentual", porcentaje: "2.35", minimo: null, fuente: "plan" };
    const c = costeoDelCiclo(plan(MENSUAL, { porcentaje: "2.35", minimo: null }), "50000.00", sinMinimo, 0, { cobrado: "0.00", pendientes: 0 });
    expect(c).toMatchObject({ modo: "porcentual", porcentaje: "2.35", minimo: null, total: "50000.00" });
  });

  it("decimal exacto, sin coma flotante (0.10 + 0.20 = 0.30) e importes grandes sin perder céntimos", () => {
    const chico = costeoDelCiclo(plan({ tipo: "monto", mensual: "0.10", descuentos: {} }), "0.10", PORCENTUAL, 0, {
      cobrado: "0.20",
      pendientes: 0,
    });
    expect(chico.total).toBe("0.30");
    const grande = costeoDelCiclo(plan({ tipo: "monto", mensual: "9999999999.99", descuentos: {} }), "9999999999.99", PORCENTUAL, 0, {
      cobrado: "9999999999.99",
      pendientes: 0,
    });
    expect(grande.total).toBe("19999999999.98");
  });

  it("lo cobrado negativo (un reverso del ciclo de un cargo anterior) resta del total", () => {
    const c = costeoDelCiclo(plan(MENSUAL), "50000.00", PORCENTUAL, 0, { cobrado: "-500.00", pendientes: 1 });
    expect(c).toMatchObject({ cobrado: "-500.00", total: "49500.00" });
  });

  it("con la base por definir: «por definir», sin total, y el aviso de costo concreto", () => {
    const c = costeoDelCiclo(plan({ tipo: "sin_precio" }), null, PORCENTUAL, 2, { cobrado: "2000.00", pendientes: 1 });
    expect(c).toMatchObject({
      modo: "porcentual",
      base: { tipo: "por_definir" },
      cobrado: "2000.00",
      pendientes: 1,
      total: null,
      sinCostoConcreto: true,
    });
  });

  it("SLT-86 (R28): el total es la base del período que llega más lo cobrado; ya no hay aviso del anual", () => {
    const conDescuento = plan({ tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "20" } } });
    const c = costeoDelCiclo(conDescuento, "480000.00", PORCENTUAL, 0, { cobrado: "100.00", pendientes: 0 });
    expect(c).toMatchObject({ base: { tipo: "monto", periodo: "480000.00" }, total: "480100.00" });
    expect(c).not.toHaveProperty("anualNoAplicaAlCosto");
  });

  it("el modo porcentual sin lo cobrado en el ciclo es un error, no un total inventado", () => {
    // Las sobrecargas ya lo impiden al compilar; esto cubre a un llamador sin tipos.
    const sinTipos = costeoDelCiclo as (...args: unknown[]) => unknown;
    expect(() => sinTipos(plan(MENSUAL), "50000.00", PORCENTUAL, 0)).toThrow(/cobrado en el ciclo/);
  });
});

describe("SLT-83 R22, R23 — costoVigenteDeLaTarifa: la fila de cobro_plataforma_tarifa_de con su modo", () => {
  it("porcentaje no nulo → porcentual del plan, con o sin mínimo", () => {
    expect(costoVigenteDeLaTarifa({ monto: null, fuente: "plan", porcentaje: "2.00", minimo: "500.00" })).toEqual(PORCENTUAL);
    expect(costoVigenteDeLaTarifa({ monto: null, fuente: "plan", porcentaje: "2.00", minimo: null })).toEqual({
      modo: "porcentual",
      porcentaje: "2.00",
      minimo: null,
      fuente: "plan",
    });
  });

  // SLT-126 (R11): la regla vigente ya no da la fuente `empresa`.
  it.each(["plan", "global", "sin_configurar"] as const)("sin porcentaje → fijo con fuente %s", (fuente) => {
    expect(costoVigenteDeLaTarifa({ monto: "80.00", fuente, porcentaje: null, minimo: null })).toEqual({ modo: "fijo", monto: "80.00", fuente });
  });

  it("una forma imposible (porcentaje fuera del plan, o fijo sin importe) es un error", () => {
    expect(() => costoVigenteDeLaTarifa({ monto: null, fuente: "global", porcentaje: "2.00", minimo: null })).toThrow(/solo el plan/);
    expect(() => costoVigenteDeLaTarifa({ monto: null, fuente: "global", porcentaje: null, minimo: null })).toThrow(/sin importe/);
  });
});

describe("SLT-83 R24 — céntimos con signo", () => {
  it.each([
    ["-246.90", "-246.90"],
    ["-0.5", "-0.50"],
    ["0", "0.00"],
    ["1500", "1500.00"],
  ])("%s → %s", (entrada, salida) => {
    expect(aTexto(aCentimosConSigno(entrada))).toBe(salida);
  });
});
