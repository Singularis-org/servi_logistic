import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import * as route from "@/app/api/webhooks/whatsapp/route";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { DestinoWebhook } from "@/lib/interfaces/repositories/IIntegracionEnrutadoRepository";
import type { IWebhookWhatsappService } from "@/lib/interfaces/services/IWebhookWhatsappService";
import { WebhookWhatsappService } from "@/lib/services/WebhookWhatsappService";
import type { WebhookEventos } from "@/lib/types/whatsapp-webhook";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// SL-17 · R15 (D14) repartia en plataforma los eventos por empresa (`repartirPorEmpresa`), leyendo
// ordenes, hilos y entregas de TODAS. SL-36 (design §10; R20-R22) lo retira: la empresa sale del
// numero del evento y el route solo traduce HTTP. Aqui se fija lo que es del ROUTE:
//   - ya no abre el contexto de plataforma ni exporta `repartirPorEmpresa` (R22);
//   - delega en el service con el cuerpo CRUDO y la cabecera, y traduce su resultado;
//   - con el service real (dobles en sus bordes), cada empresa ingiere SOLO sus eventos y en SU
//     contexto, firmados con SU App Secret (R20).
// El resto de R19-R21 vive en tests/unit/services/webhook-whatsapp-service.test.ts y la parte de
// base real en tests/integration/api/webhook-whatsapp.route.test.ts.

const RAIZ = path.resolve(__dirname, "..", "..", "..");

function firmar(raw: string, secreto: string): string {
  return "sha256=" + createHmac("sha256", secreto).update(raw, "utf8").digest("hex");
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

function post(raw: string, firma: string | null): Request {
  return new Request("https://x/api/webhooks/whatsapp", {
    method: "POST",
    body: raw,
    headers: firma === null ? {} : { "x-hub-signature-256": firma },
  });
}

describe("SL-36/R22 — el route ya no opera en plataforma", () => {
  it("⭑ sin comoPlataforma ni repartirPorEmpresa en el fuente, y ninguna lectura de la base", () => {
    const fuente = quitarComentarios(fs.readFileSync(path.join(RAIZ, "app/api/webhooks/whatsapp/route.ts"), "utf8"));
    expect(fuente.length).toBeGreaterThan(1000); // autocomprobacion: se leyo el archivo
    expect(fuente).not.toContain("comoPlataforma");
    expect(fuente).not.toContain("repartirPorEmpresa");
    expect(fuente).not.toMatch(/prisma\.\w+\.find/);
    expect("repartirPorEmpresa" in route).toBe(false);
  });
});

describe("SL-36 — el route traduce el resultado del service", () => {
  function doble(r: Awaited<ReturnType<IWebhookWhatsappService["recibir"]>>) {
    const recibir = vi.fn(async () => r);
    const verificar = vi.fn(async () => ({ status: "ok" as const, challenge: "C123" }));
    return { service: { recibir, verificar } as IWebhookWhatsappService, recibir, verificar };
  }

  it("POST: pasa el cuerpo CRUDO y la cabecera de firma tal como llegan", async () => {
    const { service, recibir } = doble({ status: "unauthorized" });
    const raw = '{"entry":[ ]}'; // con espacios: lo firmado es el texto, no su JSON reserializado
    await route.handlePost(post(raw, "sha256=abc"), { service });
    expect(recibir).toHaveBeenCalledWith({ cuerpoCrudo: raw, firma: "sha256=abc" });
  });

  it("POST: unauthorized -> 401; ok -> 200 con los conteos", async () => {
    const no = doble({ status: "unauthorized" });
    expect((await route.handlePost(post("{}", null), { service: no.service })).status).toBe(401);

    const si = doble({ status: "ok", resumen: { mensajesRegistrados: 2, statusesAplicados: 1, sinResolver: 0, hilosMigrados: 0 } });
    const res = await route.handlePost(post("{}", "sha256=x"), { service: si.service });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mensajesRegistrados: 2, statusesAplicados: 1, sinResolver: 0, hilosMigrados: 0 });
  });

  it("GET: ok -> 200 text/plain con el challenge; forbidden -> 403 sin challenge", async () => {
    const { service, verificar } = doble({ status: "unauthorized" });
    const url = "https://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=C123";
    const ok = await route.handleGet(new Request(url), { service });
    expect(verificar).toHaveBeenCalledWith({ mode: "subscribe", token: "tok", challenge: "C123" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/plain");
    expect(await ok.text()).toBe("C123");

    verificar.mockResolvedValueOnce({ status: "forbidden" } as never);
    const no = await route.handleGet(new Request(url), { service });
    expect(no.status).toBe(403);
    expect(await no.text()).not.toContain("C123");
  });
});

describe("SL-36/R20 — con el service real, cada empresa ingiere lo suyo en su contexto", () => {
  const DESTINOS = new Map<string, DestinoWebhook>([
    ["num-a", { organizacionId: "org-a", integracionId: "int-a" }],
    ["num-b", { organizacionId: "org-b", integracionId: "int-b" }],
  ]);
  const SECRETOS: Record<string, string> = { "int-a": "secreto-a", "int-b": "secreto-b" };

  function montar() {
    const vistos: { contexto: ContextoDatos | undefined; ids: string[] }[] = [];
    const service = new WebhookWhatsappService({
      enrutado: {
        porNumeros: async (numeros) => new Map([...DESTINOS].filter(([n]) => numeros.includes(n))),
        porResumenVerificacion: async () => null,
      },
      resumidor: { resumen: (t) => `r:${t}` },
      leerAppSecret: async (id) => SECRETOS[id] ?? null,
      anotarWebhook: async () => {},
      ingesta: {
        ingerirEventos: vi.fn(async (e: WebhookEventos) => {
          vistos.push({ contexto: contextoActual(), ids: e.mensajes.map((m) => m.waMessageId) });
          return { mensajesRegistrados: e.mensajes.length, statusesAplicados: 0, sinResolver: 0, hilosMigrados: 0 };
        }),
      },
      entregaEstado: () => ({ aplicar: async () => 0 }),
      logger: { warn: () => {} },
    });
    return { service, vistos };
  }

  it("dos números de dos empresas en un POST firmado por A: solo A ingiere, y solo su evento", async () => {
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "w", changes: [cambio("num-a", "wamid.A", "50688880001"), cambio("num-b", "wamid.B", "50688880002")] }],
    });
    const { service, vistos } = montar();
    const res = await route.handlePost(post(raw, firmar(raw, "secreto-a")), { service });
    expect(res.status).toBe(200);
    expect(vistos).toEqual([{ contexto: { tipo: "empresa", organizacionId: "org-a" }, ids: ["wamid.A"] }]);
  });

  it("firmado con el App Secret de OTRA empresa: 401 y nadie ingiere", async () => {
    const raw = JSON.stringify({ entry: [{ id: "w", changes: [cambio("num-a", "wamid.A", "50688880001")] }] });
    const { service, vistos } = montar();
    const res = await route.handlePost(post(raw, firmar(raw, "secreto-b")), { service });
    expect(res.status).toBe(401);
    expect(vistos).toEqual([]);
  });
});
