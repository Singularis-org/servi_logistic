import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { DestinoWebhook } from "@/lib/interfaces/repositories/IIntegracionEnrutadoRepository";
import type { IngestaResumen } from "@/lib/services/ChatWhatsappService";
import type { WebhookEventos } from "@/lib/types/whatsapp-webhook";

// SL-23 · T11 (design §5.6; R24, R25) — el webhook entrante de WhatsApp con el módulo apagado para la
// empresa del número: responde bien a Meta (el lote cuenta como válido), no guarda ni encola nada y
// deja una línea de log sin datos personales. La otra empresa del mismo POST, con WhatsApp encendido,
// se ingiere como siempre (R25).
//
// La puerta es la REAL (`moduloActivo("whatsapp")`), con la lectura de módulos en memoria por empresa.

const estado = vi.hoisted(() => ({ porEmpresa: {} as Record<string, string[]> }));

vi.mock("@/lib/repositories/ModulosActivosRepository", () => ({
  ModulosActivosRepository: class {
    async activos() {
      const { contextoActual: ctx } = await import("@/lib/db/contexto-empresa");
      const c = ctx();
      return c?.tipo === "empresa" ? [...(estado.porEmpresa[c.organizacionId] ?? [])] : [];
    }
  },
}));

const { WebhookWhatsappService } = await import("@/lib/services/WebhookWhatsappService");

const resumidor = new ResumenSecretoSha256();
const NUMERO_CLIENTE = "50688887777";
const TEXTO = "mi direccion es secreta";

const EMPRESAS = [
  { organizacionId: "org-a", integracionId: "int-a", numero: "111000111", appSecret: "secreto-a-1234567890" },
  { organizacionId: "org-b", integracionId: "int-b", numero: "222000222", appSecret: "secreto-b-0987654321" },
];

function firmar(cuerpo: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(cuerpo, "utf8").digest("hex")}`;
}

function change(numero: string, waId: string): unknown {
  return {
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "50600000000", phone_number_id: numero },
      messages: [{ from: NUMERO_CLIENTE, id: waId, timestamp: "1700000000", type: "text", text: { body: TEXTO } }],
    },
  };
}

function empresaEnCurso(): string | undefined {
  const c = contextoActual();
  return c?.tipo === "empresa" ? c.organizacionId : undefined;
}

function montar() {
  const ingestas: (string | undefined)[] = [];
  const avisos: string[] = [];
  const servicio = new WebhookWhatsappService({
    enrutado: {
      porResumenVerificacion: async () => null,
      porNumeros: async (numeros: readonly string[]) => {
        const mapa = new Map<string, DestinoWebhook>();
        for (const e of EMPRESAS) {
          if (numeros.includes(e.numero)) mapa.set(e.numero, { organizacionId: e.organizacionId, integracionId: e.integracionId });
        }
        return mapa;
      },
    },
    resumidor,
    leerAppSecret: async () => EMPRESAS.find((e) => e.organizacionId === empresaEnCurso())?.appSecret ?? null,
    anotarWebhook: async () => {},
    ingesta: {
      ingerirEventos: async (eventos: WebhookEventos): Promise<IngestaResumen> => {
        ingestas.push(empresaEnCurso());
        return { mensajesRegistrados: eventos.mensajes.length, statusesAplicados: 0, sinResolver: 0, hilosMigrados: 0 };
      },
    },
    entregaEstado: () => ({ aplicar: async () => 0 }),
    logger: { warn: (m: string) => avisos.push(m) },
    depuracion: () => {},
  });
  return { servicio, ingestas, avisos };
}

/** Un POST con un entrante para el número de cada empresa dada, firmado con el secreto de la primera. */
function post(...empresas: (typeof EMPRESAS)[number][]) {
  const cuerpoCrudo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba-1", changes: empresas.map((e, i) => change(e.numero, `wamid.${i}`)) }],
  });
  return { cuerpoCrudo, firma: firmar(cuerpoCrudo, empresas[0].appSecret) };
}

beforeEach(() => {
  estado.porEmpresa = {};
});

describe("SL-23 · webhook entrante de WhatsApp con el módulo apagado (R24)", () => {
  it("responde ok a Meta sin guardar ni encolar, con una línea de log sin datos personales", async () => {
    estado.porEmpresa = { "org-a": ["ranking"] };
    const m = montar();
    const r = await m.servicio.recibir(post(EMPRESAS[0]));
    expect(r.status).toBe("ok");
    expect(m.ingestas).toEqual([]);
    expect(m.avisos).toEqual(["[webhook-whatsapp] modulo WhatsApp apagado: lote descartado sin guardar ni encolar"]);
    for (const aviso of m.avisos) {
      expect(aviso).not.toContain(NUMERO_CLIENTE);
      expect(aviso).not.toContain(TEXTO);
      expect(aviso).not.toContain(EMPRESAS[0].numero);
    }
  });

  it("encendido, el mismo POST se ingiere como siempre", async () => {
    estado.porEmpresa = { "org-a": ["whatsapp"] };
    const m = montar();
    const r = await m.servicio.recibir(post(EMPRESAS[0]));
    expect(r.status).toBe("ok");
    expect(m.ingestas).toEqual(["org-a"]);
    expect(m.avisos).toEqual([]);
  });

  it("una firma inválida sigue siendo unauthorized: el módulo apagado no abre el webhook", async () => {
    const m = montar();
    const { cuerpoCrudo } = post(EMPRESAS[0]);
    const r = await m.servicio.recibir({ cuerpoCrudo, firma: firmar(cuerpoCrudo, "otro-secreto-cualquiera") });
    expect(r.status).toBe("unauthorized");
    expect(m.ingestas).toEqual([]);
  });

  it("R25 — en el mismo POST, la empresa con WhatsApp apagado se descarta y la otra se ingiere", async () => {
    estado.porEmpresa = { "org-a": [], "org-b": ["whatsapp"] };
    // Cada lote se valida con el secreto de su empresa: dos POST, uno por empresa, mismo servicio.
    const m = montar();
    await m.servicio.recibir(post(EMPRESAS[0]));
    await m.servicio.recibir(post(EMPRESAS[1]));
    expect(m.ingestas).toEqual(["org-b"]);
    expect(m.avisos).toHaveLength(1);
  });
});
