import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IConfirmarCorreoService } from "@/lib/interfaces/services/IConfirmarCorreoService";

// SLT-221 (T2.5): el borde público del canje. Se mide el paso por `comoPlataforma` (solo la empresa
// del enlace) y después por `conEmpresa(org)` (el canje), en ese orden.

const pasos: string[] = [];
let contexto: string | null = null;

vi.mock("@/lib/db/contexto-empresa", () => ({
  comoPlataforma: async (ficha: string, motivo: string, fn: () => Promise<unknown>) => {
    pasos.push(`plataforma:${ficha}:${motivo}`);
    contexto = "plataforma";
    try {
      return await fn();
    } finally {
      contexto = null;
    }
  },
  conEmpresa: async (org: string, fn: () => Promise<unknown>) => {
    pasos.push(`empresa:${org}`);
    contexto = `empresa:${org}`;
    try {
      return await fn();
    } finally {
      contexto = null;
    }
  },
}));
vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) as never }));

const ENLACE = `0b6b1c1e-3a52-4d8c-9e43-7c1d2a3b4c5d.${"s".repeat(43)}`;
const getContext = async () => ({ ipAddress: "203.0.113.7", userAgent: "test" });

function servicio(empresa: string | null = "org-1") {
  const vistos: Record<string, string | null> = {};
  const service: IConfirmarCorreoService = {
    empresaDelEnlace: vi.fn(async () => {
      vistos.empresaDelEnlace = contexto;
      return empresa;
    }),
    confirmar: vi.fn(async () => {
      vistos.confirmar = contexto;
      return { status: "ok" as const };
    }),
  };
  return { service, vistos };
}

describe("SLT-221 · confirmarCambioCorreo (borde público)", () => {
  beforeEach(() => {
    pasos.length = 0;
  });

  it("entrada mal formada o con claves de más -> validation_error sin llamar al servicio", async () => {
    const { confirmarCambioCorreo } = await import("@/lib/actions/confirmar-correo");
    const { service } = servicio();
    for (const input of [null, {}, { enlace: "" }, { enlace: "no es un enlace" }, { enlace: ENLACE, password: "x" }]) {
      expect(await confirmarCambioCorreo(input, { service, getContext })).toEqual({ status: "validation_error" });
    }
    expect(service.empresaDelEnlace).not.toHaveBeenCalled();
    expect(service.confirmar).not.toHaveBeenCalled();
    expect(pasos).toEqual([]);
  });

  it("R1628: sin sesión; la empresa se lee en comoPlataforma y el canje corre en conEmpresa(org)", async () => {
    const { confirmarCambioCorreo } = await import("@/lib/actions/confirmar-correo");
    const { service, vistos } = servicio("org-1");

    const r = await confirmarCambioCorreo({ enlace: ENLACE }, { service, getContext });

    expect(r).toEqual({ status: "ok" });
    expect(pasos).toEqual([
      "plataforma:SL-18:confirmar cambio de correo: el enlace lleva a su empresa",
      "empresa:org-1",
    ]);
    expect(vistos).toEqual({ empresaDelEnlace: "plataforma", confirmar: "empresa:org-1" });
    expect(service.empresaDelEnlace).toHaveBeenCalledWith({ enlace: ENLACE, ipAddress: "203.0.113.7" });
    expect(service.confirmar).toHaveBeenCalledWith({ enlace: ENLACE, ipAddress: "203.0.113.7" });
  });

  it("R1623: sin empresa para el enlace -> invalid_or_expired y no abre ninguna empresa", async () => {
    const { confirmarCambioCorreo } = await import("@/lib/actions/confirmar-correo");
    const { service } = servicio(null);

    expect(await confirmarCambioCorreo({ enlace: ENLACE }, { service, getContext })).toEqual({
      status: "invalid_or_expired",
    });
    expect(service.confirmar).not.toHaveBeenCalled();
    expect(pasos.some((p) => p.startsWith("empresa:"))).toBe(false);
  });

  it("propaga correo_en_uso del servicio tal cual (R1624)", async () => {
    const { confirmarCambioCorreo } = await import("@/lib/actions/confirmar-correo");
    const { service } = servicio("org-1");
    vi.mocked(service.confirmar).mockResolvedValue({ status: "correo_en_uso" });
    expect(await confirmarCambioCorreo({ enlace: ENLACE }, { service, getContext })).toEqual({
      status: "correo_en_uso",
    });
  });
});
