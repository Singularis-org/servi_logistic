// SL-36 (T5.2; R23, R29, R30) — la lectura PARA USO de la credencial de la empresa en curso. La
// consumen WhatsApp, Maps, rutas y el asistente (T6); cada consumidor prueba además su desenlace.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfiguracionBovedaError } from "@/lib/config/integraciones";
import { conEmpresa, comoPlataforma, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { CODIGO_CREDENCIAL_ILEGIBLE, CredencialesIntegracionService } from "@/lib/services/CredencialesIntegracionService";
import { CODIGOS_RECHAZO_USO } from "@/lib/types/integraciones";

import { ID_WHATSAPP, ORG_A, ORG_B, SECRETOS_CLARO, cifradorDoble, filaWhatsappA, repoDoble } from "./integraciones-dobles";

const ID_RUTAS = "55555555-5555-4555-8555-555555555555";

function montar() {
  const cif = cifradorDoble();
  const r = repoDoble([
    filaWhatsappA(cif.sembrar),
    {
      id: ID_RUTAS,
      organizacionId: ORG_A,
      servicio: "optimizacion_rutas",
      estado: "conectada",
      datosPublicos: { proyectoId: "proyecto-a", cuentaServicio: "cuenta-a" },
      secretos: {
        clave_cuenta_servicio: cif.sembrar("json-de-la-clave-a", {
          organizacionId: ORG_A,
          integracionId: ID_RUTAS,
          campo: "clave_cuenta_servicio",
        }),
      },
      whatsappNumeroId: null,
      ultimoErrorCodigo: null,
      ultimaPruebaAt: null,
      ultimoWebhookAt: null,
    },
  ]);
  const warn = vi.fn<(m: string) => void>();
  const service = new CredencialesIntegracionService({ repo: r.repo, cifrador: cif.cifrador, log: { warn } });
  return { service, warn, ...r, ...cif };
}

const lineasDeLog: string[] = [];
beforeEach(() => {
  lineasDeLog.length = 0;
  for (const metodo of ["log", "warn", "error", "info", "debug"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      lineasDeLog.push(args.map(String).join(" "));
    });
  }
});
afterEach(() => {
  const log = lineasDeLog.join("\n");
  for (const secreto of Object.values(SECRETOS_CLARO)) expect(log).not.toContain(secreto);
  vi.restoreAllMocks();
});

describe("SL-36/R23 — lee la de la empresa en curso; sin contexto falla EmpresaNoResuelta", () => {
  it("en el contexto de A devuelve la credencial descifrada con el contexto de A y los datos públicos", async () => {
    const m = montar();
    const r = await conEmpresa(ORG_A, () => m.service.leer("whatsapp"));

    expect(r).toEqual({
      estado: "lista",
      integracionId: ID_WHATSAPP,
      credencial: { token_acceso: SECRETOS_CLARO.tokenViejo, app_secret: SECRETOS_CLARO.appSecretViejo },
      // El número sale de su columna: es lo que el consumidor necesita para enviar.
      datosPublicos: {
        numeroId: "numero-a",
        wabaId: "waba-a",
        nombreVisible: "Mensajeria A",
        telefonoVisible: "+000 1111",
        nombreVerificado: "Mensajeria A",
      },
    });
    for (const [, ctx] of m.descifrar.mock.calls) {
      expect(ctx).toMatchObject({ organizacionId: ORG_A, integracionId: ID_WHATSAPP });
    }
    expect(m.descifrar.mock.calls.map(([, ctx]) => ctx.campo)).toEqual(["token_acceso", "app_secret"]);
  });

  it("rutas: la clave entera y el proyecto y la cuenta", async () => {
    const m = montar();
    expect(await conEmpresa(ORG_A, () => m.service.leer("optimizacion_rutas"))).toEqual({
      estado: "lista",
      integracionId: ID_RUTAS,
      credencial: { clave_cuenta_servicio: "json-de-la-clave-a" },
      datosPublicos: { proyectoId: "proyecto-a", cuentaServicio: "cuenta-a" },
    });
  });

  it("en el contexto de B la integración de A no existe: sin_configurar", async () => {
    const m = montar();
    expect(await conEmpresa(ORG_B, () => m.service.leer("whatsapp"))).toEqual({ estado: "sin_configurar" });
    expect(await conEmpresa(ORG_A, () => m.service.leer("asistente"))).toEqual({ estado: "sin_configurar" });
    expect(m.descifrar).not.toHaveBeenCalled();
  });

  it("sin contexto, o en plataforma, falla con EmpresaNoResuelta sin consultar", async () => {
    const m = montar();
    await expect(m.service.leer("whatsapp")).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(comoPlataforma("SL-36", "test", () => m.service.leer("google_maps"))).rejects.toBeInstanceOf(
      EmpresaNoResuelta,
    );
    expect(m.repo.porServicio).not.toHaveBeenCalled();
    await expect(m.service.marcarRechazo("whatsapp", "whatsapp.credencial_rechazada")).rejects.toBeInstanceOf(
      EmpresaNoResuelta,
    );
  });
});

