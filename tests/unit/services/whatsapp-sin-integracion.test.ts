import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextoDatos } from "@/lib/db/contexto-empresa";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// SL-36 (design §9.1; R23, R24, R29) — una empresa SIN WhatsApp, por los composition roots REALES de
// cada consumidor (nada de servicios inyectados): actions, jobs y cron.
//
// Lo unico que se sustituye es la base: `IntegracionRepository` responde «no hay integracion» (o una
// ilegible) y anota en que contexto se le pregunto; la empresa de la sesion es `org-sesion`. Asi se
// mide lo que importa del cableado: que cada consumidor PIDE la credencial a la empresa en curso y,
// sin ella, se comporta como dice R24, sin una sola llamada de red (`fetch` espiado):
//   - actions de chat y plantillas: `no_configurado` / el texto «WhatsApp no está configurado en tu
//     empresa», nunca una excepcion;
//   - jobs: fallan con `WhatsappNoConfiguradoError`, un error normal que la cola reintenta con
//     backoff hasta su tope y luego entierra (el job NO queda en bucle ni tumba el drenado);
//   - cron de plantillas: salta la empresa y la cuenta.

const DOBLE = vi.hoisted(() => ({
  lecturas: [] as { servicio: string; contexto: unknown }[],
  marcas: [] as { servicio: string; codigo: string; contexto: unknown }[],
  /** null = sin integracion; "ilegible" = una fila con un secreto que no se descifra. */
  fila: null as null | "ilegible",
}));

vi.mock("@/lib/repositories/IntegracionRepository", async () => {
  const { contextoActual: ctx } = await import("@/lib/db/contexto-empresa");
  return {
    IntegracionRepository: class {
      async porServicio(servicio: string) {
        DOBLE.lecturas.push({ servicio, contexto: ctx() });
        if (DOBLE.fila === null) return null;
        return {
          id: "int-1",
          servicio,
          estado: "conectada",
          whatsappNumeroId: "111",
          datosPublicos: { wabaId: "222", nombreVisible: "n", telefonoVisible: "t", nombreVerificado: "v" },
          secretos: { token_acceso: "v1:roto", app_secret: "v1:roto" },
        };
      }
      async marcarError(servicio: string, codigo: string) {
        DOBLE.marcas.push({ servicio, codigo, contexto: ctx() });
      }
    },
  };
});

vi.mock("@/lib/crypto/boveda-integraciones", async (original) => {
  const real = await original<typeof import("@/lib/crypto/boveda-integraciones")>();
  return {
    ...real,
    BovedaIntegraciones: class {
      async descifrar(): Promise<string> {
        throw new real.CredencialIlegibleError("no_autentica");
      }
    },
  };
});

vi.mock("@/lib/auth/empresa-de-la-peticion", () => ({ empresaDeLaPeticion: async () => "org-sesion" }));

// Ningun repositorio de negocio llega a consultar: la credencial se pide antes. El cliente es un
// objeto vacio para que una consulta inesperada falle a la vista en vez de ir a una base.
vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));

const { WhatsappNoConfiguradoError, TEXTO_WHATSAPP_NO_CONFIGURADO } = await import("@/lib/config/whatsapp");
const { enviarMensajeChat, enviarPlantillaChat } = await import("@/lib/actions/chat-whatsapp");
const { sincronizarPlantillasWhatsapp } = await import("@/lib/actions/plantillas-sync");
const { estadoAppMeta } = await import("@/lib/actions/plantillas");
const { metaReal } = await import("@/lib/services/jobs/whatsapp-envio-deps");
const { crearWhatsappChatEnvioHandler } = await import("@/lib/services/jobs/whatsapp-chat-envio-handler");
const { crearWhatsappTemplateSyncHandler } = await import("@/lib/services/jobs/whatsapp-template-sync-handler");
const { crearWhatsappBienvenidaHandler } = await import("@/lib/services/jobs/whatsapp-bienvenida-handler");
const { handleSyncPlantillas } = await import("@/app/api/cron/sync-plantillas-whatsapp/route");
const { whatsappDeLaEmpresa, whatsappDeLaEmpresaOpcional } = await import(
  "@/lib/services/whatsapp/whatsapp-de-la-empresa"
);
const { conEmpresa, comoPlataforma } = await import("@/lib/db/contexto-empresa");

const MENSAJERO = { usuarioId: "u-1", rol: "mensajero" } as never;
const MAESTRO = { usuarioId: "u-2", rol: "maestro" } as never;
const ordenReader = {
  findParaEnvio: vi.fn(async () => ({ orden: { telefonoDest: "50688887777" } }) as never),
};

function job(payload: Record<string, unknown>): JobDTO {
  return { id: "job-1", payload, intentos: 1, maxIntentos: 5 } as unknown as JobDTO;
}

let red: ReturnType<typeof vi.spyOn>;
let avisos: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  DOBLE.lecturas.length = 0;
  DOBLE.marcas.length = 0;
  DOBLE.fila = null;
  red = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("no deberia haber red");
  });
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  red.mockRestore();
  avisos.mockRestore();
});

const enLaSesion: ContextoDatos = { tipo: "empresa", organizacionId: "org-sesion" };

