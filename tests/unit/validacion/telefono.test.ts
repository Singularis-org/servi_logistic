import { describe, it, expect } from "vitest";
import { validarTelefonoDelPais } from "@/lib/validacion/telefono";

// SLT-42 (R14, R15, R16). La region es el `pais.id` (ISO alfa-2). `XA` es uno de los paises de
// prueba de SL-20, que no existe para libphonenumber.

describe("validarTelefonoDelPais (R14, R15)", () => {
  it("acepta un movil de CR y devuelve el numero nacional en digitos", () => {
    expect(validarTelefonoDelPais("8888-7777", "CR")).toEqual({ ok: true, nacional: "88887777" });
  });

  it("guarda el nacional sin prefijo internacional ni separadores", () => {
    expect(validarTelefonoDelPais("+506 8888 7777", "CR")).toEqual({
      ok: true,
      nacional: "88887777",
    });
  });

  it("rechaza un numero que no es valido en CR", () => {
    expect(validarTelefonoDelPais("1234", "CR")).toEqual({ ok: false, motivo: "invalido" });
    expect(validarTelefonoDelPais("12345678", "CR")).toEqual({ ok: false, motivo: "invalido" });
    expect(validarTelefonoDelPais("", "CR")).toEqual({ ok: false, motivo: "invalido" });
    expect(validarTelefonoDelPais("no es un telefono", "CR")).toEqual({
      ok: false,
      motivo: "invalido",
    });
  });

  it("rechaza un numero valido de Panama aunque la region sea CR", () => {
    expect(validarTelefonoDelPais("+507 6123 4567", "PA")).toEqual({
      ok: true,
      nacional: "61234567",
    });
    expect(validarTelefonoDelPais("+507 6123 4567", "CR")).toEqual({
      ok: false,
      motivo: "invalido",
    });
  });
});

describe("validarTelefonoDelPais con un pais sin reglas (R16)", () => {
  it("devuelve pais_sin_reglas para una region que libphonenumber no conoce", () => {
    expect(validarTelefonoDelPais("88887777", "XA")).toEqual({
      ok: false,
      motivo: "pais_sin_reglas",
    });
  });
});
