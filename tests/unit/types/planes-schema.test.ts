import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { crearPlanSchema, editarPlanSchema, precioPlanSchema, topesPlanSchema } from "@/lib/types/planes";

// SL-24 (design §5.1, §16.1; R2, R3, R25, R37) — el borde de los planes. Todo lo que este esquema
// rechaza no llega al repositorio; los `CHECK` de la base son la segunda red (planes-catalogo).

const EMPRESA = randomUUID();
const PLAN = randomUUID();

// SLT-86 (R8): sin `ordenesPorCiclo`.
const TOPES = { porRol: { adminTienda: 3 }, apiKeys: 2 };

function crear(extra: Record<string, unknown> = {}) {
  return {
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: TOPES,
    modulos: ["analitica", "ranking"],
    precio: { tipo: "sin_precio" },
    costoPorOrden: null, // SLT-66 R8: la clave es obligatoria; vacío = null.
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del esquema
    ...extra,
  };
}

function editar(extra: Record<string, unknown> = {}) {
  return {
    planId: PLAN,
    nombre: "Básico",
    topes: TOPES,
    modulos: [],
    precio: { tipo: "sin_precio" },
    vigenteDesde: null,
    costoPorOrden: null, // SLT-66 R8: la clave es obligatoria; vacío = null.
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del esquema
    ...extra,
  };
}

describe("SL-24 — esquema de crear un plan", () => {
  it("un público sin empresa y un custom con su empresa (y su tipo de cobro, D6) entran", () => {
    expect(crearPlanSchema.safeParse(crear()).success).toBe(true);
    expect(
      crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "mensual" })).success,
    ).toBe(true);
    // Ajuste planes-custom (D2, D4): un custom se asigna al crearlo, con el inicio del ciclo si se elige.
    expect(
      crearPlanSchema.safeParse(
        crear({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "anual", inicioCiclo: "2026-11-01" }),
      ).success,
    ).toBe(true);
  });

  it("D6 (ajuste planes-custom): un custom sin tipo de cobro, o un público con él, es validation_error en tipoCobro", () => {
    const customSinTipo = crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: EMPRESA }));
    const publicoConTipo = crearPlanSchema.safeParse(crear({ tipoCobro: "mensual" }));
    for (const r of [customSinTipo, publicoConTipo]) {
      expect(r.success).toBe(false);
      expect(r.error?.issues.map((i) => i.path.join("."))).toContain("tipoCobro");
    }
  });

  it("R2: un custom sin empresa, o un público con empresa, es validation_error en organizacionId", () => {
    const sinEmpresa = crearPlanSchema.safeParse(crear({ visibilidad: "custom", organizacionId: null }));
    const conEmpresa = crearPlanSchema.safeParse(crear({ visibilidad: "publico", organizacionId: EMPRESA }));
    for (const r of [sinEmpresa, conEmpresa]) {
      expect(r.success).toBe(false);
      expect(r.error?.issues.map((i) => i.path.join("."))).toContain("organizacionId");
    }
  });

  it("nombre en blanco, de más de 80, visibilidad desconocida o clave de más se rechazan", () => {
    expect(crearPlanSchema.safeParse(crear({ nombre: "   " })).success).toBe(false);
    expect(crearPlanSchema.safeParse(crear({ nombre: "x".repeat(81) })).success).toBe(false);
    expect(crearPlanSchema.safeParse(crear({ visibilidad: "privado" })).success).toBe(false);
    expect(crearPlanSchema.safeParse(crear({ archivado: true })).success).toBe(false);
  });

  it("los módulos son claves del catálogo de SL-23, sin repetir", () => {
    expect(crearPlanSchema.safeParse(crear({ modulos: ["analitica", "analitica"] })).success).toBe(false);
    expect(crearPlanSchema.safeParse(crear({ modulos: ["Cierres"] })).success).toBe(false);
    expect(crearPlanSchema.safeParse(crear({ modulos: [] })).success).toBe(true);
  });
});

describe("SL-24 — esquema de editar un plan", () => {
  it("R2: traer visibilidad u organizacionId en una edición es validation_error", () => {
    expect(editarPlanSchema.safeParse(editar()).success).toBe(true);
    expect(editarPlanSchema.safeParse(editar({ visibilidad: "custom" })).success).toBe(false);
    expect(editarPlanSchema.safeParse(editar({ organizacionId: EMPRESA })).success).toBe(false);
  });

  it("R37: vigenteDesde es una fecha AAAA-MM-DD que existe, o null", () => {
    expect(editarPlanSchema.safeParse(editar({ vigenteDesde: "2026-11-15" })).success).toBe(true);
    expect(editarPlanSchema.safeParse(editar({ vigenteDesde: "2028-02-29" })).success).toBe(true);
    for (const malo of ["2027-02-29", "2026-13-01", "15/11/2026", "2026-11-15T00:00:00Z", "", 20261115]) {
      expect(editarPlanSchema.safeParse(editar({ vigenteDesde: malo })).success, String(malo)).toBe(false);
    }
    // Es obligatorio decirlo: null = de inmediato.
    const sin: Record<string, unknown> = editar();
    delete sin.vigenteDesde;
    expect(editarPlanSchema.safeParse(sin).success).toBe(false);
  });

  it("R37/P8: la fecha rige a las 00:00 de la plataforma (−06:00), sin depender de la zona del proceso", () => {
    expect(inicioDelDiaPlataforma("2026-11-15").toISOString()).toBe("2026-11-15T06:00:00.000Z");
    expect(inicioDelDiaPlataforma("2026-12-31").toISOString()).toBe("2026-12-31T06:00:00.000Z");
    expect(inicioDelDiaPlataforma("2028-02-29").toISOString()).toBe("2028-02-29T06:00:00.000Z");
  });
});

