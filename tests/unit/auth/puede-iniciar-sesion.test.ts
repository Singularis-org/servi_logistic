import { describe, it, expect } from "vitest";
import { puedeIniciarSesion } from "@/lib/auth/puede-iniciar-sesion";

// SLT-32 — el predicado unico que comparten login, OTP y resolucion del actor.

describe("puedeIniciarSesion", () => {
  it("permite la sesion cuando el usuario tiene empresa", () => {
    expect(puedeIniciarSesion({ organizacionId: "org-1" })).toBe(true);
  });

  it("niega la sesion cuando la empresa es null", () => {
    expect(puedeIniciarSesion({ organizacionId: null })).toBe(false);
  });

  it("niega la sesion cuando la empresa no viene", () => {
    expect(puedeIniciarSesion({})).toBe(false);
  });

  it.each(["", "   "])("niega la sesion cuando la empresa es una cadena en blanco (%j)", (valor) => {
    expect(puedeIniciarSesion({ organizacionId: valor })).toBe(false);
  });
});
