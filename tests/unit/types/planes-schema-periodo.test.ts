import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  TIPOS_COBRO,
  asignarPlanSchema,
  cambiarTipoCobroSchema,
  cancelarCambioEmpresaSchema,
  crearPlanSchema,
  editarPlanSchema,
  precioPlanSchema,
  topesPlanSchema,
  versionPlanSchema,
} from "@/lib/types/planes";

// SLT-86 (design §2; R1, R8, R10, R11, R16, R22) — el borde de los tipos de cobro, los descuentos por
// período, la retirada del tope de órdenes y la fecha de efecto. Lo que necesita el reloj o la empresa
// (rango de R16, «≥ hoy» de R22, si la empresa ya tiene plan) lo mira el servicio, no este esquema.

const EMPRESA = randomUUID();
const PLAN = randomUUID();
const TOPES = { porRol: { adminTienda: 3 }, apiKeys: 2 };

/** Las claves de error con la forma de `erroresDeCampo` de `PlanesService`. */
function camposConError(r: { success: boolean; error?: z.ZodError }): string[] {
  if (r.success || !r.error) return [];
  return [...new Set(r.error.issues.map((i) => i.path.join(".")))];
}

function crear(extra: Record<string, unknown> = {}) {
  return {
    nombre: "Pro",
    visibilidad: "publico",
    organizacionId: null,
    topes: TOPES,
    modulos: [],
    precio: { tipo: "monto", mensual: "50000.00", descuentos: {} },
    costoPorOrden: null,
    costoPorOrdenPorcentual: null,
    ...extra,
  };
}

/** Lo editable de un plan: la `version` de un cambio programado (§16.1 de SLT-58). */
function version(extra: Record<string, unknown> = {}) {
  return {
    nombre: "Pro",
    topes: TOPES,
    modulos: [],
    precio: { tipo: "monto", mensual: "50000.00", descuentos: {} },
    costoPorOrden: null,
    costoPorOrdenPorcentual: null,
    ...extra,
  };
}

function editar(extra: Record<string, unknown> = {}) {
  return { ...version(), planId: PLAN, vigenteDesde: "2026-11-20", ...extra };
}

describe("SLT-86 R1 — el tipo de cobro tiene cuatro valores", () => {
  it("son quincenal, mensual, bimestral y anual, en ese orden", () => {
    expect(TIPOS_COBRO).toEqual(["quincenal", "mensual", "bimestral", "anual"]);
  });

  it.each(TIPOS_COBRO)("asignar, crear un custom y cambiar el tipo aceptan «%s»", (tipoCobro) => {
    expect(asignarPlanSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN, tipoCobro }).success).toBe(true);
    expect(
      crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro })).success,
    ).toBe(true);
    expect(
      cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro, vigenteDesde: "2026-12-01" }).success,
    ).toBe(true);
  });

  it.each(["semanal", "trimestral", "", "ANUAL"])("un tipo «%s» es validation_error en tipoCobro", (tipoCobro) => {
    expect(camposConError(asignarPlanSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN, tipoCobro }))).toEqual([
      "tipoCobro",
    ]);
    expect(
      camposConError(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro, vigenteDesde: "2026-12-01" })),
    ).toEqual(["tipoCobro"]);
    expect(
      camposConError(crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro }))),
    ).toContain("tipoCobro");
  });

  it("sin tipo de cobro, asignar y cambiar el tipo son validation_error en tipoCobro", () => {
    expect(camposConError(asignarPlanSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN }))).toEqual(["tipoCobro"]);
    expect(
      camposConError(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, vigenteDesde: "2026-12-01" })),
    ).toEqual(["tipoCobro"]);
  });
});

describe("SLT-86 R8 — ningún plan tiene tope de órdenes", () => {
  it("los topes sin órdenes entran", () => {
    expect(topesPlanSchema.safeParse(TOPES).success).toBe(true);
  });

  it.each([100, null, 0])("traer topes.ordenesPorCiclo = %s es validation_error al crear, editar y programar", (n) => {
    const topes = { ...TOPES, ordenesPorCiclo: n };
    expect(camposConError(crearPlanSchema.safeParse(crear({ topes })))).toEqual(["topes"]);
    expect(camposConError(editarPlanSchema.safeParse(editar({ topes })))).toEqual(["topes"]);
    expect(camposConError(versionPlanSchema.safeParse(version({ topes })))).toEqual(["topes"]);
  });
});