// SLT-86 (R10, R11, R33): el anual fijo y el descuento anual pasan a `descuentos`, uno opcional por
// período (porcentaje o monto fijo). Las formas de SL-24 se conservan traducidas a esa forma.
describe("SL-24 — R3: las formas del precio y nada más (SLT-86: con descuentos por período)", () => {
  it.each([
    ["sin precio", { tipo: "sin_precio" }],
    ["mensual solo", { tipo: "monto", mensual: "25000", descuentos: {} }],
    ["mensual con descuento fijo", { tipo: "monto", mensual: "25000.50", descuentos: { anual: { tipo: "monto", monto: "25000" } } }],
    ["mensual con descuento", { tipo: "monto", mensual: "0", descuentos: { anual: { tipo: "porcentaje", porcentaje: "15.5" } } }],
    ["descuento del 100", { tipo: "monto", mensual: "10", descuentos: { anual: { tipo: "porcentaje", porcentaje: "100" } } }],
    ["el mayor importe que cabe en DECIMAL(12,2)", { tipo: "monto", mensual: "9999999999.99", descuentos: {} }],
  ])("%s entra", (_caso, precio) => {
    expect(precioPlanSchema.safeParse(precio).success).toBe(true);
  });

  it.each([
    ["D1: negociable ya no es una forma", { tipo: "negociable" }],
    ["D1: negociable con un monto", { tipo: "negociable", mensual: "10" }],
    ["sin precio con descuentos", { tipo: "sin_precio", descuentos: { anual: { tipo: "monto", monto: "1" } } }],
    [
      "descuento fijo con porcentaje",
      { tipo: "monto", mensual: "10", descuentos: { anual: { tipo: "monto", monto: "100", porcentaje: "5" } } },
    ],
    ["descuentos sin mensual", { tipo: "monto", descuentos: { anual: { tipo: "monto", monto: "100" } } }],
    ["SLT-86: el `anual` de antes ya no es una clave", { tipo: "monto", mensual: "10", anual: null, descuentos: {} }],
    ["monto negativo", { tipo: "monto", mensual: "-1", descuentos: {} }],
    ["tres decimales", { tipo: "monto", mensual: "1.001", descuentos: {} }],
    ["no cabe en DECIMAL(12,2)", { tipo: "monto", mensual: "10000000000", descuentos: {} }],
    ["monto como número", { tipo: "monto", mensual: 10, descuentos: {} }],
    ["descuento 0", { tipo: "monto", mensual: "10", descuentos: { anual: { tipo: "porcentaje", porcentaje: "0" } } }],
    ["descuento 0.00", { tipo: "monto", mensual: "10", descuentos: { anual: { tipo: "porcentaje", porcentaje: "0.00" } } }],
    [
      "descuento de más de 100",
      { tipo: "monto", mensual: "10", descuentos: { anual: { tipo: "porcentaje", porcentaje: "100.01" } } },
    ],
    ["tipo desconocido", { tipo: "gratis" }],
  ])("%s es validation_error", (_caso, precio) => {
    expect(precioPlanSchema.safeParse(precio).success).toBe(false);
  });
});

describe("SL-24 — R25: los topes", () => {
  it("cada rol con tope es opcional; los topes son enteros ≥ 0 o null", () => {
    expect(topesPlanSchema.safeParse({ porRol: {}, apiKeys: null }).success).toBe(true);
    expect(
      topesPlanSchema.safeParse({
        // SLT-66 R1: el maestro ya no admite tope (su rechazo está en planes-schema-costeo).
        porRol: { admin: 2, mensajero: 3, adminTienda: 4, adminSatelite: 5 },
        apiKeys: 0,
      }).success,
    ).toBe(true);
    for (const malo of [-1, 1.5, "3", 2_147_483_648]) {
      expect(topesPlanSchema.safeParse({ ...TOPES, apiKeys: malo }).success, String(malo)).toBe(false);
      expect(topesPlanSchema.safeParse({ ...TOPES, porRol: { admin: malo } }).success, String(malo)).toBe(false);
    }
  });

  it("apiKey y superadmin no admiten tope de usuarios, ni existe un tope de tiendas aparte", () => {
    for (const clave of ["apiKey", "superadmin", "tiendas", "Admin Tienda"]) {
      expect(topesPlanSchema.safeParse({ ...TOPES, porRol: { [clave]: 1 } }).success, clave).toBe(false);
    }
    expect(topesPlanSchema.safeParse({ ...TOPES, tiendas: 3 }).success).toBe(false);
    // SLT-86 (R8): tampoco el tope de órdenes por ciclo.
    expect(topesPlanSchema.safeParse({ ...TOPES, ordenesPorCiclo: 100 }).success).toBe(false);
  });
});
