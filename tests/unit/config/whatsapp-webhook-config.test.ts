import { describe, it, expect, afterEach, vi } from "vitest";
import * as configWhatsapp from "@/lib/config/whatsapp";
import { WhatsappNoConfiguradoError, whatsappConfigDe } from "@/lib/config/whatsapp";

// Feature 109 — B1.T (R12) probaba `loadWhatsappWebhookConfig`, que leia el token de verificacion y
// el App Secret del entorno. SL-36 (design §9.1, §10; R23) lo retira: los dos son de cada empresa y
// los usa `WebhookWhatsappService` (tests/unit/services/webhook-whatsapp-service.test.ts). Lo que
// queda de este modulo es armar la config de ENVIO desde la credencial de la empresa, y eso es lo que
// se fija aqui: que el entorno ya no presta ninguna pieza de la credencial.

const CREDENCIAL = { token_acceso: "token-de-la-empresa", app_secret: "secreto-de-la-empresa" };
const DATOS = { numeroId: "111", wabaId: "222" };

afterEach(() => vi.unstubAllEnvs());

describe("SL-36/R23 — whatsappConfigDe", () => {
  it("token, número y WABA salen de la empresa aunque el entorno traiga las variables retiradas", () => {
    vi.stubEnv("WHATSAPP_CLOUD_TOKEN", "token-de-plataforma");
    vi.stubEnv("WHATSAPP_NUMERO_ID", "999");
    vi.stubEnv("WHATSAPP_WABA_ID", "888");

    const config = whatsappConfigDe(CREDENCIAL, DATOS);

    expect(config).toMatchObject({ token: "token-de-la-empresa", numeroId: "111", wabaId: "222" });
  });

  it("version, categoria e idioma siguen siendo de la plataforma (no son claves) y tienen defecto", () => {
    expect(whatsappConfigDe(CREDENCIAL, DATOS)).toMatchObject({
      apiVersion: "v21.0",
      templateCategoria: "UTILITY",
      templateIdioma: "es",
    });
    vi.stubEnv("WHATSAPP_API_VERSION", "v22.0");
    vi.stubEnv("WHATSAPP_TEMPLATE_LANG", "es_CR");
    expect(whatsappConfigDe(CREDENCIAL, DATOS)).toMatchObject({ apiVersion: "v22.0", templateIdioma: "es_CR" });
  });

  it("el App Secret no viaja en la config de envio", () => {
    expect(JSON.stringify(whatsappConfigDe(CREDENCIAL, DATOS))).not.toContain("secreto-de-la-empresa");
  });

  it("ya no existen los cargadores del entorno", () => {
    expect("loadWhatsappConfig" in configWhatsapp).toBe(false);
    expect("loadWhatsappWebhookConfig" in configWhatsapp).toBe(false);
  });

  it("WhatsappNoConfiguradoError dice el motivo y no nombra variables", () => {
    const e = new WhatsappNoConfiguradoError("ilegible");
    expect(e.motivo).toBe("ilegible");
    expect(e.message).not.toMatch(/WHATSAPP_[A-Z_]+/);
    expect(new WhatsappNoConfiguradoError().motivo).toBe("sin_configurar");
  });
});
