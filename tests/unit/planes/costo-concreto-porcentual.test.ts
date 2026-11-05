import { describe, expect, it } from "vitest";

import { tieneCostoConcreto } from "@/lib/planes/costo-concreto";
import type { PrecioPlan } from "@/lib/types/planes";

// SLT-83 (design §4.2; R5) — un plan porcentual tiene costo concreto con base «monto» y porcentaje, con o
// sin mínimo. La forma, no el importe: es la definición de SLT-66 R28 con un modo más.

const MONTO: PrecioPlan = { tipo: "monto", mensual: "50000.00", anual: null };
const SIN_PRECIO: PrecioPlan = { tipo: "sin_precio" };

describe("SLT-83 R5 — tieneCostoConcreto con el modo porcentual", () => {
  it.each([
    ["con mínimo", { porcentaje: "2.00", minimo: "500.00" }],
    ["sin mínimo", { porcentaje: "2.00", minimo: null }],
    ["con mínimo 0.00", { porcentaje: "0.01", minimo: "0.00" }],
  ])("base monto y porcentaje %s → concreto", (_caso, costoPorOrdenPorcentual) => {
    expect(tieneCostoConcreto({ precio: MONTO, costoPorOrden: null, costoPorOrdenPorcentual })).toBe(true);
  });

  it("base «sin precio» y porcentaje → no concreto", () => {
    expect(
      tieneCostoConcreto({ precio: SIN_PRECIO, costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: "500.00" } }),
    ).toBe(false);
  });

  it("base mensual 0.00 y porcentaje → concreto (mira la forma, no el importe)", () => {
    expect(
      tieneCostoConcreto({
        precio: { tipo: "monto", mensual: "0.00", anual: null },
        costoPorOrden: null,
        costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: null },
      }),
    ).toBe(true);
  });

  it("base monto sin fijo ni porcentual → no concreto; el fijo sigue como en SLT-66", () => {
    expect(tieneCostoConcreto({ precio: MONTO, costoPorOrden: null, costoPorOrdenPorcentual: null })).toBe(false);
    expect(tieneCostoConcreto({ precio: MONTO, costoPorOrden: "100.00", costoPorOrdenPorcentual: null })).toBe(true);
  });
});