describe("SLT-86 R10 — un descuento opcional por período, en porcentaje o en monto fijo", () => {
  it("un plan con un descuento distinto en cada período entra", () => {
    const precio = {
      tipo: "monto",
      mensual: "50000.00",
      descuentos: {
        quincenal: { tipo: "porcentaje", porcentaje: "0.01" },
        mensual: { tipo: "monto", monto: "0" },
        bimestral: { tipo: "monto", monto: "5000.00" },
        anual: { tipo: "porcentaje", porcentaje: "100" },
      },
    };
    expect(precioPlanSchema.safeParse(precio).success).toBe(true);
    expect(crearPlanSchema.safeParse(crear({ precio })).success).toBe(true);
  });

  it("sin descuentos (objeto vacío) entra; sin la clave `descuentos` es validation_error", () => {
    expect(precioPlanSchema.safeParse({ tipo: "monto", mensual: "10", descuentos: {} }).success).toBe(true);
    expect(camposConError(crearPlanSchema.safeParse(crear({ precio: { tipo: "monto", mensual: "10" } })))).toEqual([
      "precio.descuentos",
    ]);
  });

  it.each([
    ["0", "porcentaje"],
    ["0.00", "porcentaje"],
    ["100.01", "porcentaje"],
    ["101", "porcentaje"],
    ["10.123", "porcentaje"],
    ["-5", "porcentaje"],
    ["abc", "porcentaje"],
  ])("un porcentaje «%s» es validation_error en precio.descuentos.anual.%s", (porcentaje, campo) => {
    const precio = { tipo: "monto", mensual: "100", descuentos: { anual: { tipo: "porcentaje", porcentaje } } };
    expect(camposConError(crearPlanSchema.safeParse(crear({ precio })))).toEqual([`precio.descuentos.anual.${campo}`]);
  });

  it.each(["-1", "1.234", "12345678901", "1e3", ""])(
    "un monto «%s» es validation_error en precio.descuentos.bimestral.monto",
    (monto) => {
      const precio = { tipo: "monto", mensual: "100", descuentos: { bimestral: { tipo: "monto", monto } } };
      expect(camposConError(crearPlanSchema.safeParse(crear({ precio })))).toEqual(["precio.descuentos.bimestral.monto"]);
    },
  );

  it("las dos formas a la vez son validation_error en el campo de la forma que sobra", () => {
    const conMonto = { tipo: "monto", mensual: "100", descuentos: { mensual: { tipo: "porcentaje", porcentaje: "10", monto: "5" } } };
    const conPct = { tipo: "monto", mensual: "100", descuentos: { quincenal: { tipo: "monto", monto: "5", porcentaje: "10" } } };
    expect(camposConError(crearPlanSchema.safeParse(crear({ precio: conMonto })))).toEqual(["precio.descuentos.mensual.monto"]);
    expect(camposConError(crearPlanSchema.safeParse(crear({ precio: conPct })))).toEqual([
      "precio.descuentos.quincenal.porcentaje",
    ]);
  });

  it("un descuento sin forma, con una forma desconocida o para un período que no existe es validation_error", () => {
    const sinForma = { tipo: "monto", mensual: "100", descuentos: { anual: { porcentaje: "10" } } };
    const formaRara = { tipo: "monto", mensual: "100", descuentos: { anual: { tipo: "fijo", monto: "10" } } };
    const periodoRaro = { tipo: "monto", mensual: "100", descuentos: { semanal: { tipo: "monto", monto: "1" } } };
    for (const precio of [sinForma, formaRara, periodoRaro]) {
      const campos = camposConError(crearPlanSchema.safeParse(crear({ precio })));
      expect(campos.length).toBeGreaterThan(0);
      expect(campos.every((c) => c.startsWith("precio.descuentos"))).toBe(true);
    }
  });

  it("el precio anual fijo y el descuento anual de antes ya no existen: `anual` es validation_error en precio", () => {
    const viejo = { tipo: "monto", mensual: "100", anual: { tipo: "descuento", porcentaje: "10" }, descuentos: {} };
    expect(camposConError(crearPlanSchema.safeParse(crear({ precio: viejo })))).toEqual(["precio"]);
  });
});

