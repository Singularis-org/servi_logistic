import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  BorradorNoEncontrado,
  descuentosDeLaLista,
  pasosDelModo,
  pasosQueFaltan,
  peticionDeCrear,
  peticionDeEditar,
} from "@/lib/planes/borrador";
import { ESQUEMAS_DE_CREAR, ESQUEMAS_DE_EDITAR, type PasosDeCrear, type PasosDeEditar } from "@/lib/types/plan-borrador";
import { crearPlanSchema, editarPlanSchema } from "@/lib/types/planes";

// SLT-129 (design §5.1; R7, R16, R17, R18, R20) — lo puro del borrador: los pasos que faltan y la petición de
// crear o de editar de hoy armada con los pasos guardados.

const EMPRESA = randomUUID();
const PLAN = randomUUID();

const PRECIO = {
  precio: {
    tipo: "monto" as const,
    mensual: "50000",
    descuentos: [
      { periodo: "anual" as const, tipo: "porcentaje" as const, valor: "10" },
      { periodo: "quincenal" as const, tipo: "monto" as const, valor: "1500.50" },
    ],
  },
};
const ORDEN = { costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: "100" }, periodicidadOrdenes: "mensual" as const };
const TOPES = { topes: { porRol: { admin: 2, mensajero: 10 }, apiKeys: 3 } };
const MODULOS = { modulos: ["analitica" as const, "ranking" as const] };
// SLT-214 (R7, R15, R16): el paso «Beneficios», después de «Módulos».
const BENEFICIOS = {
  beneficios: [
    { icono: "soporte" as const, texto: "Soporte prioritario" },
    { icono: "equipo" as const, texto: "Equipo dedicado" },
  ],
};

const DESCUENTOS_DE_HOY = {
  anual: { tipo: "porcentaje", porcentaje: "10" },
  quincenal: { tipo: "monto", monto: "1500.50" },
};

describe("R16 — los pasos que faltan, en el orden del formulario", () => {
  it("los pasos de cada modo", () => {
    expect(pasosDelModo("crear")).toEqual(["general", "precio", "orden", "topes", "modulos", "beneficios"]);
    expect(pasosDelModo("editar")).toEqual(["general", "precio", "orden", "topes", "modulos", "beneficios", "vigencia"]);
  });

  it("crear sin Topes y programar sin Cuándo rige", () => {
    expect(pasosQueFaltan("crear", ["modulos", "beneficios", "general", "orden", "precio"])).toEqual(["topes"]);
    expect(pasosQueFaltan("editar", ["general", "precio", "orden", "topes", "modulos", "beneficios"])).toEqual(["vigencia"]);
  });

  it("sin nada guardado faltan todos; con todos, ninguno", () => {
    expect(pasosQueFaltan("crear", [])).toEqual(["general", "precio", "orden", "topes", "modulos", "beneficios"]);
    expect(pasosQueFaltan("editar", ["vigencia", "beneficios", "modulos", "topes", "orden", "precio", "general"])).toEqual([]);
    expect(pasosQueFaltan("crear", ["topes", "precio"])).toEqual(["general", "orden", "modulos", "beneficios"]);
  });
});

describe("R7 — la lista de descuentos en el registro por período de hoy", () => {
  it("cada línea va a su período con su forma", () => {
    expect(descuentosDeLaLista(PRECIO.precio.descuentos)).toEqual(DESCUENTOS_DE_HOY);
  });

  it("la lista vacía es sin descuentos", () => {
    expect(descuentosDeLaLista([])).toEqual({});
  });
});

