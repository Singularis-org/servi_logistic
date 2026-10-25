// SL-36 (T5.1; R5, R9, R12-R16, R18) — las seis operaciones de `IntegracionesService` con dobles de
// interfaz. El SQL (filtro por empresa, únicos, historial en la misma transacción) está probado
// contra la base en T3; aquí, el orden y las decisiones del service.
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IntegracionConSecretos } from "@/lib/interfaces/repositories/IIntegracionRepository";
import { IntegracionesService } from "@/lib/services/IntegracionesService";
import { CATALOGO_INTEGRACIONES, SECRETO_MAX, TEXTOS_ERROR_INTEGRACION } from "@/lib/types/integraciones";

import {
  AHORA,
  ID_INEXISTENTE,
  ID_MAPS,
  ID_NUEVO,
  ID_WHATSAPP,
  MAESTRO_A,
  ORG_A,
  ORG_B,
  SECRETOS_CLARO,
  TOKEN_VERIFICACION,
  URL_WEBHOOK,
  filaWhatsappA,
  montar,
} from "./integraciones-dobles";

const ENTRADA_WHATSAPP = {
  nombreVisible: "Mensajeria A",
  numeroId: "numero-a",
  wabaId: "waba-a",
  token_acceso: SECRETOS_CLARO.tokenNuevo,
  app_secret: SECRETOS_CLARO.appSecretNuevo,
};

