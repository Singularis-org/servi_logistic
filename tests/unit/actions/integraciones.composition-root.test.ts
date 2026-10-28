import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  dependenciasIntegraciones,
  urlWebhookWhatsapp,
} from "@/lib/actions/_shared/integraciones";
import { WhatsappProbador } from "@/lib/clients/probadores/whatsapp-probador";
import { GoogleMapsProbador } from "@/lib/clients/probadores/google-maps-probador";
import { OptimizacionRutasProbador } from "@/lib/clients/probadores/optimizacion-rutas-probador";
import { AsistenteProbador } from "@/lib/clients/probadores/asistente-probador";
import { ConfiguracionBovedaError, PRUEBAS_POR_MINUTO_DEFECTO } from "@/lib/config/integraciones";
import { BovedaIntegraciones, FuenteAleatoriaCripto, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import type { Actor } from "@/lib/interfaces/services/IIntegracionesService";
import { IntegracionPruebaMinutoRepository } from "@/lib/repositories/IntegracionPruebaMinutoRepository";
import { IntegracionRepository } from "@/lib/repositories/IntegracionRepository";
import { SERVICIOS_INTEGRACION } from "@/lib/types/integraciones";

// SL-36 (T7.1) — EL COMPOSITION ROOT, EJERCITADO DE VERDAD.
//
// Qué fallo cierra: `IntegracionesService` recibe siete dependencias y dos de ellas tienen defecto.
// Los tests del service inyectan sus dobles, así que un root que olvide una (o que deje caer el
// límite en su defecto en vez de leer el entorno de la app) compila, deja la suite verde y revienta
// o se comporta distinto en producción. Este repo ya midió esa familia («2 de 7 notificadores
// muertos con la suite verde»): no basta con que el módulo IMPORTE la dependencia, hay que ver que
// alguien la PASA. Aquí se mira cada una, su clase, y que lee el entorno que se le da.

const PRISMA = {} as PrismaClient;
const URL = "https://app.ejemplo.test/api/webhooks/whatsapp";
const K1 = Buffer.alloc(32, 0x11).toString("base64");

/** La lista CERRADA de lo que se pasa. Si el service gana una dependencia, este literal obliga a cablearla. */
const DEPENDENCIAS = ["aleatoria", "cifrador", "limitePorMinuto", "probadores", "pruebas", "repo", "resumen", "urlWebhook"];

describe("SL-36/T7.1 — `dependenciasIntegraciones` pasa TODAS las dependencias reales", () => {
  it("cada dependencia está y es la implementación de producción", () => {
    const d = dependenciasIntegraciones({ prisma: PRISMA, env: {}, urlWebhook: URL });
    expect(Object.keys(d).sort()).toEqual(DEPENDENCIAS);
    for (const k of DEPENDENCIAS) expect(d[k as keyof typeof d], k).toBeDefined();
    expect(d.repo).toBeInstanceOf(IntegracionRepository);
    expect(d.pruebas).toBeInstanceOf(IntegracionPruebaMinutoRepository);
    expect(d.cifrador).toBeInstanceOf(BovedaIntegraciones);
    expect(d.resumen).toBeInstanceOf(ResumenSecretoSha256);
    expect(d.aleatoria).toBeInstanceOf(FuenteAleatoriaCripto);
    expect(d.urlWebhook).toBe(URL);
    expect(Object.keys(d.probadores).sort()).toEqual([...SERVICIOS_INTEGRACION].sort());
  });

  it("design §15: en producción los cuatro probadores son los reales aunque pidan el doble", () => {
    const { probadores } = dependenciasIntegraciones({
      prisma: PRISMA,
      env: { INTEGRACIONES_PROBADOR_DOBLE: "1", VERCEL_ENV: "production" },
      urlWebhook: URL,
    });
    expect(probadores.whatsapp).toBeInstanceOf(WhatsappProbador);
    expect(probadores.google_maps).toBeInstanceOf(GoogleMapsProbador);
    expect(probadores.optimizacion_rutas).toBeInstanceOf(OptimizacionRutasProbador);
    expect(probadores.asistente).toBeInstanceOf(AsistenteProbador);
  });

  it("design §15: fuera de producción y con la variable, el doble (el entorno que se pasa es el que manda)", () => {
    const { probadores } = dependenciasIntegraciones({ prisma: PRISMA, env: { INTEGRACIONES_PROBADOR_DOBLE: "1" }, urlWebhook: URL });
    expect(probadores.whatsapp).not.toBeInstanceOf(WhatsappProbador);
    expect(probadores.asistente).not.toBeInstanceOf(AsistenteProbador);
  });

  it("R4: la bóveda lee el anillo del entorno que se pasa, en cada operación", async () => {
    const env: Record<string, string | undefined> = {};
    const { cifrador } = dependenciasIntegraciones({ prisma: PRISMA, env, urlWebhook: URL });
    const ctx = { organizacionId: "org-a", integracionId: "4d1f1d4e-7d0a-4b4c-9a51-2c3f0e9b8a77", campo: "clave_api" };
    await expect(cifrador.cifrar("valido-x", ctx)).rejects.toBeInstanceOf(ConfiguracionBovedaError);
    // Mismo objeto, entorno cambiado después de construir: si el anillo se leyera al construir, seguiría fallando.
    env.INTEGRACIONES_CLAVES_CIFRADO = `v1:${K1}`;
    env.INTEGRACIONES_CLAVE_ACTIVA = "v1";
    const guardado = await cifrador.cifrar("valido-x", ctx);
    expect(guardado.startsWith("v1:")).toBe(true);
    expect(await cifrador.descifrar(guardado, ctx)).toBe("valido-x");
  });

  it("R16: el límite sale del entorno que se pasa, en cada prueba (y no del defecto del service)", () => {
    const env: Record<string, string | undefined> = { INTEGRACIONES_PRUEBAS_POR_MINUTO: "2" };
    const { limitePorMinuto } = dependenciasIntegraciones({ prisma: PRISMA, env, urlWebhook: URL });
    expect(limitePorMinuto()).toBe(2);
    env.INTEGRACIONES_PRUEBAS_POR_MINUTO = "9";
    expect(limitePorMinuto()).toBe(9);
    delete env.INTEGRACIONES_PRUEBAS_POR_MINUTO;
    expect(limitePorMinuto()).toBe(PRUEBAS_POR_MINUTO_DEFECTO);
  });
});

describe("SL-36/R18, design §10 — la URL del webhook", () => {
  it("es la base de la app más la ruta única, sin barra doble", () => {
    expect(urlWebhookWhatsapp("https://app.ejemplo.test/", null)).toBe(URL);
    expect(urlWebhookWhatsapp("https://app.ejemplo.test", "https://otro.test")).toBe(URL);
  });

  it("sin base, el origen de la petición; sin ninguno, la ruta sola", () => {
    expect(urlWebhookWhatsapp(null, "https://app.ejemplo.test")).toBe(URL);
    expect(urlWebhookWhatsapp(null, null)).toBe("/api/webhooks/whatsapp");
  });
});

/* -------------------------------------------------------------------------- */
/* La action real, sin service inyectado                                        */
/* -------------------------------------------------------------------------- */

const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const MAESTRO_A: Actor = { usuarioId: "usuario-maestro-a", rol: "maestro", organizacionId: ORG_A };

type Datos = Record<string, unknown>;

const findMany = vi.fn<(args: { where: Datos }) => Promise<never[]>>(async () => []);
const findFirst = vi.fn<(args: { where: Datos }) => Promise<null>>(async () => null);
// El contador de R16 (SQL a mano): si `pruebas` no llegara al service, nadie lo llamaría.
const queryRaw = vi.fn<(...a: unknown[]) => Promise<Array<{ intentos: number; minuto: Date }>>>(async () => [{ intentos: 1, minuto: new Date() }]);
const create = vi.fn(async ({ data }: { data: Datos }) => ({
  id: data.id,
  servicio: data.servicio,
  estado: data.estado,
  datosPublicos: data.datosPublicos,
  whatsappNumeroId: data.whatsappNumeroId,
  ultimoErrorCodigo: null,
  ultimaPruebaAt: data.ultimaPruebaAt,
  ultimoWebhookAt: null,
}));
const createMany = vi.fn(async () => ({ count: 1 }));
const tx = { integracion: { create }, usuario: { findUnique: async () => null }, historialAccion: { createMany } };
const cabeceras = new Map<string, string>();

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    integracion: { findMany, findFirst },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    $queryRaw: queryRaw,
  }),
  PRISMA_OMIT: {},
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => cabeceras.get(k) ?? null }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  cabeceras.clear();
});

