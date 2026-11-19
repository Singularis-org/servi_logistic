import { describe, expect, it } from "vitest";

import {
  BENEFICIO_REPETIDO,
  CAMBIAN_ICONOS_U_ORDEN,
  ICONOS_DE_BENEFICIO,
  NOMBRE_DEL_ICONO,
  TEXTO_LARGO,
  TEXTO_VACIO,
  beneficiosSchema,
  cambiosDeBeneficios,
  claveDelBeneficio,
  type Beneficio,
} from "@/lib/planes/beneficios";
import { lineasDeCambioDelPlan, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import { crearPlanSchema, editarPlanSchema, versionPlanSchema, type PlanDTO } from "@/lib/types/planes";

// SLT-214 (design §3.1, §3.2) — el catálogo de íconos, el esquema de los beneficios y sus líneas de «qué cambia».

/** Los errores de un parse fallido, por ruta con puntos (`0.texto`), como los lee el formulario. */
function erroresDe(valor: unknown): Record<string, string[]> {
  const r = beneficiosSchema.safeParse(valor);
  if (r.success) return {};
  const salida: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const ruta = issue.path.join(".");
    (salida[ruta] ??= []).push(issue.message);
  }
  return salida;
}

describe("SLT-214 R5 — el catálogo de íconos", () => {
  it("ofrece exactamente los 12 íconos, en el orden del spec y con sus nombres", () => {
    expect(ICONOS_DE_BENEFICIO.map((i) => [i, NOMBRE_DEL_ICONO[i]])).toEqual([
      ["equipo", "Equipo de trabajo"],
      ["soporte", "Soporte"],
      ["reloj_24h", "Reloj 24 h"],
      ["rayo", "Rayo"],
      ["estrella", "Estrella"],
      ["escudo", "Escudo"],
      ["cohete", "Cohete"],
      ["regalo", "Regalo"],
      ["grafica", "Gráfica"],
      ["camion", "Camión"],
      ["check", "Check"],
      ["corazon", "Corazón"],
    ]);
    expect(Object.keys(NOMBRE_DEL_ICONO)).toHaveLength(12);
  });
});

describe("SLT-214 R1, R2 — el texto del beneficio", () => {
  it("R1: una lista vacía es válida", () => {
    expect(beneficiosSchema.parse([])).toEqual([]);
  });

  it("R1: no hay tope de cantidad", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => ({ icono: "check", texto: `Beneficio ${i}` }));
    expect(beneficiosSchema.parse(muchos)).toHaveLength(50);
  });

  it("R2: un texto válido se guarda sin los espacios de los extremos", () => {
    expect(beneficiosSchema.parse([{ icono: "rayo", texto: "  Acceso anticipado  " }])).toEqual([
      { icono: "rayo", texto: "Acceso anticipado" },
    ]);
  });

  it("R2: un texto vacío o solo de espacios da «Escribe el texto del beneficio.» en beneficios.<i>.texto", () => {
    expect(erroresDe([{ icono: "check", texto: "Soporte" }, { icono: "check", texto: "   " }])).toEqual({
      "1.texto": [TEXTO_VACIO],
    });
    expect(erroresDe([{ icono: "check", texto: "" }])).toEqual({ "0.texto": [TEXTO_VACIO] });
    expect(TEXTO_VACIO).toBe("Escribe el texto del beneficio.");
  });

  it("R2: admite 120 caracteres y rechaza 121 con «… admite hasta 120 caracteres.»", () => {
    expect(erroresDe([{ icono: "check", texto: "a".repeat(120) }])).toEqual({});
    expect(erroresDe([{ icono: "check", texto: ` ${"a".repeat(120)} ` }])).toEqual({});
    expect(erroresDe([{ icono: "check", texto: "a".repeat(121) }])).toEqual({ "0.texto": [TEXTO_LARGO] });
    expect(TEXTO_LARGO).toBe("El texto del beneficio admite hasta 120 caracteres.");
  });
});

describe("SLT-214 R3 — el ícono del beneficio", () => {
  it.each(["", "Users", "reloj", "CHECK", "corazón"])("rechaza «%s» con un error en beneficios.<i>.icono", (icono) => {
    expect(Object.keys(erroresDe([{ icono, texto: "Soporte" }]))).toEqual(["0.icono"]);
  });

  it("rechaza un beneficio sin ícono o con claves de más", () => {
    expect(Object.keys(erroresDe([{ texto: "Soporte" }]))).toEqual(["0.icono"]);
    expect(beneficiosSchema.safeParse([{ icono: "check", texto: "Soporte", posicion: 0 }]).success).toBe(false);
  });
});

