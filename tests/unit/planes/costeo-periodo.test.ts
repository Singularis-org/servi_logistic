import { describe, expect, it } from "vitest";

import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { CostoVigente } from "@/lib/types/consumo-plan";
import type { PrecioPlan, VersionPlan } from "@/lib/types/planes";

// SLT-86 (design §4, §6; R7, R28) — el total estimado del período de «Mi plan» y del detalle de empresa:
// el costo base del período en curso (o de su tramo), con su descuento y con el precio de cuando empezó
// el período, más las órdenes del período por el costo por orden (fijo) o lo cobrado en el período
// (porcentual). Sin el aviso de que el anual no aplica al costo.

const MENSUAL_31000: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: {} };
const FIJO: CostoVigente = { modo: "fijo", monto: "100.00", fuente: "plan" };
const PORCENTUAL: CostoVigente = { modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" };

const VIGENTE: VersionPlan = {
  nombre: "Pro",
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: MENSUAL_31000,
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
};

/** Las 00:00 de la plataforma de ese día (−06:00). */
const entrada = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
/** Mediodía de la plataforma. */
const dia = (fecha: string) => new Date(`${fecha}T18:00:00.000Z`);

function leido(cambios: Partial<PlanConUsoLeido> = {}): PlanConUsoLeido {
  return {
    vigente: VIGENTE,
    entrada: entrada("2026-01-01"),
    precioDelPeriodo: MENSUAL_31000,
    pendiente: null,
    uso: { ordenes: 3, apiKeys: 0, porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente: FIJO,
    cobroCiclo: { cobrado: "0.00", pendientes: 0 },
    tipoCobro: "mensual",
    ...cambios,
  };
}

describe("R28 — modo fijo: costo base del período + órdenes del período × costo por orden", () => {
  it("período completo: 31 000 + 3 × 100 = 31 300.00", () => {
    const p = planConConsumo(leido(), dia("2026-10-20"));
    expect(p.costeo).toEqual({
      modo: "fijo",
      base: { tipo: "monto", periodo: "31000.00" },
      sinCostoConcreto: false,
      costoPorOrden: "100.00",
      fuente: "plan",
      ordenes: 3,
      subtotalOrdenes: "300.00",
      total: "31300.00",
    });
  });

  it("tramo: con la entrada el 10 de octubre la base es 22/31 del mes (22 000.00)", () => {
    const p = planConConsumo(leido({ entrada: entrada("2026-10-10") }), dia("2026-10-20"));
    expect(p.costeo).toMatchObject({ base: { tipo: "monto", periodo: "22000.00" }, total: "22300.00" });
    expect(p.cobro).toMatchObject({ periodo: { desde: "2026-10-10", hasta: "2026-10-31", esTramo: true }, costo: "22000.00" });
  });

  it("el período de otro tipo con su descuento: anual 372 000 − 10 % = 334 800 + 300", () => {
    const precio: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } };
    const p = planConConsumo(leido({ tipoCobro: "anual", precioDelPeriodo: precio, vigente: { ...VIGENTE, precio } }), dia("2026-10-20"));
    expect(p.costeo).toMatchObject({ base: { tipo: "monto", periodo: "334800.00" }, total: "335100.00" });
  });

  it("R15: la base sale del precio de cuando empezó el período, no del vigente hoy", () => {
    const nuevo: PrecioPlan = { tipo: "monto", mensual: "40000.00", descuentos: {} };
    const p = planConConsumo(leido({ vigente: { ...VIGENTE, precio: nuevo } }), dia("2026-10-20"));
    expect(p.costeo).toMatchObject({ base: { tipo: "monto", periodo: "31000.00" }, total: "31300.00" });
    // El precio que se pinta como «Costo base» del plan sí es el vigente.
    expect(p.precioTexto).toContain("40000.00");
  });

  it("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28–R29): sin costo base cuesta como base 0, con total", () => {
    const p = planConConsumo(leido({ precioDelPeriodo: { tipo: "sin_precio" } }), dia("2026-10-20"));
    expect(p.costeo).toMatchObject({ base: { tipo: "monto", periodo: "0.00" }, subtotalOrdenes: "300.00", total: "300.00" });
    expect(p.cobro.costo).toBe("0.00");
  });

  it("ya no hay aviso de que el anual no aplica al costo", () => {
    const p = planConConsumo(leido({ tipoCobro: "anual" }), dia("2026-10-20"));
    expect(p.costeo).not.toHaveProperty("anualNoAplicaAlCosto");
  });
});