describe("SL-36/R24 — actions, jobs y cron sin integración", () => {
  describe("actions (empresa de la sesion)", () => {
    it("chat: texto y plantilla responden no_configurado, sin red y preguntando a la empresa de la sesión", async () => {
      expect(await enviarMensajeChat("o-1", "hola", { getActor: async () => MENSAJERO, ordenReader })).toEqual({
        status: "no_configurado",
      });
      expect(
        await enviarPlantillaChat("o-1", "pl-1", {
          getActor: async () => MENSAJERO,
          ordenReader,
          plantillaRepo: { findEnviableById: async () => ({ id: "pl-1" }) as never },
        }),
      ).toEqual({ status: "no_configurado" });
      expect(DOBLE.lecturas).toEqual([
        { servicio: "whatsapp", contexto: enLaSesion },
        { servicio: "whatsapp", contexto: enLaSesion },
      ]);
      expect(red).not.toHaveBeenCalled();
    });

    it("sincronizar plantillas a mano: no_configurado, sin red", async () => {
      expect(await sincronizarPlantillasWhatsapp({ getActor: async () => MAESTRO })).toEqual({ status: "no_configurado" });
      expect(DOBLE.lecturas).toEqual([{ servicio: "whatsapp", contexto: enLaSesion }]);
      expect(red).not.toHaveBeenCalled();
    });

    it("estado de la app de Meta: «WhatsApp no está configurado en tu empresa», sin red", async () => {
      const r = await estadoAppMeta({ getActor: async () => MAESTRO });
      expect(r).toMatchObject({ status: "ok", estado: "no_identificada" });
      expect((r as { mensaje: string }).mensaje).toContain(TEXTO_WHATSAPP_NO_CONFIGURADO.replace(/\.$/, ""));
      expect(red).not.toHaveBeenCalled();
    });
  });

  describe("jobs (empresa del job)", () => {
    const casos = [
      { nombre: "whatsapp_chat_envio", handler: () => crearWhatsappChatEnvioHandler(), payload: { mensajeChatId: "m-1" } },
      {
        nombre: "whatsapp_template_sync",
        handler: () => crearWhatsappTemplateSyncHandler(),
        payload: { plantillaId: "pl-1", operacion: "crear" },
      },
      {
        nombre: "whatsapp_bienvenida",
        handler: () => crearWhatsappBienvenidaHandler(),
        payload: { ordenId: "o-1", mensajeroId: "u-1", ocurridoAt: "2026-10-25T10:00:00Z" },
      },
    ];

    it.each(casos)("$nombre: falla con WhatsappNoConfiguradoError (recuperable), en la empresa del job y sin red", async (c) => {
      await expect(conEmpresa("org-job", () => c.handler()(job(c.payload)))).rejects.toBeInstanceOf(
        WhatsappNoConfiguradoError,
      );
      expect(DOBLE.lecturas).toEqual([{ servicio: "whatsapp", contexto: { tipo: "empresa", organizacionId: "org-job" } }]);
      expect(red).not.toHaveBeenCalled();
    });

    it("los cinco handlers de envíos: su Meta perezosa rechaza igual, en la empresa del job y sin red", async () => {
      await expect(conEmpresa("org-job", () => metaReal())).rejects.toBeInstanceOf(WhatsappNoConfiguradoError);
      expect(DOBLE.lecturas[0]?.contexto).toEqual({ tipo: "empresa", organizacionId: "org-job" });
      expect(red).not.toHaveBeenCalled();
    });

    it("R29: credencial ilegible -> mismo desenlace, y la integración queda marcada en SU empresa", async () => {
      DOBLE.fila = "ilegible";
      await expect(conEmpresa("org-job", () => metaReal())).rejects.toMatchObject({
        name: "WhatsappNoConfiguradoError",
        motivo: "ilegible",
      });
      expect(DOBLE.marcas).toEqual([
        { servicio: "whatsapp", codigo: "credencial_ilegible", contexto: { tipo: "empresa", organizacionId: "org-job" } },
      ]);
      expect(red).not.toHaveBeenCalled();
    });
  });

  describe("cron de plantillas (por empresa)", () => {
    it("salta cada empresa sin WhatsApp, la cuenta y no llama a Meta", async () => {
      const empresas = {
        organizacion: { findMany: vi.fn(async () => [{ id: "org-a" }, { id: "org-b" }]) },
      };
      const res = await handleSyncPlantillas(
        new Request("https://x/api/cron/sync-plantillas-whatsapp", { headers: { authorization: "Bearer s" } }),
        { getSecret: () => "s", empresas },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        leidas: 0,
        actualizadas: 0,
        sinCambios: 0,
        ignoradas: 0,
        // SL-23 (R21): el resumen cuenta también las empresas con WhatsApp apagado (aquí, ninguna).
        empresas: { procesadas: 0, fallidas: [], sinWhatsapp: 2, saltadas: 0 },
      });
      // Cada empresa pregunto por SU credencial, en su contexto.
      expect(DOBLE.lecturas.map((l) => l.contexto)).toEqual([
        { tipo: "empresa", organizacionId: "org-a" },
        { tipo: "empresa", organizacionId: "org-b" },
      ]);
      expect(red).not.toHaveBeenCalled();
    });
  });

  describe("la puerta común", () => {
    it("en plataforma no hay credencial que leer: falla cerrado sin consultar", async () => {
      await expect(comoPlataforma("SL-36", "test", () => whatsappDeLaEmpresa())).rejects.toMatchObject({
        name: "EmpresaNoResuelta",
      });
      expect(DOBLE.lecturas).toEqual([]);
    });

    it("la variante opcional devuelve null sin WhatsApp; nunca lo inventa desde el entorno", async () => {
      vi.stubEnv("WHATSAPP_CLOUD_TOKEN", "token-de-plataforma");
      vi.stubEnv("WHATSAPP_NUMERO_ID", "999");
      vi.stubEnv("WHATSAPP_WABA_ID", "888");
      try {
        expect(await conEmpresa("org-a", () => whatsappDeLaEmpresaOpcional())).toBeNull();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});