const lineasDeLog: string[] = [];
beforeEach(() => {
  lineasDeLog.length = 0;
  for (const metodo of ["log", "warn", "error", "info", "debug"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      lineasDeLog.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});
afterEach(() => {
  // Ningún test de este archivo puede dejar un secreto en el log (R5, R13).
  const log = lineasDeLog.join("\n");
  for (const secreto of Object.values(SECRETOS_CLARO)) expect(log).not.toContain(secreto);
  expect(log).not.toContain(TOKEN_VERIFICACION);
  vi.restoreAllMocks();
});

/** Ni secretos en claro, ni sus cifrados, ni el token, ni su resumen. */
function afirmarSinSecretos(valor: unknown): void {
  const texto = JSON.stringify(valor);
  for (const secreto of Object.values(SECRETOS_CLARO)) expect(texto).not.toContain(secreto);
  expect(texto).not.toMatch(/v1:/);
  expect(texto).not.toContain(createHash("sha256").update(TOKEN_VERIFICACION).digest("hex"));
}

function filaMapsA(sembrar: (t: string, c: { organizacionId: string; integracionId: string; campo: string }) => string) {
  return {
    id: ID_MAPS,
    organizacionId: ORG_A,
    servicio: "google_maps" as const,
    estado: "error" as const,
    datosPublicos: {},
    secretos: { clave_api: sembrar(SECRETOS_CLARO.claveMaps, { organizacionId: ORG_A, integracionId: ID_MAPS, campo: "clave_api" }) },
    whatsappNumeroId: null,
    ultimoErrorCodigo: "prueba_fallida.google_maps.credencial_rechazada",
    ultimaPruebaAt: new Date("2026-10-24T08:00:00.000Z"),
    ultimoWebhookAt: null,
  } satisfies IntegracionConSecretos & { organizacionId: string };
}

describe("SL-36/R5 — la vista no lleva secretos, cifrados ni resumen", () => {
  it("listar: cuatro servicios en el orden del catálogo, sin configurar los que no tienen fila", async () => {
    const m = montar((s) => [filaWhatsappA(s), filaMapsA(s)]);
    const r = await new IntegracionesService(m.deps).listar(MAESTRO_A);

    if (r.status !== "ok") throw new Error(r.status);
    expect(r.servicios.map((v) => [v.servicio, v.estado, v.marca])).toEqual([
      ["whatsapp", "conectada", "requerido"],
      ["google_maps", "error", "requerido"],
      ["optimizacion_rutas", "sin_configurar", "recomendado"],
      ["asistente", "sin_configurar", "recomendado"],
    ]);
    const [whatsapp, maps, rutas] = r.servicios;
    expect(whatsapp).toEqual({
      id: ID_WHATSAPP,
      servicio: "whatsapp",
      marca: "requerido",
      estado: "conectada",
      datosPublicos: {
        nombreVisible: "Mensajeria A",
        numeroId: "numero-a",
        wabaId: "waba-a",
        telefonoVisible: "+000 1111",
        nombreVerificado: "Mensajeria A",
      },
      // El error solo se muestra en `error` (R34).
      ultimoErrorTexto: null,
      ultimaPruebaAt: "2026-10-24T08:00:00.000Z",
      ultimoWebhookAt: null,
    });
    expect(maps?.ultimoErrorTexto).toBe(CATALOGO_INTEGRACIONES.google_maps.textosPruebaFallida.credencial_rechazada);
    expect(rutas).toEqual({
      id: null,
      servicio: "optimizacion_rutas",
      marca: "recomendado",
      estado: "sin_configurar",
      datosPublicos: {},
      ultimoErrorTexto: null,
      ultimaPruebaAt: null,
      ultimoWebhookAt: null,
    });
    afirmarSinSecretos(r);
  });

  it("alta, edición y prueba tampoco devuelven nada secreto", async () => {
    const m = montar();
    const s = new IntegracionesService(m.deps);
    const alta = await s.alta(MAESTRO_A, "whatsapp", ENTRADA_WHATSAPP);
    // El token en claro sí viaja en el alta (R18); fuera de `verificacion`, nada.
    if (alta.status !== "creada") throw new Error(alta.status);
    afirmarSinSecretos(alta.vista);
    afirmarSinSecretos(await s.editar(MAESTRO_A, ID_NUEVO, { token_acceso: SECRETOS_CLARO.tokenViejo }));
    afirmarSinSecretos(await s.probar(MAESTRO_A, ID_NUEVO));
    afirmarSinSecretos(await s.listar(MAESTRO_A));
  });
});

describe("SL-36/R9 — id inválido, inexistente o de otra empresa: mismo no_encontrada", () => {
  const operaciones = {
    editar: (s: IntegracionesService, id: string) => s.editar(MAESTRO_A, id, { token_acceso: SECRETOS_CLARO.tokenNuevo }),
    probar: (s: IntegracionesService, id: string) => s.probar(MAESTRO_A, id),
    regenerarToken: (s: IntegracionesService, id: string) => s.regenerarToken(MAESTRO_A, id),
    desconectar: (s: IntegracionesService, id: string) => s.desconectar(MAESTRO_A, id),
  };

  for (const [nombre, op] of Object.entries(operaciones)) {
    it(`${nombre}: los tres casos dan el mismo resultado y el id sin forma no consulta`, async () => {
      // La fila de WhatsApp es de B: para el maestro de A es «de otra empresa».
      const m = montar((sembrar) => [{ ...filaWhatsappA(sembrar), organizacionId: ORG_B }]);
      const s = new IntegracionesService(m.deps);

      const sinForma = await op(s, "no-es-un-uuid' OR 1=1 --");
      const consultasTrasSinForma = m.empresasVistas.length;
      const inexistente = await op(s, ID_INEXISTENTE);
      const deOtra = await op(s, ID_WHATSAPP);

      expect(sinForma).toEqual({ status: "no_encontrada" });
      expect(inexistente).toEqual(sinForma);
      expect(deOtra).toEqual(sinForma);
      expect(consultasTrasSinForma).toBe(0);
      expect(m.espias.whatsapp).not.toHaveBeenCalled();
      expect(m.filas.get(ID_WHATSAPP)?.organizacionId).toBe(ORG_B);
    });
  }
});

describe("SL-36/R12 — alta: prueba antes de escribir; buena crea conectada con datos del proveedor", () => {
  it("WhatsApp: el orden es límite → existe → prueba → id → cifrado → crear", async () => {
    const m = montar();
    const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "whatsapp", ENTRADA_WHATSAPP);

    expect(r.status).toBe("creada");
    const orden = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0] ?? Infinity;
    expect(orden(m.sumarPrueba)).toBeLessThan(orden(m.repo.porServicio));
    expect(orden(m.repo.porServicio)).toBeLessThan(orden(m.espias.whatsapp));
    expect(orden(m.espias.whatsapp)).toBeLessThan(orden(m.nuevoId));
    expect(orden(m.nuevoId)).toBeLessThan(orden(m.cifrar));
    expect(orden(m.cifrar)).toBeLessThan(orden(m.repo.crear));

    expect(m.espias.whatsapp).toHaveBeenCalledWith(
      { token_acceso: SECRETOS_CLARO.tokenNuevo, app_secret: SECRETOS_CLARO.appSecretNuevo },
      { numeroId: "numero-a", wabaId: "waba-a", nombreVisible: "Mensajeria A" },
    );
    // Cada secreto, ligado a {empresa, id de la fila, campo}.
    expect(m.cifrar.mock.calls).toEqual([
      [SECRETOS_CLARO.tokenNuevo, { organizacionId: ORG_A, integracionId: ID_NUEVO, campo: "token_acceso" }],
      [SECRETOS_CLARO.appSecretNuevo, { organizacionId: ORG_A, integracionId: ID_NUEVO, campo: "app_secret" }],
    ]);
    const [nueva, autor] = m.repo.crear.mock.calls[0] ?? [];
    expect(autor).toBe(MAESTRO_A.usuarioId);
    expect(nueva).toMatchObject({
      id: ID_NUEVO,
      servicio: "whatsapp",
      // Los datos públicos son los que devolvió el proveedor, no solo lo escrito.
      datosPublicos: {
        nombreVisible: "Mensajeria A",
        wabaId: "waba-a",
        telefonoVisible: "+000 2222",
        nombreVerificado: "Verificado por Meta",
      },
      secretos: { token_acceso: "v1:doble-1", app_secret: "v1:doble-2" },
      whatsappNumeroId: "numero-a",
      probadaAt: AHORA,
    });
    if (r.status === "creada") {
      expect(r.vista.estado).toBe("conectada");
      expect(r.vista.datosPublicos.telefonoVisible).toBe("+000 2222");
    }
  });

  it("optimización de rutas: proyecto y cuenta salen de la prueba; el JSON entero va cifrado", async () => {
    const m = montar();
    const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "optimizacion_rutas", {
      clave_cuenta_servicio: '  {"type":"service_account"}\n',
    });

    expect(r.status).toBe("creada");
    // Recortado: el salto de línea final de un pegado no llega a la prueba.
    expect(m.cifrar).toHaveBeenCalledWith('{"type":"service_account"}', expect.objectContaining({ campo: "clave_cuenta_servicio" }));
    expect(m.repo.crear.mock.calls[0]?.[0]).toMatchObject({
      datosPublicos: { proyectoId: "proyecto-a", cuentaServicio: "cuenta-a@proyecto-a.iam.gserviceaccount.test" },
    });
    expect(m.repo.crear.mock.calls[0]?.[0]).not.toHaveProperty("whatsappNumeroId");
  });

  it("si ya hay una de ese servicio responde ya_existe sin llamar al proveedor", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "whatsapp", ENTRADA_WHATSAPP);

    expect(r).toEqual({ status: "ya_existe" });
    expect(m.espias.whatsapp).not.toHaveBeenCalled();
    expect(m.cifrar).not.toHaveBeenCalled();
    expect(m.repo.crear).not.toHaveBeenCalled();
  });

  it("ya_existe y numero_ocupado del repositorio (concurrencia, R10, R11) llegan tal cual", async () => {
    for (const status of ["ya_existe", "numero_ocupado"] as const) {
      const m = montar();
      m.repo.crear.mockResolvedValueOnce({ status });
      expect(await new IntegracionesService(m.deps).alta(MAESTRO_A, "whatsapp", ENTRADA_WHATSAPP)).toEqual({ status });
    }
  });

  it("entrada inválida: invalid_input sin contar, probar ni escribir; los límites 1 y 4096 son exactos", async () => {
    const casos: Array<[unknown, boolean]> = [
      [{ clave_api: "" }, false],
      [{ clave_api: "   " }, false],
      [{}, false],
      [null, false],
      [{ clave_api: "x".repeat(SECRETO_MAX + 1) }, false],
      [{ clave_api: "x" }, true],
      [{ clave_api: "x".repeat(SECRETO_MAX) }, true],
    ];
    for (const [campos, valida] of casos) {
      const m = montar();
      const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "asistente", campos);
      if (valida) {
        expect(r.status).toBe("creada");
      } else {
        expect(r).toEqual({ status: "invalid_input", fieldErrors: expect.any(Object) });
        expect(m.sumarPrueba).not.toHaveBeenCalled();
        expect(m.espias.asistente).not.toHaveBeenCalled();
      }
    }
  });

  it("los errores de entrada no repiten lo escrito", async () => {
    const m = montar();
    const largo = `${SECRETOS_CLARO.claveMaps}${"x".repeat(SECRETO_MAX)}`;
    const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "google_maps", { clave_api: largo });
    expect(r).toEqual({ status: "invalid_input", fieldErrors: { clave_api: ["Revisa este campo."] } });
  });
});

