import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { WebhookEventos, WebhookMensajeEntrante, WebhookStatus } from "@/lib/types/whatsapp-webhook";

// SL-17 · R15 (D14) — el webhook de WhatsApp averigua en plataforma la empresa de cada evento y
// lo ingiere dentro de `conEmpresa(esa)`. Sin empresa no escribe nada y responde 200.

const DOBLE = vi.hoisted(() => {
  const contextos: { op: string; contexto: unknown }[] = [];
  return {
    contextos,
    // telefono normalizado -> orden; orden -> empresa
    ordenPorTelefono: new Map<string, string>(),
    empresaDeOrden: new Map<string, string>(),
    hilosPorTelefono: new Map<string, string[]>(),
    chatPorWamid: new Map<string, string>(),
    entregaPorWamid: new Map<string, string>(),
  };
});

vi.mock("@/lib/db/prisma-client", async () => {
  const { contextoActual: ctx } = await import("@/lib/db/contexto-empresa");
  const anotar = (op: string) => DOBLE.contextos.push({ op, contexto: ctx() });
  return {
    getPrismaClient: () => ({
      $queryRaw: vi.fn(async (sql: { values: unknown[] }) => {
        anotar("orden-por-telefono");
        const telefono = String(sql.values[sql.values.length - 1]);
        const orden = DOBLE.ordenPorTelefono.get(telefono);
        return orden ? [{ id: orden, mensajero_asignado_id: "m-1", telefono_dest: telefono }] : [];
      }),
      orden: {
        findUnique: vi.fn(async (a: { where: { id: string } }) => {
          anotar("empresa-de-orden");
          const org = DOBLE.empresaDeOrden.get(a.where.id);
          return org ? { organizacionId: org } : null;
        }),
      },
      chatConversacion: {
        findMany: vi.fn(async (a: { where: { telefonoE164: string } }) => {
          anotar("hilos-por-telefono");
          return (DOBLE.hilosPorTelefono.get(a.where.telefonoE164) ?? []).map((o) => ({ organizacionId: o }));
        }),
      },
      chatMensaje: {
        findFirst: vi.fn(async (a: { where: { waMessageId: string } }) => {
          anotar("chat-por-wamid");
          const org = DOBLE.chatPorWamid.get(a.where.waMessageId);
          return org ? { organizacionId: org } : null;
        }),
      },
      whatsappEnvioEntrega: {
        findFirst: vi.fn(async (a: { where: { waMessageId: string } }) => {
          anotar("entrega-por-wamid");
          const org = DOBLE.entregaPorWamid.get(a.where.waMessageId);
          return org ? { organizacionId: org } : null;
        }),
      },
    }),
  };
});

const { handlePost, repartirPorEmpresa } = await import("@/app/api/webhooks/whatsapp/route");
const { normalizarTelefonoWa } = await import("@/lib/utils/whatsapp-telefono");

function entrante(waMessageId: string, telefono: string, extra: Partial<WebhookMensajeEntrante> = {}): WebhookMensajeEntrante {
  return {
    waMessageId,
    telefonoE164: telefono,
    tipo: "texto",
    cuerpo: "hola",
    ocurridoAt: new Date("2026-10-22T10:00:00Z"),
    ...extra,
  } as WebhookMensajeEntrante;
}

function status(waMessageId: string): WebhookStatus {
  return { waMessageId, estado: "delivered", ocurridoAt: new Date("2026-10-22T10:00:00Z"), error: null } as WebhookStatus;
}

const TEL_A = "50688880001";
const TEL_B = "50688880002";
const TEL_NADIE = "50688889999";

beforeEach(() => {
  DOBLE.contextos.length = 0;
  for (const m of [DOBLE.ordenPorTelefono, DOBLE.empresaDeOrden, DOBLE.hilosPorTelefono, DOBLE.chatPorWamid, DOBLE.entregaPorWamid]) m.clear();
  DOBLE.ordenPorTelefono.set(normalizarTelefonoWa(TEL_A), "orden-a");
  DOBLE.ordenPorTelefono.set(normalizarTelefonoWa(TEL_B), "orden-b");
  DOBLE.empresaDeOrden.set("orden-a", "org-a");
  DOBLE.empresaDeOrden.set("orden-b", "org-b");
  DOBLE.chatPorWamid.set("wamid-sal-a", "org-a");
  DOBLE.entregaPorWamid.set("wamid-ent-b", "org-b");
});

