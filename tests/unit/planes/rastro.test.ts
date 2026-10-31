import { describe, expect, it } from "vitest";

import { diferenciasDelPlan, hayCambios, importeCanonico } from "@/lib/planes/rastro";
import type { PlanDTO } from "@/lib/types/planes";

// SL-24 (design §2.8, §5) — el diff que va a `plan_rastro.cambios`: solo lo que cambió, comparado en
// forma canónica, con los importes como texto con dos decimales.

const BASE: PlanDTO = {
  id: "p1",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3, admin: 1 }, apiKeys: 2 },
  modulos: ["ranking", "analitica"],
  precio: { tipo: "monto", mensual: "25000", anual: { tipo: "descuento", porcentaje: "10" } },
  archivado: false,
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
};

describe("SL-24 — diferenciasDelPlan", () => {
  it("al crear salen todos los campos con antes null, y los importes como texto con dos decimales", () => {
    expect(diferenciasDelPlan(null, BASE)).toEqual({
      nombre: { antes: null, despues: "Básico" },
      topes: { antes: null, despues: { ordenesPorCiclo: 100, porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 } },
      modulos: { antes: null, despues: ["analitica", "ranking"] },
      precio: {
        antes: null,
        despues: { tipo: "monto", mensual: "25000.00", anual: { tipo: "descuento", porcentaje: "10.00" } },
      },
      costoPorOrden: { antes: null, despues: null }, // SLT-66 R8: al crear también sale el costo por orden.
      archivado: { antes: null, despues: false },
    });
  });

  it("sin cambios reales da vacío: orden de módulos, orden de claves y «10» frente a «10.00» no cuentan", () => {
    const igual: PlanDTO = {
      ...BASE,
      topes: { ordenesPorCiclo: 100, porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
      modulos: ["analitica", "ranking"],
      precio: { tipo: "monto", mensual: "25000.00", anual: { tipo: "descuento", porcentaje: "10.0" } },
    };
    const d = diferenciasDelPlan(BASE, igual);
    expect(d).toEqual({});
    expect(hayCambios(d)).toBe(false);
  });

  it.each([
    ["nombre", { nombre: "Pro" }, { antes: "Básico", despues: "Pro" }],
    [
      "topes",
      { topes: { ordenesPorCiclo: 50, porRol: { adminTienda: 3, admin: 1 }, apiKeys: 2 } },
      {
        antes: { ordenesPorCiclo: 100, porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
        despues: { ordenesPorCiclo: 50, porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
      },
    ],
    ["modulos", { modulos: ["monitoreo"] }, { antes: ["analitica", "ranking"], despues: ["monitoreo"] }],
    [
      "precio",
      { precio: { tipo: "negociable" } },
      {
        antes: { tipo: "monto", mensual: "25000.00", anual: { tipo: "descuento", porcentaje: "10.00" } },
        despues: { tipo: "negociable" },
      },
    ],
    ["archivado", { archivado: true }, { antes: false, despues: true }],
  ] as const)("cambiar solo %s da solo ese campo, con antes y despues", (campo, cambio, esperado) => {
    expect(diferenciasDelPlan(BASE, { ...BASE, ...cambio } as PlanDTO)).toEqual({ [campo]: esperado });
  });

  it("quitar el tope de un rol es un cambio de topes", () => {
    const d = diferenciasDelPlan(BASE, { ...BASE, topes: { ...BASE.topes, porRol: { admin: 1 } } });
    expect(Object.keys(d)).toEqual(["topes"]);
  });

  it("importeCanonico no pasa por Number: ceros a la izquierda fuera y dos decimales", () => {
    expect(importeCanonico("007.5")).toBe("7.50");
    expect(importeCanonico("0")).toBe("0.00");
    expect(importeCanonico("9999999999.99")).toBe("9999999999.99");
    expect(importeCanonico("10.1")).toBe("10.10");
  });
});