describe("SL-36/R13 — prueba fallida: nada escrito y texto del catálogo", () => {
  it("alta: no genera id, no cifra, no crea; devuelve el código y el texto propio", async () => {
    const m = montar();
    m.espias.whatsapp.mockResolvedValueOnce({ ok: false, motivo: "credencial_rechazada" });
    const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "whatsapp", ENTRADA_WHATSAPP);

    expect(r).toEqual({
      status: "prueba_fallida",
      codigo: "prueba_fallida.whatsapp.credencial_rechazada",
      texto: CATALOGO_INTEGRACIONES.whatsapp.textosPruebaFallida.credencial_rechazada,
    });
    expect(m.nuevoId).not.toHaveBeenCalled();
    expect(m.cifrar).not.toHaveBeenCalled();
    expect(m.nuevoTokenVerificacion).not.toHaveBeenCalled();
    expect(m.repo.crear).not.toHaveBeenCalled();
    expect(m.filas.size).toBe(0);
  });

  it("edición: la fila no cambia, ni el estado ni la hora de la prueba", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const antes = structuredClone(m.filas.get(ID_WHATSAPP));
    m.espias.whatsapp.mockResolvedValueOnce({ ok: false, motivo: "waba_no_encontrada" });

    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, {
      token_acceso: SECRETOS_CLARO.tokenNuevo,
      wabaId: "waba-otra",
    });

    expect(r).toMatchObject({ status: "prueba_fallida", codigo: "prueba_fallida.whatsapp.waba_no_encontrada" });
    expect(m.repo.actualizar).not.toHaveBeenCalled();
    expect(m.repo.registrarPrueba).not.toHaveBeenCalled();
    expect(m.cifrar).not.toHaveBeenCalled();
    expect(m.filas.get(ID_WHATSAPP)).toEqual(antes);
  });
});

