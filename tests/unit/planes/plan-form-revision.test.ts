import { describe, expect, it } from "vitest";

import {
  extrasDeGeneral,
  filaDeCuandoRige,
  filasDeRevision,
  haySoloExtras,
  textoDeHoy,
} from "@/app/(app)/plataforma/planes/_components/plan-form/revision";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-130 (design §6; R16, R22, R23) — las filas de «Revisar» y el «Hoy: …», puras.

const PLAN: PlanDTO = {
  id: "p1",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { admin: 1, mensajero: 5 }, apiKeys: 2 },
  modulos: ["ranking", "analitica"],
  precio: {
    tipo: "monto",
    mensual: "100.00",
    descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } },
  },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
  periodicidadOrdenes: "quincenal",
  archivado: false,
};

const claves = (filas: { clave: string }[]) => filas.map((f) => f.clave);

describe("SLT-130 — filasDeRevision al crear", () => {
  it("R22: filas al crear — público: Visibilidad y luego todas las filas del plan con su valor final", () => {
    const extras = extrasDeGeneral({ visibilidad: "publico", empresaNombre: null, tipoCobro: "mensual", fecha: null });
    const filas = filasDeRevision({ modo: "crear", plan: null, despues: PLAN, extras });

    expect(filas).toEqual([
      { clave: "Visibilidad", valor: "Público" },
      { clave: "Nombre", valor: "Básico" },
      { clave: "Costo base mensual", valor: "100.00 / mes" },
      { clave: "Descuentos", valor: "Descuento anual: 10.00 %" },
      { clave: "Cobro por orden", valor: "se aplica el valor global" },
      { clave: "Facturación de órdenes", valor: "Quincenal" },
      { clave: "Tope de Administrador", valor: "1" },
      { clave: "Tope de Mensajero", valor: "5" },
      { clave: "Tope de Admin de tienda", valor: "sin límite" },
      { clave: "Tope de Admin satélite", valor: "sin límite" },
      { clave: "Tope de API keys", valor: "2" },
      { clave: "Módulos incluidos", valor: "Analítica · Ranking" },
    ]);
  });

  it("R22: filas al crear — custom: empresa, tipo de cobro y su fecha antes de las del plan", () => {
    const extras = extrasDeGeneral({
      visibilidad: "custom",
      empresaNombre: "Acme",
      tipoCobro: "bimestral",
      fecha: { campo: "inicioCiclo", valor: "2026-12-01" },
    });
    const custom: PlanDTO = {
      ...PLAN,
      visibilidad: "custom",
      organizacionId: "org-1",
      precio: { tipo: "sin_precio" },
      modulos: [],
      costoPorOrdenPorcentual: { porcentaje: "2", minimo: "50" },
    };
    const filas = filasDeRevision({ modo: "crear", plan: null, despues: custom, extras });

    expect(filas.slice(0, 3)).toEqual([
      { clave: "Visibilidad", valor: "Custom de Acme" },
      { clave: "Tipo de cobro", valor: "Bimestral" },
      { clave: "Inicio del período", valor: "2026-12-01" },
    ]);
    expect(filas).toContainEqual({ clave: "Costo base mensual", valor: "sin precio" });
    expect(filas).toContainEqual({ clave: "Descuentos", valor: "Ninguno" });
    expect(filas).toContainEqual({ clave: "Cobro por orden", valor: "2.00 % del valor del paquete, mínimo 50.00" });
    expect(filas).toContainEqual({ clave: "Módulos incluidos", valor: "Ninguno" });

    const conPlan = extrasDeGeneral({
      visibilidad: "custom",
      empresaNombre: "Acme",
      tipoCobro: "mensual",
      fecha: { campo: "rigeDesde", valor: "2027-01-01" },
    });
    expect(conPlan[2]).toEqual({ clave: "Rige desde", valor: "2027-01-01" });
  });
});

describe("SLT-130 — filasDeRevision al editar", () => {
  it("R23: filas al editar — solo lo que cambia, «antes → después», topes por rol, una fila de descuentos y cuándo rige", () => {
    const despues: PlanDTO = {
      ...PLAN,
      nombre: "Básico 2",
      // «100» es el mismo costo base que «100.00»: no sale. Los descuentos sí cambian.
      precio: {
        tipo: "monto",
        mensual: "100",
        descuentos: {
          mensual: { tipo: "monto", monto: "5" },
          anual: { tipo: "porcentaje", porcentaje: "15" },
        },
      },
      topes: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
    };
    const extras = [filaDeCuandoRige({ cambiaPrecio: true, aplicar: "inmediato", precioDesde: "2026-11-14", vigenteDesde: "" })];
    const filas = filasDeRevision({ modo: "editar", plan: PLAN, despues, extras });

    expect(filas).toEqual([
      { clave: "Nombre", valor: "Básico → Básico 2" },
      {
        clave: "Descuentos",
        valor: "Descuento anual: 10.00 % → Descuento mensual: 5.00 · Descuento anual: 15.00 %",
      },
      { clave: "Tope de Mensajero", valor: "5 → sin límite" },
      { clave: "Tope de Admin de tienda", valor: "sin límite → 3" },
      { clave: "Rige desde", valor: "2026-11-14" },
    ]);
    expect(claves(filas)).not.toContain("Costo base mensual");
    expect(haySoloExtras(filas, extras)).toBe(false);
  });

  it("R23: filas al editar — costo base, cobro por orden, facturación y módulos como «antes → después»", () => {
    const despues: PlanDTO = {
      ...PLAN,
      precio: { tipo: "sin_precio" },
      costoPorOrden: "25",
      periodicidadOrdenes: "mensual",
      modulos: ["analitica"],
    };
    const extras = [filaDeCuandoRige({ cambiaPrecio: false, aplicar: "programado", precioDesde: "", vigenteDesde: "2026-12-01" })];
    const filas = filasDeRevision({ modo: "editar", plan: PLAN, despues, extras });

    expect(filas).toEqual([
      { clave: "Costo base mensual", valor: "100.00 / mes → sin precio" },
      { clave: "Descuentos", valor: "Descuento anual: 10.00 % → Ninguno" },
      { clave: "Cobro por orden", valor: "se aplica el valor global → 25 por orden" },
      { clave: "Facturación de órdenes", valor: "Quincenal → Mensual" },
      { clave: "Módulos incluidos", valor: "Analítica · Ranking → Analítica" },
      { clave: "A partir de", valor: "2026-12-01" },
    ]);
  });

  it("R23: sin cambios — solo queda la fila de cuándo rige", () => {
    const extras = [filaDeCuandoRige({ cambiaPrecio: false, aplicar: "inmediato", precioDesde: "", vigenteDesde: "" })];
    const filas = filasDeRevision({ modo: "editar", plan: PLAN, despues: { ...PLAN }, extras });

    expect(filas).toEqual([{ clave: "Aplicar", valor: "De inmediato" }]);
    expect(haySoloExtras(filas, extras)).toBe(true);
  });
});

describe("SLT-130 — textoDeHoy", () => {
  it("R16: textoDeHoy — el costo base sin descuentos, o el tope con «sin límite»", () => {
    expect(textoDeHoy({ precio: PLAN.precio })).toBe("Hoy: 100.00 / mes");
    expect(textoDeHoy({ precio: { tipo: "sin_precio" } })).toBe("Hoy: sin precio");
    expect(textoDeHoy({ tope: 5 })).toBe("Hoy: 5");
    expect(textoDeHoy({ tope: null })).toBe("Hoy: sin límite");
    expect(textoDeHoy({ tope: undefined })).toBe("Hoy: sin límite");
  });
});
