import { describe, it, expect, vi } from "vitest";
import {
  ResolutorAppIdMeta,
  mensajeAppIdNoResuelto,
  type CacheAppId,
  type CredencialAppId,
} from "@/lib/clients/whatsapp-app-id";
import { WhatsappNoConfiguradoError } from "@/lib/config/whatsapp";

// Ficha 474 (T4.3, R48) — el ID de la app se obtiene del token con GET /<apiVersion>/app, token en
// la CABECERA; cache solo del exito.
// SL-36 (design §9.1, §9.2; R28) — el token es de cada empresa: la cache es por empresa y ya no hay
// anulacion por entorno (`WHATSAPP_APP_ID`).

const TOKEN = "EAAG-token-secreto-123";

function credencial(organizacionId = "org-a", extra: Partial<CredencialAppId> = {}): CredencialAppId {
  return {
    organizacionId,
    integracionId: `int-${organizacionId}`,
    config: { token: TOKEN, apiVersion: "v21.0" },
    ...extra,
  };
}

function respuesta(status: number, cuerpo: unknown): Response {
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status });
}

function crear(
  fetchImpl: typeof fetch,
  extra: { cache?: CacheAppId; leerWhatsapp?: () => Promise<CredencialAppId> } = {},
) {
  const logs: string[] = [];
  const r = new ResolutorAppIdMeta({
    fetchImpl,
    leerWhatsapp: extra.leerWhatsapp ?? (async () => credencial()),
    cache: extra.cache ?? new Map(),
    logger: { warn: (m) => logs.push(m) },
  });
  return { r, logs };
}

