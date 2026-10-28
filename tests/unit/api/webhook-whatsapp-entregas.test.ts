import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { handlePost } from "@/app/api/webhooks/whatsapp/route";
import type { IEntregaEstadoService } from "@/lib/services/EntregaEstadoService";
import { WebhookWhatsappService } from "@/lib/services/WebhookWhatsappService";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// Ficha 474 (T8.3, R38) — el webhook aplica los estados a las ENTREGAS de los envios DESPUES de la
// ingesta del chat; un fallo suyo NO cambia el 200 ni la ingesta.
// SL-36: la regla vive en `WebhookWhatsappService`; se ejerce por el route con el service real y
// dobles en sus bordes (el numero `2` es de `org-a` y su App Secret es `secreto`).

const APP_SECRET = "secreto";

function firmar(raw: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(raw, "utf8").digest("hex");
}

const CUERPO = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "1", phone_number_id: "2" },
            statuses: [{ id: "wamid.474", status: "delivered", timestamp: "1759662000", recipient_id: "50688887777" }],
          },
        },
      ],
    },
  ],
});

function req(): Request {
  return new Request("https://x/api/webhooks/whatsapp", {
    method: "POST",
    body: CUERPO,
    headers: { "x-hub-signature-256": firmar(CUERPO) },
  });
}

function servicio(entregaEstado: () => IEntregaEstadoService) {
  const ingerirEventos = vi.fn(async () => ({ mensajesRegistrados: 0, statusesAplicados: 1, sinResolver: 0, hilosMigrados: 0 }));
  const service = new WebhookWhatsappService({
    enrutado: {
      porNumeros: async () => new Map([["2", { organizacionId: "org-a", integracionId: "int-a" }]]),
      porResumenVerificacion: async () => null,
    },
    resumidor: { resumen: (t) => t },
    leerAppSecret: async () => APP_SECRET,
    anotarWebhook: async () => {},
    ingesta: { ingerirEventos },
    entregaEstado,
    logger: { warn: () => {} },
  });
  return { ingerirEventos, service };
}

describe("474/R38 — webhook -> entregas", () => {
  it("aplica los statuses a las entregas DESPUES de la ingesta del chat", async () => {
    const aplicar = vi.fn(async () => 1);
    const { service, ingerirEventos } = servicio(() => ({ aplicar }));
    const res = await handlePost(req(), { service });
    expect(res.status).toBe(200);
    expect(aplicar).toHaveBeenCalledTimes(1);
    const statuses = (aplicar.mock.calls[0] as unknown as [{ waMessageId: string; estado: string }[]])[0];
    expect(statuses.map((s) => [s.waMessageId, s.estado])).toEqual([["wamid.474", "delivered"]]);
    expect(ingerirEventos.mock.invocationCallOrder[0]).toBeLessThan(aplicar.mock.invocationCallOrder[0]);
  });

  it("⭑ un fallo al construir o aplicar NO cambia el 200 ni la ingesta", async () => {
    const { service, ingerirEventos } = servicio(() => {
      throw new Error("sin base");
    });
    const res = await handlePost(req(), { service });
    expect(res.status).toBe(200);
    expect(ingerirEventos).toHaveBeenCalledTimes(1);
  });
});
