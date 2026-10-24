import { describe, it, expect, vi } from "vitest";

import { crearContrasenaConEnlace } from "@/lib/actions/password-reset";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { IPasswordResetService, ResetOutcome } from "@/lib/interfaces/services/IPasswordResetService";

// SL-41 / T8 (design §7.3) — el borde del canje del enlace de bienvenida: el schema en la entrada
// (R19 por la forma), el reparto a `ok` o `invalid_or_expired` (R18, R19) y el contexto de plataforma.
// El canje en si (los 8 pasos) se prueba en `tests/unit/password-reset-enlace.test.ts`.

const CTX = { ipAddress: "198.51.100.4", userAgent: "vitest-agent" };
const ENLACE = "0b9d7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4.Zq3_x-Kp9LmN2oPqRsTuVwXyZ0123456789abcdEFGH";
const FUERTE = "Abcdef1!";

function servicio(outcome: ResetOutcome = { status: "ok" }) {
  const contextos: (ContextoDatos | undefined)[] = [];
  const crear = vi.fn<IPasswordResetService["crearContrasenaConEnlace"]>(async () => {
    contextos.push(contextoActual());
    return outcome;
  });
  const service: IPasswordResetService = {
    solicitar: vi.fn(),
    verificarCodigo: vi.fn(),
    restablecer: vi.fn(),
    emitirEnlaceBienvenida: vi.fn(),
    crearContrasenaConEnlace: crear,
  };
  return { service, crear, contextos };
}

describe("crearContrasenaConEnlace — validation_error en el borde, sin llamar al servicio", () => {
  it.each([
    ["sin separador", ENLACE.replace(".", "")],
    ["un código de 6 dígitos", "123456"],
    ["un secreto corto (22 caracteres, 128 bits)", `${ENLACE.split(".")[0]}.${"a".repeat(22)}`],
    ["un secreto con caracteres fuera de base64url", `${ENLACE.split(".")[0]}.${"+".repeat(43)}`],
    ["un id que no es un UUID", `${"x".repeat(36)}.${ENLACE.split(".")[1]}`],
    ["vacío", ""],
  ])("enlace mal formado: %s", async (_caso, enlace) => {
    const { service, crear } = servicio();
    const r = await crearContrasenaConEnlace(
      { enlace, password: FUERTE, confirmPassword: FUERTE },
      { service, getContext: async () => CTX },
    );
    expect(r.status).toBe("validation_error");
    expect(crear).not.toHaveBeenCalled();
  });

  it("las contraseñas no coinciden: el error cae en confirmPassword", async () => {
    const { service, crear } = servicio();
    const r = await crearContrasenaConEnlace(
      { enlace: ENLACE, password: FUERTE, confirmPassword: "Abcdef1?" },
      { service, getContext: async () => CTX },
    );
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["confirmPassword"]);
    expect(crear).not.toHaveBeenCalled();
  });

  it("una contraseña que no cumple la política fuerte", async () => {
    const { service, crear } = servicio();
    const r = await crearContrasenaConEnlace(
      { enlace: ENLACE, password: "debil", confirmPassword: "debil" },
      { service, getContext: async () => CTX },
    );
    expect(r.status).toBe("validation_error");
    expect(crear).not.toHaveBeenCalled();
  });
});

describe("crearContrasenaConEnlace — delega en el servicio", () => {
  it("R18: ok, con el enlace, la contraseña y la IP, en plataforma con SL-41", async () => {
    const { service, crear, contextos } = servicio({ status: "ok" });
    const r = await crearContrasenaConEnlace(
      { enlace: ENLACE, password: FUERTE, confirmPassword: FUERTE },
      { service, getContext: async () => CTX },
    );
    expect(r).toEqual({ status: "ok" });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(crear).toHaveBeenCalledWith({ enlace: ENLACE, newPassword: FUERTE, ipAddress: CTX.ipAddress });
    expect(contextos).toEqual([{ tipo: "plataforma", ficha: "SL-41", motivo: "login" }]);
  });

  it("R19: invalid_or_expired tal cual, sin más detalle", async () => {
    const { service } = servicio({ status: "invalid_or_expired" });
    const r = await crearContrasenaConEnlace(
      { enlace: ENLACE, password: FUERTE, confirmPassword: FUERTE },
      { service, getContext: async () => CTX },
    );
    expect(r).toEqual({ status: "invalid_or_expired" });
  });
});