describe("SL-36/R14 — edición: secreto vacío conserva sin descifrar; prueba solo cuando toca; fallida no cambia nada", () => {
  it("solo el nombre visible: guarda sin probar, sin descifrar, sin cifrar y sin tocar el estado", async () => {
    const m = montar((s) => [{ ...filaWhatsappA(s), estado: "error" as const, ultimoErrorCodigo: "whatsapp.credencial_rechazada" }]);
    const guardadoAntes = { ...m.filas.get(ID_WHATSAPP)?.secretos };

    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, {
      nombreVisible: "Nombre nuevo",
      token_acceso: "",
      app_secret: "   ",
    });

    expect(r.status).toBe("guardada");
    expect(m.descifrar).not.toHaveBeenCalled();
    expect(m.cifrar).not.toHaveBeenCalled();
    expect(m.espias.whatsapp).not.toHaveBeenCalled();
    expect(m.sumarPrueba).not.toHaveBeenCalled();
    expect(m.repo.actualizar).toHaveBeenCalledWith(
      ID_WHATSAPP,
      {
        datosPublicos: {
          nombreVisible: "Nombre nuevo",
          wabaId: "waba-a",
          telefonoVisible: "+000 1111",
          nombreVerificado: "Mensajeria A",
        },
      },
      MAESTRO_A.usuarioId,
    );
    const fila = m.filas.get(ID_WHATSAPP);
    expect(fila?.secretos).toEqual(guardadoAntes);
    expect(fila?.estado).toBe("error");
    expect(fila?.ultimoErrorCodigo).toBe("whatsapp.credencial_rechazada");
  });

  it("todo vacío: no escribe nada ni deja historial", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, { token_acceso: "", app_secret: "" });
    expect(r.status).toBe("guardada");
    expect(m.repo.actualizar).not.toHaveBeenCalled();
    expect(m.descifrar).not.toHaveBeenCalled();
  });

  it("cambia un secreto: prueba con el nuevo y el conservado; solo el nuevo se cifra y se manda", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const appSecretGuardado = m.filas.get(ID_WHATSAPP)?.secretos.app_secret;

    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, {
      token_acceso: SECRETOS_CLARO.tokenNuevo,
      app_secret: "",
    });

    expect(r.status).toBe("guardada");
    expect(m.espias.whatsapp).toHaveBeenCalledWith(
      { token_acceso: SECRETOS_CLARO.tokenNuevo, app_secret: SECRETOS_CLARO.appSecretViejo },
      { numeroId: "numero-a", wabaId: "waba-a", nombreVisible: "Mensajeria A" },
    );
    expect(m.cifrar.mock.calls).toEqual([
      [SECRETOS_CLARO.tokenNuevo, { organizacionId: ORG_A, integracionId: ID_WHATSAPP, campo: "token_acceso" }],
    ]);
    const cambios = m.repo.actualizar.mock.calls[0]?.[1];
    expect(Object.keys(cambios?.secretos ?? {})).toEqual(["token_acceso"]);
    expect(cambios?.probadaAt).toEqual(AHORA);
    // El App Secret conservado es el MISMO valor cifrado: ni se descifró para guardarse ni se recifró.
    expect(m.filas.get(ID_WHATSAPP)?.secretos.app_secret).toBe(appSecretGuardado);
  });

  it("cambia la WABA sin secretos: vuelve a probar con lo guardado y no recifra nada", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, { wabaId: "waba-nueva" });

    expect(r.status).toBe("guardada");
    expect(m.espias.whatsapp).toHaveBeenCalledWith(
      { token_acceso: SECRETOS_CLARO.tokenViejo, app_secret: SECRETOS_CLARO.appSecretViejo },
      { numeroId: "numero-a", wabaId: "waba-nueva", nombreVisible: "Mensajeria A" },
    );
    expect(m.cifrar).not.toHaveBeenCalled();
    expect(m.repo.actualizar.mock.calls[0]?.[1]).not.toHaveProperty("secretos");
    expect(m.repo.actualizar.mock.calls[0]?.[1].datosPublicos).toMatchObject({ wabaId: "waba-nueva" });
  });

  it("cambia el número: prueba y manda el número nuevo a su columna; numero_ocupado llega tal cual (R11)", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const s = new IntegracionesService(m.deps);
    expect((await s.editar(MAESTRO_A, ID_WHATSAPP, { numeroId: "numero-nuevo" })).status).toBe("guardada");
    expect(m.repo.actualizar.mock.calls[0]?.[1]).toMatchObject({ whatsappNumeroId: "numero-nuevo" });

    m.repo.actualizar.mockResolvedValueOnce({ status: "numero_ocupado" });
    expect(await s.editar(MAESTRO_A, ID_WHATSAPP, { numeroId: "numero-de-otra" })).toEqual({ status: "numero_ocupado" });
  });

  it("si hace falta probar y lo guardado no se lee: credencial_ilegible, sin proveedor y sin escribir", async () => {
    const m = montar((s) => [{ ...filaWhatsappA(s), secretos: { token_acceso: "v1:alterado", app_secret: "v1:alterado-2" } }]);
    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, { app_secret: SECRETOS_CLARO.appSecretNuevo });

    expect(r).toEqual({ status: "credencial_ilegible" });
    expect(m.espias.whatsapp).not.toHaveBeenCalled();
    expect(m.repo.actualizar).not.toHaveBeenCalled();
  });

  it("con todos los secretos nuevos no hace falta descifrar nada", async () => {
    const m = montar((s) => [{ ...filaWhatsappA(s), secretos: { token_acceso: "v1:alterado", app_secret: "v1:alterado-2" } }]);
    const r = await new IntegracionesService(m.deps).editar(MAESTRO_A, ID_WHATSAPP, {
      token_acceso: SECRETOS_CLARO.tokenNuevo,
      app_secret: SECRETOS_CLARO.appSecretNuevo,
    });
    expect(r.status).toBe("guardada");
    expect(m.descifrar).not.toHaveBeenCalled();
  });
});

