import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { construirTokenProvider } from "@/lib/auth/google-sa-token";

// Feature 92 (R11/R12) — este archivo fijaba la PRECEDENCIA del selector de tres modos (ADC > WIF >
// JWT-bearer). SL-36 (design §9.2) retiro ADC y WIF: eran identidades de la PLATAFORMA (la de quien
// desarrolla y la del despliegue de Vercel), y prestarlas a las empresas es justo lo que la ficha
// prohibe. Lo que queda por fijar es lo contrario de lo que se fijaba antes: que NINGUNA variable del
// entorno vuelve a encender un modo de plataforma. Si alguien reintrodujera el selector leyendo el
// entorno, el token dejaria de ser el de la cuenta de servicio de la empresa y estos casos se
// pondrian rojos.

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const CLAVE_DE_LA_EMPRESA = { email: "sa@a.iam.gserviceaccount.com", privateKey };

/** Las variables de los modos retirados, puestas como estaban en el despliegue de la plataforma. */
const ENTORNO_DE_PLATAFORMA: Record<string, string> = {
  GOOGLE_ROUTE_OPT_USE_ADC: "true",
  GOOGLE_WIF_PROJECT_NUMBER: "123456789012",
  GOOGLE_WIF_POOL_ID: "vercel",
  GOOGLE_WIF_PROVIDER_ID: "vercel",
  GOOGLE_CLOUD_PROJECT_NUMBER: "123456789012",
  GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID: "vercel",
  GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel",
  GOOGLE_ROUTE_OPT_SA_EMAIL: "sa-de-la-plataforma@p.iam.gserviceaccount.com",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function respuestaToken(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: "tok-de-la-empresa", expires_in: 3600 }),
  } as unknown as Response;
}

describe("SL-36 — un solo modo: JWT-bearer con la clave de la empresa", () => {
  it("⭑ con las variables de ADC y WIF en el entorno, el proveedor sigue siendo el de firma", () => {
    for (const [k, v] of Object.entries(ENTORNO_DE_PLATAFORMA)) vi.stubEnv(k, v);
    const provider = construirTokenProvider(CLAVE_DE_LA_EMPRESA);
    expect(provider.constructor.name).toBe("GoogleServiceAccountToken");
  });

  it("⭑ y el token se pide firmando con la cuenta de la EMPRESA, no con la de la plataforma", async () => {
    for (const [k, v] of Object.entries(ENTORNO_DE_PLATAFORMA)) vi.stubEnv(k, v);
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => respuestaToken());
    const provider = construirTokenProvider(CLAVE_DE_LA_EMPRESA, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.obtener()).toBe("tok-de-la-empresa");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    // El endpoint del JWT-bearer, no STS (WIF) ni el metadata server (ADC).
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"));
    expect(claims.iss).toBe("sa@a.iam.gserviceaccount.com");
    expect(JSON.stringify(claims)).not.toContain("plataforma");
  });
});
