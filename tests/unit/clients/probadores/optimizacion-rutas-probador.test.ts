// SL-36 (T4.3, R17, design §5 y §7.2) — la prueba de rutas valida el JSON de la clave y lo
// intercambia por un token (JWT-bearer). Se firma con un par RSA generado aquí: sin credencial real.
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  leerClaveCuentaServicio,
  OptimizacionRutasProbador,
} from "@/lib/clients/probadores/optimizacion-rutas-probador";
import {
  afirmarSinSecretos,
  capturarLogs,
  fetchQueNoContesta,
  fetchSinRed,
  llamada,
  respuesta,
} from "./ayuda-probadores";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const CLAVE = {
  type: "service_account",
  project_id: "proyecto-norte",
  private_key_id: "abc123",
  private_key: PEM,
  client_email: "rutas@proyecto.iam.gserviceaccount.com",
};
const JSON_CLAVE = JSON.stringify(CLAVE);
const CREDENCIAL = { clave_cuenta_servicio: JSON_CLAVE };
const ACCESS_TOKEN = "ya29.token-de-acceso-que-no-sale";
// Un trozo del cuerpo de la PEM: si cualquier parte de la clave privada sale, aparece este.
const TROZO_PEM = PEM.split("\n")[3] ?? "";
const SECRETOS = [TROZO_PEM, ACCESS_TOKEN];

function crear(fetchImpl: typeof fetch, timeoutMs?: number) {
  const logs = capturarLogs();
  const probador = new OptimizacionRutasProbador({ fetchImpl, logger: logs.logger, timeoutMs });
  return { probador, logs };
}

function fetchUna(r: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(r);
}

afterEach(() => vi.restoreAllMocks());

describe("SL-36/R17 — rutas prueba con el intercambio de la clave por un token", () => {
  it("hace un solo POST al endpoint de token con el grant JWT-bearer firmado", async () => {
    const fetchImpl = fetchUna(respuesta(200, { access_token: ACCESS_TOKEN, expires_in: 3600 }));
    const { probador } = crear(fetchImpl);
    await probador.probar(CREDENCIAL);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, init } = llamada(fetchImpl);
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    const cuerpo = new URLSearchParams(String(init.body));
    expect(cuerpo.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(cuerpo.get("assertion")?.split(".")).toHaveLength(3);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("la prueba buena devuelve proyecto y cuenta como datos públicos, sin el token", async () => {
    const { probador, logs } = crear(
      fetchUna(respuesta(200, { access_token: ACCESS_TOKEN, expires_in: 3600 })),
    );
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({
      ok: true,
      datosPublicos: {
        proyectoId: "proyecto-norte",
        cuentaServicio: "rutas@proyecto.iam.gserviceaccount.com",
      },
    });
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });
});

describe("SL-36/R13 — el JSON de la clave se valida antes de llamar a Google", () => {
  it.each([
    ["no es JSON", "esto no es json"],
    ["no es una cuenta de servicio", JSON.stringify({ ...CLAVE, type: "authorized_user" })],
    ["le falta la clave privada", JSON.stringify({ ...CLAVE, private_key: "" })],
    ["le falta el proyecto", JSON.stringify({ ...CLAVE, project_id: undefined })],
  ])("%s: `clave_mal_formada` sin red", async (_caso, texto) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { probador, logs } = crear(fetchImpl);
    const r = await probador.probar({ clave_cuenta_servicio: texto });
    expect(r).toEqual({ ok: false, motivo: "clave_mal_formada" });
    expect(fetchImpl).not.toHaveBeenCalled();
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("una PEM que no se puede firmar es `clave_mal_formada` sin red", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { probador } = crear(fetchImpl);
    const r = await probador.probar({
      clave_cuenta_servicio: JSON.stringify({ ...CLAVE, private_key: "-----BEGIN basura-----" }),
    });
    expect(r).toEqual({ ok: false, motivo: "clave_mal_formada" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("`leerClaveCuentaServicio` recorta lo que no usa", () => {
    expect(leerClaveCuentaServicio(JSON_CLAVE)).toEqual({
      type: "service_account",
      project_id: "proyecto-norte",
      client_email: "rutas@proyecto.iam.gserviceaccount.com",
      private_key: PEM,
    });
  });
});

describe("SL-36/R13 — fallos del intercambio", () => {
  it.each([400, 401])("HTTP %i es `credencial_rechazada` (señal de R30) y no filtra la clave", async (status) => {
    const { probador, logs } = crear(
      fetchUna(respuesta(status, { error: "invalid_grant", error_description: JSON_CLAVE })),
    );
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "credencial_rechazada" });
    expect(logs.texto()).toContain(`HTTP ${status}`);
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("HTTP 500 es `proveedor`", async () => {
    const { probador } = crear(fetchUna(respuesta(500, "caído")));
    expect(await probador.probar(CREDENCIAL)).toEqual({ ok: false, motivo: "proveedor" });
  });

  it("fallo de red es `sin_respuesta`, sin lanzar", async () => {
    const { probador, logs } = crear(fetchSinRed);
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("red");
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("timeout es `sin_respuesta` y el log dice `tiempo_agotado`", async () => {
    const { probador, logs } = crear(fetchQueNoContesta, 20);
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta" });
    expect(logs.texto()).toContain("tiempo_agotado");
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });

  it("200 sin `access_token` es `respuesta_invalida`", async () => {
    const { probador, logs } = crear(fetchUna(respuesta(200, { token_type: "Bearer" })));
    const r = await probador.probar(CREDENCIAL);
    expect(r).toEqual({ ok: false, motivo: "respuesta_invalida" });
    afirmarSinSecretos(r, logs.texto(), SECRETOS);
  });
});
