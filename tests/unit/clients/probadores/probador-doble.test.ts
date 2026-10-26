// SL-36 (T4.5, design §15) — el doble del E2E acepta los secretos `valido-…` y solo se elige con
// la variable encendida Y fuera de producción. Un test por cada mitad de la condición.
import { describe, expect, it } from "vitest";
import {
  crearProbadoresDoble,
  usarProbadorDoble,
} from "@/lib/clients/probadores/probador-doble";
import { crearProbadores } from "@/lib/clients/probadores/probadores";
import { WhatsappProbador } from "@/lib/clients/probadores/whatsapp-probador";

const DATOS_WA = { numeroId: "1111", wabaId: "2222", nombreVisible: "Norte" };

function jsonClave(privateKey: string): string {
  return JSON.stringify({
    type: "service_account",
    project_id: "p-e2e",
    client_email: "e2e@proyecto.iam.gserviceaccount.com",
    private_key: privateKey,
  });
}

describe("SL-36/design §15 — selección del doble por entorno", () => {
  it("se elige con la variable en 1 fuera de producción", () => {
    expect(usarProbadorDoble({ INTEGRACIONES_PROBADOR_DOBLE: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(usarProbadorDoble({ INTEGRACIONES_PROBADOR_DOBLE: "1" })).toBe(true);
  });

  it("mitad 1: sin la variable (o con otro valor) no se elige", () => {
    expect(usarProbadorDoble({ VERCEL_ENV: "preview" })).toBe(false);
    expect(usarProbadorDoble({ INTEGRACIONES_PROBADOR_DOBLE: "true" })).toBe(false);
    expect(usarProbadorDoble({ INTEGRACIONES_PROBADOR_DOBLE: "0" })).toBe(false);
  });

  it("mitad 2: en producción no se elige aunque la variable esté en 1", () => {
    expect(usarProbadorDoble({ INTEGRACIONES_PROBADOR_DOBLE: "1", VERCEL_ENV: "production" })).toBe(
      false,
    );
  });

  it("`crearProbadores` da los reales en producción y el doble en E2E", () => {
    const prod = crearProbadores({ INTEGRACIONES_PROBADOR_DOBLE: "1", VERCEL_ENV: "production" });
    expect(prod.whatsapp).toBeInstanceOf(WhatsappProbador);
    const e2e = crearProbadores({ INTEGRACIONES_PROBADOR_DOBLE: "1" });
    expect(e2e.whatsapp).not.toBeInstanceOf(WhatsappProbador);
  });
});

describe("SL-36/design §15 — el doble acepta `valido-…` y rechaza el resto", () => {
  const doble = crearProbadoresDoble();

  it("WhatsApp: los dos secretos válidos dan datos públicos de relleno", async () => {
    const r = await doble.whatsapp.probar(
      { token_acceso: "valido-t", app_secret: "valido-s" },
      DATOS_WA,
    );
    expect(r).toEqual({
      ok: true,
      datosPublicos: {
        numeroId: "1111",
        wabaId: "2222",
        nombreVisible: "Norte",
        telefonoVisible: "+1111",
        nombreVerificado: "Norte",
      },
    });
  });

  it("WhatsApp: un secreto sin prefijo es `credencial_rechazada`", async () => {
    expect(
      await doble.whatsapp.probar({ token_acceso: "valido-t", app_secret: "malo" }, DATOS_WA),
    ).toEqual({ ok: false, motivo: "credencial_rechazada" });
  });

  it("Maps y asistente: prefijo decide", async () => {
    expect(await doble.google_maps.probar({ clave_api: "valido-x" }, {})).toEqual({
      ok: true,
      datosPublicos: {},
    });
    expect(await doble.google_maps.probar({ clave_api: "x" }, {})).toEqual({
      ok: false,
      motivo: "credencial_rechazada",
    });
    expect(await doble.asistente.probar({ clave_api: "valido-x" }, {})).toEqual({
      ok: true,
      datosPublicos: {},
    });
    expect(await doble.asistente.probar({ clave_api: "x" }, {})).toEqual({
      ok: false,
      motivo: "credencial_rechazada",
    });
  });

  it("rutas: exige la forma de la clave y el prefijo en la clave privada", async () => {
    expect(
      await doble.optimizacion_rutas.probar({ clave_cuenta_servicio: jsonClave("valido-pem") }, {}),
    ).toEqual({
      ok: true,
      datosPublicos: { proyectoId: "p-e2e", cuentaServicio: "e2e@proyecto.iam.gserviceaccount.com" },
    });
    expect(
      await doble.optimizacion_rutas.probar({ clave_cuenta_servicio: jsonClave("pem") }, {}),
    ).toEqual({ ok: false, motivo: "credencial_rechazada" });
    expect(
      await doble.optimizacion_rutas.probar({ clave_cuenta_servicio: "valido-no-json" }, {}),
    ).toEqual({ ok: false, motivo: "clave_mal_formada" });
  });
});
