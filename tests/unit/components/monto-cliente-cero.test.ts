import { describe, it, expect } from "vitest";

import {
  esMontoCero,
  montoValido,
  montoValidoOCero,
} from "@/components/shared/monto-cliente";
import { esMontoCero as esMontoCeroReexportado } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";

// SLT-96 «Consolidación de ₡0 no se puede marcar recibida» (R11) — los dos lectores TEXTUALES
// del cero que usa el diálogo de «Marcar recibido»: `esMontoCero` lee lo DECLARADO y
// `montoValidoOCero` decide si el monto TECLEADO tiene forma cuando lo declarado es 0. Las
// expectativas son literales escritos a mano, nunca calculados con la función bajo prueba.

describe("esMontoCero (promovido a components/shared/monto-cliente)", () => {
  it.each(["0", "0.0", "0.00", "-0.00", " 0.00 "])("%j es cero", (monto) => {
    expect(esMontoCero(monto)).toBe(true);
  });

  it.each(["0.01", "10", "", "5000.00", "-0.01", "abc"])("%j NO es cero", (monto) => {
    expect(esMontoCero(monto)).toBe(false);
  });

  it("cierre-detalle-shared la re-exporta: es la MISMA función, no una copia", () => {
    expect(esMontoCeroReexportado).toBe(esMontoCero);
  });
});

describe("montoValidoOCero (la forma de montoValido sin exigir > 0)", () => {
  it.each(["0", "0.0", "0.00", "10", "0.01", "485.00", " 0.00 "])("%j tiene forma válida", (monto) => {
    expect(montoValidoOCero(monto)).toBe(true);
  });

  it.each(["", "-0.00", "0.000", "-5", "abc", "1,5", "0."])("%j NO tiene forma válida", (monto) => {
    expect(montoValidoOCero(monto)).toBe(false);
  });

  it("montoValido sigue rechazando el cero: el 0 solo se admite por la otra función", () => {
    expect(montoValido("0")).toBe(false);
    expect(montoValido("0.00")).toBe(false);
  });
});
