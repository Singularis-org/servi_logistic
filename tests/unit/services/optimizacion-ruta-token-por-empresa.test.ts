import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { RutaNoConfiguradoError, RutaTokenError } from "@/lib/auth/google-token-shared";
import { conEmpresa, contextoActual } from "@/lib/db/contexto-empresa";
import type {
  ICredencialesIntegracion,
  LecturaCredencial,
} from "@/lib/interfaces/services/ICredencialesIntegracion";
import { RutasPorEmpresa } from "@/lib/services/integraciones/rutas-de-la-empresa";
import type { ServicioIntegracion } from "@/lib/types/integraciones";

// SL-36 (design §5, §9.1; R23, R26, R28, R29, R30) — la credencial de optimizacion de rutas es la
// clave JSON de la cuenta de servicio de CADA empresa. El drenador atiende en la misma corrida jobs
// de varias empresas con UN service, y antes ese service guardaba un `tokenProvider ??=` de proceso:
// con claves por empresa, el primer job habria fijado su token para todas. Todo con dobles: sin red,
// sin base y con pares RSA generados aqui (la firma es real).

function par() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  }).privateKey;
}
const PEM_A = par();
const PEM_B = par();

function claveJson(proyecto: string, email: string, pem: string): string {
  return JSON.stringify({ type: "service_account", project_id: proyecto, client_email: email, private_key: pem });
}

const CLAVE_A = claveJson("proyecto-a", "sa@a.iam.gserviceaccount.com", PEM_A);
const CLAVE_B = claveJson("proyecto-b", "sa@b.iam.gserviceaccount.com", PEM_B);

type Guardado = string | "sin_configurar" | "ilegible";

/** Lector de credenciales que responde segun la empresa del CONTEXTO, como el real (R23). */
function credencialesPorEmpresa(porEmpresa: Record<string, Guardado>, integracionId = "int-rutas") {
  const marcas: { organizacionId: string | undefined; servicio: string; codigo: string }[] = [];
  const leidas: (string | undefined)[] = [];
  const empresa = () => {
    const c = contextoActual();
    return c?.tipo === "empresa" ? c.organizacionId : undefined;
  };
  const credenciales: ICredencialesIntegracion = {
    async leer<S extends ServicioIntegracion>(servicio: S): Promise<LecturaCredencial<S>> {
      expect(servicio).toBe("optimizacion_rutas");
      const org = empresa();
      leidas.push(org);
      const guardado = org === undefined ? "sin_configurar" : (porEmpresa[org] ?? "sin_configurar");
      if (guardado === "sin_configurar" || guardado === "ilegible") return { estado: guardado };
      return {
        estado: "lista",
        integracionId,
        credencial: { clave_cuenta_servicio: guardado },
        datosPublicos: {},
      } as unknown as LecturaCredencial<S>;
    },
    async marcarRechazo(servicio, codigo) {
      marcas.push({ organizacionId: empresa(), servicio, codigo });
    },
  };
  return { credenciales, marcas, leidas };
}

/** El `iss` del JWT firmado que viaja al endpoint de token: dice CON QUE cuenta se firmo. */
function emisorDe(init: RequestInit | undefined): string {
  const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
  return JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8")).iss;
}

function respuesta(status: number, cuerpo: unknown = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

/** Google de mentira: el token que devuelve lleva el nombre de la cuenta que lo pidio. */
function googleDoble(statusToken = 200) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "https://oauth2.googleapis.com/token") {
      if (statusToken !== 200) return respuesta(statusToken, { error: "invalid_grant" });
      return respuesta(200, { access_token: `tok-de-${emisorDe(init)}`, expires_in: 3600 });
    }
    return respuesta(200, {});
  });
}

const tokenEn = (rutas: RutasPorEmpresa, org: string) =>
  conEmpresa(org, async () => (await rutas.deLaEmpresa()).getToken());

describe("SL-36/R28 — el token de Google se cachea POR EMPRESA", () => {
  it("⭑ el token de A no se usa para B", async () => {
    const { credenciales } = credencialesPorEmpresa({ "org-a": CLAVE_A, "org-b": CLAVE_B });
    const fetchBase = googleDoble();
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: fetchBase as unknown as typeof fetch });

    const deA = await tokenEn(rutas, "org-a");
    const deB = await tokenEn(rutas, "org-b");

    expect(deA).toBe("tok-de-sa@a.iam.gserviceaccount.com");
    expect(deB).toBe("tok-de-sa@b.iam.gserviceaccount.com");
    // Dos intercambios: uno por cuenta de servicio. Con una cache sin empresa, B no habria pedido el suyo.
    expect(fetchBase).toHaveBeenCalledTimes(2);
  });

  it("y el de A sí se reutiliza para A (la cache sigue sirviendo, solo que por empresa)", async () => {
    const { credenciales } = credencialesPorEmpresa({ "org-a": CLAVE_A, "org-b": CLAVE_B });
    const fetchBase = googleDoble();
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: fetchBase as unknown as typeof fetch });

    await tokenEn(rutas, "org-a");
    await tokenEn(rutas, "org-b");
    expect(await tokenEn(rutas, "org-a")).toBe("tok-de-sa@a.iam.gserviceaccount.com");

    expect(fetchBase).toHaveBeenCalledTimes(2);
  });

  it("si la empresa cambia su clave, el token viejo no se sirve", async () => {
    const guardado: Record<string, Guardado> = { "org-a": CLAVE_A };
    const { credenciales } = credencialesPorEmpresa(guardado);
    const fetchBase = googleDoble();
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: fetchBase as unknown as typeof fetch });

    await tokenEn(rutas, "org-a");
    guardado["org-a"] = claveJson("proyecto-a", "otra-sa@a.iam.gserviceaccount.com", PEM_B);

    expect(await tokenEn(rutas, "org-a")).toBe("tok-de-otra-sa@a.iam.gserviceaccount.com");
  });

  it("el proyecto de la URL sale de la clave de CADA empresa", async () => {
    const { credenciales } = credencialesPorEmpresa({ "org-a": CLAVE_A, "org-b": CLAVE_B });
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: googleDoble() as unknown as typeof fetch });

    expect((await conEmpresa("org-a", () => rutas.deLaEmpresa())).projectId).toBe("proyecto-a");
    expect((await conEmpresa("org-b", () => rutas.deLaEmpresa())).projectId).toBe("proyecto-b");
  });
});

