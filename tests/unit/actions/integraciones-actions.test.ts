import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor, IIntegracionesService, VistaIntegracion } from "@/lib/interfaces/services/IIntegracionesService";
import { TEXTOS_ERROR_INTEGRACION } from "@/lib/types/integraciones";

// SL-36 (T7.1) — las Server Actions de `/configuracion/integraciones`, con el service doble. Lo que
// se mide aquí es lo que hace el BORDE: de dónde sale el actor (R7), que no decide la autorización
// por su cuenta (R6), qué resultados revalidan la página, que el token solo viaja en su respuesta
// (R18) y que lo que el service lanza sale como `unexpected` sin el mensaje del error. Las reglas de
// negocio están en `tests/unit/services/integraciones-*.test.ts`; el cableado real, en
// `integraciones.composition-root.test.ts`.

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const {
  altaIntegracion,
  desconectarIntegracion,
  editarIntegracion,
  listarIntegraciones,
  probarIntegracion,
  regenerarTokenIntegracion,
} = await import("@/lib/actions/integraciones");

const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b2";
const ID = "22222222-2222-4222-8222-222222222222";
const MAESTRO_A: Actor = { usuarioId: "usuario-maestro-a", rol: "maestro", organizacionId: ORG_A };
const TOKEN = "token-verificacion-revelado-una-vez";
const URL_WEBHOOK = "https://app.ejemplo.test/api/webhooks/whatsapp";
const SECRETO = "token-acceso-en-claro-del-maestro";

const VISTA: VistaIntegracion = {
  id: ID,
  servicio: "whatsapp",
  marca: "recomendado",
  estado: "conectada",
  datosPublicos: { nombreVisible: "Oficina", numeroId: "123", wabaId: "456", telefonoVisible: "", nombreVerificado: "" },
  ultimoErrorTexto: null,
  ultimaPruebaAt: null,
  ultimoWebhookAt: null,
};

/** Cada método falla ruidosamente si el test no lo esperaba: un vacío pasaría por la razón equivocada. */
function serviceDoble(over: Partial<IIntegracionesService> = {}): IIntegracionesService {
  const falla = (n: string) => vi.fn(async () => {
    throw new Error(`${n} no debe invocarse aqui`);
  });
  return {
    listar: falla("listar"),
    alta: falla("alta"),
    editar: falla("editar"),
    probar: falla("probar"),
    regenerarToken: falla("regenerarToken"),
    desconectar: falla("desconectar"),
    ...over,
  };
}

const sesion = (actor: Actor | null) => ({ getActor: async () => actor });

beforeEach(() => revalidatePath.mockClear());

describe("SL-36/R7 — el actor sale de la sesión, nunca de la entrada", () => {
  it("alta: el service recibe el actor de la sesión aunque la entrada traiga otra empresa y otro usuario", async () => {
    const alta = vi.fn(async () => ({ status: "ya_existe" as const }));
    const campos = { clave_api: "valido-x", organizacionId: ORG_B, usuarioId: "intruso" };
    await altaIntegracion(
      { servicio: "google_maps", campos, organizacionId: ORG_B, actor: { rol: "maestro", organizacionId: ORG_B } },
      { integracionesService: serviceDoble({ alta }), ...sesion(MAESTRO_A) },
    );
    expect(alta).toHaveBeenCalledTimes(1);
    const [actor, servicio, recibidos] = alta.mock.calls[0] as unknown as [Actor, string, unknown];
    expect(actor).toBe(MAESTRO_A);
    expect(servicio).toBe("google_maps");
    // Los campos llegan tal cual: el esquema del service es el que descarta las claves de más.
    expect(recibidos).toBe(campos);
  });

  it("editar, probar, regenerar, desconectar y listar pasan el mismo actor de la sesión", async () => {
    const llamadas: Array<Actor | null> = [];
    const anota = <R>(r: R) => vi.fn(async (actor: Actor | null) => (llamadas.push(actor), r));
    const s = serviceDoble({
      listar: anota({ status: "forbidden" as const }),
      editar: anota({ status: "no_encontrada" as const }),
      probar: anota({ status: "no_encontrada" as const }),
      regenerarToken: anota({ status: "no_encontrada" as const }),
      desconectar: anota({ status: "no_encontrada" as const }),
    });
    const deps = { integracionesService: s, ...sesion(MAESTRO_A) };
    const ajena = { id: ID, organizacionId: ORG_B };
    await listarIntegraciones(deps);
    await editarIntegracion({ ...ajena, campos: {} }, deps);
    await probarIntegracion(ajena, deps);
    await regenerarTokenIntegracion(ajena, deps);
    await desconectarIntegracion(ajena, deps);
    expect(llamadas).toEqual([MAESTRO_A, MAESTRO_A, MAESTRO_A, MAESTRO_A, MAESTRO_A]);
    expect(llamadas.every((a) => a === MAESTRO_A)).toBe(true);
  });
});

