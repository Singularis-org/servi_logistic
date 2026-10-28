import { describe, expect, it, vi } from "vitest";

import { esRechazoDeCredencialMeta, fetchQueVigilaRechazo } from "@/lib/clients/whatsapp-rechazo-credencial";
import { WhatsappCloudClient } from "@/lib/clients/whatsapp-cloud";
import { conEmpresa, contextoActual } from "@/lib/db/contexto-empresa";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import { whatsappDeLaEmpresa } from "@/lib/services/whatsapp/whatsapp-de-la-empresa";

// SL-36 (design §5, R30) — Meta rechaza el token de la empresa durante un USO real: HTTP 401 o
// `error.code` 190 de Graph. La integracion queda en `error` con `whatsapp.credencial_rechazada`,
// en la empresa del token, y el envio sigue su curso (la respuesta no cambia).

function respuesta(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

describe("SL-36/R30 — la señal de rechazo de Meta", () => {
  it("401 y error.code 190 son rechazo; otro 4xx, un 5xx o un 2xx no", async () => {
    expect(await esRechazoDeCredencialMeta(respuesta(401, {}))).toBe(true);
    expect(await esRechazoDeCredencialMeta(respuesta(400, { error: { code: 190, message: "Invalid OAuth access token" } }))).toBe(true);
    expect(await esRechazoDeCredencialMeta(respuesta(400, { error: { code: 100 } }))).toBe(false);
    expect(await esRechazoDeCredencialMeta(respuesta(500, { error: { code: 2 } }))).toBe(false);
    expect(await esRechazoDeCredencialMeta(respuesta(200, { error: { code: 190 } }))).toBe(false);
    expect(await esRechazoDeCredencialMeta(new Response("no es json", { status: 400 }))).toBe(false);
  });

  it("el envoltorio avisa y devuelve la MISMA respuesta, con su cuerpo aun legible", async () => {
    const alRechazar = vi.fn(async () => {});
    const f = fetchQueVigilaRechazo(async () => respuesta(400, { error: { code: 190 } }), alRechazar);
    const r = await f("https://graph.facebook.com/v21.0/111/messages");
    expect(alRechazar).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { code: 190 } });
  });

  it("sin rechazo no avisa; un fallo al marcar no rompe la llamada", async () => {
    const alRechazar = vi.fn(async () => {});
    await fetchQueVigilaRechazo(async () => respuesta(200, { ok: true }), alRechazar)("u");
    expect(alRechazar).not.toHaveBeenCalled();

    const avisos: string[] = [];
    const f = fetchQueVigilaRechazo(
      async () => respuesta(401, {}),
      async () => {
        throw new Error("base caida");
      },
      { warn: (m) => avisos.push(m) },
    );
    expect((await f("u")).status).toBe(401);
    expect(avisos).toEqual(["[whatsapp] rechazo de credencial no anotado: Error"]);
  });
});

describe("SL-36/R30 — un uso real con el cliente de envío", () => {
  function credenciales() {
    const marcas: { servicio: string; codigo: string; contexto: unknown }[] = [];
    const lector: ICredencialesIntegracion = {
      leer: (async () => ({
        estado: "lista",
        integracionId: "int-a",
        credencial: { token_acceso: "token-de-a", app_secret: "s" },
        datosPublicos: { numeroId: "111", wabaId: "222", nombreVisible: "n", telefonoVisible: "t", nombreVerificado: "v" },
      })) as ICredencialesIntegracion["leer"],
      marcarRechazo: (async (servicio: string, codigo: string) => {
        marcas.push({ servicio, codigo, contexto: contextoActual() });
      }) as ICredencialesIntegracion["marcarRechazo"],
    };
    return { lector, marcas };
  }

  it("⭑ Meta responde 401 a un envío: marcarRechazo('whatsapp', 'whatsapp.credencial_rechazada') en la empresa del token", async () => {
    const { lector, marcas } = credenciales();
    const fetchBase = vi.fn(async () => respuesta(401, { error: { code: 190, type: "OAuthException" } }));
    const wa = await conEmpresa("org-a", () => whatsappDeLaEmpresa({ credenciales: lector, fetchBase: fetchBase as never }));

    // El envio corre FUERA del contexto (como una action resuelta por cookie): la marca no puede
    // depender de que el llamador siga dentro de `conEmpresa`.
    const cliente = new WhatsappCloudClient({ config: wa.config, fetchImpl: wa.fetchImpl, logger: { warn: () => {} } as never });
    const outcome = await cliente.enviarPlantilla("50688887777", "aviso", "es");

    expect(fetchBase).toHaveBeenCalledTimes(1);
    expect(outcome.status).not.toBe("ok");
    expect(marcas).toEqual([
      { servicio: "whatsapp", codigo: "whatsapp.credencial_rechazada", contexto: { tipo: "empresa", organizacionId: "org-a" } },
    ]);
  });

  it("un rechazo que no es de credencial (plantilla inexistente) no marca la integración", async () => {
    const { lector, marcas } = credenciales();
    const fetchBase = vi.fn(async () => respuesta(400, { error: { code: 132001, message: "Template name does not exist" } }));
    const wa = await conEmpresa("org-a", () => whatsappDeLaEmpresa({ credenciales: lector, fetchBase: fetchBase as never }));
    const cliente = new WhatsappCloudClient({ config: wa.config, fetchImpl: wa.fetchImpl, logger: { warn: () => {} } as never });
    await cliente.enviarPlantilla("50688887777", "aviso", "es");
    expect(marcas).toEqual([]);
  });
});
