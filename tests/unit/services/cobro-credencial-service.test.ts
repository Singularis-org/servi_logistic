import { RolValue } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { CredencialIlegibleError } from "@/lib/crypto/boveda-integraciones";
import type { ContextoSecreto, ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { TrioCredencialCobro } from "@/lib/interfaces/external/IProveedorCobro";
import type {
  EstadoCredencialGuardada,
  GuardarCredencialRepoInput,
  GuardarCredencialRepoResult,
  ICobroCredencialRepository,
} from "@/lib/interfaces/repositories/ICobroCredencialRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  CobroCredencialService,
  crearLectorCredencialesCobro,
  ORGANIZACION_PLATAFORMA_EN_BOVEDA,
} from "@/lib/services/CobroCredencialService";
import { ProveedorCobroError } from "@/lib/types/cobro";
import { ejecutarGuardado } from "@/scripts/cobro-credencial-guardar";

// SLT-227 (design §8.3, §9.1, §12; R8–R10, R12) — el servicio de las credenciales de cobro con el repositorio, el
// cifrador y la fuente de ids dobles. Lo que hace la base (el CHECK, el único, la FK, el reemplazo) y la bóveda real
// lo cubre `tests/integration/db/cobro-proveedor-credencial.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: RolValue.superadmin };
const AHORA = new Date("2026-11-21T15:00:00.000Z");
const ID_NUEVO = "1d000000-0000-4000-8000-000000000001";
const API_KEY = "sk_test_CENTINELA_1234";
const WEBHOOK = `whsec_${"ab".repeat(32)}`;
const TRIO: TrioCredencialCobro = { proveedor: "rebill", paisId: "CR", entorno: "sandbox" };

const entrada = (secretos: Record<string, string> = { apiKey: API_KEY, secretoWebhook: WEBHOOK }, otros = {}) => ({
  ...TRIO,
  secretos,
  ...otros,
});

function dobles(opciones: { idExistente?: string | null; guardar?: GuardarCredencialRepoResult; estado?: EstadoCredencialGuardada | null } = {}) {
  const repo = {
    idDe: vi.fn(async () => opciones.idExistente ?? null),
    guardar: vi.fn<(input: GuardarCredencialRepoInput) => Promise<GuardarCredencialRepoResult>>(async () => opciones.guardar ?? "ok"),
    estado: vi.fn(async () => opciones.estado ?? null),
    secretosDe: vi.fn(async () => null),
    idSuperadmin: vi.fn(async () => "u-super"),
    listarSecretos: vi.fn(async () => []),
    reemplazarSecretos: vi.fn(async () => true),
  } satisfies ICobroCredencialRepository;
  const cifrador = {
    cifrar: vi.fn(async (texto: string, ctx: ContextoSecreto) => `cif(${ctx.integracionId}/${ctx.campo}:${texto.length})`),
    descifrar: vi.fn(async () => "claro"),
    versionDe: vi.fn(() => "v1"),
  } satisfies ICifradorSecretos;
  const fuente = { nuevoId: vi.fn(() => ID_NUEVO) };
  const servicio = new CobroCredencialService({ repo, cifrador, fuente, ahora: () => AHORA });
  return { repo, cifrador, fuente, servicio };
}

function sinLlamadas(d: ReturnType<typeof dobles>) {
  for (const f of [d.repo.idDe, d.repo.guardar, d.repo.estado, d.repo.secretosDe, d.cifrador.cifrar, d.cifrador.descifrar, d.fuente.nuevoId]) {
    expect(f).not.toHaveBeenCalled();
  }
}