describe("SLT-86 R11 — sin costo base no hay descuentos", () => {
  it("«sin precio» con descuentos es validation_error en precio, al crear, editar y programar", () => {
    const precio = { tipo: "sin_precio", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } };
    expect(camposConError(crearPlanSchema.safeParse(crear({ precio })))).toEqual(["precio"]);
    expect(camposConError(editarPlanSchema.safeParse(editar({ precio })))).toEqual(["precio"]);
    expect(camposConError(versionPlanSchema.safeParse(version({ precio })))).toEqual(["precio"]);
  });

  it("«sin precio» con descuentos vacíos también es validation_error: la forma no lleva la clave", () => {
    expect(camposConError(precioPlanSchema.safeParse({ tipo: "sin_precio", descuentos: {} }))).toEqual([""]);
  });

  it("«sin precio» solo entra", () => {
    expect(crearPlanSchema.safeParse(crear({ precio: { tipo: "sin_precio" } })).success).toBe(true);
  });
});

describe("SLT-86 R16 — la fecha de efecto de un cambio de empresa", () => {
  it("cambiar el tipo de cobro sin fecha de efecto es validation_error en vigenteDesde", () => {
    expect(camposConError(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro: "bimestral" }))).toEqual([
      "vigenteDesde",
    ]);
  });

  it.each(["2026-02-30", "2026-13-01", "05/11/2026", "2026-11-5", "", "mañana"])(
    "una fecha de efecto «%s» no válida es validation_error en vigenteDesde",
    (vigenteDesde) => {
      expect(
        camposConError(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro: "anual", vigenteDesde })),
      ).toEqual(["vigenteDesde"]);
      expect(
        camposConError(asignarPlanSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN, tipoCobro: "anual", vigenteDesde })),
      ).toEqual(["vigenteDesde"]);
      expect(
        camposConError(
          crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "anual", vigenteDesde })),
        ),
      ).toEqual(["vigenteDesde"]);
    },
  );

  it("asignar y el custom para una empresa aceptan la fecha de efecto (la obligación la mira el servicio)", () => {
    expect(
      asignarPlanSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN, tipoCobro: "quincenal", vigenteDesde: "2026-11-16" })
        .success,
    ).toBe(true);
    expect(
      crearPlanSchema.safeParse(
        crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "quincenal", vigenteDesde: "2026-11-16" }),
      ).success,
    ).toBe(true);
  });

  it("fecha de inicio y fecha de efecto a la vez son validation_error en vigenteDesde", () => {
    const ambas = { inicioCiclo: "2026-11-05", vigenteDesde: "2026-11-16" };
    expect(
      camposConError(asignarPlanSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", ...ambas })),
    ).toEqual(["vigenteDesde"]);
    expect(
      camposConError(crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "mensual", ...ambas }))),
    ).toEqual(["vigenteDesde"]);
  });

  it("un plan público no lleva fecha de efecto", () => {
    expect(camposConError(crearPlanSchema.safeParse(crear({ vigenteDesde: "2026-11-16" })))).toEqual(["vigenteDesde"]);
  });

  it("«Cancelar cambio» lleva solo la empresa", () => {
    expect(cancelarCambioEmpresaSchema.safeParse({ organizacionId: EMPRESA }).success).toBe(true);
    expect(camposConError(cancelarCambioEmpresaSchema.safeParse({ organizacionId: "x" }))).toEqual(["organizacionId"]);
    expect(camposConError(cancelarCambioEmpresaSchema.safeParse({ organizacionId: EMPRESA, planId: PLAN }))).toEqual([""]);
  });
});

describe("SLT-86 R22 — la edición del precio lleva una fecha de efecto con forma de día", () => {
  it("una edición con descuentos y fecha entra", () => {
    const precio = { tipo: "monto", mensual: "60000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } };
    expect(editarPlanSchema.safeParse(editar({ precio, vigenteDesde: "2026-11-05" })).success).toBe(true);
  });

  it("una fecha de efecto que no es un día es validation_error en vigenteDesde", () => {
    expect(camposConError(editarPlanSchema.safeParse(editar({ vigenteDesde: "2026-11-31" })))).toEqual(["vigenteDesde"]);
  });
});
