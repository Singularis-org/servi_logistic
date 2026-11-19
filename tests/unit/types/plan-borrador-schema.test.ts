import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  ESQUEMAS_DE_CREAR,
  ESQUEMAS_DE_EDITAR,
  PASOS_DE_CREAR,
  PASOS_DE_EDITAR,
  PERIODO_REPETIDO,
  UN_PLAN_NUEVO_EMPIEZA_POR_GENERAL,
  guardarPasoBorradorSchema,
  leerBorradorSchema,
} from "@/lib/types/plan-borrador";
import { BENEFICIO_REPETIDO, TEXTO_LARGO, TEXTO_VACIO } from "@/lib/planes/beneficios";
import { MENSAJE_MONTO_COBRO_INVALIDO } from "@/lib/types/cobro-plataforma";
import { crearPlanSchema } from "@/lib/types/planes";

// SLT-129 (design §3; R3, R6, R7) — el esquema de cada paso del borrador. Cada error sale con la clave de campo
// de `PlanesService.crear` / `.editar` (la forma de `erroresDeCampo` de `PlanesService`) y con el mensaje
// de hoy. Lo que cruza pasos o necesita la base o el reloj NO se mira al guardar un paso (R6).

const EMPRESA = randomUUID();

/** Las claves de error con la forma de `erroresDeCampo` de `PlanesService`. */
function claves(r: { success: boolean; error?: z.ZodError }): string[] {
  if (r.success || !r.error) return [];
  return [...new Set(r.error.issues.map((i) => (i.path.length > 0 ? i.path.join(".") : "_")))];
}

function mensajes(r: { success: boolean; error?: z.ZodError }, clave: string): string[] {
  if (r.success || !r.error) return [];
  return r.error.issues.filter((i) => i.path.join(".") === clave).map((i) => i.message);
}

const GENERAL_PUBLICO = { nombre: "Pro", visibilidad: "publico", organizacionId: null };
const GENERAL_CUSTOM = { nombre: "Pro", visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "mensual" };
const ORDEN = { costoPorOrden: "100", costoPorOrdenPorcentual: null, periodicidadOrdenes: "quincenal" };

function conPrecio(descuentos: unknown) {
  return { precio: { tipo: "monto", mensual: "50000", descuentos } };
}

describe("R6 — un paso válido pasa por su esquema", () => {
  it.each([
    ["general (público)", ESQUEMAS_DE_CREAR.general, GENERAL_PUBLICO],
    ["general (custom con inicio)", ESQUEMAS_DE_CREAR.general, { ...GENERAL_CUSTOM, inicioCiclo: "2026-11-20" }],
    ["precio sin precio", ESQUEMAS_DE_CREAR.precio, { precio: { tipo: "sin_precio" } }],
    ["precio con monto", ESQUEMAS_DE_CREAR.precio, conPrecio([{ periodo: "anual", tipo: "porcentaje", valor: "10" }])],
    ["orden fijo", ESQUEMAS_DE_CREAR.orden, ORDEN],
    [
      "orden porcentual",
      ESQUEMAS_DE_CREAR.orden,
      { costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: null }, periodicidadOrdenes: "mensual" },
    ],
    ["topes", ESQUEMAS_DE_CREAR.topes, { topes: { porRol: { admin: 2 }, apiKeys: null } }],
    ["módulos", ESQUEMAS_DE_CREAR.modulos, { modulos: ["analitica"] }],
    ["general al editar", ESQUEMAS_DE_EDITAR.general, { nombre: "Pro 2" }],
    ["vigencia con fecha", ESQUEMAS_DE_EDITAR.vigencia, { vigenteDesde: "2026-12-01" }],
  ] as const)("%s", (_caso, esquema, valores) => {
    expect(claves(esquema.safeParse(valores))).toEqual([]);
  });
});

