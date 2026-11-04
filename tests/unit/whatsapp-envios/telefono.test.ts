import { describe, it, expect } from "vitest";
import { enmascararTelefono } from "@/lib/whatsapp-envios/telefono";
import { telefonoSirveParaEnvio, type ReglasTelefono } from "@/lib/utils/telefono-pais";

// SLT-42 (R20, R21): `telefonoValido` se retiro; sus casos se mantienen sobre
// `telefonoSirveParaEnvio` con las reglas de Costa Rica y deben dar lo mismo.
const CR: ReglasTelefono = { prefijo: "506", digitosNacionales: 8 };
const telefonoValido = (raw: string | null): boolean => telefonoSirveParaEnvio(raw, CR);

// Ficha 474 (T2.4, R17/R29/R42) — validez y enmascarado.

describe("474/R29 — telefono valido para envio (SLT-42: telefonoSirveParaEnvio con CR)", () => {
  it("vacio es invalido", () => {
    expect(telefonoValido("")).toBe(false);
    expect(telefonoValido(null)).toBe(false);
  });

  it("7 digitos es invalido", () => {
    expect(telefonoValido("8888777")).toBe(false);
  });

  it("8 digitos locales CR se normalizan a 506 + 8 = valido", () => {
    expect(telefonoValido("8888-7777")).toBe(true);
  });

  it("506 truncado (10 digitos) es invalido", () => {
    expect(telefonoValido("5068888777")).toBe(false);
  });

  it("506 con 11 digitos es valido", () => {
    expect(telefonoValido("+506 8888 7777")).toBe(true);
  });

  it("+1 internacional de 11 digitos es valido", () => {
    expect(telefonoValido("+1 305 555 0100")).toBe(true);
  });

  it("mas de 15 digitos es invalido", () => {
    expect(telefonoValido("+1234567890123456")).toBe(false);
  });
});

describe("474/R42 — enmascararTelefono", () => {
  it("solo los 4 ultimos digitos", () => {
    expect(enmascararTelefono("50688887777")).toBe("•••• 7777");
  });

  it("no filtra el resto del numero", () => {
    expect(enmascararTelefono("50688887777")).not.toContain("8888");
  });

  it("menos de 4 digitos -> solo puntos", () => {
    expect(enmascararTelefono("12")).toBe("••••");
  });
});
