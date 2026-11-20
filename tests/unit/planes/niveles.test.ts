import { describe, expect, it } from "vitest";

import {
  DEMASIADOS_NIVELES,
  MAX_NIVELES,
  META_INVALIDA,
  META_NO_CRECE,
  SIN_NIVELES,
  descuentosDelNivel,
  nivelesSchema,
  textoDeLosNiveles,
  textoDelNivel,
  type Nivel,
} from "@/lib/planes/niveles";
import { crearPlanSchema, editarPlanSchema, versionPlanSchema, SOLO_UNA_FORMA } from "@/lib/types/planes";

// SLT-215 (design §3.1, §3.2; R1–R5, R18, R20, R21) — el esquema de los niveles de un plan, los descuentos que
// acumula un nivel y sus textos.

/** Los errores de un parse fallido, por ruta con puntos (`0.meta`), como los lee el formulario. */
function erroresDe(valor: unknown): Record<string, string[]> {
  const r = nivelesSchema.safeParse(valor);
  if (r.success) return {};
  const salida: Record<string, string[]> = {};
  for (const issue of r.error.issues) (salida[issue.path.join(".")] ??= []).push(issue.message);
  return salida;
}

const pct = (porcentaje: string) => ({ tipo: "porcentaje" as const, porcentaje });
const monto = (m: string) => ({ tipo: "monto" as const, monto: m });
const nivel = (meta: number, descuento: Nivel["descuento"] = pct("10")): Nivel => ({ meta, descuento });

describe("SLT-215 R1 — la lista de niveles", () => {
  it("acepta la lista vacía, uno solo y diez con metas crecientes, en su orden", () => {
    expect(nivelesSchema.parse([])).toEqual([]);
    expect(nivelesSchema.parse([nivel(1)])).toEqual([nivel(1)]);
    const diez = Array.from({ length: MAX_NIVELES }, (_, i) => nivel((i + 1) * 100, i % 2 ? monto("50") : pct("5")));
    expect(nivelesSchema.parse(diez)).toEqual(diez);
  });

  it("es `.strict()`: una clave de más en el nivel es un error", () => {
    expect(nivelesSchema.safeParse([{ ...nivel(1), numero: 1 }]).success).toBe(false);
  });
});

describe("SLT-215 R3 — la meta", () => {
  it("rechaza 0, negativa, decimal y NaN con «Escribe una meta de al menos 1 orden.» en `<i>.meta`", () => {
    for (const meta of [0, -5, 1.5, Number.NaN]) {
      expect(erroresDe([nivel(meta)])).toEqual({ "0.meta": [META_INVALIDA] });
    }
    expect(META_INVALIDA).toBe("Escribe una meta de al menos 1 orden.");
  });

  it("rechaza una meta igual o menor que la anterior con «La meta debe ser mayor que la del nivel anterior.» en su campo", () => {
    expect(erroresDe([nivel(100), nivel(100)])).toEqual({ "1.meta": [META_NO_CRECE] });
    expect(erroresDe([nivel(100), nivel(200), nivel(150), nivel(300)])).toEqual({ "2.meta": [META_NO_CRECE] });
    expect(META_NO_CRECE).toBe("La meta debe ser mayor que la del nivel anterior.");
  });
});

describe("SLT-215 R4 — el descuento", () => {
  it("porcentaje: rechaza 0 y 100,01 y acepta 100 y 0,01 con dos decimales; el error va en `<i>.descuento.porcentaje`", () => {
    expect(Object.keys(erroresDe([nivel(1, pct("0"))]))).toEqual(["0.descuento.porcentaje"]);
    expect(Object.keys(erroresDe([nivel(1, pct("100.01"))]))).toEqual(["0.descuento.porcentaje"]);
    expect(Object.keys(erroresDe([nivel(1, pct("10.555"))]))).toEqual(["0.descuento.porcentaje"]);
    expect(erroresDe([nivel(1, pct("100"))])).toEqual({});
    expect(erroresDe([nivel(1, pct("0.01"))])).toEqual({});
  });

  it("monto: rechaza 0, 0,00, negativo y tres decimales; acepta 0,01 y diez cifras enteras; el error va en `<i>.descuento.monto`", () => {
    for (const m of ["0", "0.00", "-5", "1.005", "12345678901"]) {
      expect(Object.keys(erroresDe([nivel(1, monto(m))]))).toEqual(["0.descuento.monto"]);
    }
    expect(erroresDe([nivel(1, monto("0.01"))])).toEqual({});
    expect(erroresDe([nivel(1, monto("9999999999.99"))])).toEqual({});
  });

  it("las dos formas a la vez dan «Un descuento es porcentaje o monto fijo, no los dos.» en el campo de la otra", () => {
    expect(erroresDe([{ meta: 1, descuento: { tipo: "porcentaje", porcentaje: "10", monto: "5" } }])).toEqual({
      "0.descuento.monto": [SOLO_UNA_FORMA],
    });
    expect(erroresDe([{ meta: 1, descuento: { tipo: "monto", monto: "5", porcentaje: "10" } }])).toEqual({
      "0.descuento.porcentaje": [SOLO_UNA_FORMA],
    });
    expect(SOLO_UNA_FORMA).toBe("Un descuento es porcentaje o monto fijo, no los dos.");
  });

  it("sin descuento, o con un tipo desconocido, es un error", () => {
    expect(nivelesSchema.safeParse([{ meta: 1 }]).success).toBe(false);
    expect(nivelesSchema.safeParse([{ meta: 1, descuento: { tipo: "otro" } }]).success).toBe(false);
  });
});