describe("R6 — un caso por paso con un valor inválido y su clave", () => {
  it.each([
    ["general: nombre vacío", ESQUEMAS_DE_CREAR.general, { ...GENERAL_PUBLICO, nombre: "  " }, ["nombre"]],
    ["general: custom sin empresa", ESQUEMAS_DE_CREAR.general, { ...GENERAL_PUBLICO, visibilidad: "custom" }, ["organizacionId"]],
    [
      "general: empresa sin tipo de cobro",
      ESQUEMAS_DE_CREAR.general,
      { ...GENERAL_CUSTOM, tipoCobro: undefined },
      ["tipoCobro"],
    ],
    [
      "general: público con inicio del período",
      ESQUEMAS_DE_CREAR.general,
      { ...GENERAL_PUBLICO, inicioCiclo: "2026-11-20" },
      ["inicioCiclo"],
    ],
    [
      "general: público con fecha de efecto",
      ESQUEMAS_DE_CREAR.general,
      { ...GENERAL_PUBLICO, vigenteDesde: "2026-11-20" },
      ["vigenteDesde"],
    ],
    [
      "general: inicio y efecto a la vez",
      ESQUEMAS_DE_CREAR.general,
      { ...GENERAL_CUSTOM, inicioCiclo: "2026-11-20", vigenteDesde: "2026-11-20" },
      ["vigenteDesde"],
    ],
    ["general: un campo de otro paso", ESQUEMAS_DE_CREAR.general, { ...GENERAL_PUBLICO, modulos: [] }, ["_"]],
    ["general al editar: visibilidad", ESQUEMAS_DE_EDITAR.general, { nombre: "Pro", visibilidad: "publico" }, ["_"]],
    ["precio: mensual inválido", ESQUEMAS_DE_CREAR.precio, { precio: { tipo: "monto", mensual: "abc", descuentos: [] } }, ["precio.mensual"]],
    [
      "orden: fijo y porcentual a la vez",
      ESQUEMAS_DE_CREAR.orden,
      { ...ORDEN, costoPorOrdenPorcentual: { porcentaje: "2", minimo: null } },
      ["costoPorOrdenPorcentual"],
    ],
    ["orden: sin periodicidad", ESQUEMAS_DE_CREAR.orden, { costoPorOrden: null, costoPorOrdenPorcentual: null }, ["periodicidadOrdenes"]],
    ["topes: rol sin tope", ESQUEMAS_DE_CREAR.topes, { topes: { porRol: { superadmin: 1 }, apiKeys: null } }, ["topes.porRol.superadmin"]],
    ["topes: negativo", ESQUEMAS_DE_CREAR.topes, { topes: { porRol: {}, apiKeys: -1 } }, ["topes.apiKeys"]],
    ["módulos: repetido", ESQUEMAS_DE_CREAR.modulos, { modulos: ["analitica", "analitica"] }, ["modulos"]],
    ["vigencia: fecha que no existe", ESQUEMAS_DE_EDITAR.vigencia, { vigenteDesde: "2026-02-30" }, ["vigenteDesde"]],
  ] as const)("%s", (_caso, esquema, valores, esperadas) => {
    expect(claves(esquema.safeParse(valores))).toEqual(esperadas);
  });

  it("los mensajes de General son los de crearPlanSchema", () => {
    const valores = { ...GENERAL_PUBLICO, visibilidad: "custom" };
    const deHoy = crearPlanSchema.safeParse({
      ...valores,
      topes: { porRol: {}, apiKeys: null },
      modulos: [],
      precio: { tipo: "sin_precio" },
      costoPorOrden: null,
      costoPorOrdenPorcentual: null,
    });
    expect(mensajes(ESQUEMAS_DE_CREAR.general.safeParse(valores), "organizacionId")).toEqual(
      mensajes(deHoy, "organizacionId"),
    );
  });
});