describe("SL-36/R15 — probar: buena limpia el error; mala deja error con código y hora", () => {
  it("buena: conectada y sin error, con la hora de la prueba", async () => {
    const m = montar((s) => [filaMapsA(s)]);
    const r = await new IntegracionesService(m.deps).probar(MAESTRO_A, ID_MAPS);

    expect(r).toEqual({ status: "probada", ok: true });
    expect(m.espias.google_maps).toHaveBeenCalledWith({ clave_api: SECRETOS_CLARO.claveMaps }, {});
    expect(m.repo.registrarPrueba).toHaveBeenCalledWith(ID_MAPS, { ok: true }, AHORA, MAESTRO_A.usuarioId);
    expect(m.filas.get(ID_MAPS)).toMatchObject({ estado: "conectada", ultimoErrorCodigo: null, ultimaPruebaAt: AHORA });
  });

  it("mala: error con el código del catálogo y la hora", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    m.espias.whatsapp.mockResolvedValueOnce({ ok: false, motivo: "sin_respuesta" });
    const r = await new IntegracionesService(m.deps).probar(MAESTRO_A, ID_WHATSAPP);

    expect(r).toEqual({
      status: "probada",
      ok: false,
      codigo: "prueba_fallida.whatsapp.sin_respuesta",
      texto: CATALOGO_INTEGRACIONES.whatsapp.textosPruebaFallida.sin_respuesta,
    });
    expect(m.filas.get(ID_WHATSAPP)).toMatchObject({
      estado: "error",
      ultimoErrorCodigo: "prueba_fallida.whatsapp.sin_respuesta",
      ultimaPruebaAt: AHORA,
    });
  });

  it("credencial guardada ilegible: error con credencial_ilegible y sin llamar al proveedor", async () => {
    const m = montar((s) => [{ ...filaMapsA(s), secretos: { clave_api: "v1:copiado-de-otra-fila" } }]);
    const r = await new IntegracionesService(m.deps).probar(MAESTRO_A, ID_MAPS);

    expect(r).toEqual({
      status: "probada",
      ok: false,
      codigo: "credencial_ilegible",
      texto: TEXTOS_ERROR_INTEGRACION.credencial_ilegible,
    });
    expect(m.espias.google_maps).not.toHaveBeenCalled();
    expect(m.filas.get(ID_MAPS)).toMatchObject({ estado: "error", ultimoErrorCodigo: "credencial_ilegible" });
  });
});