describe("SL-36/R29 — ilegible: deja error con código y no llama al proveedor", () => {
  it("un valor alterado o copiado de otra fila da ilegible y marca la integración", async () => {
    const m = montar();
    const fila = m.filas.get(ID_WHATSAPP);
    if (fila === undefined) throw new Error("sin semilla");
    // Copiado de otra empresa: el doble, como la bóveda, no lo descifra con el contexto de A.
    m.filas.set(ID_WHATSAPP, { ...fila, secretos: { ...fila.secretos, app_secret: "v1:de-otra-empresa" } });

    const r = await conEmpresa(ORG_A, () => m.service.leer("whatsapp"));

    expect(r).toEqual({ estado: "ilegible" });
    expect(m.repo.marcarError).toHaveBeenCalledWith("whatsapp", CODIGO_CREDENCIAL_ILEGIBLE);
    expect(m.filas.get(ID_WHATSAPP)).toMatchObject({ estado: "error", ultimoErrorCodigo: "credencial_ilegible" });
    // El resultado no lleva nada de la credencial: el consumidor no tiene qué mandar al proveedor.
    expect(JSON.stringify(r)).not.toContain(SECRETOS_CLARO.tokenViejo);
    // Al log, el diagnóstico sin valores.
    expect(m.warn).toHaveBeenCalledTimes(1);
    expect(m.warn.mock.calls[0]?.[0]).toContain("diagnostico=no_autentica");
    expect(m.warn.mock.calls[0]?.[0]).not.toContain("v1:");
  });

  it("un secreto que falta en la fila también es ilegible", async () => {
    const m = montar();
    const fila = m.filas.get(ID_WHATSAPP);
    if (fila === undefined) throw new Error("sin semilla");
    m.filas.set(ID_WHATSAPP, { ...fila, secretos: { token_acceso: fila.secretos.token_acceso ?? "" } });
    expect(await conEmpresa(ORG_A, () => m.service.leer("whatsapp"))).toEqual({ estado: "ilegible" });
    expect(m.repo.marcarError).toHaveBeenCalledWith("whatsapp", "credencial_ilegible");
  });

  it("una bóveda sin configurar (R4) se propaga y no marca la fila: no es culpa de la empresa", async () => {
    const m = montar();
    m.descifrar.mockRejectedValueOnce(new ConfiguracionBovedaError("INTEGRACIONES_CLAVES_CIFRADO no esta definida"));
    await expect(conEmpresa(ORG_A, () => m.service.leer("whatsapp"))).rejects.toBeInstanceOf(ConfiguracionBovedaError);
    expect(m.repo.marcarError).not.toHaveBeenCalled();
  });
});

describe("SL-36/R30 — marcarRechazo", () => {
  it("deja la integración del servicio en error con el código del catálogo, en la empresa en curso", async () => {
    const m = montar();
    await conEmpresa(ORG_A, () => m.service.marcarRechazo("optimizacion_rutas", "optimizacion_rutas.permiso"));

    expect(m.repo.marcarError).toHaveBeenCalledWith("optimizacion_rutas", "optimizacion_rutas.permiso");
    expect(m.filas.get(ID_RUTAS)).toMatchObject({ estado: "error", ultimoErrorCodigo: "optimizacion_rutas.permiso" });
    expect(m.filas.get(ID_WHATSAPP)?.estado).toBe("conectada");
  });

  it("en el contexto de B no toca la de A", async () => {
    const m = montar();
    await conEmpresa(ORG_B, () => m.service.marcarRechazo("whatsapp", "whatsapp.credencial_rechazada"));
    expect(m.filas.get(ID_WHATSAPP)?.estado).toBe("conectada");
  });

  it("cada código del catálogo pertenece a su servicio; uno ajeno se rechaza sin escribir", async () => {
    const m = montar();
    for (const codigo of CODIGOS_RECHAZO_USO) {
      const servicio = codigo.split(".")[0] as "whatsapp";
      await conEmpresa(ORG_A, () => m.service.marcarRechazo(servicio, codigo as "whatsapp.credencial_rechazada"));
    }
    expect(m.repo.marcarError).toHaveBeenCalledTimes(CODIGOS_RECHAZO_USO.length);

    m.repo.marcarError.mockClear();
    await expect(
      conEmpresa(ORG_A, () => m.service.marcarRechazo("whatsapp", "google_maps.credencial_rechazada" as never)),
    ).rejects.toBeInstanceOf(TypeError);
    expect(m.repo.marcarError).not.toHaveBeenCalled();
  });
});
