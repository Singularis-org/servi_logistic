import { describe, expect, it } from "vitest";

import {
  lineasDeCambioDelPlan,
  SIN_COSTO_PORCENTUAL,
  type CambioDelPlanParaCorreo,
} from "@/lib/planes/mensajes";
import { diferenciasDelPlan, hayCambios } from "@/lib/planes/rastro";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-83 (design §4.2; R4) — el modo porcentual en el rastro y en las líneas de «qué cambia», que
// comparten el detalle del plan, «Mi plan», el modal de asignación y el correo de SL-24 R41.

const PLAN: PlanDTO = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Porcentual",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000.00", anual: null },
  costoPorOrden: null,
  costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: "500.00" },
  archivado: false,
};

const FIJO: PlanDTO = { ...PLAN, costoPorOrden: "100.00", costoPorOrdenPorcentual: null };

function lineas(antes: PlanDTO, despues: PlanDTO): string[] {
  return lineasDeCambioDelPlan(diferenciasDelPlan(antes, despues) as CambioDelPlanParaCorreo);
}

describe("SLT-83 R4 — diferenciasDelPlan con el modo porcentual", () => {
  it("«2» y «2.00», «500» y «500.00» son el mismo porcentual: sin cambios, no se escribe", () => {
    const igual = { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" } };
    expect(hayCambios(diferenciasDelPlan(PLAN, igual))).toBe(false);
    const sinMinimo = { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "02.5", minimo: null } };
    expect(hayCambios(diferenciasDelPlan(sinMinimo, { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "2.50", minimo: null } }))).toBe(
      false,
    );
  });

  it("cambiar el porcentaje deja antes y después en forma canónica", () => {
    const d = diferenciasDelPlan(PLAN, { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "5", minimo: "500" } });
    expect(d).toEqual({
      costoPorOrdenPorcentual: {
        antes: { porcentaje: "2.00", minimo: "500.00" },
        despues: { porcentaje: "5.00", minimo: "500.00" },
      },
    });
  });

  it("quitar el mínimo es un cambio", () => {
    const d = diferenciasDelPlan(PLAN, { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: null } });
    expect(d.costoPorOrdenPorcentual).toEqual({
      antes: { porcentaje: "2.00", minimo: "500.00" },
      despues: { porcentaje: "2.00", minimo: null },
    });
  });

  it("pasar de fijo a porcentual deja los dos campos: el fijo se vacía y el porcentual aparece", () => {
    expect(diferenciasDelPlan(FIJO, { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" } })).toEqual({
      costoPorOrden: { antes: "100.00", despues: null },
      costoPorOrdenPorcentual: { antes: null, despues: { porcentaje: "2.00", minimo: "500.00" } },
    });
  });

  it("al crear sale el campo con antes null, también vacío", () => {
    expect(diferenciasDelPlan(null, PLAN).costoPorOrdenPorcentual).toEqual({
      antes: null,
      despues: { porcentaje: "2.00", minimo: "500.00" },
    });
    expect(diferenciasDelPlan(null, FIJO).costoPorOrdenPorcentual).toEqual({ antes: null, despues: null });
  });
});

describe("SLT-83 R4 — las líneas de «qué cambia»", () => {
  it("cambiar el porcentaje da la línea «Costo por orden porcentual: A → B»", () => {
    expect(lineas(PLAN, { ...PLAN, costoPorOrdenPorcentual: { porcentaje: "5", minimo: null } })).toEqual([
      "Costo por orden porcentual: 2.00 % del valor del paquete, mínimo 500.00 → 5.00 % del valor del paquete",
    ]);
  });

  it("pasar de fijo a porcentual da la línea del fijo y la del porcentual", () => {
    expect(lineas(FIJO, PLAN)).toEqual([
      "Costo por orden: 100.00 por orden → se aplica el valor global",
      `Costo por orden porcentual: ${SIN_COSTO_PORCENTUAL} → 2.00 % del valor del paquete, mínimo 500.00`,
    ]);
  });

  it("pasar de porcentual a fijo da las dos líneas al revés", () => {
    expect(lineas(PLAN, FIJO)).toEqual([
      "Costo por orden: se aplica el valor global → 100.00 por orden",
      `Costo por orden porcentual: 2.00 % del valor del paquete, mínimo 500.00 → ${SIN_COSTO_PORCENTUAL}`,
    ]);
  });

  it("sin cambio del porcentual no hay línea, y un rastro anterior a la ficha no la pinta", () => {
    expect(lineas(PLAN, { ...PLAN, nombre: "Otro" })).toEqual(["Nombre del plan: Porcentual → Otro"]);
    expect(lineasDeCambioDelPlan({ costoPorOrden: { antes: "1.00", despues: "2.00" } })).toEqual([
      "Costo por orden: 1.00 por orden → 2.00 por orden",
    ]);
  });
});
