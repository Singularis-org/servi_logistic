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

// B1 (R1629): el composition root real (`buildConfirmarCorreoService`) con el repositorio doblado.
// El espía se comparte entre instancias: cada petición construye un `UserRepository` nuevo.
const empresaDelCambioCorreo = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/repositories/UserRepository", () => ({
  UserRepository: class {
    empresaDelCambioCorreo = empresaDelCambioCorreo;
    cambioCorreoParaCanje = vi.fn(async () => null);
    aplicarCambioCorreo = vi.fn(async () => "invalido" as const);
  },
}));

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

  it("R1629: sin deps.service, el límite por (enlace, IP) cuenta entre peticiones del composition root", async () => {
    const { confirmarCambioCorreo } = await import("@/lib/actions/confirmar-correo");
    const { authConfig } = await import("@/lib/config/auth");
    const tope = authConfig.RESET_MAX_VERIFY_ATTEMPTS;
    // Un enlace propio de este test: el limitador del módulo vive mientras viva el módulo.
    const enlace = `9f0e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f.${"t".repeat(43)}`;
    empresaDelCambioCorreo.mockClear();

    for (let i = 0; i < tope + 3; i++) {
      expect(await confirmarCambioCorreo({ enlace }, { getContext })).toEqual({ status: "invalid_or_expired" });
    }

    // Pasado el tope ya no se lee la base: solo las `tope` primeras peticiones llegan al repositorio.
    expect(empresaDelCambioCorreo).toHaveBeenCalledTimes(tope);
    expect(empresaDelCambioCorreo).toHaveBeenCalledWith("9f0e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f");
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
