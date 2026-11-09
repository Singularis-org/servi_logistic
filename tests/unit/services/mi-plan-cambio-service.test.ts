import { describe, expect, it } from "vitest";

import { esPlanDisponible } from "@/lib/planes/costo-concreto";
import type { PlanDTO, VersionPlan } from "@/lib/types/planes";

// SLT-99 (design §3 paso 3, §4; R1, R2, R5, R12, R13, R16, R18) — el servicio del cambio de plan del maestro
// con un repositorio espía, y la regla de «plan disponible» que comparten el carrusel y la escritura.

function planDTO(p: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "1000.00", descuentos: {} },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null,
    archivado: false,
    ...p,
  };
}

function version(p: Partial<VersionPlan> = {}): VersionPlan {
  const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = planDTO();
  return { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual, ...p };
}

describe("R5, R12 — esPlanDisponible: público, no archivado y con costo concreto, también en su versión programada", () => {
  it("un público con costo concreto (fijo, porcentual o «0.00») y sin versión programada está disponible", () => {
    expect(esPlanDisponible(planDTO(), null)).toBe(true);
    expect(esPlanDisponible(planDTO({ precio: { tipo: "monto", mensual: "0.00", descuentos: {} } }), null)).toBe(true);
    expect(
      esPlanDisponible(planDTO({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: null } }), null),
    ).toBe(true);
  });

  it("archivado no está disponible", () => {
    expect(esPlanDisponible(planDTO({ archivado: true }), null)).toBe(false);
  });

  it("custom no está disponible, sea de la empresa o de otra", () => {
    expect(esPlanDisponible(planDTO({ visibilidad: "custom", organizacionId: "org-a" }), null)).toBe(false);
  });

  it("sin precio o sin costo por orden no está disponible", () => {
    expect(esPlanDisponible(planDTO({ precio: { tipo: "sin_precio" } }), null)).toBe(false);
    expect(esPlanDisponible(planDTO({ costoPorOrden: null }), null)).toBe(false);
  });

  it("con una versión programada sin costo concreto no está disponible; con una concreta, sí", () => {
    expect(esPlanDisponible(planDTO(), version({ precio: { tipo: "sin_precio" } }))).toBe(false);
    expect(esPlanDisponible(planDTO(), version({ costoPorOrden: null }))).toBe(false);
    expect(esPlanDisponible(planDTO(), version({ precio: { tipo: "monto", mensual: "2000.00", descuentos: {} } }))).toBe(true);
  });
});
