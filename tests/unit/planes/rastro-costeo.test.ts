import { describe, expect, it } from "vitest";

import {
  lineasDeCambioDelPlan,
  textoDelCostoPorOrden,
  type CambioDelPlanParaCorreo,
} from "@/lib/planes/mensajes";
import { diferenciasDelPlan, hayCambios } from "@/lib/planes/rastro";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-66 (design §4.2, §4.4; R9, R11) — el costo por orden en el rastro y en las líneas de «qué cambia».

const PLAN: PlanDTO = {
  id: "p1",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 10, porRol: { admin: 2 }, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "50000.00", anual: null },
  costoPorOrden: "100.00",
  archivado: false,
};

function lineas(antes: PlanDTO, despues: PlanDTO): string[] {
  return lineasDeCambioDelPlan(diferenciasDelPlan(antes, despues) as CambioDelPlanParaCorreo);
}

describe("SLT-66 R11 — diferencias del costo por orden", () => {
  it("«100» y el «100.00» de la base son el mismo costo: sin cambios, no se escribe nada", () => {
    expect(hayCambios(diferenciasDelPlan(PLAN, { ...PLAN, costoPorOrden: "100" }))).toBe(false);
    expect(hayCambios(diferenciasDelPlan(PLAN, { ...PLAN, costoPorOrden: "0100.0" }))).toBe(false);
  });

  it("un cambio real deja antes y después como texto con dos decimales", () => {
    expect(diferenciasDelPlan(PLAN, { ...PLAN, costoPorOrden: "150.5" })).toEqual({
      costoPorOrden: { antes: "100.00", despues: "150.50" },
    });
  });

  it("vaciarlo o darle valor a uno vacío es un cambio, con null del lado vacío", () => {
    expect(diferenciasDelPlan(PLAN, { ...PLAN, costoPorOrden: null })).toEqual({
      costoPorOrden: { antes: "100.00", despues: null },
    });
    expect(diferenciasDelPlan({ ...PLAN, costoPorOrden: null }, { ...PLAN, costoPorOrden: "0" })).toEqual({
      costoPorOrden: { antes: null, despues: "0.00" },
    });
  });

  it("al crear, el costo sale con antes: null como los demás campos", () => {
    expect(diferenciasDelPlan(null, { ...PLAN, costoPorOrden: "7" }).costoPorOrden).toEqual({
      antes: null,
      despues: "7.00",
    });
  });
});

describe("SLT-66 R9, R11 — las líneas de «qué cambia»", () => {
  it("textoDelCostoPorOrden: importe «por orden»; vacío, el valor global", () => {
    expect(textoDelCostoPorOrden("100.00")).toBe("100.00 por orden");
    expect(textoDelCostoPorOrden(null)).toBe("se aplica el valor global");
  });

  it("un cambio del costo por orden pinta su línea", () => {
    expect(lineas(PLAN, { ...PLAN, costoPorOrden: "150" })).toEqual([
      "Costo por orden: 100.00 por orden → 150.00 por orden",
    ]);
    expect(lineas(PLAN, { ...PLAN, costoPorOrden: null })).toEqual([
      "Costo por orden: 100.00 por orden → se aplica el valor global",
    ]);
  });

  it("el precio mensual de SL-24 se llama «Costo base»", () => {
    expect(lineas(PLAN, { ...PLAN, precio: { tipo: "negociable" } })).toEqual([
      "Costo base: 50000.00 al mes → negociable",
    ]);
  });

  it("base y costo por orden cambian a la vez: dos líneas, base primero", () => {
    expect(lineas(PLAN, { ...PLAN, precio: { tipo: "sin_precio" }, costoPorOrden: "90" })).toEqual([
      "Costo base: 50000.00 al mes → sin precio",
      "Costo por orden: 100.00 por orden → 90.00 por orden",
    ]);
  });

  it("un rastro viejo sin costoPorOrden no pinta esa línea", () => {
    expect(lineasDeCambioDelPlan({ nombre: { antes: "A", despues: "B" } })).toEqual(["Nombre del plan: A → B"]);
  });
});
