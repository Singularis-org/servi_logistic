import { describe, expect, it, vi } from "vitest";

import { PaisIncompleto } from "@/lib/db/errores-pais";
import type { IChatConversacionRepository } from "@/lib/interfaces/repositories/IChatConversacionRepository";
import type { IChatMensajeRepository } from "@/lib/interfaces/repositories/IChatMensajeRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { ChatWhatsappService } from "@/lib/services/ChatWhatsappService";
import type { WebhookEventos, WebhookMensajeEntrante } from "@/lib/types/whatsapp-webhook";
import type { ReglasTelefono } from "@/lib/utils/telefono-pais";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (R18, R21) — el chat de WhatsApp normaliza el telefono del cliente con el prefijo y los
// digitos nacionales del pais de la EMPRESA, no con los de Costa Rica. Un pais de prueba (`XA`,
// prefijo `999`, 7 digitos) hace visible cualquier `506` u `8` que quede escondido; Costa Rica fija
// que la clave de sus hilos no cambia.

const AHORA = new Date("2026-11-04T12:00:00.000Z");
const TEL_XA: ReglasTelefono = { prefijo: "999", digitosNacionales: 7 };
const TEL_CR: ReglasTelefono = { prefijo: "506", digitosNacionales: 8 };
const XA = reglasPaisFijas({ paisId: "XA", telefono: TEL_XA });

function conversacionRepo(): IChatConversacionRepository {
  return {
    resolverOrdenActivaPorNumero: vi.fn(async (telefono: string) => ({
      ordenId: "orden-1",
      mensajeroId: "men-1",
      telefonoE164: telefono,
    })),
    upsertParaOrden: vi.fn(async (input: { telefonoE164: string }) => ({
      id: "hilo-1",
      telefonoE164: input.telefonoE164,
      ordenId: "orden-1",
      mensajeroId: "men-1",
      ultimoEntranteAt: AHORA,
    })),
    marcarUltimoEntrante: vi.fn(async () => {}),
    findByOrdenParaMensajero: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    contarNoLeidosPorMensajero: vi.fn(async () => []),
    marcarLeidoHastaUltimoEntrante: vi.fn(async () => {}),
    migrarTelefono: vi.fn(async () => 1),
    findHiloDeSalienteCitado: vi.fn(async () => null),
  };
}

function mensajeRepo(): IChatMensajeRepository {
  return {
    insertarEntranteIdempotente: vi.fn(async () => true),
    findByWaMessageId: vi.fn(async () => null),
    marcarFallido: vi.fn(async () => {}),
    insertarSaliente: vi.fn(async () => ({ id: "msg-out" })) as unknown as IChatMensajeRepository["insertarSaliente"],
    actualizarEstadoPorWaMessageId: vi.fn(async () => 1),
    reconciliarSaliente: vi.fn(async () => {}),
    findById: vi.fn(async () => null),
    listarHilo: vi.fn(async () => []),
    ultimoEntranteAt: vi.fn(async () => AHORA),
    findMediaParaMensajero: vi.fn(async () => null),
  };
}

function montar(reglasPais: IReglasPaisEmpresa) {
  const conv = conversacionRepo();
  const msg = mensajeRepo();
  const client = {
    enviarTexto: vi.fn(async () => ({ status: "ok" as const, mensajeId: "wamid.OUT" })),
    enviarPlantilla: vi.fn(async () => ({ status: "ok" as const, mensajeId: "wamid.OUT" })),
  };
  const service = new ChatWhatsappService({ reglasPais, conversacionRepo: conv, mensajeRepo: msg, client, now: () => AHORA });
  return { service, conv, msg, client };
}

function entrante(over: Partial<WebhookMensajeEntrante> = {}): WebhookEventos {
  return {
    mensajes: [{ waMessageId: "wamid.IN", telefonoE164: "+999 777 0001", tipo: "texto", cuerpo: "hola", ocurridoAt: AHORA, ...over }],
    statuses: [],
  };
}