describe("SLT-214 R4 — sin textos repetidos en un plan", () => {
  it("compara sin mayúsculas, tildes ni espacios de más", () => {
    expect(claveDelBeneficio("Soporte  24 h")).toBe("soporte 24 h");
    expect(claveDelBeneficio(" soporte 24 H")).toBe("soporte 24 h");
    expect(claveDelBeneficio("Sópórte 24 h")).toBe("soporte 24 h");
  });

  it("marca «Ya hay un beneficio con ese texto» en cada repetido después del primero", () => {
    expect(
      erroresDe([
        { icono: "check", texto: "Soporte  24 h" },
        { icono: "rayo", texto: "Acceso anticipado" },
        { icono: "soporte", texto: " soporte 24 H" },
        { icono: "estrella", texto: "Sópórte 24 h" },
      ]),
    ).toEqual({ "2.texto": [BENEFICIO_REPETIDO], "3.texto": [BENEFICIO_REPETIDO] });
    expect(BENEFICIO_REPETIDO).toBe("Ya hay un beneficio con ese texto");
  });

  it("textos distintos no chocan", () => {
    expect(erroresDe([{ icono: "check", texto: "Soporte 24 h" }, { icono: "check", texto: "Soporte 12 h" }])).toEqual({});
  });
});

const PLAN_PUBLICO = {
  nombre: "Básico",
  visibilidad: "publico" as const,
  organizacionId: null,
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" as const },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
};

const VERSION = {
  nombre: "Básico",
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" as const },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
};

describe("SLT-214 R2–R4, R18 — los beneficios en los esquemas del plan", () => {
  it("crearPlanSchema: sin `beneficios` vale (sin beneficios) y con ellos los recorta", () => {
    expect(crearPlanSchema.parse(PLAN_PUBLICO).beneficios).toBeUndefined();
    expect(
      crearPlanSchema.parse({ ...PLAN_PUBLICO, beneficios: [{ icono: "equipo", texto: " Equipo dedicado " }] }).beneficios,
    ).toEqual([{ icono: "equipo", texto: "Equipo dedicado" }]);
  });

  it("crearPlanSchema: los errores llegan con la ruta beneficios.<i>.<campo>", () => {
    const r = crearPlanSchema.safeParse({
      ...PLAN_PUBLICO,
      beneficios: [
        { icono: "check", texto: "Soporte" },
        { icono: "otro", texto: "Rayo" },
      ],
    });
    expect(r.success).toBe(false);
    const rutas = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(rutas).toEqual(["beneficios.1.icono"]);
  });

  it("R18: una versión sin `beneficios` sigue validando y los deja ausentes (sin cambio)", () => {
    expect(versionPlanSchema.parse(VERSION)).not.toHaveProperty("beneficios");
    expect(versionPlanSchema.parse({ ...VERSION, beneficios: [] }).beneficios).toEqual([]);
  });

  it("editarPlanSchema y versionPlanSchema aplican R4", () => {
    const repetidos = [
      { icono: "check", texto: "Acceso anticipado" },
      { icono: "rayo", texto: "acceso  anticipado" },
    ];
    const edicion = editarPlanSchema.safeParse({
      ...VERSION,
      planId: "6f1c0f7e-3c1a-4c55-9a51-1f2d3e4c5b6a",
      vigenteDesde: "2099-01-01",
      beneficios: repetidos,
    });
    expect(edicion.success ? [] : edicion.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["beneficios.1.texto", BENEFICIO_REPETIDO],
    ]);
    expect(versionPlanSchema.safeParse({ ...VERSION, beneficios: repetidos }).success).toBe(false);
  });
});