describe("R6 — lo que cruza pasos o necesita la base o el reloj no se mira al guardar", () => {
  it("una fecha fuera de rango se acepta en General (inicio en el pasado lejano y efecto lejano)", () => {
    expect(claves(ESQUEMAS_DE_CREAR.general.safeParse({ ...GENERAL_CUSTOM, inicioCiclo: "2001-01-01" }))).toEqual([]);
    expect(claves(ESQUEMAS_DE_CREAR.general.safeParse({ ...GENERAL_CUSTOM, vigenteDesde: "2099-12-31" }))).toEqual([]);
  });

  it("tipo quincenal en General se acepta aunque Cobro por orden sea mensual (cruza pasos)", () => {
    expect(claves(ESQUEMAS_DE_CREAR.general.safeParse({ ...GENERAL_CUSTOM, tipoCobro: "quincenal" }))).toEqual([]);
    expect(claves(ESQUEMAS_DE_CREAR.orden.safeParse({ ...ORDEN, periodicidadOrdenes: "mensual" }))).toEqual([]);
  });

  it("una fecha de efecto pasada se acepta en Cuándo rige", () => {
    expect(claves(ESQUEMAS_DE_EDITAR.vigencia.safeParse({ vigenteDesde: "2001-01-01" }))).toEqual([]);
  });
});

// SLT-135 (R10): `vigencia` hereda la obligatoriedad de `editarPlanSchema`: sin fecha no se guarda. El rango (R2)
// sigue mirándose al confirmar (SLT-129 R6).
describe("SLT-135 — R10: el paso vigencia lleva fecha", () => {
  it("R10: vigencia sin fecha es inválida; una fecha pasada se acepta al guardar", () => {
    for (const valores of [{ vigenteDesde: null }, {}]) {
      const r = ESQUEMAS_DE_EDITAR.vigencia.safeParse(valores);
      expect(claves(r)).toEqual(["vigenteDesde"]);
      expect(mensajes(r, "vigenteDesde")).toEqual(["Elige desde qué fecha rige el cambio."]);
      // Por la entrada de guardar un paso: la clave lleva `valores.` (el servicio quita el prefijo).
      const g = guardarPasoBorradorSchema.safeParse({ modo: "editar", planId: randomUUID(), paso: "vigencia", valores });
      expect(claves(g)).toEqual(["valores.vigenteDesde"]);
      expect(mensajes(g, "valores.vigenteDesde")).toEqual(["Elige desde qué fecha rige el cambio."]);
    }
    expect(claves(ESQUEMAS_DE_EDITAR.vigencia.safeParse({ vigenteDesde: "2001-01-01" }))).toEqual([]);
  });
});

describe("R7 — los descuentos en lista", () => {
  const precio = ESQUEMAS_DE_CREAR.precio;

  it("período repetido", () => {
    const r = precio.safeParse(
      conPrecio([
        { periodo: "anual", tipo: "porcentaje", valor: "10" },
        { periodo: "mensual", tipo: "monto", valor: "100" },
        { periodo: "anual", tipo: "monto", valor: "500" },
      ]),
    );
    expect(claves(r)).toEqual(["precio.descuentos.anual"]);
    expect(mensajes(r, "precio.descuentos.anual")).toEqual([PERIODO_REPETIDO]);
  });

  it("porcentaje 0 y 100.01", () => {
    const r = precio.safeParse(
      conPrecio([
        { periodo: "anual", tipo: "porcentaje", valor: "0" },
        { periodo: "bimestral", tipo: "porcentaje", valor: "100.01" },
        { periodo: "mensual", tipo: "porcentaje", valor: "100" },
      ]),
    );
    expect(claves(r).sort()).toEqual(["precio.descuentos.anual.porcentaje", "precio.descuentos.bimestral.porcentaje"]);
  });

  it("monto inválido, con el mensaje de hoy", () => {
    const r = precio.safeParse(conPrecio([{ periodo: "quincenal", tipo: "monto", valor: "12,5" }]));
    expect(claves(r)).toEqual(["precio.descuentos.quincenal.monto"]);
    expect(mensajes(r, "precio.descuentos.quincenal.monto")).toEqual([MENSAJE_MONTO_COBRO_INVALIDO]);
  });

  it("un período o un tipo que no existen", () => {
    expect(claves(precio.safeParse(conPrecio([{ periodo: "semanal", tipo: "monto", valor: "1" }])))).toEqual([
      "precio.descuentos.0.periodo",
    ]);
    expect(claves(precio.safeParse(conPrecio([{ periodo: "anual", tipo: "fijo", valor: "1" }])))).toEqual([
      "precio.descuentos.0.tipo",
    ]);
  });

  it("sin precio con líneas", () => {
    const r = precio.safeParse({ precio: { tipo: "sin_precio", descuentos: [] } });
    expect(claves(r)).toEqual(["precio"]);
  });

  it("la lista vacía es sin descuentos", () => {
    const r = precio.safeParse(conPrecio([]));
    expect(r.success).toBe(true);
    expect(r.data).toEqual(conPrecio([]));
  });

  it("la lista se conserva en el orden en que llegó (R9)", () => {
    const lineas = [
      { periodo: "anual", tipo: "porcentaje", valor: "10" },
      { periodo: "quincenal", tipo: "monto", valor: "100" },
      { periodo: "mensual", tipo: "porcentaje", valor: "5.5" },
    ];
    expect(precio.safeParse(conPrecio(lineas)).data).toEqual(conPrecio(lineas));
  });
});

