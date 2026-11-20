import { describe, it, expect, vi } from "vitest";
import { enviarPlantillaChat } from "@/lib/actions/chat-whatsapp";
import { ChatWhatsappService } from "@/lib/services/ChatWhatsappService";
import { crearWhatsappBienvenidaHandler } from "@/lib/services/jobs/whatsapp-bienvenida-handler";
import { PaisSinMoneda } from "@/lib/db/errores-pais";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { PlantillaEnviable } from "@/lib/interfaces/repositories/IPlantillaMensajeRepository";
import type { IChatConversacionRepository } from "@/lib/interfaces/repositories/IChatConversacionRepository";
import type { IChatMensajeRepository } from "@/lib/interfaces/repositories/IChatMensajeRepository";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { necesitaMoneda } from "@/lib/types/plantilla-datos";
import { datosPlantillaFixture } from "@/tests/fixtures/plantilla-datos";
import { SIN_CAMPOS_311 } from "@/tests/fixtures/chat-mensaje";
import { MONEDA_DE_PRUEBA, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SL-21 (R10, R11, R16; design §5.2) — los tres llamantes de servidor de las plantillas de WhatsApp
// pintan `{{monto}}` en la moneda del país de la empresa, que leen por el puerto solo si la plantilla
// pinta un importe. Con Costa Rica, el mismo texto de antes (`₡25.900`).

const DATOS = datosPlantillaFixture({ orden: { montoCobrar: 25900, telefonoDest: "50688887777" } });

const CON_MONTO: PlantillaEnviable = {
  id: "plt-1",
  nombre: "cobro_entrega",
  cuerpo: "Hola {{cliente}}, son {{monto}} ({{total}})",
  variables: ["cliente", "monto", "total"],
  templateId: "tpl-1",
  templateIdioma: "es",
};
const SIN_MONTO: PlantillaEnviable = {
  ...CON_MONTO,
  cuerpo: "Hola {{cliente}}, tu guía es {{guia}} ({{monto_crudo}})",
  variables: ["cliente", "guia", "monto_crudo"],
};

const ESPERADO_PRUEBA = "Hola Juan Perez, son €25 900 (€25 900)";
const ESPERADO_CR = "Hola Juan Perez, son ₡25.900 (₡25.900)";

/** Un puerto cuyo `moneda()` lanza y queda espiado: si se llama, el test lo ve. */
function sinMoneda(): IReglasPaisEmpresa {
  const r = reglasPaisFijas({ moneda: null });
  vi.spyOn(r, "moneda");
  return r;
}

describe("necesitaMoneda (R11)", () => {
  it("solo es true si alguna variable pinta un importe; `monto_crudo` no lo es", () => {
    expect(necesitaMoneda(["monto"])).toBe(true);
    expect(necesitaMoneda(["cliente", "total"])).toBe(true);
    expect(necesitaMoneda(["cliente", "guia", "monto_crudo"])).toBe(false);
    expect(necesitaMoneda(["clave_inexistente"])).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 1. La acción de envío del chat (`lib/actions/chat-whatsapp.ts`)            */
/* -------------------------------------------------------------------------- */

describe("enviarPlantillaChat (R10, R11, R16)", () => {
  const MENSAJERO: Actor = { usuarioId: "men-1", rol: "mensajero" };

  async function enviar(plantilla: PlantillaEnviable, reglasPais: IReglasPaisEmpresa) {
    const service = {
      enviarPlantilla: vi.fn(async () => ({ status: "ok", mensajeId: "w", mensajeChatId: "m" })),
    } as unknown as ChatWhatsappService;
    const res = await enviarPlantillaChat("orden-1", "plt-1", {
      getActor: async () => MENSAJERO,
      ordenReader: { findParaEnvio: vi.fn(async () => DATOS) },
      plantillaRepo: { findEnviableById: vi.fn(async () => plantilla) },
      service,
      reglasPais,
    });
    return { res, service: service as unknown as { enviarPlantilla: ReturnType<typeof vi.fn> } };
  }

  it("R10: pinta el importe en la moneda del país (cuerpo y componentes)", async () => {
    const { res, service } = await enviar(CON_MONTO, reglasPaisFijas({ moneda: MONEDA_DE_PRUEBA }));
    expect(res.status).toBe("ok");
    const arg = service.enviarPlantilla.mock.calls[0][0];
    expect(arg.cuerpoRenderizado).toBe(ESPERADO_PRUEBA);
    expect(arg.componentes).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Juan Perez" },
          { type: "text", text: "€25 900" },
          { type: "text", text: "€25 900" },
        ],
      },
    ]);
  });

  it("R16: con Costa Rica, el texto de siempre", async () => {
    const { service } = await enviar(CON_MONTO, reglasPaisFijas());
    expect(service.enviarPlantilla.mock.calls[0][0].cuerpoRenderizado).toBe(ESPERADO_CR);
  });

  it("R6: con importe y sin moneda, PaisSinMoneda antes de enviar", async () => {
    const service = { enviarPlantilla: vi.fn() } as unknown as ChatWhatsappService;
    await expect(
      enviarPlantillaChat("orden-1", "plt-1", {
        getActor: async () => MENSAJERO,
        ordenReader: { findParaEnvio: vi.fn(async () => DATOS) },
        plantillaRepo: { findEnviableById: vi.fn(async () => CON_MONTO) },
        service,
        reglasPais: reglasPaisFijas({ moneda: null }),
      }),
    ).rejects.toBeInstanceOf(PaisSinMoneda);
    expect(service.enviarPlantilla).not.toHaveBeenCalled();
  });

  it("R11: sin importe en la plantilla, no lee la moneda aunque el país no la tenga", async () => {
    const reglas = sinMoneda();
    const { res, service } = await enviar(SIN_MONTO, reglas);
    expect(res.status).toBe("ok");
    expect(reglas.moneda).not.toHaveBeenCalled();
    expect(service.enviarPlantilla.mock.calls[0][0].cuerpoRenderizado).toBe(
      "Hola Juan Perez, tu guía es 25381189 (25900)",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 2. El mensaje de bienvenida (`whatsapp-bienvenida-handler.ts`)            */
/* -------------------------------------------------------------------------- */

describe("crearWhatsappBienvenidaHandler (R10, R11, R16)", () => {
  const JOB = {
    id: "job-1",
    payload: { ordenId: "orden-1", mensajeroId: "men-1", ocurridoAt: "2026-11-19T10:00:00Z" },
  } as unknown as JobDTO;

  function correr(plantilla: PlantillaEnviable, reglasPais: IReglasPaisEmpresa) {
    const service = {
      enviarPlantilla: vi.fn<(input: { cuerpoRenderizado: string }) => Promise<unknown>>(async () => ({
        status: "ok",
        mensajeId: "w",
        mensajeChatId: "m",
      })),
    };
    const handler = crearWhatsappBienvenidaHandler(() => ({
      service: service as unknown as ChatWhatsappService,
      plantillaRepo: {
        findWelcomeMessage: vi.fn(async () => ({
          id: plantilla.id,
          nombre: plantilla.nombre,
          templateId: plantilla.templateId,
          estado: "activo" as const,
        })),
        findEnviableById: vi.fn(async () => plantilla),
      },
      ordenReader: { findParaEnvio: vi.fn(async () => DATOS) },
      reglasPais,
    }));
    return { ejecucion: handler(JOB), service };
  }

  it("R10: pinta el importe en la moneda del país", async () => {
    const { ejecucion, service } = correr(CON_MONTO, reglasPaisFijas({ moneda: MONEDA_DE_PRUEBA }));
    await ejecucion;
    expect(service.enviarPlantilla.mock.calls[0][0].cuerpoRenderizado).toBe(ESPERADO_PRUEBA);
  });

  it("R16: con Costa Rica, el texto de siempre", async () => {
    const { ejecucion, service } = correr(CON_MONTO, reglasPaisFijas());
    await ejecucion;
    expect(service.enviarPlantilla.mock.calls[0][0].cuerpoRenderizado).toBe(ESPERADO_CR);
  });

  it("R6: con importe y sin moneda, el job falla con PaisSinMoneda sin enviar", async () => {
    const { ejecucion, service } = correr(CON_MONTO, reglasPaisFijas({ moneda: null }));
    await expect(ejecucion).rejects.toBeInstanceOf(PaisSinMoneda);
    expect(service.enviarPlantilla).not.toHaveBeenCalled();
  });

  it("R11: sin importe en la plantilla, no lee la moneda", async () => {
    const reglas = sinMoneda();
    const { ejecucion, service } = correr(SIN_MONTO, reglas);
    await ejecucion;
    expect(reglas.moneda).not.toHaveBeenCalled();
    expect(service.enviarPlantilla).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. El envío del chat que se reintenta (`ChatWhatsappService`)             */
/* -------------------------------------------------------------------------- */

describe("ChatWhatsappService.reintentarEnvio de una plantilla (R10, R11, R16)", () => {
  const AHORA = new Date("2026-11-19T12:00:00.000Z");

  function servicio(plantilla: PlantillaEnviable, reglasPais: IReglasPaisEmpresa) {
    const client = {
      enviarTexto: vi.fn(),
      enviarPlantilla: vi.fn(async () => ({ status: "ok" as const, mensajeId: "wamid.R" })),
    };
    const mensajeRepo = {
      findById: vi.fn(async () => ({
        id: "msg-queued",
        conversacionId: "hilo-1",
        direccion: "saliente" as const,
        tipo: "plantilla" as const,
        cuerpo: "viejo",
        plantillaId: plantilla.id,
        waMessageId: null,
        estado: "queued" as const,
        latitud: null,
        longitud: null,
        errorCodigo: null,
        errorTitulo: null,
        errorDetalle: null,
        ...SIN_CAMPOS_311,
        ocurridoAt: AHORA,
        createdAt: AHORA,
      })),
      reconciliarSaliente: vi.fn(async () => {}),
      marcarFallido: vi.fn(async () => {}),
    } as unknown as IChatMensajeRepository;
    const conversacionRepo = {
      findById: vi.fn(async () => ({
        id: "hilo-1",
        telefonoE164: "50688887777",
        ordenId: "orden-1",
        mensajeroId: "men-1",
        ultimoEntranteAt: AHORA,
      })),
    } as unknown as IChatConversacionRepository;
    const service = new ChatWhatsappService({
      reglasPais,
      conversacionRepo,
      mensajeRepo,
      client,
      plantillaRepo: { findEnviableById: vi.fn(async () => plantilla) },
      ordenReader: { findParaEnvio: vi.fn(async () => DATOS) },
    });
    return { service, client, mensajeRepo };
  }

  /** El texto de cada parámetro del cuerpo que viajó a Meta. */
  function textos(client: { enviarPlantilla: ReturnType<typeof vi.fn> }): string[] {
    const componentes = client.enviarPlantilla.mock.calls[0][3] as { parameters: { text: string }[] }[];
    return componentes[0].parameters.map((p) => p.text);
  }

  it("R10: el importe re-renderizado sale en la moneda del país", async () => {
    const { service, client } = servicio(CON_MONTO, reglasPaisFijas({ moneda: MONEDA_DE_PRUEBA }));
    await service.reintentarEnvio("msg-queued");
    expect(textos(client)).toEqual(["Juan Perez", "€25 900", "€25 900"]);
  });

  it("R16: con Costa Rica, el texto de siempre", async () => {
    const { service, client } = servicio(CON_MONTO, reglasPaisFijas());
    await service.reintentarEnvio("msg-queued");
    expect(textos(client)).toEqual(["Juan Perez", "₡25.900", "₡25.900"]);
  });

  it("R6: con importe y sin moneda, PaisSinMoneda sin llamar a Meta ni reconciliar", async () => {
    const { service, client, mensajeRepo } = servicio(CON_MONTO, reglasPaisFijas({ moneda: null }));
    await expect(service.reintentarEnvio("msg-queued")).rejects.toBeInstanceOf(PaisSinMoneda);
    expect(client.enviarPlantilla).not.toHaveBeenCalled();
    expect(mensajeRepo.reconciliarSaliente).not.toHaveBeenCalled();
  });

  it("R11: sin importe en la plantilla, no lee la moneda", async () => {
    const reglas = sinMoneda();
    const { service, client } = servicio(SIN_MONTO, reglas);
    await service.reintentarEnvio("msg-queued");
    expect(reglas.moneda).not.toHaveBeenCalled();
    expect(textos(client)).toEqual(["Juan Perez", "25381189", "25900"]);
  });
});
