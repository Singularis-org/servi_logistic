import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RolValue } from "@prisma/client";

import { altaEmpresaAction } from "@/lib/actions/organizaciones";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type {
  EnviarBienvenidaResultado,
  IBienvenidaMaestroService,
} from "@/lib/interfaces/services/IBienvenidaMaestroService";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { AltaEmpresaResultado } from "@/lib/types/organizacion";

// SL-17 / T2.8 (design §7.7) — R48: la action de alta solo la ejecuta el superadmin de SL-32. El
// servicio es un doble que cuenta llamadas: si se llama una sola vez para un actor no autorizado,
// el test lo ve. SL-32 (T4, adelantando T15) engancha `exigirSuperadmin` a `esPlataforma`.

const ENTRADA = {
  nombre: "Envíos del Sur",
  slug: "envios-del-sur",
  maestro: { nombre: "Lucía", email: "lucia@ejemplo.test", telefono: "88887777", documento: "112223333", tipoDocumento: "cedula" },
};

function servicioDoble() {
  const altaEmpresa = vi.fn(async () => ({ estado: "creada" as const, organizacionId: "o", maestroId: "u" }));
  const service: IOrganizacionService = { altaEmpresa };
  return { service, altaEmpresa };
}

// SL-41: la bienvenida y el contexto de la peticion tambien son dobles; sin ellos la action iria a
// la base y a las cabeceras de Next.
function bienvenidaDoble(resultado: EnviarBienvenidaResultado = { estado: "enviada", email: "lucia@ejemplo.test" }) {
  const contextos: (ContextoDatos | undefined)[] = [];
  const enviar = vi.fn<IBienvenidaMaestroService["enviar"]>(async () => {
    contextos.push(contextoActual());
    return resultado;
  });
  const bienvenida: IBienvenidaMaestroService = { enviar };
  return { bienvenida, enviar, contextos };
}
const CONTEXTO_PETICION = async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" });

// Todos los valores reales de `RolValue` (db/schema.prisma), con si dan de alta empresas. El
// literal es el contrato: `satisfies` hace que añadir un rol al enum sin decidirlo aquí no compile.
const DA_DE_ALTA = {
  maestro: false,
  admin: false,
  mensajero: false,
  adminTienda: false,
  adminSatelite: false,
  apiKey: false,
  superadmin: true,
} satisfies Record<RolValue, boolean>;

const ROLES_DE_EMPRESA = (Object.keys(DA_DE_ALTA) as RolValue[]).filter((r) => !DA_DE_ALTA[r]);

