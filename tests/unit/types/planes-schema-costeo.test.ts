import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { crearPlanSchema, editarPlanSchema, ROLES_CON_TOPE, versionPlanSchema } from "@/lib/types/planes";

// SLT-66 (design §4.1; R1, R7, R8) — el borde del plan: sin tope de maestro y con costo por orden.

const PLAN = randomUUID();
const TOPES = { ordenesPorCiclo: 100, porRol: { admin: 2 }, apiKeys: 2 };

const BASES = [
  { tipo: "sin_precio" },
  { tipo: "negociable" },
  { tipo: "monto", mensual: "50000.00", anual: { tipo: "descuento", porcentaje: "10" } },
] as const;

function crear(extra: Record<string, unknown> = {}) {
  return {
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: TOPES,
    modulos: [],
    precio: { tipo: "sin_precio" },
    costoPorOrden: "100",
    ...extra,
  };
}

function editar(extra: Record<string, unknown> = {}) {
  return {
    planId: PLAN,
    nombre: "Básico",
    topes: TOPES,
    modulos: [],
    precio: { tipo: "negociable" },
    costoPorOrden: null,
    vigenteDesde: null,
    ...extra,
  };
}

function rutasDelError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return r.error?.issues.map((i) => i.path.map(String).join(".")) ?? [];
}

describe("SLT-66 R1 — el maestro no admite tope", () => {
  it("ROLES_CON_TOPE ya no nombra a maestro y los otros cuatro siguen", () => {
    expect(ROLES_CON_TOPE).toEqual(["admin", "mensajero", "adminTienda", "adminSatelite"]);
  });

  it("porRol.maestro es validation_error al crear, al editar y en una versión programada", () => {
    const topes = { ...TOPES, porRol: { maestro: 3 } };
    for (const r of [
      crearPlanSchema.safeParse(crear({ topes })),
      editarPlanSchema.safeParse(editar({ topes, vigenteDesde: "2026-12-01" })),
      versionPlanSchema.safeParse({ nombre: "X", topes, modulos: [], precio: { tipo: "sin_precio" }, costoPorOrden: null }),
    ]) {
      expect(r.success).toBe(false);
      expect(rutasDelError(r).some((p) => p.startsWith("topes.porRol"))).toBe(true);
    }
  });
});

describe("SLT-66 R7 — costo por orden opcional e independiente de la base", () => {
  it.each(BASES)("con base %o entra con costo y sin él", (precio) => {
    for (const costoPorOrden of ["100", "0", "12.50", null]) {
      const creado = crearPlanSchema.safeParse(crear({ precio, costoPorOrden }));
      expect(creado.success, `crear ${String(costoPorOrden)}`).toBe(true);
      expect(creado.data?.costoPorOrden).toBe(costoPorOrden);
      expect(editarPlanSchema.safeParse(editar({ precio, costoPorOrden })).success).toBe(true);
    }
  });
});

describe("SLT-66 R8 — el costo por orden es un importe ≥ 0 con hasta dos decimales, como texto", () => {
  it.each([
    ["negativo", "-1"],
    ["tres decimales", "1.005"],
    ["número en vez de texto", 100],
    ["texto vacío", ""],
    ["letras", "cien"],
  ])("%s → validation_error en costoPorOrden", (_caso, costoPorOrden) => {
    for (const r of [
      crearPlanSchema.safeParse(crear({ costoPorOrden })),
      editarPlanSchema.safeParse(editar({ costoPorOrden })),
    ]) {
      expect(r.success).toBe(false);
      expect(rutasDelError(r)).toContain("costoPorOrden");
    }
  });

  it("vacío es null y se acepta", () => {
    expect(crearPlanSchema.safeParse(crear({ costoPorOrden: null })).success).toBe(true);
    expect(editarPlanSchema.safeParse(editar({ costoPorOrden: null })).success).toBe(true);
  });

  it("la clave ausente es validation_error: un formulario viejo no lo borra en silencio", () => {
    const sinClaveCrear = crear();
    delete (sinClaveCrear as Record<string, unknown>).costoPorOrden;
    const sinClaveEditar = editar();
    delete (sinClaveEditar as Record<string, unknown>).costoPorOrden;
    for (const r of [crearPlanSchema.safeParse(sinClaveCrear), editarPlanSchema.safeParse(sinClaveEditar)]) {
      expect(r.success).toBe(false);
      expect(rutasDelError(r)).toContain("costoPorOrden");
    }
  });
});
