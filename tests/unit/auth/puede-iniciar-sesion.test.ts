import { describe, it, expect } from "vitest";
import type { EstadoUsuario } from "@prisma/client";
import { puedeIniciarSesion, type SujetoDeSesion } from "@/lib/auth/puede-iniciar-sesion";

// SLT-32 — el predicado unico que comparten login, OTP, resolucion del actor y guard del
// middleware. Contrato de SL-18 design §9: activo y (con empresa o de plataforma).

const base: SujetoDeSesion = { estado: "activo", organizacionId: "org-1", rol: "maestro" };

describe("puedeIniciarSesion", () => {
  it("permite la sesion cuando el usuario esta activo y tiene empresa", () => {
    expect(puedeIniciarSesion(base)).toBe(true);
  });

  it("niega la sesion cuando la empresa es null y el rol es de empresa", () => {
    expect(puedeIniciarSesion({ ...base, organizacionId: null })).toBe(false);
  });

  it.each(["", "   "])("niega la sesion cuando la empresa es una cadena en blanco (%j)", (valor) => {
    expect(puedeIniciarSesion({ ...base, organizacionId: valor })).toBe(false);
  });

  it("SL-32: permite la sesion a la cuenta de plataforma (superadmin) sin empresa", () => {
    expect(puedeIniciarSesion({ ...base, organizacionId: null, rol: "superadmin" })).toBe(true);
  });

  it.each<EstadoUsuario>(["inactivo", "bloqueado", "pendiente"])(
    "niega la sesion a una cuenta %s aunque tenga empresa o sea de plataforma",
    (estado) => {
      expect(puedeIniciarSesion({ ...base, estado })).toBe(false);
      expect(puedeIniciarSesion({ estado, organizacionId: null, rol: "superadmin" })).toBe(false);
    },
  );
});