describe("R48 — todo actor que no es superadmin recibe «no autorizado» sin llamar al servicio", () => {
  it("la tabla cubre los siete roles y solo uno da de alta", () => {
    expect(ROLES_DE_EMPRESA).toHaveLength(6);
  });

  it.each(ROLES_DE_EMPRESA)("rol %s", async (rol) => {
    const { service, altaEmpresa } = servicioDoble();
    const actor: Actor = { usuarioId: `u-${rol}`, rol };
    const { bienvenida, enviar } = bienvenidaDoble();
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => actor, service, bienvenida });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(altaEmpresa).not.toHaveBeenCalled();
    // SL-41 R27: sin alta no hay bienvenida.
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sin sesión", async () => {
    const { service, altaEmpresa } = servicioDoble();
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => null, service });
    expect(r).toEqual({ estado: "no_autorizado" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("el superadmin sí llega al servicio, una sola vez", async () => {
    const { service, altaEmpresa } = servicioDoble();
    const superadmin: Actor = { usuarioId: "u-super", rol: "superadmin" };
    const { bienvenida } = bienvenidaDoble();
    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => superadmin,
      service,
      bienvenida,
      getContext: CONTEXTO_PETICION,
    });
    expect(r).toEqual({ estado: "creada", organizacionId: "o", maestroId: "u", bienvenida: "enviada" });
    expect(altaEmpresa).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* SL-41 — la bienvenida del maestro tras el alta                              */
/* -------------------------------------------------------------------------- */

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: "superadmin" };
const ORG_NUEVA = "6f1c2a4e-1b7d-4c3e-9a8f-1234567890ab";

function altaQueDevuelve(r: AltaEmpresaResultado) {
  const altaEmpresa = vi.fn<IOrganizacionService["altaEmpresa"]>(async () => r);
  return { service: { altaEmpresa } satisfies IOrganizacionService, altaEmpresa };
}

describe("SL-41 R12 — con creada, la action envía la bienvenida a esa empresa", () => {
  it("una sola vez, con el organizacionId del alta y la IP de la petición, en plataforma con SL-41", async () => {
    const { service } = altaQueDevuelve({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m" });
    const { bienvenida, enviar, contextos } = bienvenidaDoble();

    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => SUPERADMIN,
      service,
      bienvenida,
      getContext: CONTEXTO_PETICION,
    });

    expect(r).toEqual({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m", bienvenida: "enviada" });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith({ organizacionId: ORG_NUEVA, ipAddress: "203.0.113.5" });
    expect(contextos).toEqual([{ tipo: "plataforma", ficha: "SL-41", motivo: "bienvenida del maestro" }]);
  });
});

describe("SL-41 R23 y R24 — el alta termina en creada aunque el correo no salga", () => {
  it.each([
    ["no_enviada", { estado: "no_enviada", email: "lucia@ejemplo.test" }],
    ["no_enviada", { estado: "no_enviada", email: null }],
    ["sin_correo", { estado: "sin_correo", email: "lucia@ejemplo.test" }],
  ] as const)("bienvenida %s", async (esperado, resultado) => {
    const { service } = altaQueDevuelve({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m" });
    const { bienvenida } = bienvenidaDoble(resultado);
    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => SUPERADMIN,
      service,
      bienvenida,
      getContext: CONTEXTO_PETICION,
    });
    expect(r).toEqual({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m", bienvenida: esperado });
  });

  it("si la bienvenida lanza (no debería), la action no lanza y devuelve creada con no_enviada", async () => {
    const { service } = altaQueDevuelve({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m" });
    const enviar = vi.fn<IBienvenidaMaestroService["enviar"]>(async () => {
      throw new Error("fallo con lucia@ejemplo.test");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => SUPERADMIN,
      service,
      bienvenida: { enviar },
      getContext: CONTEXTO_PETICION,
    });
    expect(r).toEqual({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m", bienvenida: "no_enviada" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("lucia@ejemplo.test");
    error.mockRestore();
  });

  it("si leer el contexto de la petición falla, el alta sigue en creada con no_enviada", async () => {
    const { service } = altaQueDevuelve({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m" });
    const { bienvenida, enviar } = bienvenidaDoble();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => SUPERADMIN,
      service,
      bienvenida,
      getContext: async () => {
        throw new Error("headers() fuera de una peticion");
      },
    });
    expect(r).toEqual({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m", bienvenida: "no_enviada" });
    expect(enviar).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("una empresa recién creada sin maestro encontrado cuenta como no_enviada", async () => {
    const { service } = altaQueDevuelve({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m" });
    const { bienvenida } = bienvenidaDoble({ estado: "sin_maestro" });
    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => SUPERADMIN,
      service,
      bienvenida,
      getContext: CONTEXTO_PETICION,
    });
    expect(r).toEqual({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m", bienvenida: "no_enviada" });
  });
});

describe("SL-41 R27 — sin creada, ni enlace ni correo", () => {
  it.each<AltaEmpresaResultado>([
    { estado: "ya_existe", organizacionId: ORG_NUEVA },
    { estado: "conflicto", campo: "slug" },
    { estado: "invalida", campo: "maestro.email" },
  ])("$estado: devuelve el resultado tal cual y no llama a la bienvenida", async (resultado) => {
    const { service } = altaQueDevuelve(resultado);
    const { bienvenida, enviar } = bienvenidaDoble();
    const getContext = vi.fn(CONTEXTO_PETICION);
    const r = await altaEmpresaAction(ENTRADA, { getActor: async () => SUPERADMIN, service, bienvenida, getContext });
    expect(r).toEqual(resultado);
    expect(enviar).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
  });
});

describe("SL-41 R28 — la respuesta no lleva el enlace, el secreto ni su hash", () => {
  it("aunque el servicio de bienvenida los devolviera, el JSON de la respuesta no los contiene", async () => {
    const SECRETO = "Zq3_x-Kp9LmN2oPqRsTuVwXyZ0123456789abcdEFGH";
    const ENLACE = `0b9d7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4.${SECRETO}`;
    const HASH = "$2a$12$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWX";
    const { service } = altaQueDevuelve({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m" });
    // Un doble que «se equivoca» y mete el enlace y el hash en su resultado: la action copia solo el estado.
    const conFuga = { estado: "enviada", email: "lucia@ejemplo.test", enlace: ENLACE, hash: HASH };
    const enviar = vi.fn(async () => conFuga as EnviarBienvenidaResultado);
    const r = await altaEmpresaAction(ENTRADA, {
      getActor: async () => SUPERADMIN,
      service,
      bienvenida: { enviar },
      getContext: CONTEXTO_PETICION,
    });
    const json = JSON.stringify(r);
    expect(r).toEqual({ estado: "creada", organizacionId: ORG_NUEVA, maestroId: "u-m", bienvenida: "enviada" });
    expect(json).not.toContain(SECRETO);
    expect(json).not.toContain(HASH);
    expect(json).not.toContain("enlace");
  });
});

/* -------------------------------------------------------------------------- */
/* Guardia del punto de enganche con SL-32                                     */
/* -------------------------------------------------------------------------- */

const RAIZ = path.resolve(__dirname, "../../..");
const RUTA_PLATAFORMA = path.join(RAIZ, "lib/auth/plataforma.ts");
const RUTA_EXIGIR = path.join(RAIZ, "lib/auth/exigir-superadmin.ts");

function leer(ruta: string): string {
  return readFileSync(ruta, "utf8");
}

/** Un import real (no un comentario) de `lib/auth/plataforma`, por alias o relativo. */
function importaPlataforma(texto: string): boolean {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return /\bfrom\s+["'](?:@\/lib\/auth\/|\.\/)plataforma(?:\.ts)?["']/.test(sinComentarios);
}

/** La regla: si `plataforma.ts` existe, el enganche lo importa. */
function enganchePendiente(existePlataforma: boolean, textoExigir: string): boolean {
  return existePlataforma && !importaPlataforma(textoExigir);
}

describe("R48 — guardia: el enganche no se queda en `false` por olvido", () => {
  it("en el árbol real: si lib/auth/plataforma.ts existe, exigir-superadmin.ts lo importa", () => {
    expect(existsSync(RUTA_EXIGIR)).toBe(true);
    expect(enganchePendiente(existsSync(RUTA_PLATAFORMA), leer(RUTA_EXIGIR))).toBe(false);
  });

  it("plataforma.ts existe: la guardia de arriba mira el caso que importa", () => {
    expect(existsSync(RUTA_PLATAFORMA)).toBe(true);
  });

  it("autocomprobación: detecta el olvido con el texto de hoy si plataforma.ts existiera", () => {
    const olvidado = `import type { Actor } from "@/lib/interfaces/services/IOrdenService";
// SL-32: sustituir por esPlataforma de lib/auth/plataforma.ts
// import { esPlataforma } from "@/lib/auth/plataforma";
export function exigirSuperadmin(actor: Actor | null): boolean { return false; }`;
    expect(enganchePendiente(true, olvidado)).toBe(true);
    expect(enganchePendiente(true, leer(RUTA_EXIGIR))).toBe(!importaPlataforma(leer(RUTA_EXIGIR)));
  });

  it("autocomprobación: acepta el enganche hecho, por alias o relativo", () => {
    expect(enganchePendiente(true, `import { esPlataforma } from "@/lib/auth/plataforma";`)).toBe(false);
    expect(enganchePendiente(true, `import { esPlataforma } from './plataforma';`)).toBe(false);
  });
});