/** El entorno de la app para un alta por el root real: anillo de claves y el doble de §15. */
function entornoDeAlta(base: string): void {
  vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", `v1:${K1}`);
  vi.stubEnv("INTEGRACIONES_CLAVE_ACTIVA", "v1");
  vi.stubEnv("INTEGRACIONES_PROBADOR_DOBLE", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", base);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
}

const ALTA_WHATSAPP = {
  servicio: "whatsapp",
  campos: {
    nombreVisible: "Oficina central",
    numeroId: "1098765432",
    wabaId: "2087654321",
    token_acceso: "valido-token-acceso-del-maestro",
    app_secret: "valido-app-secret-del-maestro",
  },
};

describe("SL-36/T7.1 — la action construye el service por el root de verdad", () => {
  it("`listarIntegraciones` sin `deps.integracionesService` lee la base con la empresa de la sesión", async () => {
    const { listarIntegraciones } = await import("@/lib/actions/integraciones");
    const r = await listarIntegraciones({ getActor: async () => MAESTRO_A });
    expect(r).toMatchObject({ status: "ok" });
    const servicios = (r as { servicios: Array<{ servicio: string; estado: string }> }).servicios;
    expect(servicios.map((s) => s.servicio)).toEqual([...SERVICIOS_INTEGRACION]);
    expect(servicios.every((s) => s.estado === "sin_configurar")).toBe(true);
    // Anti-vacuidad: el repositorio se usó, y con la empresa del actor en el `where`.
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({ organizacionId: ORG_A });
  });

  it("R12/R18: un alta de WhatsApp recorre TODAS las dependencias reales del root", async () => {
    entornoDeAlta("https://app.ejemplo.test/");
    const { altaIntegracion } = await import("@/lib/actions/integraciones");
    const r = await altaIntegracion(ALTA_WHATSAPP, { getActor: async () => MAESTRO_A });

    expect(r).toMatchObject({ status: "creada", verificacion: { urlWebhook: URL } });
    const { token } = (r as { verificacion: { token: string } }).verificacion;
    // `aleatoria`: 32 bytes en base64url.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // `pruebas`: el contador se pidió antes de probar.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // `repo`: buscó el duplicado con la empresa de la sesión y creó en una transacción con historial.
    expect(findFirst.mock.calls[0][0].where).toEqual({ organizacionId: ORG_A, servicio: "whatsapp" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    // `aleatoria` otra vez: el id es un UUID generado, no uno de la entrada.
    expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(data.organizacionId).toBe(ORG_A);
    // `cifrador`: la bóveda real con el anillo del entorno; nada en claro.
    const secretos = data.secretos as Record<string, string>;
    expect(Object.keys(secretos).sort()).toEqual(["app_secret", "token_acceso"]);
    for (const v of Object.values(secretos)) expect(v).toMatch(/^v1:/);
    expect(JSON.stringify(data)).not.toContain("valido-");
    // `resumen`: a la base va el SHA-256 del token y no el token.
    expect(data.whatsappResumenVerificacion).toBe(new ResumenSecretoSha256().resumen(token));
    expect(JSON.stringify(data)).not.toContain(token);
    // `probadores`: el doble de §15 devolvió el teléfono que se guarda.
    expect((data.datosPublicos as Datos).telefonoVisible).toBe("+1098765432");
  });

  it("design §15: con el doble pedido EN PRODUCCIÓN, el alta va al probador real y no escribe", async () => {
    entornoDeAlta("https://app.ejemplo.test");
    vi.stubEnv("VERCEL_ENV", "production");
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 401 }));
    vi.stubGlobal("fetch", fetchFalso);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { altaIntegracion } = await import("@/lib/actions/integraciones");
      const r = await altaIntegracion(ALTA_WHATSAPP, { getActor: async () => MAESTRO_A });
      expect(r).toMatchObject({ status: "prueba_fallida", codigo: "prueba_fallida.whatsapp.credencial_rechazada" });
      expect(fetchFalso).toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("sin `NEXT_PUBLIC_APP_URL` ni `NEXT_PUBLIC_SITE_URL`, la URL del webhook sale del origen de la petición", async () => {
    entornoDeAlta("");
    cabeceras.set("x-forwarded-host", "app.ejemplo.test");
    cabeceras.set("x-forwarded-proto", "https");
    const { altaIntegracion } = await import("@/lib/actions/integraciones");
    const r = await altaIntegracion(ALTA_WHATSAPP, { getActor: async () => MAESTRO_A });
    expect(r).toMatchObject({ status: "creada", verificacion: { urlWebhook: URL } });
  });

  it("R4: sin el anillo de claves, el alta es `unexpected` y no escribe nada", async () => {
    entornoDeAlta("https://app.ejemplo.test");
    vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", "");
    const log = vi.fn();
    const { altaIntegracion } = await import("@/lib/actions/integraciones");
    const r = await altaIntegracion(ALTA_WHATSAPP, { getActor: async () => MAESTRO_A, log });
    expect(r).toMatchObject({ status: "unexpected" });
    expect(log).toHaveBeenCalledWith("[integraciones] alta falló", expect.objectContaining({ error: "ConfiguracionBovedaError" }));
    expect(create).not.toHaveBeenCalled();
  });
});
