import { describe, it, expect, vi } from "vitest";
import {
  solicitarRecuperacion,
  verificarCodigoRecuperacion,
  restablecerContrasena,
} from "@/lib/actions/password-reset";
import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";

// Feature 20 / R1, R12. SL-18 (R20): los pasos del codigo ya no llegan al servicio. Su prueba con
// base real esta en `tests/integration/actions/recuperar-por-empresa.test.ts`.

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

describe("SL-18 R20 — los envoltorios de transicion del paso del codigo", () => {
  it("verificarCodigoRecuperacion responde invalid_or_expired sin llamar al servicio", async () => {
    const service = buildService();
    const result = await verificarCodigoRecuperacion(
      { email: "ana@example.com", code: "123456" },
      { service, getContext: async () => CTX },
    );
    expect(result).toEqual({ status: "invalid_or_expired" });
    for (const metodo of Object.values(service)) expect(metodo).not.toHaveBeenCalled();
  });

  it("restablecerContrasena responde invalid_or_expired sin llamar al servicio", async () => {
    const service = buildService();
    const result = await restablecerContrasena(
      { email: "ana@example.com", code: "123456", password: "Abcdef1!", confirmPassword: "Abcdef1!" },
      { service, getContext: async () => CTX },
    );
    expect(result).toEqual({ status: "invalid_or_expired" });
    for (const metodo of Object.values(service)) expect(metodo).not.toHaveBeenCalled();
  });
});
