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
  topes: { porRol: { adminTienda: 3, admin: 1 }, apiKeys: 2 },
  modulos: ["ranking", "analitica"],
  precio: { tipo: "monto", mensual: "25000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  archivado: false,
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
};

describe("SL-24 — diferenciasDelPlan", () => {
  it("al crear salen todos los campos con antes null, y los importes como texto con dos decimales", () => {
    expect(diferenciasDelPlan(null, BASE)).toEqual({
      nombre: { antes: null, despues: "Básico" },
      topes: { antes: null, despues: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 } },
      modulos: { antes: null, despues: ["analitica", "ranking"] },
      // SLT-86 (R31): el costo base mensual en `precio` y cada descuento en su clave.
      precio: { antes: null, despues: { tipo: "monto", mensual: "25000.00" } },
      descuento_quincenal: { antes: null, despues: null },
      descuento_mensual: { antes: null, despues: null },
      descuento_bimestral: { antes: null, despues: null },
      descuento_anual: { antes: null, despues: { tipo: "porcentaje", porcentaje: "10.00" } },
      costoPorOrden: { antes: null, despues: null }, // SLT-66 R8: al crear también sale el costo por orden.
      costoPorOrdenPorcentual: { antes: null, despues: null }, // SLT-83: campo nuevo del rastro; el alta lo registra como los demás.
      periodicidadOrdenes: { antes: null, despues: "quincenal" }, // SLT-118 R35: campo nuevo del rastro; el alta lo registra.
      archivado: { antes: null, despues: false },
    });
  });

  it("sin cambios reales da vacío: orden de módulos, orden de claves y «10» frente a «10.00» no cuentan", () => {
    const igual: PlanDTO = {
      ...BASE,
      topes: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
      modulos: ["analitica", "ranking"],
      precio: { tipo: "monto", mensual: "25000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.0" } } },
    };
    const d = diferenciasDelPlan(BASE, igual);
    expect(d).toEqual({});
    expect(hayCambios(d)).toBe(false);
  });

  it.each([
    ["nombre", { nombre: "Pro" }, { antes: "Básico", despues: "Pro" }],
    [
      "topes",
      { topes: { porRol: { adminTienda: 3, admin: 1 }, apiKeys: 5 } },
      {
        antes: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
        despues: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 5 },
      },
    ],
    ["modulos", { modulos: ["monitoreo"] }, { antes: ["analitica", "ranking"], despues: ["monitoreo"] }],
    [
      "precio",
      { precio: { tipo: "monto", mensual: "30000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } } },
      { antes: { tipo: "monto", mensual: "25000.00" }, despues: { tipo: "monto", mensual: "30000.00" } },
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