describe("SL-36/R16 — límite de pruebas por minuto (la parte del service)", () => {
  it("la sexta prueba del minuto se rechaza sin llamar al proveedor y dice cuándo volver", async () => {
    const m = montar((s) => [filaMapsA(s)]);
    const s = new IntegracionesService(m.deps);
    for (let i = 0; i < 5; i++) expect((await s.probar(MAESTRO_A, ID_MAPS)).status).toBe("probada");

    const sexta = await s.probar(MAESTRO_A, ID_MAPS);

    // AHORA es 12:00:20 y el minuto empezó a las 12:00:00: quedan 40 s.
    expect(sexta).toEqual({ status: "limite", reintentarEnS: 40 });
    expect(m.espias.google_maps).toHaveBeenCalledTimes(5);
    expect(m.repo.registrarPrueba).toHaveBeenCalledTimes(5);
  });

  it("cuentan el alta, la edición que prueba y «Probar»; el contador va antes del proveedor", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const s = new IntegracionesService({ ...m.deps, limitePorMinuto: () => 2 });

    expect((await s.alta(MAESTRO_A, "google_maps", { clave_api: SECRETOS_CLARO.claveMaps })).status).toBe("creada");
    expect((await s.editar(MAESTRO_A, ID_WHATSAPP, { wabaId: "waba-b" })).status).toBe("guardada");
    expect((await s.probar(MAESTRO_A, ID_WHATSAPP)).status).toBe("limite");
    expect((await s.alta(MAESTRO_A, "asistente", { clave_api: "otra-clave" })).status).toBe("limite");
    expect((await s.editar(MAESTRO_A, ID_WHATSAPP, { wabaId: "waba-c" })).status).toBe("limite");

    expect(m.espias.whatsapp).toHaveBeenCalledTimes(1);
    expect(m.espias.asistente).not.toHaveBeenCalled();
    expect(m.sumarPrueba.mock.invocationCallOrder[0]).toBeLessThan(m.espias.google_maps.mock.invocationCallOrder[0] ?? 0);
  });

  it("reintentarEnS queda entre 1 y 60 aunque el reloj de la instancia vaya desfasado", async () => {
    for (const [reloj, esperado] of [
      [new Date("2026-10-25T11:58:00.000Z"), 60],
      [new Date("2026-10-25T12:03:00.000Z"), 1],
    ] as const) {
      const m = montar((s) => [filaMapsA(s)]);
      const s = new IntegracionesService({ ...m.deps, limitePorMinuto: () => 0, reloj: () => reloj });
      expect(await s.probar(MAESTRO_A, ID_MAPS)).toEqual({ status: "limite", reintentarEnS: esperado });
    }
  });
});