describe("R7 — las órdenes del período son las del uso, sin tope, y son las mismas que suma el total", () => {
  it("`ordenesDelPeriodo` y `costeo.ordenes` son el mismo conteo y no hay fila de órdenes", () => {
    const p = planConConsumo(leido({ uso: { ordenes: 1234, apiKeys: 0, porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 } } }), dia("2026-10-20"));
    expect(p.ordenesDelPeriodo).toBe(1234);
    expect(p.costeo).toMatchObject({ modo: "fijo", ordenes: 1234, subtotalOrdenes: "123400.00" });
    expect(p.filas.map((f) => f.clave)).not.toContain("ordenes");
  });

  it("el reinicio cuenta hasta el siguiente período de calendario y el siguiente cobro es ese mismo día", () => {
    const p = planConConsumo(leido({ tipoCobro: "quincenal" }), dia("2026-10-10"));
    expect(p.reinicio).toEqual({ dias: 6, fecha: "2026-10-16" });
    expect(p.cobro.siguienteCobro).toBe("2026-10-16");
  });

  it("con un pendiente, el siguiente cobro es su fecha de efecto", () => {
    const pendiente = { planNombre: "Max", tipo: "bimestral" as const, desde: "2026-10-25" };
    const p = planConConsumo(leido({ pendiente }), dia("2026-10-20"));
    expect(p.cobro).toMatchObject({ siguienteCobro: "2026-10-25", pendiente });
  });
});

describe("R28 — modo porcentual: costo base del período + lo cobrado en el período", () => {
  const conPorcentual = (cambios: Partial<PlanConUsoLeido> = {}) =>
    leido({
      vigente: { ...VIGENTE, costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: "500.00" } },
      costoVigente: PORCENTUAL,
      cobroCiclo: { cobrado: "2500.00", pendientes: 2 },
      ...cambios,
    });

  it("período completo: 31 000 + 2 500 = 33 500.00, con los pendientes solo contados", () => {
    const p = planConConsumo(conPorcentual(), dia("2026-10-20"));
    expect(p.costeo).toEqual({
      modo: "porcentual",
      base: { tipo: "monto", periodo: "31000.00" },
      sinCostoConcreto: false,
      porcentaje: "2.00",
      minimo: "500.00",
      cobrado: "2500.00",
      pendientes: 2,
      total: "33500.00",
    });
  });

  it("tramo quincenal con entrada el 10: 6/15 de 15 500 = 6 200 + lo cobrado", () => {
    const p = planConConsumo(conPorcentual({ tipoCobro: "quincenal", entrada: entrada("2026-10-10") }), dia("2026-10-12"));
    expect(p.costeo).toMatchObject({ base: { tipo: "monto", periodo: "6200.00" }, total: "8700.00" });
  });

  it("lo cobrado negativo resta; sin costo base la base es 0 (SLT-99, decisión del 2026-11-10)", () => {
    const negativo = planConConsumo(conPorcentual({ cobroCiclo: { cobrado: "-500.00", pendientes: 0 } }), dia("2026-10-20"));
    expect(negativo.costeo.total).toBe("30500.00");
    const sinBase = planConConsumo(conPorcentual({ precioDelPeriodo: { tipo: "sin_precio" } }), dia("2026-10-20"));
    expect(sinBase.costeo).toMatchObject({ base: { tipo: "monto", periodo: "0.00" }, cobrado: "2500.00", total: "2500.00" });
  });
});
