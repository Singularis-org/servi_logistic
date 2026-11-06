import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

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

// Vitest resuelve la libreria por su entrada ESM; `tsx`, el que corre la demo de QA en el build, por
// la CJS. Con `libphonenumber-js/max` todo lo de arriba seguia verde y el build de `dev` cayo en el
// alta con un TypeError (#90). Por eso este caso corre el modulo en un `tsx` de verdad.
describe("validarTelefonoDelPais bajo tsx, como los scripts del build", () => {
  it("valida igual que en la app", async () => {
    const modulo = path.resolve("lib/validacion/telefono.ts");
    const codigo = `const { validarTelefonoDelPais: v } = require(${JSON.stringify(modulo)});
      console.log(JSON.stringify([v("8888-7777", "CR"), v("88887777", "XA")]));`;
    const { stdout } = await promisify(execFile)(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "-e", codigo]);
    expect(JSON.parse(stdout)).toEqual([
      { ok: true, nacional: "88887777" },
      { ok: false, motivo: "pais_sin_reglas" },
    ]);
  }, 30_000);
});