describe("474/R48 — exito", () => {
  it("GET a /v21.0/app con Authorization Bearer y el token FUERA de la URL", async () => {
    const fetchImpl = vi.fn(async () => respuesta(200, { id: "1234567890", name: "Servi Logistic" }));
    const { r } = crear(fetchImpl as unknown as typeof fetch);
    const out = await r.resolver();
    expect(out).toEqual({ ok: true, appId: "1234567890", origen: "meta" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/app");
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("la segunda llamada de la MISMA empresa NO vuelve a la red", async () => {
    const fetchImpl = vi.fn(async () => respuesta(200, { id: "987" }));
    const cache: CacheAppId = new Map();
    const a = crear(fetchImpl as unknown as typeof fetch, { cache });
    await a.r.resolver();
    const b = crear(fetchImpl as unknown as typeof fetch, { cache }); // otro resolutor, mismo proceso
    expect(await b.r.resolver()).toEqual({ ok: true, appId: "987", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sin fetch inyectado usa el de la credencial (el que marca el rechazo, R30)", async () => {
    const deLaEmpresa = vi.fn(async () => respuesta(200, { id: "42" }));
    const r = new ResolutorAppIdMeta({
      leerWhatsapp: async () => credencial("org-a", { fetchImpl: deLaEmpresa as unknown as typeof fetch }),
      cache: new Map(),
    });
    expect(await r.resolver()).toEqual({ ok: true, appId: "42", origen: "meta" });
    expect(deLaEmpresa).toHaveBeenCalledTimes(1);
  });
});

describe("SL-36/R28 — la cache es por empresa", () => {
  it("⭑ la caché de A no responde a B", async () => {
    // A y B con el MISMO id de integracion a proposito: asi lo unico que las separa es la empresa
    // de la clave. Con una clave sin empresa (la cache de proceso de antes), B leeria la app de A.
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      return respuesta(200, { id: auth === "Bearer token-de-b" ? "222" : "111" });
    });
    const cache: CacheAppId = new Map();
    const deA = crear(fetchImpl as unknown as typeof fetch, {
      cache,
      leerWhatsapp: async () => ({ organizacionId: "org-a", integracionId: "int-1", config: { token: "token-de-a", apiVersion: "v21.0" } }),
    });
    const deB = crear(fetchImpl as unknown as typeof fetch, {
      cache,
      leerWhatsapp: async () => ({ organizacionId: "org-b", integracionId: "int-1", config: { token: "token-de-b", apiVersion: "v21.0" } }),
    });

    expect(await deA.r.resolver()).toEqual({ ok: true, appId: "111", origen: "meta" });
    expect(await deB.r.resolver()).toEqual({ ok: true, appId: "222", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Y la de A sigue siendo la suya.
    expect(await deA.r.resolver()).toEqual({ ok: true, appId: "111", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("si la empresa conecta OTRA integracion, la app vieja no se reutiliza", async () => {
    const fetchImpl = vi.fn(async () => respuesta(200, { id: "333" }));
    const cache: CacheAppId = new Map([["org-a", { integracionId: "int-vieja", huellaToken: "h", appId: "111" }]]);
    const { r } = crear(fetchImpl as unknown as typeof fetch, { cache });
    expect(await r.resolver()).toEqual({ ok: true, appId: "333", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("un token editado en la misma integración no reutiliza el app id cacheado", async () => {
    // Review SL-36 m2: misma empresa y misma integracion; lo unico que cambia es el token, que el
    // maestro edito y que puede ser de otra app de Meta. Cada token responde con su app.
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      return respuesta(200, { id: auth === "Bearer token-nuevo" ? "555" : "444" });
    });
    const cache: CacheAppId = new Map();
    let token = "token-viejo";
    const { r } = crear(fetchImpl as unknown as typeof fetch, {
      cache,
      leerWhatsapp: async () => ({ organizacionId: "org-a", integracionId: "int-1", config: { token, apiVersion: "v21.0" } }),
    });

    expect(await r.resolver()).toEqual({ ok: true, appId: "444", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    token = "token-nuevo";
    expect(await r.resolver()).toEqual({ ok: true, appId: "555", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // Mismo token: la cache si sirve, sin volver a la red.
    expect(await r.resolver()).toEqual({ ok: true, appId: "555", origen: "meta" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // La cache no guarda el token en claro.
    expect(JSON.stringify([...cache.values()])).not.toContain("token-nuevo");
  });

  it("sin WhatsApp no responde la cache aunque la empresa tuviera app antes", async () => {
    const fetchImpl = vi.fn();
    const cache: CacheAppId = new Map([["org-a", { integracionId: "int-org-a", huellaToken: "h", appId: "111" }]]);
    const { r } = crear(fetchImpl as unknown as typeof fetch, {
      cache,
      leerWhatsapp: async () => {
        throw new WhatsappNoConfiguradoError();
      },
    });
    expect(await r.resolver()).toEqual({ ok: false, motivo: "sin_credencial" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("474/R48 — fallos (no se cachean)", () => {
  it("HTTP 400 con codigo de Meta -> ok:false http + codigo; la siguiente vuelve a pedir", async () => {
    const fetchImpl = vi.fn(async () => respuesta(400, { error: { code: 190, message: `token ${TOKEN} invalido` } }));
    const cache: CacheAppId = new Map();
    const { r, logs } = crear(fetchImpl as unknown as typeof fetch, { cache });
    const out = await r.resolver();
    expect(out).toEqual({ ok: false, motivo: "http", codigo: 190 });
    await r.resolver();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
    expect(JSON.stringify(out) + logs.join("|")).not.toContain(TOKEN);
  });

  it("red -> ok:false red", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const { r } = crear(fetchImpl as unknown as typeof fetch);
    expect(await r.resolver()).toEqual({ ok: false, motivo: "red" });
  });

  it("timeout -> ok:false timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const { r } = crear(fetchImpl as unknown as typeof fetch);
    expect(await r.resolver()).toEqual({ ok: false, motivo: "timeout" });
  });

  it("id no numerico -> respuesta_invalida", async () => {
    const fetchImpl = vi.fn(async () => respuesta(200, { id: "abc" }));
    const cache: CacheAppId = new Map();
    const { r } = crear(fetchImpl as unknown as typeof fetch, { cache });
    expect(await r.resolver()).toEqual({ ok: false, motivo: "respuesta_invalida" });
    expect(cache.size).toBe(0);
  });

  it("SL-36/R24: la empresa sin WhatsApp -> sin_credencial, sin red y sin nombrar variables", async () => {
    const fetchImpl = vi.fn();
    const { r } = crear(fetchImpl as unknown as typeof fetch, {
      leerWhatsapp: async () => {
        throw new WhatsappNoConfiguradoError("sin_configurar");
      },
    });
    const out = await r.resolver();
    expect(out).toEqual({ ok: false, motivo: "sin_credencial" });
    expect(fetchImpl).not.toHaveBeenCalled();
    if (out.ok) throw new Error("imposible");
    const mensaje = mensajeAppIdNoResuelto(out);
    expect(mensaje).toContain("WhatsApp no está configurado en tu empresa");
    expect(mensaje).not.toMatch(/WHATSAPP_[A-Z_]+/);
  });

  it("un error que no es «no configurado» (base caida) se propaga: no se disfraza de sin credencial", async () => {
    const { r } = crear(vi.fn() as unknown as typeof fetch, {
      leerWhatsapp: async () => {
        throw new Error("base caida");
      },
    });
    await expect(r.resolver()).rejects.toThrow("base caida");
  });

  it("el mensaje de fallo nombra el codigo y no lleva secretos", () => {
    const m = mensajeAppIdNoResuelto({ ok: false, motivo: "http", codigo: 190 });
    expect(m).toContain("código 190");
    expect(m).toContain("Las plantillas con documento no se pueden enviar a aprobación");
  });
});
