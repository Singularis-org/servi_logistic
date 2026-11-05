import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import * as route from "@/app/api/webhooks/whatsapp/route";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IChatConversacionRepository } from "@/lib/interfaces/repositories/IChatConversacionRepository";
import type { IChatMensajeRepository } from "@/lib/interfaces/repositories/IChatMensajeRepository";
import type { DestinoWebhook } from "@/lib/interfaces/repositories/IIntegracionEnrutadoRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { ChatWhatsappService } from "@/lib/services/ChatWhatsappService";
import { WebhookWhatsappService } from "@/lib/services/WebhookWhatsappService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// SLT-42 (decisión del humano tras la tanda 2, punto 2) — si el país de UNA empresa del lote no
// tiene prefijo o dígitos, la ingesta de esa empresa falla cerrado con `PaisIncompleto`. El webhook
// lo registra en el log (sin PII), salta los mensajes de esa empresa, sigue con las demás y responde
// 200 a Meta, para que no reintente un lote que el reintento no arregla.

const AHORA = new Date("2026-11-04T12:00:00.000Z");
const SECRETO = "secreto-app";

const DESTINOS = new Map<string, DestinoWebhook>([
  ["num-a", { organizacionId: "org-a", integracionId: "int-a" }],
  ["num-b", { organizacionId: "org-b", integracionId: "int-b" }],
]);

function firmar(raw: string): string {
  return "sha256=" + createHmac("sha256", SECRETO).update(raw, "utf8").digest("hex");
}

function cambio(numeroId: string, waMessageId: string, telefono: string) {
  return {
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "1", phone_number_id: numeroId },
      messages: [{ from: telefono, id: waMessageId, timestamp: "1700000000", type: "text", text: { body: "hola" } }],
    },
  };
}

function post(raw: string): Request {
  return new Request("https://x/api/webhooks/whatsapp", {
    method: "POST",
    body: raw,
    headers: { "x-hub-signature-256": firmar(raw) },
  });
}

function conversacionRepo(): IChatConversacionRepository {
  return {
    resolverOrdenActivaPorNumero: vi.fn(async (telefono: string) => ({ ordenId: "orden-1", mensajeroId: "men-1", telefonoE164: telefono })),
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
    migrarTelefono: vi.fn(async () => 0),
    findHiloDeSalienteCitado: vi.fn(async () => null),
  };
}

function mensajeRepo(insertados: { empresa: string | undefined; waMessageId: string }[]): IChatMensajeRepository {
  return {
    insertarEntranteIdempotente: vi.fn(async (input: { waMessageId: string }) => {
      const ctx = contextoActual();
      insertados.push({ empresa: ctx?.tipo === "empresa" ? ctx.organizacionId : undefined, waMessageId: input.waMessageId });
      return true;
    }) as unknown as IChatMensajeRepository["insertarEntranteIdempotente"],
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

/** El país depende de la empresa EN CURSO: `org-b` tiene un país sin prefijo ni dígitos. */
function reglasPorEmpresa(): IReglasPaisEmpresa {
  const completo = reglasPaisFijas();
  const incompleto = reglasPaisFijas({ paisId: "XB", telefono: null });
  const actual = () => {
    const ctx = contextoActual();
    return ctx?.tipo === "empresa" && ctx.organizacionId === "org-b" ? incompleto : completo;
  };
  return {
    deLaEmpresa: () => actual().deLaEmpresa(),
    zonaHoraria: () => actual().zonaHoraria(),
    tipoDocumento: (v) => actual().tipoDocumento(v),
  };
}

function montar() {
  const insertados: { empresa: string | undefined; waMessageId: string }[] = [];
  const logs: string[] = [];
  const logger = { warn: (m: string) => logs.push(m) };
  const anotados: string[] = [];
  const service = new WebhookWhatsappService({
    enrutado: {
      porNumeros: async (numeros) => new Map([...DESTINOS].filter(([n]) => numeros.includes(n))),
      porResumenVerificacion: async () => null,
    },
    resumidor: { resumen: (t) => `r:${t}` },
    leerAppSecret: async () => SECRETO,
    anotarWebhook: async (id) => {
      anotados.push(id);
    },
    ingesta: new ChatWhatsappService({
      reglasPais: reglasPorEmpresa(),
      conversacionRepo: conversacionRepo(),
      mensajeRepo: mensajeRepo(insertados),
      logger,
      now: () => AHORA,
    }),
    entregaEstado: () => ({ aplicar: async () => 0 }),
    logger,
    reloj: () => AHORA,
  });
  return { service, insertados, logs, anotados };
}

describe("SLT-42 — webhook de WhatsApp con el país de una empresa incompleto", () => {
  it("lote con dos empresas, una con país incompleto: la otra se procesa, responde 200 y queda en el log sin PII", async () => {
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "w", changes: [cambio("num-b", "wamid.B", "50688880002"), cambio("num-a", "wamid.A", "50688880001")] }],
    });
    const { service, insertados, logs } = montar();

    const res = await route.handlePost(post(raw), { service });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mensajesRegistrados: 1 });
    // Solo la empresa con el país completo escribe; la del país incompleto no escribe nada.
    expect(insertados).toEqual([{ empresa: "org-a", waMessageId: "wamid.A" }]);

    const delPais = logs.filter((m) => m.includes("incompleto"));
    expect(delPais).toHaveLength(1);
    expect(delPais[0]).toContain("org-b");
    expect(delPais[0]).toContain("XB");
    // Sin PII: ni el número del cliente ni el cuerpo del mensaje.
    for (const m of logs) {
      expect(m).not.toContain("88880002");
      expect(m).not.toContain("88880001");
      expect(m).not.toContain("hola");
    }
  });

  it("si la única empresa del lote tiene el país incompleto, igual responde 200 (Meta no reintenta)", async () => {
    const raw = JSON.stringify({ entry: [{ id: "w", changes: [cambio("num-b", "wamid.B", "50688880002")] }] });
    const { service, insertados, logs } = montar();

    const res = await route.handlePost(post(raw), { service });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mensajesRegistrados: 0 });
    expect(insertados).toEqual([]);
    expect(logs.some((m) => m.includes("incompleto") && m.includes("org-b"))).toBe(true);
  });

  it("un error que NO es de país incompleto no se traga: sigue propagándose", async () => {
    const raw = JSON.stringify({ entry: [{ id: "w", changes: [cambio("num-a", "wamid.A", "50688880001")] }] });
    const service = new WebhookWhatsappService({
      enrutado: { porNumeros: async (n) => new Map([...DESTINOS].filter(([x]) => n.includes(x))), porResumenVerificacion: async () => null },
      resumidor: { resumen: (t) => t },
      leerAppSecret: async () => SECRETO,
      anotarWebhook: async () => {},
      ingesta: { ingerirEventos: async () => Promise.reject(new Error("caida de la base")) },
      entregaEstado: () => ({ aplicar: async () => 0 }),
      logger: { warn: () => {} },
    });
    await expect(service.recibir({ cuerpoCrudo: raw, firma: firmar(raw) })).rejects.toThrow("caida de la base");
  });
});
