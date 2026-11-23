import { describe, it, expect } from "vitest";
import {
  CODIGO_LIBRE_MAX,
  tieneReglaDeCodigo,
  tipoDeNivelDePais,
  validarCodigo,
  validarCodigoDeTipo,
  type ReglaDeCodigoDePais,
  type ReglaDeCodigoDeTipo,
} from "@/lib/utils/codigo-geografico";

// SL-20 R17 — DONDE el pais tiene regla de codigo (hoy solo CR: 1/3/5 digitos y prefijo del padre),
// un codigo que no la cumple se rechaza; DONDE no la tiene, vale cualquier texto de 1 a 20
// caracteres sin espacios. La regla llega como DATOS del pais, no como un `if (pais === "CR")`.

const CON_REGLA_1_3_5: ReglaDeCodigoDePais = {
  digitosCodigoNivel1: 1,
  digitosCodigoNivel2: 3,
  digitosCodigoNivel3: 5,
};
const SIN_REGLA: ReglaDeCodigoDePais = {
  digitosCodigoNivel1: null,
  digitosCodigoNivel2: null,
  digitosCodigoNivel3: null,
};

describe("R17 — pais con regla de digitos (la de CR, 1/3/5)", () => {
  it("acepta los codigos reales de CR con su prefijo", () => {
    expect(validarCodigo(CON_REGLA_1_3_5, "provincia", "1", null)).toBeNull();
    expect(validarCodigo(CON_REGLA_1_3_5, "canton", "101", "1")).toBeNull();
    expect(validarCodigo(CON_REGLA_1_3_5, "distrito", "10101", "101")).toBeNull();
  });

  it("rechaza un codigo con un numero de digitos distinto del de su nivel", () => {
    expect(validarCodigo(CON_REGLA_1_3_5, "provincia", "10", null)).toMatch(/exactamente 1 dígito\./);
    expect(validarCodigo(CON_REGLA_1_3_5, "canton", "1011", "1")).toMatch(/exactamente 3 dígitos/);
    expect(validarCodigo(CON_REGLA_1_3_5, "distrito", "1010", "101")).toMatch(
      /exactamente 5 dígitos/,
    );
  });

  it("rechaza un codigo que no es solo digitos aunque tenga la longitud justa", () => {
    expect(validarCodigo(CON_REGLA_1_3_5, "provincia", "A", null)).not.toBeNull();
    expect(validarCodigo(CON_REGLA_1_3_5, "canton", "1A1", "1")).not.toBeNull();
    expect(validarCodigo(CON_REGLA_1_3_5, "canton", "1 1", "1")).not.toBeNull();
  });

  it("rechaza un hijo cuyo codigo no empieza por el de su padre", () => {
    expect(validarCodigo(CON_REGLA_1_3_5, "canton", "201", "1")).toMatch(/empezar por .*«1»/);
    expect(validarCodigo(CON_REGLA_1_3_5, "distrito", "10201", "101")).toMatch(/«101»/);
  });

  it("rechaza el codigo de un hijo cuyo padre no tiene codigo", () => {
    expect(validarCodigo(CON_REGLA_1_3_5, "canton", "101", null)).toMatch(/padre no tiene código/);
  });

  it("a la provincia no le importa el codigo del padre (no tiene)", () => {
    expect(validarCodigo(CON_REGLA_1_3_5, "provincia", "7", "9")).toBeNull();
  });

  it("la regla sale de los datos: otro pais con 2/4/6 la aplica igual, sin literal de pais", () => {
    const otra: ReglaDeCodigoDePais = {
      digitosCodigoNivel1: 2,
      digitosCodigoNivel2: 4,
      digitosCodigoNivel3: 6,
    };
    expect(validarCodigo(otra, "provincia", "05", null)).toBeNull();
    expect(validarCodigo(otra, "canton", "0512", "05")).toBeNull();
    expect(validarCodigo(otra, "provincia", "5", null)).not.toBeNull();
  });
});

