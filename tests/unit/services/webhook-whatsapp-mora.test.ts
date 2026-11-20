import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { contextoActual } from "@/lib/db/contexto-empresa";
import { permisoEnMoraActual } from "@/lib/db/permiso-en-mora";
import { WebhookWhatsappService } from "@/lib/services/WebhookWhatsappService";

// SLT-121 (design §6.1; R15) — con la empresa congelada, los mensajes entrantes de WhatsApp se siguen
// guardando: la ingesta de cada empresa del lote, y la anotacion del ultimo contacto, corren dentro de
// `permitidoEnMora("whatsapp_entrante")`. Lo de antes de la firma (el enrutado) no escribe y no lo lleva.

const SECRETO = "secreto-app";
const AHORA = new Date("2026-11-20T12:00:00.000Z");

const firmar = (raw: string) => "sha256=" + createHmac("sha256", SECRETO).update(raw, "utf8").digest("hex");

function cuerpo(...numeros: string[]): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "w",
        changes: numeros.map((numero, i) => ({
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "1", phone_number_id: numero },
            messages: [{ from: "50688880001", id: `wamid.${i}`, timestamp: "1700000000", type: "text", text: { body: "hola" } }],
          },
        })),
      },
    ],
  });
}

type Visto = { paso: string; permiso: string | null; empresa: string | null };

function montar() {
  const vistos: Visto[] = [];
  const anotar = (paso: string) => {
    const ctx = contextoActual();
    vistos.push({ paso, permiso: permisoEnMoraActual(), empresa: ctx?.tipo === "empresa" ? ctx.organizacionId : null });
  };
  const service = new WebhookWhatsappService({
    enrutado: {
      porNumeros: async () => {
        anotar("enrutado");
        return new Map([
          ["num-a", { organizacionId: "org-a", integracionId: "int-a" }],
          ["num-b", { organizacionId: "org-b", integracionId: "int-b" }],
        ]);
      },
      porResumenVerificacion: async () => null,
    },
    resumidor: { resumen: (t) => `r:${t}` },
    leerAppSecret: async () => SECRETO,
    anotarWebhook: async () => anotar("anotar"),
    ingesta: {
      ingerirEventos: async () => {
        anotar("ingesta");
        return { mensajesRegistrados: 1, statusesAplicados: 0, sinResolver: 0, hilosMigrados: 0, enrutadosPorCita: 0 };
      },
    },
    entregaEstado: () => ({ aplicar: async () => 0 }),
    logger: { warn: () => {}, error: () => {} },
    reloj: () => AHORA,
  });
  return { service, vistos };
}

describe("R15 — la ingesta de WhatsApp corre con el permiso whatsapp_entrante", () => {
  it("cada empresa del lote ingiere y anota con el permiso, en su empresa", async () => {
    const { service, vistos } = montar();
    const raw = cuerpo("num-a", "num-b");
    const r = await service.recibir({ cuerpoCrudo: raw, firma: firmar(raw) });

    expect(r).toMatchObject({ status: "ok" });
    expect(vistos.filter((v) => v.paso !== "enrutado")).toEqual([
      { paso: "ingesta", permiso: "whatsapp_entrante", empresa: "org-a" },
      { paso: "anotar", permiso: "whatsapp_entrante", empresa: "org-a" },
      { paso: "ingesta", permiso: "whatsapp_entrante", empresa: "org-b" },
      { paso: "anotar", permiso: "whatsapp_entrante", empresa: "org-b" },
    ]);
  });

  it("el enrutado (antes de la firma, solo lectura) no lleva permiso, y el permiso no se escapa", async () => {
    const { service, vistos } = montar();
    const raw = cuerpo("num-a");
    await service.recibir({ cuerpoCrudo: raw, firma: firmar(raw) });

    expect(vistos.find((v) => v.paso === "enrutado")?.permiso).toBeNull();
    expect(permisoEnMoraActual()).toBeNull();
  });

  it("con la firma invalida no se ingiere nada", async () => {
    const { service, vistos } = montar();
    const raw = cuerpo("num-a");
    const r = await service.recibir({ cuerpoCrudo: raw, firma: "sha256=" + "0".repeat(64) });

    expect(r).toEqual({ status: "unauthorized" });
    expect(vistos.map((v) => v.paso)).toEqual(["enrutado"]);
  });
});