describe("SL-17 · R15 — repartirPorEmpresa", () => {
  it("agrupa entrantes y estados por la empresa de su orden o de su fila", async () => {
    const eventos: WebhookEventos = {
      mensajes: [entrante("w1", TEL_A), entrante("w2", TEL_B), entrante("w3", TEL_NADIE)],
      statuses: [status("wamid-sal-a"), status("wamid-ent-b"), status("wamid-de-nadie")],
    };

    const reparto = await repartirPorEmpresa(eventos);

    const porOrg = Object.fromEntries(reparto.lotes.map((l) => [l.organizacionId, l.eventos]));
    expect(Object.keys(porOrg).sort()).toEqual(["org-a", "org-b"]);
    expect(porOrg["org-a"].mensajes.map((m) => m.waMessageId)).toEqual(["w1"]);
    expect(porOrg["org-a"].statuses.map((s) => s.waMessageId)).toEqual(["wamid-sal-a"]);
    expect(porOrg["org-b"].mensajes.map((m) => m.waMessageId)).toEqual(["w2"]);
    expect(porOrg["org-b"].statuses.map((s) => s.waMessageId)).toEqual(["wamid-ent-b"]);
    expect(reparto.mensajesSinEmpresa).toBe(1);
  });

  it("todas sus lecturas van en plataforma con la ficha SL-36", async () => {
    await repartirPorEmpresa({ mensajes: [entrante("w1", TEL_A)], statuses: [status("wamid-sal-a")] });

    expect(DOBLE.contextos.length).toBeGreaterThan(0);
    for (const { contexto } of DOBLE.contextos) {
      expect(contexto).toMatchObject({ tipo: "plataforma", ficha: "SL-36" });
    }
  });

  it("un cambio de número sin orden viva va a las empresas que tienen hilos con el número anterior", async () => {
    const anterior = "50677770000";
    DOBLE.hilosPorTelefono.set(normalizarTelefonoWa(anterior), ["org-c"]);

    const reparto = await repartirPorEmpresa({
      mensajes: [entrante("w9", anterior, { sistema: { telefonoAnterior: anterior, telefonoNuevo: "50677771111" } })],
      statuses: [],
    });

    expect(reparto.lotes.map((l) => l.organizacionId)).toEqual(["org-c"]);
    expect(reparto.mensajesSinEmpresa).toBe(0);
  });
});

describe("SL-17 · R15 — handlePost ingiere cada lote en su empresa", () => {
  const CONFIG = { verifyToken: "t", appSecret: "secreto" };
  function firmado(cuerpo: unknown): Request {
    const raw = JSON.stringify(cuerpo);
    const firma = createHmac("sha256", CONFIG.appSecret).update(raw, "utf8").digest("hex");
    return new Request("https://x/api/webhooks/whatsapp", {
      method: "POST",
      body: raw,
      headers: { "x-hub-signature-256": `sha256=${firma}` },
    });
  }

  it("cada ingesta y cada aplicación de estados ve SOLO su empresa; sin empresa no se escribe y hay 200", async () => {
    const vistosIngesta: (ContextoDatos | undefined)[] = [];
    const vistosEntregas: (ContextoDatos | undefined)[] = [];
    const ingerirEventos = vi.fn(async (e: WebhookEventos) => {
      vistosIngesta.push(contextoActual());
      return { mensajesRegistrados: e.mensajes.length, statusesAplicados: e.statuses.length, sinResolver: 0, hilosMigrados: 0 };
    });
    const res = await handlePost(firmado({ object: "whatsapp_business_account", entry: [] }), {
      getConfig: () => CONFIG,
      buildService: () => ({ ingerirEventos }) as never,
      buildEntregaEstado: () => ({
        aplicar: vi.fn(async () => {
          vistosEntregas.push(contextoActual());
          return 0;
        }),
      }),
      repartir: async () => ({
        lotes: [
          { organizacionId: "org-a", eventos: { mensajes: [entrante("w1", TEL_A)], statuses: [status("s1")] } },
          { organizacionId: "org-b", eventos: { mensajes: [entrante("w2", TEL_B)], statuses: [] } },
        ],
        mensajesSinEmpresa: 2,
      }),
    });

    expect(res.status).toBe(200);
    expect(vistosIngesta).toEqual([
      { tipo: "empresa", organizacionId: "org-a" },
      { tipo: "empresa", organizacionId: "org-b" },
    ]);
    expect(vistosEntregas).toEqual([{ tipo: "empresa", organizacionId: "org-a" }]);
    expect(await res.json()).toMatchObject({ ok: true, mensajesRegistrados: 2, statusesAplicados: 1, sinResolver: 2 });
  });

  it("sin ningún evento con empresa: 200 y la ingesta no se llama", async () => {
    const ingerirEventos = vi.fn();
    const res = await handlePost(firmado({ object: "whatsapp_business_account", entry: [] }), {
      getConfig: () => CONFIG,
      buildService: () => ({ ingerirEventos }) as never,
      repartir: async () => ({ lotes: [], mensajesSinEmpresa: 1 }),
    });

    expect(res.status).toBe(200);
    expect(ingerirEventos).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, sinResolver: 1 });
  });
});