describe("SLT-227 — CobroCredencialService.guardar", () => {
  it("R8: con la entrada válida, cifra cada campo con el id de la fila nueva y guarda como el superadmin", async () => {
    const d = dobles();
    const r = await d.servicio.guardar(SUPERADMIN, entrada());
    expect(r).toEqual({ estado: "ok", campos: ["apiKey", "secretoWebhook"] });
    expect(d.cifrador.cifrar).toHaveBeenCalledWith(API_KEY, { organizacionId: ORGANIZACION_PLATAFORMA_EN_BOVEDA, integracionId: ID_NUEVO, campo: "apiKey" });
    expect(d.cifrador.cifrar).toHaveBeenCalledWith(WEBHOOK, { organizacionId: "plataforma", integracionId: ID_NUEVO, campo: "secretoWebhook" });
    expect(d.repo.guardar).toHaveBeenCalledWith({
      id: ID_NUEVO,
      trio: TRIO,
      secretos: { apiKey: `cif(${ID_NUEVO}/apiKey:${API_KEY.length})`, secretoWebhook: `cif(${ID_NUEVO}/secretoWebhook:${WEBHOOK.length})` },
      por: "u-super",
      ahora: AHORA,
    });
  });

  it("R8: si el trío ya tiene fila, reusa su id (el de los datos asociados) y no pide uno nuevo", async () => {
    const d = dobles({ idExistente: "fila-existente" });
    expect(await d.servicio.guardar(SUPERADMIN, entrada())).toEqual({ estado: "ok", campos: ["apiKey", "secretoWebhook"] });
    expect(d.fuente.nuevoId).not.toHaveBeenCalled();
    expect(d.repo.guardar.mock.calls[0][0]).toMatchObject({ id: "fila-existente" });
    expect(d.cifrador.cifrar.mock.calls.every(([, ctx]) => ctx.integracionId === "fila-existente")).toBe(true);
  });

  it("R8: los espacios alrededor de un valor no se cifran", async () => {
    const d = dobles();
    await d.servicio.guardar(SUPERADMIN, entrada({ apiKey: `  ${API_KEY}\n`, secretoWebhook: ` ${WEBHOOK} ` }));
    expect(d.cifrador.cifrar.mock.calls.map(([t]) => t)).toEqual([API_KEY, WEBHOOK]);
  });

  it("R8: falta un campo, sobra uno o va vacío ⇒ validation_error sin cifrar; wompi ⇒ proveedor_no_disponible", async () => {
    const casos: [unknown, string[]][] = [
      [entrada({ apiKey: API_KEY }), ["secretos.secretoWebhook"]],
      [entrada({ secretoWebhook: WEBHOOK }), ["secretos.apiKey"]],
      [entrada({ apiKey: API_KEY, secretoWebhook: WEBHOOK, sobra: "x" }), ["secretos.campo_no_reconocido"]],
      [entrada({ apiKey: "", secretoWebhook: WEBHOOK }), ["secretos.apiKey"]],
      [entrada({ apiKey: "   ", secretoWebhook: WEBHOOK }), ["secretos.apiKey"]],
      [entrada({ apiKey: API_KEY, secretoWebhook: "" }), ["secretos.secretoWebhook"]],
      [entrada(undefined, { paisId: "cr" }), ["paisId"]],
      [entrada(undefined, { entorno: "produccion_real" }), ["entorno"]],
      [entrada(undefined, { proveedor: "stripe" }), ["proveedor"]],
      [null, ["entrada"]],
    ];
    for (const [e, campos] of casos) {
      const d = dobles();
      expect(await d.servicio.guardar(SUPERADMIN, e), JSON.stringify(e)).toEqual({ estado: "validation_error", campos });
      sinLlamadas(d);
    }
    for (const proveedor of ["wompi", "global66"]) {
      const d = dobles();
      expect(await d.servicio.guardar(SUPERADMIN, entrada(undefined, { proveedor }))).toEqual({ estado: "proveedor_no_disponible" });
      sinLlamadas(d);
    }
  });

  it("R8: una apiKey pk_ o un secretoWebhook sin la forma whsec_ + 64 hex ⇒ validation_error", async () => {
    const malos: Record<string, string>[] = [
      { apiKey: "pk_test_publica", secretoWebhook: WEBHOOK },
      { apiKey: "sk_", secretoWebhook: WEBHOOK },
      { apiKey: `sk_${"x".repeat(498)}`, secretoWebhook: WEBHOOK },
      { apiKey: API_KEY, secretoWebhook: "ab".repeat(32) },
      { apiKey: API_KEY, secretoWebhook: `whsec_${"ab".repeat(31)}` },
      { apiKey: API_KEY, secretoWebhook: `whsec_${"AB".repeat(32)}` },
      { apiKey: API_KEY, secretoWebhook: `whsec_${"zz".repeat(32)}` },
    ];
    for (const secretos of malos) {
      const d = dobles();
      const r = await d.servicio.guardar(SUPERADMIN, entrada(secretos));
      expect(r.estado, JSON.stringify(secretos)).toBe("validation_error");
      // El error nombra el campo, nunca su valor.
      for (const valor of Object.values(secretos)) expect(JSON.stringify(r)).not.toContain(valor);
      sinLlamadas(d);
    }
  });

  it("R8: el repositorio dice pais_no_existe o conflicto ⇒ se devuelve tal cual, sin campos", async () => {
    for (const desenlace of ["pais_no_existe", "conflicto"] as const) {
      const d = dobles({ guardar: desenlace });
      expect(await d.servicio.guardar(SUPERADMIN, entrada())).toEqual({ estado: desenlace });
    }
  });
});

