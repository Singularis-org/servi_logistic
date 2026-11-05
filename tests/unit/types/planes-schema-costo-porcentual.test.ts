import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  costoPorOrdenPorcentualSchema,
  crearPlanSchema,
  editarPlanSchema,
  porcentajeSchema,
  versionPlanSchema,
} from "@/lib/types/planes";

// SLT-83 (design §4.1; R1, R2) — el borde del costo por orden porcentual: un modo a la vez, porcentaje
// en (0, 100] con dos decimales y mínimo opcional con la forma de `DECIMAL(12,2)`.

const PLAN = randomUUID();
const TOPES = { ordenesPorCiclo: 100, porRol: {}, apiKeys: null };
const PRECIO = { tipo: "monto", mensual: "50000.00", anual: null };

function crear(extra: Record<string, unknown> = {}) {
  return {
    nombre: "Porcentual",
    visibilidad: "publico",
    organizacionId: null,
    topes: TOPES,
    modulos: [],
    precio: PRECIO,
    costoPorOrden: null,
    costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" },
    ...extra,
  };
}

function editar(extra: Record<string, unknown> = {}) {
  return {
    planId: PLAN,
    nombre: "Porcentual",
    topes: TOPES,
    modulos: [],
    precio: PRECIO,
    costoPorOrden: null,
    costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" },
    vigenteDesde: null,
    ...extra,
  };
}

function version(extra: Record<string, unknown> = {}) {
  const v: Record<string, unknown> = editar(extra);
  delete v.planId;
  delete v.vigenteDesde;
  return v;
}

/** Las tres entradas que escriben una versión: crear, editar (inmediato o programado) y la versión guardada. */
function lasTres(extra: Record<string, unknown>) {
  return [
    ["crear", crearPlanSchema.safeParse(crear(extra))],
    ["editar", editarPlanSchema.safeParse(editar({ ...extra, vigenteDesde: "2026-12-01" }))],
    ["versión", versionPlanSchema.safeParse(version(extra))],
  ] as const;
}

function rutasDelError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return r.error?.issues.map((i) => i.path.map(String).join(".")) ?? [];
}

describe("SLT-83 R1 — tres estados del costo por orden: fijo, porcentual o vacío", () => {
  it.each([
    ["fijo", { costoPorOrden: "100.00", costoPorOrdenPorcentual: null }],
    ["porcentual con mínimo", { costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" } }],
    ["porcentual sin mínimo", { costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.35", minimo: null } }],
    ["vacío", { costoPorOrden: null, costoPorOrdenPorcentual: null }],
  ])("%s entra al crear, al editar y en una versión programada", (_caso, extra) => {
    for (const [nombre, r] of lasTres(extra)) expect(r.success, nombre).toBe(true);
  });

  it("el porcentual llega tal cual al servicio (texto, sin pasar por Number)", () => {
    const r = crearPlanSchema.safeParse(crear({ costoPorOrdenPorcentual: { porcentaje: "2.35", minimo: "500.5" } }));
    expect(r.data?.costoPorOrdenPorcentual).toEqual({ porcentaje: "2.35", minimo: "500.5" });
  });

  it("fijo y porcentual a la vez es validation_error en costoPorOrdenPorcentual, en las tres entradas", () => {
    for (const [nombre, r] of lasTres({ costoPorOrden: "100.00", costoPorOrdenPorcentual: { porcentaje: "2", minimo: null } })) {
      expect(r.success, nombre).toBe(false);
      expect(rutasDelError(r), nombre).toContain("costoPorOrdenPorcentual");
    }
  });

  it("la clave ausente es validation_error: un formulario viejo no lo borra en silencio", () => {
    const sinClave = crear();
    delete (sinClave as Record<string, unknown>).costoPorOrdenPorcentual;
    const r = crearPlanSchema.safeParse(sinClave);
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("costoPorOrdenPorcentual");
  });

  it("un importe fijo dentro del porcentual (claves de otro modo) es validation_error", () => {
    const r = crearPlanSchema.safeParse(crear({ costoPorOrdenPorcentual: { porcentaje: "2", minimo: null, monto: "100" } }));
    expect(r.success).toBe(false);
    expect(rutasDelError(r).some((p) => p.startsWith("costoPorOrdenPorcentual"))).toBe(true);
  });
});

describe("SLT-83 R2 — el porcentaje: texto con hasta dos decimales, > 0 y ≤ 100", () => {
  it.each(["0.01", "2", "2.35", "100", "100.00"])("%s entra", (porcentaje) => {
    for (const [nombre, r] of lasTres({ costoPorOrdenPorcentual: { porcentaje, minimo: null } })) {
      expect(r.success, `${nombre} ${porcentaje}`).toBe(true);
    }
  });

  it.each([
    ["cero", "0"],
    ["cero con decimales", "0.00"],
    ["más de 100", "100.01"],
    ["tres decimales", "2.355"],
    ["negativo", "-1"],
    ["vacío", ""],
    ["número en vez de texto", 2],
    ["null", null],
  ])("%s → validation_error en costoPorOrdenPorcentual.porcentaje", (_caso, porcentaje) => {
    for (const [nombre, r] of lasTres({ costoPorOrdenPorcentual: { porcentaje, minimo: null } })) {
      expect(r.success, nombre).toBe(false);
      expect(rutasDelError(r), nombre).toContain("costoPorOrdenPorcentual.porcentaje");
    }
  });

  it("el porcentaje es el mismo esquema que el descuento anual (una sola definición del rango)", () => {
    expect(porcentajeSchema.safeParse("100").success).toBe(true);
    expect(porcentajeSchema.safeParse("100.01").success).toBe(false);
    const anual = crearPlanSchema.safeParse(
      crear({ precio: { tipo: "monto", mensual: "1.00", anual: { tipo: "descuento", porcentaje: "100.01" } } }),
    );
    expect(anual.success).toBe(false);
  });
});

describe("SLT-83 R2 — el mínimo: importe ≥ 0 de DECIMAL(12,2), opcional", () => {
  it.each(["0", "500", "500.5", "9999999999.99"])("%s entra", (minimo) => {
    for (const [nombre, r] of lasTres({ costoPorOrdenPorcentual: { porcentaje: "2", minimo } })) {
      expect(r.success, `${nombre} ${minimo}`).toBe(true);
    }
  });

  it("un mínimo vacío (null) es válido: sin piso", () => {
    expect(costoPorOrdenPorcentualSchema.safeParse({ porcentaje: "2", minimo: null }).success).toBe(true);
  });

  it.each([
    ["negativo", "-1"],
    ["tres decimales", "1.005"],
    ["no cabe en DECIMAL(12,2)", "10000000000"],
    ["texto vacío", ""],
    ["número en vez de texto", 500],
  ])("%s → validation_error en costoPorOrdenPorcentual.minimo", (_caso, minimo) => {
    for (const [nombre, r] of lasTres({ costoPorOrdenPorcentual: { porcentaje: "2", minimo } })) {
      expect(r.success, nombre).toBe(false);
      expect(rutasDelError(r), nombre).toContain("costoPorOrdenPorcentual.minimo");
    }
  });

  it("la clave del mínimo es obligatoria: vacío se manda como null", () => {
    const r = costoPorOrdenPorcentualSchema.safeParse({ porcentaje: "2" });
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("minimo");
  });
});
