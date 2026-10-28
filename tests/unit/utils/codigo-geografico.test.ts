import { describe, it, expect } from "vitest";
import {
  CODIGO_LIBRE_MAX,
  tieneReglaDeCodigo,
  validarCodigo,
  type ReglaDeCodigoDePais,
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
