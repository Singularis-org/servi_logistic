import { describe, expect, it } from "vitest";

import { cambioPendienteDelPlan } from "@/lib/planes/consumo";
import { lineasDeCambioDelPlan, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { diferenciasDelPlan, hayCambios } from "@/lib/planes/rastro";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-86 (design §5.4; R30, R31) — el rastro del plan con los descuentos del período: cada descuento en
// su clave `descuento_<periodo>` con su antes y su después, y las líneas de «qué cambia» del detalle, de
// «Mi plan» y del correo. Las filas que ya existen (anual, tope de órdenes) se siguen pintando.

const PLAN: PlanDTO = {
  id: "p1",
  nombre: "Pro",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { admin: 2 }, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000.00", descuentos: { bimestral: { tipo: "monto", monto: "5000" } } },
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
  archivado: false,
};

const lineas = (antes: PlanDTO, despues: PlanDTO) =>
  lineasDeCambioDelPlan(diferenciasDelPlan(antes, despues) as CambioDelPlanParaCorreo);

describe("R31 — cada descuento real deja su antes y su después en el rastro", () => {
  it("añadir un descuento anual: solo su clave, sin tocar `precio` ni los demás", () => {
    const despues: PlanDTO = {
      ...PLAN,
      precio: { tipo: "monto", mensual: "50000", descuentos: { bimestral: { tipo: "monto", monto: "5000.00" }, anual: { tipo: "porcentaje", porcentaje: "10" } } },
    };
    expect(diferenciasDelPlan(PLAN, despues)).toEqual({
      descuento_anual: { antes: null, despues: { tipo: "porcentaje", porcentaje: "10.00" } },
    });
  });

  it("cambiar de monto a porcentaje y quitar uno son dos cambios del mismo descuento", () => {
    const aPorcentaje: PlanDTO = { ...PLAN, precio: { tipo: "monto", mensual: "50000.00", descuentos: { bimestral: { tipo: "porcentaje", porcentaje: "5" } } } };
    expect(diferenciasDelPlan(PLAN, aPorcentaje)).toEqual({
      descuento_bimestral: { antes: { tipo: "monto", monto: "5000.00" }, despues: { tipo: "porcentaje", porcentaje: "5.00" } },
    });
    const sinDescuento: PlanDTO = { ...PLAN, precio: { tipo: "monto", mensual: "50000.00", descuentos: {} } };
    expect(diferenciasDelPlan(PLAN, sinDescuento)).toEqual({
      descuento_bimestral: { antes: { tipo: "monto", monto: "5000.00" }, despues: null },
    });
  });

  it("una edición sin cambios no escribe: «5000» y «5000.00» y el orden de las claves no cuentan", () => {
    const igual: PlanDTO = { ...PLAN, precio: { tipo: "monto", mensual: "50000", descuentos: { bimestral: { tipo: "monto", monto: "5000.00" } } } };
    const d = diferenciasDelPlan(PLAN, igual);
    expect(d).toEqual({});
    expect(hayCambios(d)).toBe(false);
  });

  it("R11: pasar a «sin precio» cambia el costo base y deja el descuento en null", () => {
    expect(diferenciasDelPlan(PLAN, { ...PLAN, precio: { tipo: "sin_precio" } })).toEqual({
      precio: { antes: { tipo: "monto", mensual: "50000.00" }, despues: { tipo: "sin_precio" } },
      descuento_bimestral: { antes: { tipo: "monto", monto: "5000.00" }, despues: null },
    });
  });

  it("al crear, el rastro trae los cuatro descuentos, con null los que no hay", () => {
    const d = diferenciasDelPlan(null, PLAN);
    expect(d.descuento_bimestral).toEqual({ antes: null, despues: { tipo: "monto", monto: "5000.00" } });
    expect(d.descuento_quincenal).toEqual({ antes: null, despues: null });
    expect(d.descuento_anual).toEqual({ antes: null, despues: null });
    expect(d.precio).toEqual({ antes: null, despues: { tipo: "monto", mensual: "50000.00" } });
  });

  it("los topes ya no llevan órdenes por ciclo", () => {
    expect(diferenciasDelPlan(null, PLAN).topes).toEqual({ antes: null, despues: { porRol: { admin: 2 }, apiKeys: null } });
  });
});

describe("R31 — las líneas de «qué cambia» (detalle, «Mi plan» y correo) suman los descuentos", () => {
  it("un descuento por línea, con «sin descuento» del lado vacío, en el orden de los tipos", () => {
    const despues: PlanDTO = {
      ...PLAN,
      precio: {
        tipo: "monto",
        mensual: "60000",
        descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" }, quincenal: { tipo: "monto", monto: "100" } },
      },
    };
    expect(lineas(PLAN, despues)).toEqual([
      "Costo base: 50000.00 / mes → 60000.00 / mes",
      "Descuento quincenal: sin descuento → 100.00",
      "Descuento bimestral: 5000.00 → sin descuento",
      "Descuento anual: sin descuento → 10.00 %",
    ]);
  });

  it("el cambio programado de «Mi plan» pinta las mismas líneas", () => {
    const vigente = {
      nombre: PLAN.nombre,
      topes: PLAN.topes,
      modulos: PLAN.modulos,
      precio: PLAN.precio,
      costoPorOrden: PLAN.costoPorOrden,
      costoPorOrdenPorcentual: PLAN.costoPorOrdenPorcentual,
    };
    const version = { ...vigente, precio: { tipo: "monto" as const, mensual: "50000.00", descuentos: { bimestral: { tipo: "porcentaje" as const, porcentaje: "7.5" } } } };
    const vista = cambioPendienteDelPlan(vigente, { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version });
    expect(vista).toEqual({ vigenteDesde: "2026-12-01", lineas: ["Descuento bimestral: 5000.00 → 7.50 %"] });
  });

  it("ningún cambio nuevo habla de órdenes", () => {
    const todo: PlanDTO = { ...PLAN, nombre: "Max", topes: { porRol: {}, apiKeys: 3 }, precio: { tipo: "sin_precio" } };
    expect(lineas(PLAN, todo).some((l) => /órdenes/i.test(l))).toBe(false);
  });
});

describe("R30 — las filas que ya existen se pintan tal cual", () => {
  it("el `precio` de antes con el anual fijo o con el descuento anual", () => {
    expect(
      lineasDeCambioDelPlan({
        precio: {
          antes: { tipo: "monto", mensual: "1000.00", anual: { tipo: "fijo", monto: "10000.00" } },
          despues: { tipo: "monto", mensual: "1000.00", anual: { tipo: "descuento", porcentaje: "15.00" } },
        },
      }),
    ).toEqual(["Costo base: 1000.00 / mes · 10000.00 al año → 1000.00 / mes · con 15.00 % de descuento en el pago anual"]);
  });

  it("los topes de antes con órdenes por ciclo", () => {
    expect(
      lineasDeCambioDelPlan({
        topes: {
          antes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
          despues: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
        },
      }),
    ).toEqual(["Órdenes por ciclo: 100 → sin límite"]);
  });

  it("R34: la fila `editado` de la migración que retiró el tope de órdenes", () => {
    expect(lineasDeCambioDelPlan({ tope_ordenes_ciclo: { antes: "250", despues: null } })).toEqual([
      "Órdenes por ciclo: 250 → sin límite",
    ]);
  });
});
