import { describe, expect, it, vi } from "vitest";

import * as acciones from "@/lib/actions/mora-empresa";
import type { IMoraEmpresaRepository } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { IMoraEmpresaService } from "@/lib/interfaces/services/IMoraEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MODULO_POR_ACTION } from "@/lib/modulos/reparto";
import { MoraEmpresaService } from "@/lib/services/MoraEmpresaService";

// SLT-121 · T4.1 (design §5.4; R4, R24, R32) — el borde de la mora. Lo que se mide: el actor que llega al servicio es
// el de la sesión (`getActor`), nunca uno del cliente; la empresa del superadmin es la LIGADA en el servidor
// (primer argumento), no la que traiga el `input`; sin el rol que toca nada llega a la base (el servicio real con
// un repositorio que lanza si se le llama), y el banner no tumba la página si su lectura falla. Las reglas las mide
// `tests/unit/services/mora-empresa-service.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const SUPERADMIN: Actor = { usuarioId: "u-super", rol: "superadmin" };

const LIGADA = "0b7c6a2e-5d1f-4e3a-9c8b-1a2b3c4d5e6f";
const OTRA = "1c8d7b3f-6e2a-4f4b-8d9c-2b3c4d5e6f70";

function servicioEspia() {
  return {
    avisoDeMiEmpresa: vi.fn<IMoraEmpresaService["avisoDeMiEmpresa"]>(async () => ({ estado: "al_dia" })),
    moraDeEmpresa: vi.fn<IMoraEmpresaService["moraDeEmpresa"]>(async () => ({ estado: "not_found" })),
    fijarGracia: vi.fn<IMoraEmpresaService["fijarGracia"]>(async () => ({ estado: "ok" })),
    descongelar: vi.fn<IMoraEmpresaService["descongelar"]>(async () => ({ estado: "ok" })),
  } satisfies IMoraEmpresaService;
}

/** El servicio real sobre un repositorio que lanza en cualquier llamada: un `forbidden` no lee la base. */
function servicioSinBase(): IMoraEmpresaService {
  const lanza = () => {
    throw new Error("la base no debía leerse");
  };
  const repo: IMoraEmpresaRepository = {
    moraDeLaEmpresa: lanza,
    graciaDeLaEmpresa: lanza,
    estaCongelada: lanza,
    moraParaPlataforma: lanza,
    fijarGracia: lanza,
    descongelarAMano: lanza,
    existeEmpresa: lanza,
    empresasConMora: lanza,
    congelarSiVencida: lanza,
    encolarRecordatorios: lanza,
  };
  return new MoraEmpresaService(repo);
}

describe("lib/actions/mora-empresa — la empresa ligada manda (R32)", () => {
  it("fijarGraciaEmpresaAction pasa la empresa ligada, no la del input, con el actor de la sesión", async () => {
    const service = servicioEspia();
    const r = await acciones.fijarGraciaEmpresaAction(
      LIGADA,
      { organizacionId: OTRA, dias: 15 },
      { service, getActor: async () => SUPERADMIN },
    );
    expect(r).toEqual({ estado: "ok" });
    expect(service.fijarGracia).toHaveBeenCalledWith(SUPERADMIN, { organizacionId: LIGADA, dias: 15 });
  });

  it("descongelarEmpresaAction pasa la empresa ligada, no la del input", async () => {
    const service = servicioEspia();
    await acciones.descongelarEmpresaAction(
      LIGADA,
      { organizacionId: OTRA, motivo: "Acuerdo", hasta: "2026-11-30" },
      { service, getActor: async () => SUPERADMIN },
    );
    expect(service.descongelar).toHaveBeenCalledWith(SUPERADMIN, {
      organizacionId: LIGADA,
      motivo: "Acuerdo",
      hasta: "2026-11-30",
    });
  });

  it("un input que no es un objeto llega como solo la empresa ligada", async () => {
    const service = servicioEspia();
    await acciones.fijarGraciaEmpresaAction(LIGADA, "basura", { service, getActor: async () => SUPERADMIN });
    expect(service.fijarGracia).toHaveBeenCalledWith(SUPERADMIN, { organizacionId: LIGADA });
  });

  it("verMoraDeEmpresaAction lee la empresa ligada", async () => {
    const service = servicioEspia();
    await acciones.verMoraDeEmpresaAction(LIGADA, { service, getActor: async () => SUPERADMIN });
    expect(service.moraDeEmpresa).toHaveBeenCalledWith(SUPERADMIN, { organizacionId: LIGADA });
  });
});

describe("lib/actions/mora-empresa — R4: un rol de empresa no llega a la base", () => {
  for (const [nombre, actor] of [
    ["maestro", MAESTRO],
    ["admin", ADMIN],
    ["sin sesión", null],
  ] as const) {
    it(`con ${nombre}, las tres actions del superadmin responden forbidden sin leer`, async () => {
      const deps = { service: servicioSinBase(), getActor: async () => actor };
      expect(await acciones.verMoraDeEmpresaAction(LIGADA, deps)).toEqual({ estado: "forbidden" });
      expect(await acciones.fijarGraciaEmpresaAction(LIGADA, { dias: 15 }, deps)).toEqual({ estado: "forbidden" });
      expect(await acciones.descongelarEmpresaAction(LIGADA, { motivo: "m", hasta: "2026-11-30" }, deps)).toEqual({
        estado: "forbidden",
      });
    });
  }
});

describe("lib/actions/mora-empresa — el banner del layout (R24)", () => {
  it("lee el estado con el actor de la sesión", async () => {
    const service = servicioEspia();
    expect(await acciones.avisoMoraDelLayout({ service, getActor: async () => MAESTRO })).toEqual({ estado: "al_dia" });
    expect(service.avisoDeMiEmpresa).toHaveBeenCalledWith(MAESTRO);
  });

  it("el superadmin no consulta nada: null sin tocar la base", async () => {
    expect(await acciones.avisoMoraDelLayout({ service: servicioSinBase(), getActor: async () => SUPERADMIN })).toBeNull();
  });

  it("si la lectura falla, no hay banner (null) y el error queda en el registro", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = servicioEspia();
    service.avisoDeMiEmpresa.mockRejectedValueOnce(new Error("se cayó la base"));
    expect(await acciones.avisoMoraDelLayout({ service, getActor: async () => ADMIN })).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("lib/actions/mora-empresa — reparto por módulo", () => {
  it("es núcleo en MODULO_POR_ACTION", () => {
    expect(MODULO_POR_ACTION["mora-empresa"]).toBe("nucleo");
  });
});