describe("SLT-214 R25 — cambiosDeBeneficios", () => {
  const SOPORTE: Beneficio = { icono: "soporte", texto: "Soporte 24 h" };
  const RAYO: Beneficio = { icono: "rayo", texto: "Acceso anticipado" };
  const ESTRELLA: Beneficio = { icono: "estrella", texto: "Features nuevas" };

  it("«Se agrega: <texto>» por cada beneficio nuevo, en el orden de después", () => {
    expect(cambiosDeBeneficios([SOPORTE], [ESTRELLA, SOPORTE, RAYO])).toEqual([
      "Se agrega: Features nuevas",
      "Se agrega: Acceso anticipado",
    ]);
  });

  it("«Se quita: <texto>» por cada beneficio que ya no está, en el orden de antes", () => {
    expect(cambiosDeBeneficios([RAYO, SOPORTE, ESTRELLA], [SOPORTE])).toEqual([
      "Se quita: Acceso anticipado",
      "Se quita: Features nuevas",
    ]);
  });

  it("agregados primero y quitados después cuando hay de los dos", () => {
    expect(cambiosDeBeneficios([SOPORTE, RAYO], [SOPORTE, ESTRELLA])).toEqual([
      "Se agrega: Features nuevas",
      "Se quita: Acceso anticipado",
    ]);
  });

  it("compara con la regla de R4: tildes, mayúsculas y espacios no cuentan como agregar ni quitar", () => {
    expect(cambiosDeBeneficios([SOPORTE], [{ icono: "soporte", texto: "Sópórte  24 h" }])).toEqual([
      CAMBIAN_ICONOS_U_ORDEN,
    ]);
  });

  it("solo cambian íconos u orden: una sola línea", () => {
    expect(CAMBIAN_ICONOS_U_ORDEN).toBe("Cambian los íconos o el orden de los beneficios.");
    expect(cambiosDeBeneficios([SOPORTE, RAYO], [RAYO, SOPORTE])).toEqual([CAMBIAN_ICONOS_U_ORDEN]);
    expect(cambiosDeBeneficios([SOPORTE], [{ ...SOPORTE, icono: "reloj_24h" }])).toEqual([CAMBIAN_ICONOS_U_ORDEN]);
  });

  it("sin diferencia, ninguna línea", () => {
    expect(cambiosDeBeneficios([], [])).toEqual([]);
    expect(cambiosDeBeneficios([SOPORTE, RAYO], [{ ...SOPORTE }, { ...RAYO }])).toEqual([]);
  });
});

// T6 (design §3.6): el camino entero de «Esto es lo que cambia:» (aviso de «Mi plan», correo, rastro y detalle de
// empresa) pasa por `diferenciasDelPlan` y luego por `lineasDeCambioDelPlan`.
describe("SLT-214 R25 — lineasDeCambioDelPlan con los beneficios", () => {
  const SOPORTE: Beneficio = { icono: "soporte", texto: "Soporte 24 h" };
  const RAYO: Beneficio = { icono: "rayo", texto: "Acceso anticipado" };
  const ESTRELLA: Beneficio = { icono: "estrella", texto: "Features nuevas" };
  const PLAN: PlanDTO = {
    id: "p1",
    nombre: "Pro",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: ["analitica"],
    beneficios: [SOPORTE, RAYO],
    precio: { tipo: "sin_precio" },
    costoPorOrden: null,
    costoPorOrdenPorcentual: null,
    archivado: false,
  };

  function lineas(despues: Partial<PlanDTO>): string[] {
    return lineasDeCambioDelPlan(diferenciasDelPlan(PLAN, { ...PLAN, ...despues }) as CambioDelPlanParaCorreo);
  }

  it("«Se agrega: …» y «Se quita: …», después de las líneas de los módulos", () => {
    expect(lineas({ modulos: [], beneficios: [SOPORTE, ESTRELLA] })).toEqual([
      "Deja de incluirse el módulo Analítica.",
      "Se agrega: Features nuevas",
      "Se quita: Acceso anticipado",
    ]);
  });

  it("solo íconos u orden: la línea única", () => {
    expect(lineas({ beneficios: [RAYO, SOPORTE] })).toEqual([CAMBIAN_ICONOS_U_ORDEN]);
    expect(lineas({ beneficios: [{ ...SOPORTE, icono: "reloj_24h" }, RAYO] })).toEqual([CAMBIAN_ICONOS_U_ORDEN]);
  });

  it("sin cambio en los beneficios, ni una línea suya; tampoco con una versión que no los trae (R18)", () => {
    expect(lineas({ nombre: "Pro 2" })).toEqual(["Nombre del plan: Pro → Pro 2"]);
    const { nombre, topes, modulos, precio } = PLAN;
    expect(lineas({ nombre, topes, modulos, precio })).toEqual([]);
  });
});
