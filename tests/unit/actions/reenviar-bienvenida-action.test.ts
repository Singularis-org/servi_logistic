import { describe, it, expect, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import { bienvenidasPendientesAction, reenviarBienvenidaAction } from "@/lib/actions/organizaciones";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { IBienvenidaMaestroRepository } from "@/lib/interfaces/repositories/IBienvenidaMaestroRepository";
import type {
  EnviarBienvenidaResultado,
  IBienvenidaMaestroService,
} from "@/lib/interfaces/services/IBienvenidaMaestroService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-41 / T8 (design §7.2 y §16.2) — R30, R32, R33 y R38 en las actions. El SQL de «primer maestro»
// y de «pendientes» se prueba contra Postgres en `tests/integration/db/bienvenida-maestro-repository.test.ts`.

const ORG = "6f1c2a4e-1b7d-4c3e-9a8f-1234567890ab";
const SUPERADMIN: Actor = { usuarioId: "u-super", rol: "superadmin", organizacionId: null };
const CONTEXTO = async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" });

// Todos los roles de la app menos el superadmin: el literal es el contrato y `satisfies` obliga a
// decidir aquí cualquier rol nuevo del enum.
const ES_PLATAFORMA = {
  maestro: false,
  admin: false,
  mensajero: false,
  adminTienda: false,
  adminSatelite: false,
  apiKey: false,
  superadmin: true,
} satisfies Record<RolValue, boolean>;
const ROLES_DE_EMPRESA = (Object.keys(ES_PLATAFORMA) as RolValue[]).filter((r) => !ES_PLATAFORMA[r]);

function bienvenidaDoble(resultado: EnviarBienvenidaResultado = { estado: "enviada", email: "lucia@ejemplo.test" }) {
  const contextos: (ContextoDatos | undefined)[] = [];
  const enviar = vi.fn<IBienvenidaMaestroService["enviar"]>(async () => {
    contextos.push(contextoActual());
    return resultado;
  });
  return { bienvenida: { enviar } satisfies IBienvenidaMaestroService, enviar, contextos };
}

function repoDoble(leer: () => Promise<string[]> = async () => [ORG]) {
  const contextos: (ContextoDatos | undefined)[] = [];
  const organizacionesConBienvenidaPendiente = vi.fn(async () => {
    contextos.push(contextoActual());
    return leer();
  });
  const maestroParaBienvenida = vi.fn(async () => null);
  const repo: IBienvenidaMaestroRepository = { organizacionesConBienvenidaPendiente, maestroParaBienvenida };
  return { repo, organizacionesConBienvenidaPendiente, maestroParaBienvenida, contextos };
}

describe("R30 — el superadmin reenvía la bienvenida de una empresa", () => {
  it.each<EnviarBienvenidaResultado>([
    { estado: "enviada", email: "lucia@ejemplo.test" },
    { estado: "no_enviada", email: "lucia@ejemplo.test" },
    { estado: "sin_correo", email: "lucia@ejemplo.test" },
    { estado: "sin_maestro" },
  ])("devuelve lo que dice el servicio: $estado", async (resultado) => {
    const { bienvenida, enviar, contextos } = bienvenidaDoble(resultado);
    const r = await reenviarBienvenidaAction(
      { organizacionId: ORG },
      { getActor: async () => SUPERADMIN, bienvenida, getContext: CONTEXTO },
    );
    expect(r).toEqual(resultado);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith({ organizacionId: ORG, ipAddress: "203.0.113.5" });
    expect(contextos).toEqual([{ tipo: "plataforma", ficha: "SL-41", motivo: "reenvio de bienvenida" }]);
  });

  it("si armar el envío falla, responde no_enviada y no lanza", async () => {
    const { bienvenida, enviar } = bienvenidaDoble();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await reenviarBienvenidaAction(
      { organizacionId: ORG },
      {
        getActor: async () => SUPERADMIN,
        bienvenida,
        getContext: async () => {
          throw new Error("sin cabeceras");
        },
      },
    );
    expect(r).toEqual({ estado: "no_enviada", email: null });
    expect(enviar).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("R32 — quien no es superadmin recibe no_autorizado sin leer, emitir ni enviar", () => {
  it("la tabla cubre los siete roles y solo uno es de plataforma", () => {
    expect(ROLES_DE_EMPRESA).toHaveLength(6);
  });

  it.each(ROLES_DE_EMPRESA)("rol %s", async (rol) => {
    const { bienvenida, enviar } = bienvenidaDoble();
    const getContext = vi.fn(CONTEXTO);
    const r = await reenviarBienvenidaAction(
      { organizacionId: ORG },
      { getActor: async () => ({ usuarioId: `u-${rol}`, rol, organizacionId: ORG }), bienvenida, getContext },
    );
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(enviar).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
  });

  it("sin sesión, y aunque el id no sea un UUID: no_autorizado antes que invalida", async () => {
    const { bienvenida, enviar } = bienvenidaDoble();
    const r = await reenviarBienvenidaAction({ organizacionId: "no-es-uuid" }, { getActor: async () => null, bienvenida });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("R33 — el identificador de la empresa", () => {
  it.each([
    ["no es un UUID", { organizacionId: "envios-del-sur" }],
    ["falta", {}],
    ["no es un objeto", "6f1c2a4e-1b7d-4c3e-9a8f-1234567890ab"],
    ["es null", null],
  ])("si %s, responde invalida sin llamar al servicio", async (_caso, input) => {
    const { bienvenida, enviar } = bienvenidaDoble();
    const r = await reenviarBienvenidaAction(input, { getActor: async () => SUPERADMIN, bienvenida, getContext: CONTEXTO });
    expect(r).toEqual({ estado: "invalida" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("un UUID de una empresa sin maestro, o que no existe, responde sin_maestro", async () => {
    const { bienvenida } = bienvenidaDoble({ estado: "sin_maestro" });
    const r = await reenviarBienvenidaAction(
      { organizacionId: "00000000-0000-4000-8000-000000000000" },
      { getActor: async () => SUPERADMIN, bienvenida, getContext: CONTEXTO },
    );
    expect(r).toEqual({ estado: "sin_maestro" });
  });
});

describe("R38 — bienvenidasPendientesAction", () => {
  it.each(ROLES_DE_EMPRESA)("rol %s: no_autorizado sin leer nada", async (rol) => {
    const { repo, organizacionesConBienvenidaPendiente } = repoDoble();
    const r = await bienvenidasPendientesAction({
      getActor: async () => ({ usuarioId: `u-${rol}`, rol, organizacionId: ORG }),
      bienvenidaRepo: repo,
    });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(organizacionesConBienvenidaPendiente).not.toHaveBeenCalled();
  });

  it("sin sesión: no_autorizado sin leer nada", async () => {
    const { repo, organizacionesConBienvenidaPendiente } = repoDoble();
    const r = await bienvenidasPendientesAction({ getActor: async () => null, bienvenidaRepo: repo });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(organizacionesConBienvenidaPendiente).not.toHaveBeenCalled();
  });

  it("el superadmin recibe las empresas pendientes, leídas en plataforma con SL-41", async () => {
    const otra = "11111111-2222-4333-8444-555555555555";
    const { repo, contextos } = repoDoble(async () => [ORG, otra]);
    const r = await bienvenidasPendientesAction({ getActor: async () => SUPERADMIN, bienvenidaRepo: repo });
    expect(r).toEqual({ estado: "ok", organizacionIds: [ORG, otra] });
    expect(contextos).toEqual([
      { tipo: "plataforma", ficha: "SL-41", motivo: "bienvenidas pendientes de la pantalla Empresas" },
    ]);
  });

  it("si la lectura falla: error, sin el mensaje, ni en la respuesta ni en la consola", async () => {
    const MENSAJE = "connection refused a lucia@ejemplo.test";
    const { repo } = repoDoble(async () => {
      throw new Error(MENSAJE);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await bienvenidasPendientesAction({ getActor: async () => SUPERADMIN, bienvenidaRepo: repo });
    expect(r).toEqual({ estado: "error" });
    expect(JSON.stringify(r)).not.toContain(MENSAJE);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain(MENSAJE);
    error.mockRestore();
  });
});
