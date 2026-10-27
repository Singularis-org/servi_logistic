import { describe, it, expect, vi } from "vitest";
import * as accionesRecuperacion from "@/lib/actions/password-reset";
import { solicitarRecuperacion } from "@/lib/actions/password-reset";
import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";

// Feature 20 / R1, R12. SL-18 (R20): los pasos del codigo ya no existen; el modulo no los exporta.
// Su prueba con base real esta en `tests/integration/actions/recuperar-por-empresa.test.ts`.

const CTX = { ipAddress: "1.2.3.4", userAgent: "vitest-agent" };

function buildService(overrides: Partial<IPasswordResetService> = {}): IPasswordResetService {
  return {
    solicitar: vi.fn().mockResolvedValue({ status: "ok" }),
    emitirEnlaceBienvenida: vi.fn(),
    anularEnlaceBienvenida: vi.fn(),
    crearContrasenaConEnlace: vi.fn(),
    ...overrides,
  };
}

describe("Server Action solicitarRecuperacion", () => {
  it("R1/R12: devuelve ok generico exista o no el email", async () => {
    const service = buildService();
    const result = await solicitarRecuperacion(
      { email: "ana@example.com" },
      { service, getContext: async () => CTX },
    );
    expect(result).toEqual({ status: "ok" });
    expect(service.solicitar).toHaveBeenCalledTimes(1);
  });

  it("rechaza email invalido con validation_error sin llamar al servicio", async () => {
    const service = buildService();
    const result = await solicitarRecuperacion(
      { email: "no-es-email" },
      { service, getContext: async () => CTX },
    );
    expect(result.status).toBe("validation_error");
    expect(service.solicitar).not.toHaveBeenCalled();
  });
});

describe("SL-18 R20 — sin pasos del codigo", () => {
  it("el modulo ya no exporta verificarCodigoRecuperacion ni restablecerContrasena", () => {
    expect("verificarCodigoRecuperacion" in accionesRecuperacion).toBe(false);
    expect("restablecerContrasena" in accionesRecuperacion).toBe(false);
  });
});
