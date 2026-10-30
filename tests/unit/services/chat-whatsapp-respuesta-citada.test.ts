import { describe, it, expect, vi } from "vitest";
import { ChatWhatsappService } from "@/lib/services/ChatWhatsappService";
import type {
  ChatConversacionDTO,
  HiloCitado,
  IChatConversacionRepository,
  UpsertHiloInput,
} from "@/lib/interfaces/repositories/IChatConversacionRepository";
import type { IChatMensajeRepository } from "@/lib/interfaces/repositories/IChatMensajeRepository";
import type { WebhookEventos, WebhookMensajeEntrante } from "@/lib/types/whatsapp-webhook";

// SLT-40 T4 (design §4.2) — el paso nuevo de `ingerirEventos`: un entrante que cita un saliente
// va al hilo de ese saliente; si la cita no sirve, la regla por numero de siempre. Repos fakeados:
// la politica D1-D4 se prueba sola en `enrutado-por-cita.test.ts`; aqui se prueba el cableado.

const AHORA = new Date("2026-10-29T12:00:00.000Z");
// El cliente escribe con `+` y el hilo guarda la forma canonica: casan tras normalizar (R11).
const FROM_CRUDO = "+50688887777";
const FROM = "50688887777";
const WAMID_CITADO = "wamid.SALIENTE_ORDEN_VIEJA";
const CUERPO = "sobre la orden vieja";

/** Hilo citado de la orden MENOS reciente (la mas reciente es `orden-nueva`). */
function hiloCitado(over: Partial<HiloCitado> = {}): HiloCitado {
  return {
    conversacionId: "hilo-vieja",
    ordenId: "orden-vieja",
    telefonoE164: FROM,
    ordenEliminada: false,
    ordenMensajeroAsignadoId: "men-vieja",
    ...over,
  };
}

function fakeConversacionRepo(hilo: HiloCitado | null) {
  const upsertParaOrden = vi.fn(
    async (input: UpsertHiloInput): Promise<ChatConversacionDTO> => ({
      id: input.ordenId === "orden-vieja" ? "hilo-vieja" : "hilo-nueva",
      telefonoE164: input.telefonoE164,
      ordenId: input.ordenId,
      mensajeroId: input.mensajeroId,
      ultimoEntranteAt: null,
    }),
  );
  const repo: IChatConversacionRepository = {
    // La regla actual da la orden de `asignado_at` mas reciente del numero.
    resolverOrdenActivaPorNumero: vi.fn(async () => ({
      ordenId: "orden-nueva",
      mensajeroId: "men-nueva",
      telefonoE164: FROM,
    })),
    upsertParaOrden,
    marcarUltimoEntrante: vi.fn(async () => {}),
    findByOrdenParaMensajero: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    contarNoLeidosPorMensajero: vi.fn(async () => []),
    marcarLeidoHastaUltimoEntrante: vi.fn(async () => {}),
    migrarTelefono: vi.fn(async () => 0),
    findHiloDeSalienteCitado: vi.fn(async () => hilo),
  };
  return repo;
}

function fakeMensajeRepo(insertado = true): IChatMensajeRepository {
  return {
    insertarEntranteIdempotente: vi.fn(async () => insertado),
    findByWaMessageId: vi.fn(async () => null),
    marcarFallido: vi.fn(async () => {}),
    insertarSaliente: vi.fn(async () => {
      throw new Error("la ingesta no inserta salientes");
    }),
    actualizarEstadoPorWaMessageId: vi.fn(async () => 0),
    reconciliarSaliente: vi.fn(async () => {}),
    findById: vi.fn(async () => null),
    listarHilo: vi.fn(async () => []),
    ultimoEntranteAt: vi.fn(async () => null),
    findMediaParaMensajero: vi.fn(async () => null),
  };
}

function entrante(over: Partial<WebhookMensajeEntrante> = {}): WebhookMensajeEntrante {
  return {
    waMessageId: "wamid.ENTRANTE_1",
    telefonoE164: FROM_CRUDO,
    tipo: "texto",
    cuerpo: CUERPO,
    ocurridoAt: AHORA,
    citadoWaMessageId: WAMID_CITADO,
    ...over,
  };
}