describe("R3 — guardar un paso: la entrada", () => {
  it("un plan nuevo empieza por General", () => {
    const r = guardarPasoBorradorSchema.safeParse({
      modo: "crear",
      borradorId: null,
      paso: "precio",
      valores: { precio: { tipo: "sin_precio" } },
    });
    expect(claves(r)).toEqual(["paso"]);
    expect(mensajes(r, "paso")).toEqual([UN_PLAN_NUEVO_EMPIEZA_POR_GENERAL]);
  });

  it("General sin borrador y otro paso con borrador son válidos", () => {
    expect(
      guardarPasoBorradorSchema.safeParse({ modo: "crear", borradorId: null, paso: "general", valores: GENERAL_PUBLICO })
        .success,
    ).toBe(true);
    expect(
      guardarPasoBorradorSchema.safeParse({
        modo: "crear",
        borradorId: randomUUID(),
        paso: "precio",
        valores: { precio: { tipo: "sin_precio" } },
      }).success,
    ).toBe(true);
  });

  it("los errores de valores salen con su ruta bajo `valores.` (el servicio quita el prefijo)", () => {
    const r = guardarPasoBorradorSchema.safeParse({
      modo: "editar",
      planId: randomUUID(),
      paso: "precio",
      valores: conPrecio([{ periodo: "anual", tipo: "porcentaje", valor: "0" }]),
    });
    expect(claves(r)).toEqual(["valores.precio.descuentos.anual.porcentaje"]);
  });

  it("`vigencia` no es un paso de crear, y un paso que no existe no es válido", () => {
    expect(
      guardarPasoBorradorSchema.safeParse({
        modo: "crear",
        borradorId: randomUUID(),
        paso: "vigencia",
        valores: { vigenteDesde: "2026-12-01" },
      }).success,
    ).toBe(false);
    expect(
      guardarPasoBorradorSchema.safeParse({ modo: "editar", planId: randomUUID(), paso: "revisar", valores: {} }).success,
    ).toBe(false);
  });

  it("al editar, General solo admite el nombre", () => {
    const r = guardarPasoBorradorSchema.safeParse({
      modo: "editar",
      planId: randomUUID(),
      paso: "general",
      valores: GENERAL_PUBLICO,
    });
    expect(claves(r)).toEqual(["valores"]);
  });

  it("leer pide un borrador o un plan, con uuid", () => {
    expect(leerBorradorSchema.safeParse({ borradorId: randomUUID() }).success).toBe(true);
    expect(leerBorradorSchema.safeParse({ planId: randomUUID() }).success).toBe(true);
    expect(leerBorradorSchema.safeParse({ planId: "x" }).success).toBe(false);
  });
});