describe("SL-36/R26 y R29 — sin credencial usable, RutaNoConfiguradoError SIN red", () => {
  it.each([
    ["sin integración", "sin_configurar", "sin_configurar"],
    ["credencial ilegible (R29)", "ilegible", "ilegible"],
    ["clave que no es de una cuenta de servicio", JSON.stringify({ type: "otra" }), "clave_mal_formada"],
  ] as const)("%s -> motivo %s", async (_caso, guardado, motivo) => {
    const { credenciales } = credencialesPorEmpresa({ "org-a": guardado });
    const fetchBase = googleDoble();
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: fetchBase as unknown as typeof fetch });

    const error = await conEmpresa("org-a", () => rutas.deLaEmpresa()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RutaNoConfiguradoError);
    expect((error as RutaNoConfiguradoError).motivo).toBe(motivo);
    expect(fetchBase).not.toHaveBeenCalled();
  });

  it("sin empresa (sesión sin empresa): sin_empresa, sin leer ni llamar", async () => {
    const { credenciales, leidas } = credencialesPorEmpresa({ "org-a": CLAVE_A });
    const fetchBase = googleDoble();
    const rutas = new RutasPorEmpresa({
      credenciales,
      fetchBase: fetchBase as unknown as typeof fetch,
      empresaDeLaSesion: async () => null,
    });

    const error = await rutas.deLaEmpresa().catch((e: unknown) => e);

    expect((error as RutaNoConfiguradoError).motivo).toBe("sin_empresa");
    expect(leidas).toEqual([]);
    expect(fetchBase).not.toHaveBeenCalled();
  });

  it("sin contexto, la empresa sale de la sesión (la action del mensajero) y se lee en ESA empresa", async () => {
    const { credenciales, leidas } = credencialesPorEmpresa({ "org-b": CLAVE_B });
    const rutas = new RutasPorEmpresa({
      credenciales,
      fetchBase: googleDoble() as unknown as typeof fetch,
      empresaDeLaSesion: async () => "org-b",
    });

    expect(await (await rutas.deLaEmpresa()).getToken()).toBe("tok-de-sa@b.iam.gserviceaccount.com");
    expect(leidas).toEqual(["org-b"]);
  });
});

describe("SL-36/R30 — Google rechaza la credencial durante un uso real", () => {
  it.each([400, 401])(
    "⭑ HTTP %s en el intercambio (invalid_grant): marca optimizacion_rutas.credencial_rechazada en ESA empresa",
    async (status) => {
      const { credenciales, marcas } = credencialesPorEmpresa({ "org-a": CLAVE_A });
      const rutas = new RutasPorEmpresa({ credenciales, fetchBase: googleDoble(status) as unknown as typeof fetch });

      await expect(tokenEn(rutas, "org-a")).rejects.toBeInstanceOf(RutaTokenError);

      expect(marcas).toEqual([
        { organizacionId: "org-a", servicio: "optimizacion_rutas", codigo: "optimizacion_rutas.credencial_rechazada" },
      ]);
    },
  );

  it("un 500 del endpoint de token no es un rechazo: no se marca", async () => {
    const { credenciales, marcas } = credencialesPorEmpresa({ "org-a": CLAVE_A });
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: googleDoble(500) as unknown as typeof fetch });

    await expect(tokenEn(rutas, "org-a")).rejects.toBeInstanceOf(RutaTokenError);
    expect(marcas).toEqual([]);
  });

  it("⭑ 403 en optimizeTours: marca optimizacion_rutas.permiso en ESA empresa; la respuesta no cambia", async () => {
    const { credenciales, marcas } = credencialesPorEmpresa({ "org-a": CLAVE_A });
    const fetchBase = vi.fn(async () => respuesta(403, { error: { status: "PERMISSION_DENIED" } }));
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: fetchBase as unknown as typeof fetch });

    const empresa = await conEmpresa("org-a", () => rutas.deLaEmpresa());
    // Fuera de `conEmpresa`, como en la action del mensajero: la marca va igual a la empresa A.
    const r = await empresa.fetchOptimizacion("https://routeoptimization.googleapis.com/v1/projects/proyecto-a:optimizeTours");

    expect(r.status).toBe(403);
    expect(marcas).toEqual([
      { organizacionId: "org-a", servicio: "optimizacion_rutas", codigo: "optimizacion_rutas.permiso" },
    ]);
  });

  it.each([200, 400, 401, 429, 500])("optimizeTours %s no es la señal de permiso: no se marca", async (status) => {
    const { credenciales, marcas } = credencialesPorEmpresa({ "org-a": CLAVE_A });
    const fetchBase = vi.fn(async () => respuesta(status));
    const rutas = new RutasPorEmpresa({ credenciales, fetchBase: fetchBase as unknown as typeof fetch });

    const empresa = await conEmpresa("org-a", () => rutas.deLaEmpresa());
    await empresa.fetchOptimizacion("https://routeoptimization.googleapis.com/v1/projects/p:optimizeTours");

    expect(marcas).toEqual([]);
  });
});