describe("SL-36/R6 — la action no decide la autorización: la deja al service", () => {
  it("sin sesión pasa `null` y devuelve el `forbidden` del service, sin revalidar", async () => {
    const desconectar = vi.fn(async () => ({ status: "forbidden" as const }));
    const r = await desconectarIntegracion({ id: ID }, { integracionesService: serviceDoble({ desconectar }), ...sesion(null) });
    expect(desconectar).toHaveBeenCalledWith(null, ID);
    expect(r).toEqual({ status: "forbidden" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("con otro rol pasa ese actor tal cual (el rechazo es del service, R6)", async () => {
    const admin: Actor = { usuarioId: "u-admin", rol: "admin", organizacionId: ORG_A };
    const listar = vi.fn(async () => ({ status: "forbidden" as const }));
    const r = await listarIntegraciones({ integracionesService: serviceDoble({ listar }), ...sesion(admin) });
    expect(listar).toHaveBeenCalledWith(admin);
    expect(r).toEqual({ status: "forbidden" });
  });
});

describe("SL-36/R9 — una entrada mal formada llega como el mismo «no encontrada»", () => {
  it("un id que no es texto se pasa vacío (el service lo trata como inexistente)", async () => {
    const probar = vi.fn(async () => ({ status: "no_encontrada" as const }));
    const deps = { integracionesService: serviceDoble({ probar }), ...sesion(MAESTRO_A) };
    for (const entrada of [{ id: 5 }, null, "texto", { otro: ID }]) {
      expect(await probarIntegracion(entrada, deps)).toEqual({ status: "no_encontrada" });
    }
    expect(probar.mock.calls.map((c) => (c as unknown[])[1])).toEqual(["", "", "", ""]);
  });

  it("un alta sin cáscara pasa servicio vacío y campos ausentes (el service responde invalid_input)", async () => {
    const respuesta = { status: "invalid_input" as const, fieldErrors: { servicio: ["Revisa este campo."] } };
    const alta = vi.fn(async () => respuesta);
    const r = await altaIntegracion(42, { integracionesService: serviceDoble({ alta }), ...sesion(MAESTRO_A) });
    expect(alta).toHaveBeenCalledWith(MAESTRO_A, "", undefined);
    expect(r).toEqual(respuesta);
  });
});

describe("SL-36/R12-R16, R32 — qué resultados revalidan la pantalla", () => {
  const casos: Array<[string, () => Promise<unknown>, boolean]> = [];
  const deps = (s: Partial<IIntegracionesService>) => ({ integracionesService: serviceDoble(s), ...sesion(MAESTRO_A) });

  casos.push(["alta creada", () => altaIntegracion({ servicio: "google_maps", campos: {} }, deps({ alta: async () => ({ status: "creada", vista: VISTA }) })), true]);
  casos.push(["alta con prueba fallida (R13: no escribió)", () => altaIntegracion({ servicio: "google_maps", campos: {} }, deps({ alta: async () => ({ status: "prueba_fallida", codigo: "prueba_fallida.google_maps.credencial_rechazada", texto: "x" }) })), false]);
  casos.push(["alta con límite (R16)", () => altaIntegracion({ servicio: "google_maps", campos: {} }, deps({ alta: async () => ({ status: "limite", reintentarEnS: 30 }) })), false]);
  casos.push(["edición guardada", () => editarIntegracion({ id: ID, campos: {} }, deps({ editar: async () => ({ status: "guardada", vista: VISTA }) })), true]);
  casos.push(["edición con prueba fallida (R13)", () => editarIntegracion({ id: ID, campos: {} }, deps({ editar: async () => ({ status: "prueba_fallida", codigo: "prueba_fallida.whatsapp.credencial_rechazada", texto: "x" }) })), false]);
  casos.push(["prueba buena (R15)", () => probarIntegracion({ id: ID }, deps({ probar: async () => ({ status: "probada", ok: true }) })), true]);
  casos.push(["prueba mala: también escribe el estado (R15)", () => probarIntegracion({ id: ID }, deps({ probar: async () => ({ status: "probada", ok: false, codigo: "c", texto: "t" }) })), true]);
  casos.push(["prueba con límite (R16)", () => probarIntegracion({ id: ID }, deps({ probar: async () => ({ status: "limite", reintentarEnS: 10 }) })), false]);
  casos.push(["token regenerado (R18: nada visible cambia)", () => regenerarTokenIntegracion({ id: ID }, deps({ regenerarToken: async () => ({ status: "regenerado", token: TOKEN, urlWebhook: URL_WEBHOOK }) })), false]);
  casos.push(["desconectada (R32)", () => desconectarIntegracion({ id: ID }, deps({ desconectar: async () => ({ status: "desconectada", servicio: "whatsapp" }) })), true]);
  casos.push(["desconectar no encontrada", () => desconectarIntegracion({ id: ID }, deps({ desconectar: async () => ({ status: "no_encontrada" }) })), false]);
  casos.push(["listar", () => listarIntegraciones(deps({ listar: async () => ({ status: "ok", servicios: [VISTA] }) })), false]);

  it.each(casos)("%s → revalida: %s", async (_n, llamar, revalida) => {
    await llamar();
    if (revalida) expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/configuracion/integraciones");
    else expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("SL-36/R18 — el token viaja solo en la respuesta del alta y de regenerar", () => {
  it("el alta de WhatsApp devuelve el token y la URL tal como los da el service", async () => {
    const creada = { status: "creada" as const, vista: VISTA, verificacion: { token: TOKEN, urlWebhook: URL_WEBHOOK } };
    const r = await altaIntegracion(
      { servicio: "whatsapp", campos: {} },
      { integracionesService: serviceDoble({ alta: async () => creada }), ...sesion(MAESTRO_A) },
    );
    expect(r).toEqual(creada);
  });

  it("regenerar devuelve el token una vez; la lectura de la página que sigue no lo trae", async () => {
    const s = serviceDoble({
      regenerarToken: async () => ({ status: "regenerado", token: TOKEN, urlWebhook: URL_WEBHOOK }),
      listar: async () => ({ status: "ok", servicios: [VISTA] }),
    });
    const deps = { integracionesService: s, ...sesion(MAESTRO_A) };
    expect(await regenerarTokenIntegracion({ id: ID }, deps)).toEqual({ status: "regenerado", token: TOKEN, urlWebhook: URL_WEBHOOK });
    // La action no guarda nada entre llamadas: la lectura siguiente es solo lo que da el service.
    expect(JSON.stringify(await listarIntegraciones(deps))).not.toContain(TOKEN);
  });
});

describe("SL-36 — lo que el service lanza sale como `unexpected`, sin el error", () => {
  const errorConSecreto = () => Object.assign(new Error(`Invalid prisma.integracion.create() { secretos: "${SECRETO}" }`), { code: "P2010" });

  it("devuelve referencia y texto del catálogo; ni el resultado ni el log llevan el mensaje", async () => {
    const log = vi.fn();
    const r = await altaIntegracion(
      { servicio: "whatsapp", campos: { token_acceso: SECRETO } },
      {
        integracionesService: serviceDoble({ alta: async () => { throw errorConSecreto(); } }),
        ...sesion(MAESTRO_A),
        log,
      },
    );
    expect(r).toMatchObject({ status: "unexpected", texto: TEXTOS_ERROR_INTEGRACION.unexpected });
    const referencia = (r as { referencia: string }).referencia;
    expect(referencia).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(r)).not.toContain(SECRETO);
    expect(log).toHaveBeenCalledExactlyOnceWith("[integraciones] alta falló", { referencia, error: "Error", codigo: "P2010" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRETO);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("una sesión que no se puede resolver (base caída) también es `unexpected`", async () => {
    const log = vi.fn();
    const r = await listarIntegraciones({
      integracionesService: serviceDoble(),
      getActor: async () => { throw new Error("connect ECONNREFUSED"); },
      log,
    });
    expect(r).toMatchObject({ status: "unexpected" });
    expect(log).toHaveBeenCalledWith("[integraciones] listar falló", expect.objectContaining({ error: "Error" }));
  });

  it("dos fallos dan dos referencias distintas", async () => {
    const deps = { integracionesService: serviceDoble(), ...sesion(MAESTRO_A), log: vi.fn() };
    const a = (await probarIntegracion({ id: ID }, deps)) as { referencia: string };
    const b = (await probarIntegracion({ id: ID }, deps)) as { referencia: string };
    expect(a.referencia).not.toBe(b.referencia);
  });
});