describe("SL-36/R18 — alta y regenerar devuelven el token una vez y guardan solo el resumen", () => {
  const resumenDelToken = createHash("sha256").update(TOKEN_VERIFICACION).digest("hex");

  it("alta de WhatsApp: el token y la URL en la respuesta; al repositorio, solo el resumen", async () => {
    const m = montar();
    const s = new IntegracionesService(m.deps);
    const r = await s.alta(MAESTRO_A, "whatsapp", ENTRADA_WHATSAPP);

    expect(r).toMatchObject({ status: "creada", verificacion: { token: TOKEN_VERIFICACION, urlWebhook: URL_WEBHOOK } });
    const nueva = m.repo.crear.mock.calls[0]?.[0];
    expect(nueva).toMatchObject({ whatsappResumenVerificacion: resumenDelToken });
    expect(JSON.stringify(nueva)).not.toContain(TOKEN_VERIFICACION);
    // Al recargar (listar), el token ya no aparece en ninguna parte.
    expect(JSON.stringify(await s.listar(MAESTRO_A))).not.toContain(TOKEN_VERIFICACION);
  });

  it("alta de otro servicio: sin token ni verificación", async () => {
    const m = montar();
    const r = await new IntegracionesService(m.deps).alta(MAESTRO_A, "google_maps", { clave_api: SECRETOS_CLARO.claveMaps });
    expect(r.status).toBe("creada");
    expect(r).not.toHaveProperty("verificacion");
    expect(m.nuevoTokenVerificacion).not.toHaveBeenCalled();
  });

  it("regenerar: token nuevo una vez; el repositorio recibe el resumen; fuera de WhatsApp, no_encontrada", async () => {
    const m = montar((s) => [filaWhatsappA(s), filaMapsA(s)]);
    const s = new IntegracionesService(m.deps);

    expect(await s.regenerarToken(MAESTRO_A, ID_WHATSAPP)).toEqual({
      status: "regenerado",
      token: TOKEN_VERIFICACION,
      urlWebhook: URL_WEBHOOK,
    });
    expect(m.repo.regenerarToken).toHaveBeenCalledWith(ID_WHATSAPP, resumenDelToken, MAESTRO_A.usuarioId);
    expect(await s.regenerarToken(MAESTRO_A, ID_MAPS)).toEqual({ status: "no_encontrada" });
  });
});

describe("SL-36/R32 — desconectar (la parte del service)", () => {
  it("borra la de la empresa y dice qué servicio quedó sin configurar", async () => {
    const m = montar((s) => [filaWhatsappA(s)]);
    const s = new IntegracionesService(m.deps);
    expect(await s.desconectar(MAESTRO_A, ID_WHATSAPP)).toEqual({ status: "desconectada", servicio: "whatsapp" });
    expect(m.repo.borrar).toHaveBeenCalledWith(ID_WHATSAPP, MAESTRO_A.usuarioId);
    const listado = await s.listar(MAESTRO_A);
    expect(listado.status === "ok" && listado.servicios[0]?.estado).toBe("sin_configurar");
  });
});