describe("SLT-227 — CobroCredencialService.estado", () => {
  it("R9: un trío sin fila ⇒ configurada: false", async () => {
    const d = dobles({ estado: null });
    expect(await d.servicio.estado(SUPERADMIN, TRIO)).toEqual({ estado: "ok", configurada: false });
    expect(d.repo.estado).toHaveBeenCalledWith(TRIO);
    expect(d.cifrador.descifrar).not.toHaveBeenCalled();
  });

  it("R9: con fila, los campos y el último cambio, y nada más de lo que traiga el repositorio", async () => {
    const guardada = { campos: ["apiKey", "secretoWebhook"], actualizadoAt: AHORA, actualizadoPor: "u-super" };
    const d = dobles({ estado: { ...guardada, secretos: { apiKey: "v1:cifrado" } } as EstadoCredencialGuardada });
    const r = await d.servicio.estado(SUPERADMIN, TRIO);
    expect(r).toEqual({ estado: "ok", configurada: true, ...guardada });
    expect(JSON.stringify(r)).not.toContain("v1:");
  });
});

describe("SLT-227 — R10: solo el superadmin", () => {
  const otros = Object.values(RolValue).filter((rol) => rol !== RolValue.superadmin);

  it("R10: maestro, admin, mensajero y tienda reciben forbidden al guardar y al consultar, sin llamadas", async () => {
    expect(otros).toEqual(expect.arrayContaining(["maestro", "admin", "mensajero", "adminTienda"]));
    for (const rol of otros) {
      const d = dobles();
      const actor: Actor = { usuarioId: `u-${rol}`, rol, organizacionId: "org-1" };
      expect(await d.servicio.guardar(actor, entrada()), rol).toEqual({ estado: "forbidden" });
      expect(await d.servicio.estado(actor, TRIO), rol).toEqual({ estado: "forbidden" });
      sinLlamadas(d);
    }
  });
});

describe("SLT-227 — crearLectorCredencialesCobro (R7, R11)", () => {
  it("descifra cada campo con el id de SU fila y el nombre de SU campo; sin fila, null", async () => {
    const secretosDe = vi.fn(async (t: TrioCredencialCobro) =>
      t.entorno === "sandbox" ? { id: "fila-1", secretos: { apiKey: "c1", secretoWebhook: "c2" } } : null,
    );
    const descifrar = vi.fn(async (g: string, ctx: ContextoSecreto) => `${g}@${ctx.organizacionId}/${ctx.integracionId}/${ctx.campo}`);
    const leer = crearLectorCredencialesCobro({ repo: { secretosDe }, cifrador: { descifrar } });
    expect(await leer(TRIO)).toEqual({ apiKey: "c1@plataforma/fila-1/apiKey", secretoWebhook: "c2@plataforma/fila-1/secretoWebhook" });
    expect(await leer({ ...TRIO, entorno: "produccion" })).toBeNull();
  });

  it("un campo ilegible ⇒ credencial_ilegible, sin el campo ni el valor; otro error sale tal cual", async () => {
    const secretosDe = async () => ({ id: "fila-1", secretos: { apiKey: "v1:CIFRADO_CENTINELA" } });
    const ilegible = crearLectorCredencialesCobro({
      repo: { secretosDe },
      cifrador: { descifrar: async () => Promise.reject(new CredencialIlegibleError("no_autentica")) },
    });
    const e = await ilegible(TRIO).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ProveedorCobroError);
    expect(e).toMatchObject({ codigo: "credencial_ilegible", proveedor: "rebill" });
    for (const texto of [String(e), JSON.stringify(e), (e as Error).stack ?? ""]) {
      expect(texto).not.toContain("CIFRADO_CENTINELA");
      expect(texto).not.toContain("apiKey");
    }

    const despliegue = new Error("faltan las variables del anillo");
    const sinAnillo = crearLectorCredencialesCobro({ repo: { secretosDe }, cifrador: { descifrar: async () => Promise.reject(despliegue) } });
    await expect(sinAnillo(TRIO)).rejects.toBe(despliegue);
  });
});

// ─── R12: el comando `pnpm cobro:credencial` (design §9.1) ──────────────────────────────────────────────────────

function salidaDoble() {
  const lineas: { canal: "log" | "error"; texto: string }[] = [];
  return {
    lineas,
    texto: () => lineas.map((l) => l.texto).join("\n"),
    salida: { log: (texto: string) => lineas.push({ canal: "log", texto }), error: (texto: string) => lineas.push({ canal: "error", texto }) },
  };
}

const ARGUMENTOS = ["--proveedor", "rebill", "--pais", "CR", "--entorno", "sandbox"];
const ENTRADA = `apiKey=${API_KEY}\nsecretoWebhook=${WEBHOOK}\n`;