// SLT-214 (design §3.7; R7, R10, R2–R4) — el paso «Beneficios» del borrador, en los dos modos. Sus errores salen
// en `beneficios.<i>.texto` (o `.icono`), la clave que el formulario pinta junto al campo de cada beneficio.
describe("SLT-214 — el paso «Beneficios» del borrador", () => {
  const MODOS = [
    ["crear", ESQUEMAS_DE_CREAR.beneficios],
    ["editar", ESQUEMAS_DE_EDITAR.beneficios],
  ] as const;

  it("R7: va justo después de «Módulos», y al editar antes de «Cuándo rige»", () => {
    expect(PASOS_DE_CREAR).toEqual(["general", "precio", "orden", "topes", "modulos", "beneficios"]);
    expect(PASOS_DE_EDITAR).toEqual(["general", "precio", "orden", "topes", "modulos", "beneficios", "vigencia"]);
  });

  it.each(MODOS)("R9, R10 (%s): la lista vacía y una lista válida pasan; el texto se guarda recortado", (_modo, esquema) => {
    expect(claves(esquema.safeParse({ beneficios: [] }))).toEqual([]);
    const r = esquema.safeParse({ beneficios: [{ icono: "soporte", texto: "  Soporte 24 h " }, { icono: "check", texto: "Envíos" }] });
    expect(r.success && r.data.beneficios).toEqual([
      { icono: "soporte", texto: "Soporte 24 h" },
      { icono: "check", texto: "Envíos" },
    ]);
  });

  it.each(MODOS)("R2–R4 (%s): cada error en `beneficios.<i>.<campo>` con su mensaje", (_modo, esquema) => {
    const r = esquema.safeParse({
      beneficios: [
        { icono: "soporte", texto: "Soporte 24 h" },
        { icono: "check", texto: "   " },
        { icono: "rayo", texto: "a".repeat(121) },
        { icono: "Users", texto: "Equipo" },
      ],
    });
    expect(claves(r).sort()).toEqual(["beneficios.1.texto", "beneficios.2.texto", "beneficios.3.icono"]);
    expect(mensajes(r, "beneficios.1.texto")).toEqual([TEXTO_VACIO]);
    expect(mensajes(r, "beneficios.2.texto")).toEqual([TEXTO_LARGO]);
    // R4 es un refinamiento de la lista: zod lo mira cuando cada beneficio ya es válido.
    const repetido = esquema.safeParse({
      beneficios: [
        { icono: "soporte", texto: "Soporte 24 h" },
        { icono: "estrella", texto: "SÓPORTE  24 H" },
      ],
    });
    expect(claves(repetido)).toEqual(["beneficios.1.texto"]);
    expect(mensajes(repetido, "beneficios.1.texto")).toEqual([BENEFICIO_REPETIDO]);
  });

  it.each(MODOS)("R3 (%s): sin la lista, o con claves de más, no pasa", (_modo, esquema) => {
    expect(esquema.safeParse({}).success).toBe(false);
    expect(esquema.safeParse({ beneficios: [], modulos: [] }).success).toBe(false);
    expect(claves(esquema.safeParse({ beneficios: [{ icono: "check", texto: "Uno", color: "rojo" }] }))).toEqual(["beneficios.0"]);
  });

  it("R10: guardar el paso en los dos modos; sus errores salen bajo `valores.beneficios.<i>.texto`", () => {
    const valores = { beneficios: [{ icono: "check", texto: "Uno" }] };
    expect(guardarPasoBorradorSchema.safeParse({ modo: "crear", borradorId: randomUUID(), paso: "beneficios", valores }).success).toBe(
      true,
    );
    expect(guardarPasoBorradorSchema.safeParse({ modo: "editar", planId: randomUUID(), paso: "beneficios", valores }).success).toBe(true);
    const r = guardarPasoBorradorSchema.safeParse({
      modo: "editar",
      planId: randomUUID(),
      paso: "beneficios",
      valores: { beneficios: [{ icono: "check", texto: "Uno" }, { icono: "rayo", texto: "uno" }] },
    });
    expect(claves(r)).toEqual(["valores.beneficios.1.texto"]);
  });
});