describe("SLT-42 R18 — ingesta del webhook con el pais de la empresa", () => {
  it("resuelve la orden y keyea el hilo con el numero normalizado por el pais, pasando SUS reglas al repo", async () => {
    const m = montar(XA);

    const r = await m.service.ingerirEventos(entrante());

    expect(r.mensajesRegistrados).toBe(1);
    expect(m.conv.resolverOrdenActivaPorNumero).toHaveBeenCalledWith("9997770001", TEL_XA);
    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith(
      { ordenId: "orden-1", mensajeroId: "men-1", telefonoE164: "9997770001" },
      TEL_XA,
    );
  });

  it("el cambio de numero se normaliza con el pais: migra, keyea y guarda la evidencia con SU prefijo", async () => {
    const m = montar(XA);

    await m.service.ingerirEventos(
      entrante({ tipo: "sistema", cuerpo: null, sistema: { telefonoAnterior: "777-0001", telefonoNuevo: "777 0002" } }),
    );

    expect(m.conv.migrarTelefono).toHaveBeenCalledWith("9997770001", "9997770002", TEL_XA);
    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith(expect.objectContaining({ telefonoE164: "9997770002" }), TEL_XA);
    expect(m.msg.insertarEntranteIdempotente).toHaveBeenCalledWith(
      expect.objectContaining({ sistemaTelefonoAnterior: "9997770001", sistemaTelefonoNuevo: "9997770002" }),
    );
  });

  it("R21: con Costa Rica el cambio de numero local se guarda como antes (506 + 8 digitos)", async () => {
    const m = montar(reglasPaisFijas());

    await m.service.ingerirEventos(
      entrante({ telefonoE164: "50688887777", tipo: "sistema", cuerpo: null, sistema: { telefonoAnterior: "8888-7777", telefonoNuevo: "9999 6666" } }),
    );

    expect(m.conv.migrarTelefono).toHaveBeenCalledWith("50688887777", "50699996666", TEL_CR);
    expect(m.msg.insertarEntranteIdempotente).toHaveBeenCalledWith(
      expect.objectContaining({ sistemaTelefonoAnterior: "50688887777", sistemaTelefonoNuevo: "50699996666" }),
    );
  });

  it("un lote de solo statuses no lee el pais", async () => {
    const reglas = reglasPaisFijas();
    const deLaEmpresa = vi.spyOn(reglas, "deLaEmpresa");
    const m = montar(reglas);

    await m.service.ingerirEventos({
      mensajes: [],
      statuses: [{ waMessageId: "wamid.OUT", estado: "delivered", ocurridoAt: AHORA, error: null }],
    });

    expect(deLaEmpresa).not.toHaveBeenCalled();
  });

  it("un pais sin prefijo o sin digitos falla cerrado con PaisIncompleto antes de escribir", async () => {
    const m = montar(reglasPaisFijas({ paisId: "XB", telefono: null }));

    await expect(m.service.ingerirEventos(entrante())).rejects.toBeInstanceOf(PaisIncompleto);
    expect(m.conv.resolverOrdenActivaPorNumero).not.toHaveBeenCalled();
    expect(m.msg.insertarEntranteIdempotente).not.toHaveBeenCalled();
  });
});

describe("SLT-42 R18 — envio saliente con el pais de la empresa", () => {
  it("enviarTexto manda a Meta y keyea el hilo con el local prefijado con el prefijo del pais", async () => {
    const m = montar(XA);

    const r = await m.service.enviarTexto({ ordenId: "orden-1", mensajeroId: "men-1", telefonoE164: "777-0001", texto: "hola" });

    expect(r.status).toBe("ok");
    expect(m.client.enviarTexto).toHaveBeenCalledWith("9997770001", "hola");
    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith(
      { ordenId: "orden-1", mensajeroId: "men-1", telefonoE164: "9997770001" },
      TEL_XA,
    );
  });

  it("enviarPlantilla con un local de CR en una empresa de otro pais NO le pone 506", async () => {
    const m = montar(XA);

    await m.service.enviarPlantilla({
      ordenId: "orden-1",
      mensajeroId: "men-1",
      telefonoE164: "8888-7777",
      plantillaId: "pl-1",
      nombre: "bienvenida",
      idioma: "es",
      componentes: [],
      cuerpoRenderizado: "Hola",
    });

    expect(m.client.enviarPlantilla).toHaveBeenCalledWith("88887777", "bienvenida", "es", []);
  });

  it("un pais sin prefijo o sin digitos: enviarTexto falla con PaisIncompleto sin tocar Meta ni el hilo", async () => {
    const m = montar(reglasPaisFijas({ paisId: "XB", telefono: null }));

    await expect(
      m.service.enviarTexto({ ordenId: "orden-1", mensajeroId: "men-1", telefonoE164: "777-0001", texto: "hola" }),
    ).rejects.toBeInstanceOf(PaisIncompleto);
    expect(m.conv.upsertParaOrden).not.toHaveBeenCalled();
    expect(m.client.enviarTexto).not.toHaveBeenCalled();
  });
});