describe("SLT-227 — R12: el comando de carga", () => {
  it("R12: el comando lee los secretos de la entrada estándar, guarda como el superadmin y no imprime ningún valor", async () => {
    const d = dobles();
    const guardar = vi.spyOn(d.servicio, "guardar");
    const s = salidaDoble();
    expect(await ejecutarGuardado(d.servicio, "u-super", ARGUMENTOS, ENTRADA, s.salida)).toBe(0);
    expect(guardar).toHaveBeenCalledWith(
      { usuarioId: "u-super", rol: "superadmin" },
      { proveedor: "rebill", paisId: "CR", entorno: "sandbox", secretos: { apiKey: API_KEY, secretoWebhook: WEBHOOK } },
    );
    // Pasó por la regla de R8 de verdad: el cifrador recibió los dos valores y el repositorio guardó como el superadmin.
    expect(d.cifrador.cifrar.mock.calls.map(([t]) => t)).toEqual([API_KEY, WEBHOOK]);
    expect(d.repo.guardar.mock.calls[0][0]).toMatchObject({ por: "u-super", trio: TRIO });
    expect(s.lineas).toEqual([{ canal: "log", texto: "Guardadas: rebill · CR · sandbox (apiKey, secretoWebhook)" }]);

    // Con `--opcion=valor`, CRLF y líneas en blanco, lo mismo.
    const otra = salidaDoble();
    const crlf = `\r\napiKey=${API_KEY}\r\n\r\nsecretoWebhook=${WEBHOOK}\r\n`;
    expect(await ejecutarGuardado(dobles().servicio, "u-super", ["--proveedor=rebill", "--pais=CR", "--entorno=sandbox"], crlf, otra.salida)).toBe(0);
    expect(otra.texto()).toBe("Guardadas: rebill · CR · sandbox (apiKey, secretoWebhook)");
  });

  it("R12: con una entrada que no cumple R8, sale con 1, nombra el campo y no repite ningún valor", async () => {
    const casos = [
      `apiKey=pk_test_PUBLICA_CENTINELA\nsecretoWebhook=${WEBHOOK}`,
      `apiKey=${API_KEY}`,
      `apiKey=${API_KEY}\nsecretoWebhook=${WEBHOOK}\nsobra=OTRO_CENTINELA`,
      `${API_KEY}\nsecretoWebhook=${WEBHOOK}`,
      `apiKey=${API_KEY}\napiKey=${API_KEY}\nsecretoWebhook=${WEBHOOK}`,
    ];
    for (const entrada of casos) {
      const d = dobles();
      const s = salidaDoble();
      expect(await ejecutarGuardado(d.servicio, "u-super", ARGUMENTOS, entrada, s.salida), entrada).toBe(1);
      expect(d.repo.guardar).not.toHaveBeenCalled();
      expect(s.lineas.every((l) => l.canal === "error")).toBe(true);
      for (const prohibido of [API_KEY, WEBHOOK, "pk_test_PUBLICA_CENTINELA", "OTRO_CENTINELA"]) {
        expect(s.texto()).not.toContain(prohibido);
      }
    }
    const s = salidaDoble();
    await ejecutarGuardado(dobles().servicio, "u-super", ARGUMENTOS, casos[0], s.salida);
    expect(s.texto()).toBe("No se guardó: validation_error en secretos.apiKey.");
  });

  it("R12: un argumento desconocido sale con 1 sin repetirlo; sin superadmin, sale con 1", async () => {
    const malos = [
      [...ARGUMENTOS, "--api-key=sk_live_PEGADA_CENTINELA"],
      [...ARGUMENTOS, "sk_live_PEGADA_CENTINELA"],
      ["--proveedor", "rebill", "--pais", "CR"],
      ["--proveedor", "rebill", "--proveedor", "rebill", "--pais", "CR", "--entorno", "sandbox"],
      ["--proveedor", "rebill", "--pais", "CR", "--entorno"],
    ];
    for (const argumentos of malos) {
      const d = dobles();
      const s = salidaDoble();
      expect(await ejecutarGuardado(d.servicio, "u-super", argumentos, ENTRADA, s.salida), argumentos.join(" ")).toBe(1);
      expect(s.texto()).toContain("Argumento no reconocido");
      expect(s.texto()).not.toContain("PEGADA_CENTINELA");
      sinLlamadas(d);
    }

    const d = dobles();
    const s = salidaDoble();
    expect(await ejecutarGuardado(d.servicio, null, ARGUMENTOS, ENTRADA, s.salida)).toBe(1);
    expect(s.texto()).toContain("pnpm arranque:superadmin");
    sinLlamadas(d);
  });

  it("R12: si el servicio lanza, sale con 1 sin imprimir el mensaje del error", async () => {
    const d = dobles();
    d.repo.guardar.mockRejectedValueOnce(Object.assign(new Error(`fallo con ${API_KEY} dentro`), { code: "P2010" }));
    const s = salidaDoble();
    expect(await ejecutarGuardado(d.servicio, "u-super", ARGUMENTOS, ENTRADA, s.salida)).toBe(1);
    expect(s.texto()).toContain("Error P2010");
    expect(s.texto()).not.toContain(API_KEY);
  });
});