describe("R17 — pais sin regla de codigo", () => {
  it("acepta cualquier texto de 1 a 20 caracteres sin espacios, sin mirar al padre", () => {
    expect(validarCodigo(SIN_REGLA, "provincia", "A", null)).toBeNull();
    expect(validarCodigo(SIN_REGLA, "canton", "ZZ-01", "otro")).toBeNull();
    expect(validarCodigo(SIN_REGLA, "distrito", "x".repeat(CODIGO_LIBRE_MAX), null)).toBeNull();
    expect(validarCodigo(SIN_REGLA, "distrito", "01", "999")).toBeNull();
  });

  it("rechaza un codigo vacio, con espacios o de mas de 20 caracteres", () => {
    expect(validarCodigo(SIN_REGLA, "provincia", "", null)).toMatch(/1 a 20 caracteres/);
    expect(validarCodigo(SIN_REGLA, "provincia", "A B", null)).toMatch(/sin espacios/);
    expect(validarCodigo(SIN_REGLA, "provincia", "A\tB", null)).not.toBeNull();
    expect(
      validarCodigo(SIN_REGLA, "provincia", "x".repeat(CODIGO_LIBRE_MAX + 1), null),
    ).not.toBeNull();
  });
});

// SLT-46 R17 (design §4.5) — la regla pasa a leerse del TIPO de nivel. La tabla de arriba se corre
// tambien contra `validarCodigoDeTipo` con los tipos que `pais_tipos_de_nivel` deriva de cada pais
// (nivel 1 sin prefijo; 2 y 3 con prefijo si tienen digitos): para CR tiene que dar EXACTAMENTE lo
// mismo, mensaje incluido (R12).

type Caso = [regla: ReglaDeCodigoDePais, nivel: "provincia" | "canton" | "distrito", codigo: string, padre: string | null];

const OTRA_2_4_6: ReglaDeCodigoDePais = {
  digitosCodigoNivel1: 2,
  digitosCodigoNivel2: 4,
  digitosCodigoNivel3: 6,
};

const CASOS_SL20: Caso[] = [
  [CON_REGLA_1_3_5, "provincia", "1", null],
  [CON_REGLA_1_3_5, "canton", "101", "1"],
  [CON_REGLA_1_3_5, "distrito", "10101", "101"],
  [CON_REGLA_1_3_5, "provincia", "10", null],
  [CON_REGLA_1_3_5, "canton", "1011", "1"],
  [CON_REGLA_1_3_5, "distrito", "1010", "101"],
  [CON_REGLA_1_3_5, "provincia", "A", null],
  [CON_REGLA_1_3_5, "canton", "1A1", "1"],
  [CON_REGLA_1_3_5, "canton", "1 1", "1"],
  [CON_REGLA_1_3_5, "canton", "201", "1"],
  [CON_REGLA_1_3_5, "distrito", "10201", "101"],
  [CON_REGLA_1_3_5, "canton", "101", null],
  [CON_REGLA_1_3_5, "provincia", "7", "9"],
  [OTRA_2_4_6, "provincia", "05", null],
  [OTRA_2_4_6, "canton", "0512", "05"],
  [OTRA_2_4_6, "provincia", "5", null],
  [SIN_REGLA, "provincia", "A", null],
  [SIN_REGLA, "canton", "ZZ-01", "otro"],
  [SIN_REGLA, "distrito", "x".repeat(CODIGO_LIBRE_MAX), null],
  [SIN_REGLA, "distrito", "01", "999"],
  [SIN_REGLA, "provincia", "", null],
  [SIN_REGLA, "provincia", "A B", null],
  [SIN_REGLA, "provincia", "A\tB", null],
  [SIN_REGLA, "provincia", "x".repeat(CODIGO_LIBRE_MAX + 1), null],
];

/** El tipo que el trigger `pais_tipos_de_nivel` de SLT-43 escribe para ese nivel del pais. */
function tipoComoElTrigger(regla: ReglaDeCodigoDePais, nivel: Caso[1]): ReglaDeCodigoDeTipo {
  const digitos = {
    provincia: regla.digitosCodigoNivel1,
    canton: regla.digitosCodigoNivel2,
    distrito: regla.digitosCodigoNivel3,
  }[nivel];
  return { digitosCodigo: digitos, codigoHeredaPrefijo: nivel !== "provincia" && digitos !== null };
}