describe("R17 — la petición de crear armada con los cinco pasos", () => {
  it("un público: pasa crearPlanSchema con los descuentos en el registro de hoy", () => {
    const pasos: PasosDeCrear = {
      general: { nombre: "Pro", visibilidad: "publico", organizacionId: null },
      precio: PRECIO,
      orden: ORDEN,
      topes: TOPES,
      modulos: MODULOS,
      beneficios: BENEFICIOS,
    };
    const peticion = peticionDeCrear(pasos);

    expect(peticion).toEqual({
      nombre: "Pro",
      visibilidad: "publico",
      organizacionId: null,
      precio: { tipo: "monto", mensual: "50000", descuentos: DESCUENTOS_DE_HOY },
      costoPorOrden: null,
      costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: "100" },
      periodicidadOrdenes: "mensual",
      topes: TOPES.topes,
      modulos: MODULOS.modulos,
      beneficios: BENEFICIOS.beneficios,
    });
    expect(crearPlanSchema.safeParse(peticion).success).toBe(true);
  });

  it("un custom: lleva la empresa, el tipo de cobro y el inicio, y sin precio", () => {
    const pasos: PasosDeCrear = {
      general: { nombre: "Custom", visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "anual", inicioCiclo: "2026-11-20" },
      precio: { precio: { tipo: "sin_precio" } },
      orden: { costoPorOrden: "80", costoPorOrdenPorcentual: null, periodicidadOrdenes: "quincenal" },
      topes: TOPES,
      modulos: { modulos: [] },
      beneficios: { beneficios: [] },
    };
    const peticion = peticionDeCrear(pasos);

    expect(peticion).toMatchObject({
      organizacionId: EMPRESA,
      tipoCobro: "anual",
      inicioCiclo: "2026-11-20",
      precio: { tipo: "sin_precio" },
    });
    expect(crearPlanSchema.safeParse(peticion).success).toBe(true);
  });

  it("los pasos guardados por sus esquemas dan una petición que crearPlanSchema acepta", () => {
    const general = ESQUEMAS_DE_CREAR.general.parse({ nombre: "Pro", visibilidad: "publico", organizacionId: null });
    const pasos: PasosDeCrear = {
      general,
      precio: ESQUEMAS_DE_CREAR.precio.parse(PRECIO),
      orden: ESQUEMAS_DE_CREAR.orden.parse(ORDEN),
      topes: ESQUEMAS_DE_CREAR.topes.parse(TOPES),
      modulos: ESQUEMAS_DE_CREAR.modulos.parse(MODULOS),
      beneficios: ESQUEMAS_DE_CREAR.beneficios.parse(BENEFICIOS),
    };
    expect(crearPlanSchema.safeParse(peticionDeCrear(pasos)).success).toBe(true);
  });

  it("lo que cruza pasos lo rechaza crearPlanSchema con la clave de hoy (quincenal con órdenes mensuales)", () => {
    const pasos: PasosDeCrear = {
      general: { nombre: "Custom", visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "quincenal" },
      precio: PRECIO,
      orden: ORDEN,
      topes: TOPES,
      modulos: MODULOS,
      beneficios: BENEFICIOS,
    };
    const r = crearPlanSchema.safeParse(peticionDeCrear(pasos));
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toEqual(["tipoCobro"]);
  });
});

describe("R18 — la petición de editar armada con los seis pasos", () => {
  it("lleva el plan, el nombre de General y la fecha de Cuándo rige, y pasa editarPlanSchema", () => {
    const pasos: PasosDeEditar = {
      general: { nombre: "Pro 2" },
      precio: PRECIO,
      orden: ORDEN,
      topes: TOPES,
      modulos: MODULOS,
      beneficios: BENEFICIOS,
      vigencia: { vigenteDesde: "2026-12-01" },
    };
    const peticion = peticionDeEditar(PLAN, pasos);

    expect(peticion).toEqual({
      planId: PLAN,
      nombre: "Pro 2",
      precio: { tipo: "monto", mensual: "50000", descuentos: DESCUENTOS_DE_HOY },
      costoPorOrden: null,
      costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: "100" },
      periodicidadOrdenes: "mensual",
      topes: TOPES.topes,
      modulos: MODULOS.modulos,
      beneficios: BENEFICIOS.beneficios,
      vigenteDesde: "2026-12-01",
    });
    expect(editarPlanSchema.safeParse(peticion).success).toBe(true);
    expect(ESQUEMAS_DE_EDITAR.vigencia.safeParse(pasos.vigencia).success).toBe(true);
  });
});

describe("R20 — el borrador que ya no está", () => {
  it("BorradorNoEncontrado es un Error que lleva el id", () => {
    const e = new BorradorNoEncontrado("b-1");
    expect(e).toBeInstanceOf(Error);
    expect(e.borradorId).toBe("b-1");
    expect(e.name).toBe("BorradorNoEncontrado");
  });
});