function lote(...mensajes: WebhookMensajeEntrante[]): WebhookEventos {
  return { mensajes, statuses: [] };
}

function montar(hilo: HiloCitado | null, insertado = true) {
  const conv = fakeConversacionRepo(hilo);
  const msg = fakeMensajeRepo(insertado);
  const warn = vi.fn();
  const service = new ChatWhatsappService({
    conversacionRepo: conv,
    mensajeRepo: msg,
    logger: { warn },
    now: () => AHORA,
  });
  return { conv, msg, warn, service };
}

describe("SLT-40 — ingerirEventos enruta por mensaje citado", () => {
  it("R5: con dos ordenes vivas del numero, la cita al saliente de la MENOS reciente va a su hilo", async () => {
    const m = montar(hiloCitado());

    await m.service.ingerirEventos(lote(entrante()));

    expect(m.conv.findHiloDeSalienteCitado).toHaveBeenCalledWith(WAMID_CITADO);
    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith({
      ordenId: "orden-vieja",
      mensajeroId: "men-vieja",
      telefonoE164: FROM,
    });
    expect(m.conv.resolverOrdenActivaPorNumero).not.toHaveBeenCalled();
    expect(m.msg.insertarEntranteIdempotente).toHaveBeenCalledWith(
      expect.objectContaining({ conversacionId: "hilo-vieja", waMessageId: "wamid.ENTRANTE_1" }),
    );
  });

  it.each(["texto", "imagen", "ubicacion", "contactos", "otro"] as const)(
    "R4: un entrante de tipo %s con cita util se registra en el hilo citado",
    async (tipo) => {
      const m = montar(hiloCitado());

      await m.service.ingerirEventos(lote(entrante({ tipo, cuerpo: tipo === "texto" ? CUERPO : null })));

      expect(m.conv.upsertParaOrden).toHaveBeenCalledWith(expect.objectContaining({ ordenId: "orden-vieja" }));
      expect(m.conv.resolverOrdenActivaPorNumero).not.toHaveBeenCalled();
    },
  );

  it("R6: si la orden citada se reasigno (hilo guardado con A, orden ahora de B), el upsert pasa el hilo a B", async () => {
    // El hilo guardado era de `men-A`; `HiloCitado` trae el mensajero ACTUAL de la orden.
    const m = montar(hiloCitado({ ordenMensajeroAsignadoId: "men-B" }));

    await m.service.ingerirEventos(lote(entrante()));

    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith({
      ordenId: "orden-vieja",
      mensajeroId: "men-B",
      telefonoE164: FROM,
    });
  });

  it("R9: una orden citada en estado terminal pero no eliminada se enruta por cita", async () => {
    // `HiloCitado` no lleva estado a proposito: lo unico que excluye es `ordenEliminada`.
    const m = montar(hiloCitado({ ordenEliminada: false }));

    const r = await m.service.ingerirEventos(lote(entrante()));

    expect(m.conv.resolverOrdenActivaPorNumero).not.toHaveBeenCalled();
    expect(r.enrutadosPorCita).toBe(1);
  });

  it.each<[string, HiloCitado | null]>([
    ["R7: id citado sin saliente (no existe, es entrante o de otra empresa)", null],
    ["R12: id citado de una entrega automatica (no esta en chat_mensaje)", null],
    ["R8: orden citada eliminada", hiloCitado({ ordenEliminada: true })],
    ["R10: orden citada sin mensajero asignado", hiloCitado({ ordenMensajeroAsignadoId: null })],
    ["R11: el from no coincide con el numero del hilo citado", hiloCitado({ telefonoE164: "50677776666" })],
  ])("%s -> regla actual con el from normalizado", async (_nombre, hilo) => {
    const m = montar(hilo);

    const r = await m.service.ingerirEventos(lote(entrante()));

    expect(m.conv.resolverOrdenActivaPorNumero).toHaveBeenCalledWith(FROM);
    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith({
      ordenId: "orden-nueva",
      mensajeroId: "men-nueva",
      telefonoE164: FROM,
    });
    expect(r.enrutadosPorCita).toBe(0);
    expect(r.mensajesRegistrados).toBe(1);
  });

  it("R7: sin cita util y sin orden por numero, cuenta sinResolver igual que hoy", async () => {
    const m = montar(null);
    vi.mocked(m.conv.resolverOrdenActivaPorNumero).mockResolvedValueOnce(null);

    const r = await m.service.ingerirEventos(lote(entrante()));

    expect(r).toEqual({
      mensajesRegistrados: 0,
      statusesAplicados: 0,
      sinResolver: 1,
      hilosMigrados: 0,
      enrutadosPorCita: 0,
    });
    expect(m.conv.upsertParaOrden).not.toHaveBeenCalled();
  });

  it("R14: un entrante nuevo enrutado por cita sella SOLO la marca del hilo citado", async () => {
    const m = montar(hiloCitado());

    await m.service.ingerirEventos(lote(entrante()));

    expect(m.conv.marcarUltimoEntrante).toHaveBeenCalledTimes(1);
    expect(m.conv.marcarUltimoEntrante).toHaveBeenCalledWith("hilo-vieja", AHORA);
  });

  it("R15: el mismo wamid repetido (dedupe) no re-sella la marca ni cuenta", async () => {
    const m = montar(hiloCitado(), false);

    const r = await m.service.ingerirEventos(lote(entrante()));

    expect(m.msg.insertarEntranteIdempotente).toHaveBeenCalledTimes(1);
    expect(m.conv.marcarUltimoEntrante).not.toHaveBeenCalled();
    expect(r.mensajesRegistrados).toBe(0);
    expect(r.enrutadosPorCita).toBe(0);
  });

  it("R16: enrutadosPorCita cuenta solo inserts nuevos por cita y no suma a sinResolver", async () => {
    const m = montar(hiloCitado());
    // Entrante 3 es un duplicado del 1: dedupe -> no cuenta.
    vi.mocked(m.msg.insertarEntranteIdempotente)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    // El 2 no trae cita: va por numero y no cuenta como cita.
    // El 4 no trae cita y su numero no resuelve: `sinResolver`.
    vi.mocked(m.conv.resolverOrdenActivaPorNumero)
      .mockResolvedValueOnce({ ordenId: "orden-nueva", mensajeroId: "men-nueva", telefonoE164: FROM })
      .mockResolvedValueOnce(null);

    const r = await m.service.ingerirEventos(
      lote(
        entrante({ waMessageId: "wamid.1" }),
        entrante({ waMessageId: "wamid.2", citadoWaMessageId: undefined }),
        entrante({ waMessageId: "wamid.1" }),
        entrante({ waMessageId: "wamid.4", citadoWaMessageId: undefined }),
      ),
    );

    expect(r).toEqual({
      mensajesRegistrados: 2,
      statusesAplicados: 0,
      sinResolver: 1,
      hilosMigrados: 0,
      enrutadosPorCita: 1,
    });
  });

  it("R17: ninguna rama del enrutado por cita escribe en el log el numero, el cuerpo ni el id citado", async () => {
    for (const hilo of [
      hiloCitado(),
      null,
      hiloCitado({ ordenEliminada: true }),
      hiloCitado({ ordenMensajeroAsignadoId: null }),
      hiloCitado({ telefonoE164: "50677776666" }),
    ]) {
      const m = montar(hilo);
      await m.service.ingerirEventos(lote(entrante()));
      const log = m.warn.mock.calls.map((c) => String(c[0])).join("\n");
      for (const secreto of [FROM, "88887777", CUERPO, WAMID_CITADO]) {
        expect(log).not.toContain(secreto);
      }
    }
  });

  it("R18: sin citadoWaMessageId no se busca el hilo citado y se aplica la regla actual", async () => {
    const m = montar(hiloCitado());

    const r = await m.service.ingerirEventos(lote(entrante({ citadoWaMessageId: undefined })));

    expect(m.conv.findHiloDeSalienteCitado).not.toHaveBeenCalled();
    expect(m.conv.resolverOrdenActivaPorNumero).toHaveBeenCalledWith(FROM);
    expect(m.conv.upsertParaOrden).toHaveBeenCalledWith(expect.objectContaining({ ordenId: "orden-nueva" }));
    expect(r.enrutadosPorCita).toBe(0);
  });
});
