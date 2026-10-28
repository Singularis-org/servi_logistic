import { describe, it, expect } from "vitest";

import {
  MENSAJE_MONTO_COBRO_INVALIDO,
  fijarCobroEmpresaSchema,
  fijarCobroGlobalSchema,
  montoCobroSchema,
} from "@/lib/types/cobro-plataforma";

// SL-40 R4 — el importe del cobro por orden: texto, mayor o igual que cero, dos decimales como
// máximo y dentro de DECIMAL(12,2). Los literales de abajo SON el contrato (el tope de 10 cifras
// enteras sale de la columna, no del schema), así que no se derivan de la regex.

describe("SL-40 R4 — montoCobroSchema", () => {
  it.each(["0", "0.00", "500", "500.5", "500.00", "9999999999.99", "0000000001"])("acepta %s", (monto) => {
    expect(montoCobroSchema.safeParse(monto)).toEqual({ success: true, data: monto });
  });

  it.each([
    ["un negativo", "-1"],
    ["un negativo con decimales", "-0.01"],
    ["tres decimales", "500.001"],
    ["el punto sin decimales", "500."],
    ["once cifras enteras (no cabe en DECIMAL(12,2))", "10000000000"],
    ["once cifras enteras con decimales", "10000000000.00"],
    ["vacío", ""],
    ["espacios alrededor", " 500 "],
    ["coma decimal", "500,00"],
    ["notación científica", "5e2"],
    ["texto", "quinientos"],
    ["signo más", "+500"],
  ])("rechaza %s", (_caso, monto) => {
    const r = montoCobroSchema.safeParse(monto);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(MENSAJE_MONTO_COBRO_INVALIDO);
  });

  it.each([
    ["un número", 500],
    ["null", null],
    ["undefined", undefined],
  ])("rechaza %s: el importe viaja como texto, nunca como número", (_caso, monto) => {
    expect(montoCobroSchema.safeParse(monto).success).toBe(false);
  });
});

describe("SL-40 R4/R5 — los schemas de las dos escrituras", () => {
  it("el global exige monto, y no admite null (no hay «quitar el global»)", () => {
    expect(fijarCobroGlobalSchema.safeParse({ monto: "600.00" }).success).toBe(true);
    expect(fijarCobroGlobalSchema.safeParse({ monto: null }).success).toBe(false);
    expect(fijarCobroGlobalSchema.safeParse({}).success).toBe(false);
  });

  it("la excepción admite null para quitarla (R5) y exige la empresa", () => {
    expect(fijarCobroEmpresaSchema.safeParse({ organizacionId: "org-1", monto: null }).success).toBe(true);
    expect(fijarCobroEmpresaSchema.safeParse({ organizacionId: "org-1", monto: "300.00" }).success).toBe(true);
    expect(fijarCobroEmpresaSchema.safeParse({ organizacionId: "", monto: "300.00" }).success).toBe(false);
    expect(fijarCobroEmpresaSchema.safeParse({ monto: "300.00" }).success).toBe(false);
  });

  it("el error de la excepción sale por el campo `monto`", () => {
    const r = fijarCobroEmpresaSchema.safeParse({ organizacionId: "org-1", monto: "-5" });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors).toEqual({ monto: [MENSAJE_MONTO_COBRO_INVALIDO] });
  });
});