describe("SLT-215 R5 — hasta 10 niveles", () => {
  it("11 niveles dan «Un plan admite hasta 10 niveles.» en la lista", () => {
    const once = Array.from({ length: MAX_NIVELES + 1 }, (_, i) => nivel(i + 1));
    expect(erroresDe(once)).toEqual({ "": [DEMASIADOS_NIVELES] });
    expect(DEMASIADOS_NIVELES).toBe("Un plan admite hasta 10 niveles.");
  });
});

describe("SLT-215 R2 — los descuentos de un nivel", () => {
  const niveles = [nivel(100, pct("10")), nivel(200, pct("10")), nivel(300, monto("15"))];

  it("el nivel n da los descuentos de los niveles 1 a n, en orden (el ejemplo: nivel 2 con 10 % y 10 %)", () => {
    expect(descuentosDelNivel(niveles, 2)).toEqual([pct("10"), pct("10")]);
    expect(descuentosDelNivel(niveles, 3)).toEqual([pct("10"), pct("10"), monto("15")]);
    expect(descuentosDelNivel(niveles, 1)).toEqual([pct("10")]);
  });

  it("el nivel 0 no da descuentos", () => {
    expect(descuentosDelNivel(niveles, 0)).toEqual([]);
    expect(descuentosDelNivel([], 0)).toEqual([]);
  });
});

describe("SLT-215 R21, R20 — los textos", () => {
  it("R21: un nivel en porcentaje y uno en monto, sin moneda y con dos decimales", () => {
    expect(textoDelNivel(1, nivel(150, pct("10")))).toBe("Nivel 1: desde 150 órdenes, −10.00 %");
    expect(textoDelNivel(2, nivel(300, monto("1500")))).toBe("Nivel 2: desde 300 órdenes, −1500.00");
    expect(textoDelNivel(3, nivel(1000, pct("12.5")))).toBe("Nivel 3: desde 1000 órdenes, −12.50 %");
  });

  it("R20: la lista en una línea separada por «; », y «Sin niveles» si está vacía", () => {
    expect(textoDeLosNiveles([nivel(150, pct("10")), nivel(300, monto("1500.00"))])).toBe(
      "Nivel 1: desde 150 órdenes, −10.00 %; Nivel 2: desde 300 órdenes, −1500.00",
    );
    expect(textoDeLosNiveles([])).toBe("Sin niveles");
    expect(SIN_NIVELES).toBe("Sin niveles");
  });
});

describe("SLT-215 R1, R18 — los niveles en los esquemas del plan", () => {
  const BASE_CREAR = {
    nombre: "Plan con niveles",
    visibilidad: "publico" as const,
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "sin_precio" as const },
    costoPorOrden: null,
    costoPorOrdenPorcentual: null,
  };
  const BASE_VERSION = {
    nombre: "Plan con niveles",
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "sin_precio" as const },
    costoPorOrden: null,
    costoPorOrdenPorcentual: null,
  };

  it("crear: `niveles` es opcional (ausente = sin niveles) y se valida con R3–R5", () => {
    expect(crearPlanSchema.safeParse(BASE_CREAR).success).toBe(true);
    expect(crearPlanSchema.parse({ ...BASE_CREAR, niveles: [nivel(10), nivel(20)] }).niveles).toEqual([nivel(10), nivel(20)]);
    const r = crearPlanSchema.safeParse({ ...BASE_CREAR, niveles: [nivel(20), nivel(10)] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([["niveles.1.meta", META_NO_CRECE]]);
  });

  it("R18: una versión sin `niveles` valida y queda sin la clave (sin cambio); con la lista vacía, la trae vacía", () => {
    const sin = versionPlanSchema.parse(BASE_VERSION);
    expect("niveles" in sin).toBe(false);
    expect(versionPlanSchema.parse({ ...BASE_VERSION, niveles: [] }).niveles).toEqual([]);
    expect(
      editarPlanSchema.safeParse({
        ...BASE_VERSION,
        planId: "6f1c0c39-6b8f-4a39-9d4e-0b9f8a1c2d3e",
        vigenteDesde: "2026-12-01",
        niveles: Array.from({ length: 11 }, (_, i) => nivel(i + 1)),
      }).success,
    ).toBe(false);
  });
});
