import { describe, it, expect } from "vitest";
import { validarDocumento, type ReglaDocumento } from "@/lib/utils/documento";

// SLT-42 (R10, P5). Las reglas son las de los cinco tipos que R3 siembra; aqui son solo datos de
// entrada: el modulo no sabe de ningun pais.

const CEDULA_FISICA: ReglaDocumento = { caracteres: "digitos", largoMin: 9, largoMax: 9 };
const DIMEX: ReglaDocumento = { caracteres: "digitos", largoMin: 11, largoMax: 12 };
const PASAPORTE: ReglaDocumento = { caracteres: "alfanumerico", largoMin: 6, largoMax: 20 };

describe("validarDocumento con una regla de solo digitos (R10)", () => {
  it("acepta el largo exacto y devuelve el valor tal cual", () => {
    expect(validarDocumento("123456789", CEDULA_FISICA)).toEqual({ ok: true, valor: "123456789" });
  });

  it("rechaza un largo distinto con un mensaje que dice el largo", () => {
    const r = validarDocumento("12345678", CEDULA_FISICA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("9");
    expect(validarDocumento("1234567890", CEDULA_FISICA).ok).toBe(false);
  });

  it("acepta los dos extremos de un rango y rechaza fuera de el", () => {
    expect(validarDocumento("12345678901", DIMEX).ok).toBe(true);
    expect(validarDocumento("123456789012", DIMEX).ok).toBe(true);
    expect(validarDocumento("1234567890", DIMEX).ok).toBe(false);
    expect(validarDocumento("1234567890123", DIMEX).ok).toBe(false);
  });

  it("rechaza letras, guiones y espacios: no los limpia", () => {
    expect(validarDocumento("1-2345-6789", CEDULA_FISICA).ok).toBe(false);
    expect(validarDocumento("1 2345 678", CEDULA_FISICA).ok).toBe(false);
    expect(validarDocumento("12345678A", CEDULA_FISICA).ok).toBe(false);
    expect(validarDocumento("", CEDULA_FISICA).ok).toBe(false);
  });
});

describe("validarDocumento con la regla del pasaporte (P5: alfanumerico, sin espacios, 6 a 20)", () => {
  it("acepta letras y digitos y guarda en mayusculas", () => {
    expect(validarDocumento("ab123456", PASAPORTE)).toEqual({ ok: true, valor: "AB123456" });
    expect(validarDocumento("A12345", PASAPORTE)).toEqual({ ok: true, valor: "A12345" });
    expect(validarDocumento("A".repeat(20), PASAPORTE).ok).toBe(true);
  });

  it("rechaza menos de 6 o mas de 20 caracteres", () => {
    expect(validarDocumento("A1234", PASAPORTE).ok).toBe(false);
    expect(validarDocumento("A".repeat(21), PASAPORTE).ok).toBe(false);
  });

  it("rechaza espacios, guiones y letras fuera de A-Z", () => {
    expect(validarDocumento("AB 123456", PASAPORTE).ok).toBe(false);
    expect(validarDocumento("AB-123456", PASAPORTE).ok).toBe(false);
    expect(validarDocumento("ÑB123456", PASAPORTE).ok).toBe(false);
  });
});
