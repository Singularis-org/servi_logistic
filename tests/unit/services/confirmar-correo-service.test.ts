import { describe, expect, it, vi } from "vitest";

import { ConfirmarCorreoService } from "@/lib/services/ConfirmarCorreoService";
import type { ICambioCorreoRepository } from "@/lib/interfaces/repositories/IUserRepository";
import { loadAuthConfig, type AuthConfig } from "@/lib/config/auth";
import { hashPassword } from "@/lib/utils/password";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";

// SLT-221 (T2.5): el canje del enlace que confirma un cambio de correo. Sin sesión ni actor.

const SECRETO = "s".repeat(43);
const ENLACE = `cc-1.${SECRETO}`;
const IP = "203.0.113.7";
const CONFIG: AuthConfig = { ...loadAuthConfig(), RESET_MAX_VERIFY_ATTEMPTS: 3, RESET_VERIFY_WINDOW_MINUTES: 10 };

async function montar() {
  const secretoHash = await hashPassword(SECRETO);
  const repo = {
    empresaDelCambioCorreo: vi.fn().mockResolvedValue("org-1"),
    cambioCorreoParaCanje: vi.fn().mockResolvedValue({
      id: "cc-1",
      usuarioId: "usr-1",
      emailNuevo: "nuevo@empresa.test",
      secretoHash,
      solicitadoPorId: "maestro-1",
    }),
    aplicarCambioCorreo: vi.fn().mockResolvedValue("ok"),
  };
  // Solo los tres métodos del canje: ni sesiones ni contraseña (R1627, R1628).
  const service = new ConfirmarCorreoService(
    repo as unknown as Pick<
      ICambioCorreoRepository,
      "empresaDelCambioCorreo" | "cambioCorreoParaCanje" | "aplicarCambioCorreo"
    >,
    new ResetRateLimiter(),
    CONFIG,
  );
  return { service, repo };
}

const INVALIDO = { status: "invalid_or_expired" };

describe("SLT-221 · ConfirmarCorreoService", () => {
  it("R1622/R1628: enlace válido -> aplica ESE pendiente y responde ok, sin contraseña ni sesión", async () => {
    const { service, repo } = await montar();
    expect(await service.empresaDelEnlace({ enlace: ENLACE, ipAddress: IP })).toBe("org-1");
    expect(repo.empresaDelCambioCorreo).toHaveBeenCalledWith("cc-1");

    expect(await service.confirmar({ enlace: ENLACE, ipAddress: IP })).toEqual({ status: "ok" });
    expect(repo.cambioCorreoParaCanje).toHaveBeenCalledWith("cc-1");
    expect(repo.aplicarCambioCorreo).toHaveBeenCalledWith("cc-1");
  });

  describe("R1623: toda salida inválida es la misma respuesta y no cambia nada", () => {
    it("formato roto: sin leer la base", async () => {
      const { service, repo } = await montar();
      for (const enlace of ["sin-punto", ".solo-secreto", "solo-id."]) {
        expect(await service.empresaDelEnlace({ enlace, ipAddress: IP })).toBeNull();
        expect(await service.confirmar({ enlace, ipAddress: IP })).toEqual(INVALIDO);
      }
      expect(repo.empresaDelCambioCorreo).not.toHaveBeenCalled();
      expect(repo.cambioCorreoParaCanje).not.toHaveBeenCalled();
      expect(repo.aplicarCambioCorreo).not.toHaveBeenCalled();
    });

    it("inexistente: sin empresa", async () => {
      const { service, repo } = await montar();
      repo.empresaDelCambioCorreo.mockResolvedValue(null);
      expect(await service.empresaDelEnlace({ enlace: ENLACE, ipAddress: IP })).toBeNull();
    });

    // Anulado, usado y vencido los descarta el WHERE de `cambioCorreoParaCanje` (integración).
    for (const motivo of ["inexistente", "anulado", "usado", "vencido"]) {
      it(`${motivo}: el repositorio no lo da para canje`, async () => {
        const { service, repo } = await montar();
        repo.cambioCorreoParaCanje.mockResolvedValue(null);
        expect(await service.confirmar({ enlace: ENLACE, ipAddress: IP })).toEqual(INVALIDO);
        expect(repo.aplicarCambioCorreo).not.toHaveBeenCalled();
      });
    }

    it("secreto incorrecto: no aplica", async () => {
      const { service, repo } = await montar();
      const r = await service.confirmar({ enlace: `cc-1.${"x".repeat(43)}`, ipAddress: IP });
      expect(r).toEqual(INVALIDO);
      expect(repo.aplicarCambioCorreo).not.toHaveBeenCalled();
    });
  });

  it("R1625: si otro canje ganó la carrera, responde como enlace no válido", async () => {
    const { service, repo } = await montar();
    repo.aplicarCambioCorreo.mockResolvedValue("invalido");
    expect(await service.confirmar({ enlace: ENLACE, ipAddress: IP })).toEqual(INVALIDO);
  });

  it("R1624: correo ya usado en la empresa -> correo_en_uso", async () => {
    const { service, repo } = await montar();
    repo.aplicarCambioCorreo.mockResolvedValue("correo_en_uso");
    expect(await service.confirmar({ enlace: ENLACE, ipAddress: IP })).toEqual({ status: "correo_en_uso" });
  });

  it("R1629: superado el tope de intentos desde la misma IP, no lee nada; otra IP sigue pudiendo", async () => {
    const { service, repo } = await montar();
    for (let i = 0; i < CONFIG.RESET_MAX_VERIFY_ATTEMPTS; i++) {
      expect(await service.empresaDelEnlace({ enlace: ENLACE, ipAddress: IP })).toBe("org-1");
    }
    repo.empresaDelCambioCorreo.mockClear();
    expect(await service.empresaDelEnlace({ enlace: ENLACE, ipAddress: IP })).toBeNull();
    expect(repo.empresaDelCambioCorreo).not.toHaveBeenCalled();

    expect(await service.empresaDelEnlace({ enlace: ENLACE, ipAddress: "198.51.100.1" })).toBe("org-1");
  });
});