describe("SLT-46 R17 — validarCodigoDeTipo da lo mismo que la regla de SL-20 (tabla de CR)", () => {
  it.each(CASOS_SL20)("caso %#: mismo resultado y mismo mensaje por el tipo que por el pais", (regla, nivel, codigo, padre) => {
    expect(validarCodigoDeTipo(tipoComoElTrigger(regla, nivel), codigo, padre)).toBe(
      validarCodigo(regla, nivel, codigo, padre),
    );
  });

  it("la tabla no es trivial: hay aceptados y rechazados", () => {
    const resultados = CASOS_SL20.map(([r, n, c, p]) => validarCodigoDeTipo(tipoComoElTrigger(r, n), c, p));
    expect(resultados.filter((x) => x === null).length).toBeGreaterThan(5);
    expect(resultados.filter((x) => x !== null).length).toBeGreaterThan(5);
  });
});

describe("SLT-46 R17 — tipo de cualquier profundidad", () => {
  const LIBRE: ReglaDeCodigoDeTipo = { digitosCodigo: null, codigoHeredaPrefijo: false };

  it("un tipo sin digitos acepta de 1 a 20 caracteres sin espacios, sin mirar al padre", () => {
    expect(validarCodigoDeTipo(LIBRE, "B-7", "999")).toBeNull();
    expect(validarCodigoDeTipo(LIBRE, "x".repeat(CODIGO_LIBRE_MAX), null)).toBeNull();
    expect(validarCodigoDeTipo(LIBRE, "", null)).toMatch(/1 a 20 caracteres/);
    expect(validarCodigoDeTipo(LIBRE, "B 7", null)).toMatch(/sin espacios/);
    expect(validarCodigoDeTipo(LIBRE, "x".repeat(CODIGO_LIBRE_MAX + 1), null)).not.toBeNull();
  });

  it("un tipo sin digitos ignora la marca de herencia (no hay prefijo que heredar)", () => {
    expect(validarCodigoDeTipo({ digitosCodigo: null, codigoHeredaPrefijo: true }, "ZZ", "1")).toBeNull();
  });

  it("un tipo de profundidad 4 con 7 digitos y herencia exige longitud y prefijo del padre", () => {
    const barrio: ReglaDeCodigoDeTipo = { digitosCodigo: 7, codigoHeredaPrefijo: true };
    expect(validarCodigoDeTipo(barrio, "1010101", "10101")).toBeNull();
    expect(validarCodigoDeTipo(barrio, "101010", "10101")).toMatch(/exactamente 7 dígitos/);
    expect(validarCodigoDeTipo(barrio, "2010101", "10101")).toMatch(/«10101»/);
    expect(validarCodigoDeTipo(barrio, "1010101", null)).toMatch(/padre no tiene código/);
  });

  it("con digitos y sin herencia no mira al padre", () => {
    expect(validarCodigoDeTipo({ digitosCodigo: 2, codigoHeredaPrefijo: false }, "07", "9")).toBeNull();
  });

  it("tipoDeNivelDePais traduce la regla del pais como el trigger", () => {
    expect(tipoDeNivelDePais(CON_REGLA_1_3_5, "provincia")).toEqual({ digitosCodigo: 1, codigoHeredaPrefijo: false });
    expect(tipoDeNivelDePais(CON_REGLA_1_3_5, "distrito")).toEqual({ digitosCodigo: 5, codigoHeredaPrefijo: true });
    expect(tipoDeNivelDePais(SIN_REGLA, "canton")).toEqual({ digitosCodigo: null, codigoHeredaPrefijo: false });
  });
});

describe("tieneReglaDeCodigo", () => {
  it("distingue los tres puestos de los tres nulos", () => {
    expect(tieneReglaDeCodigo(CON_REGLA_1_3_5)).toBe(true);
    expect(tieneReglaDeCodigo(SIN_REGLA)).toBe(false);
  });

  it("falla con contexto ante una regla a medias en vez de aceptar codigos en silencio", () => {
    expect(() =>
      tieneReglaDeCodigo({ digitosCodigoNivel1: 1, digitosCodigoNivel2: null, digitosCodigoNivel3: 5 }),
    ).toThrow(/regla de codigo del pais incompleta: digitos 1\/null\/5/);
  });
});
