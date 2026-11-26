import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as ruta from "@/app/api/cron/recifrar-integraciones/route";
import { ConfiguracionBovedaError } from "@/lib/config/integraciones";
import type {
  IRecifradoIntegracionesService,
  OpcionesRecifrado,
  ResumenRecifrado,
} from "@/lib/interfaces/services/IRecifradoIntegracionesService";

// SLT-268 T2.1 (design §2; R6-R8, R13-R16) — `POST /api/cron/recifrar-integraciones`.
//
// El servicio es un doble (`servicio: () => doble`): aqui se mide el borde HTTP, no la regla del
// recifrado (eso lo mide `tests/integration/db/recifrado-integraciones-extra.test.ts`). El cliente
// Prisma real queda bloqueado: si algun camino lo pidiera, el test se cae en vez de tocar una base.
// Las claves y los «cifrados» se generan aqui; ningun valor real entra en el test.

const infra = vi.hoisted(() => ({
  prisma: vi.fn<() => never>(() => {
    throw new Error("el test no puede abrir el cliente Prisma real");
  }),
}));
vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: infra.prisma }));

const { handleRecifrarIntegraciones, construirServicioRecifrado } = ruta;

const SECRETO = `cron-${randomBytes(12).toString("hex")}`;
const URL_BASE = "https://servi.test/api/cron/recifrar-integraciones";
const CLAVE_A = randomBytes(32).toString("base64");
const CLAVE_B = randomBytes(32).toString("base64");
const CIFRADO = `v1:${randomBytes(24).toString("base64url")}.${randomBytes(16).toString("base64url")}`;
const ID_EMPRESA = "0b9f3a52-1c11-4e0c-9b7a-5d2a52a1e001";

const CLAVES_DEL_RESUMEN = [
  "conflictos",
  "empresasConError",
  "ilegibles",
  "porVersion",
  "recifrados",
  "soloContar",
  "versionActiva",
];

function peticion(query = "", autorizacion: string | null = `Bearer ${SECRETO}`): Request {
  const headers = new Headers();
  if (autorizacion !== null) headers.set("authorization", autorizacion);
  return new Request(`${URL_BASE}${query}`, { method: "POST", headers });
}

function resumenDe(opciones: OpcionesRecifrado, extra: Partial<ResumenRecifrado> = {}): ResumenRecifrado {
  return {
    soloContar: opciones.soloContar,
    versionActiva: "v9",
    porVersion: { v9: 3 },
    ilegibles: 0,
    recifrados: opciones.soloContar ? 0 : 3,
    conflictos: 0,
    empresasConError: 0,
    ...extra,
  };
}

/** Un doble del servicio y la fabrica que lo entrega, para saber si la ruta llego a construirlo. */
function dobles(ejecutar: IRecifradoIntegracionesService["ejecutar"] = async (o) => resumenDe(o)) {
  const servicio = { ejecutar: vi.fn(ejecutar) };
  const fabrica = vi.fn(() => servicio as IRecifradoIntegracionesService);
  return { servicio, fabrica };
}

/** Todo lo que sale por consola mientras corre `fn`. */
async function capturarConsola<T>(fn: () => Promise<T>): Promise<{ valor: T; texto: string }> {
  const trozos: string[] = [];
  const guardar = (...args: unknown[]) => {
    trozos.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a))).join(" "));
  };
  const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(guardar),
  );
  try {
    return { valor: await fn(), texto: trozos.join("\n") };
  } finally {
    for (const e of espias) e.mockRestore();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SLT-268 R6 — sin el secreto correcto: 401 sin construir el servicio ni leer el anillo", () => {
  it.each([
    ["sin cabecera", null],
    ["secreto erroneo", "Bearer otro-secreto"],
    ["sin la palabra Bearer", SECRETO],
    ["Bearer vacio", "Bearer "],
  ])("%s -> 401", async (_caso, autorizacion) => {
    const { fabrica, servicio } = dobles();
    const res = await handleRecifrarIntegraciones(peticion("?solo-contar=1", autorizacion), {
      getSecret: () => SECRETO,
      servicio: fabrica,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fabrica).not.toHaveBeenCalled();
    expect(servicio.ejecutar).not.toHaveBeenCalled();
  });

  it.each([
    ["no configurado (null)", null],
    ["vacio", ""],
  ])("CRON_SECRET %s -> 401 aunque la peticion traiga un Bearer", async (_caso, esperado) => {
    const { fabrica } = dobles();
    const res = await handleRecifrarIntegraciones(peticion("", "Bearer "), {
      getSecret: () => esperado,
      servicio: fabrica,
    });
    expect(res.status).toBe(401);
    expect(fabrica).not.toHaveBeenCalled();
  });

  it("por defecto lee CRON_SECRET del entorno: sin la variable, 401 y el anillo ni se mira", async () => {
    vi.stubEnv("CRON_SECRET", "");
    // Un anillo roto: si la ruta lo leyera antes de autorizar, saldria 500 y no 401.
    vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", "roto");
    const res = await handleRecifrarIntegraciones(peticion("", `Bearer ${SECRETO}`));
    expect(res.status).toBe(401);
    expect(infra.prisma).not.toHaveBeenCalled();
  });

  it("por defecto lee CRON_SECRET del entorno: con el secreto correcto, pasa la autorizacion", async () => {
    vi.stubEnv("CRON_SECRET", SECRETO);
    const { fabrica } = dobles();
    const res = await handleRecifrarIntegraciones(peticion("?solo-contar=1"), { servicio: fabrica });
    expect(res.status).toBe(200);
    expect(fabrica).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-268 R7 — solo POST", () => {
  it("el modulo exporta POST y no GET (Next responde 405 al GET)", () => {
    expect(typeof ruta.POST).toBe("function");
    expect("GET" in ruta).toBe(false);
    for (const metodo of ["PUT", "PATCH", "DELETE"]) expect(metodo in ruta).toBe(false);
  });
});

describe("SLT-268 R8 — un parametro no reconocido da 400 sin ejecutar ni repetir lo recibido", () => {
  it.each([
    ["errata con guion bajo", "?solo_contar=1", ["solo_contar"]],
    ["valor 0", "?solo-contar=0", []],
    ["valor true", "?solo-contar=true", ["true"]],
    ["sin valor", "?solo-contar", []],
    ["clave repetida", "?solo-contar=1&solo-contar=1", []],
    ["otro parametro junto", `?solo-contar=1&clave=${CLAVE_A}`, ["clave", CLAVE_A]],
    ["una clave pegada como nombre", `?${CLAVE_B}=1`, [CLAVE_B]],
  ])("%s -> 400", async (_caso, query, recibidos) => {
    const { fabrica, servicio } = dobles();
    const res = await handleRecifrarIntegraciones(peticion(query), { getSecret: () => SECRETO, servicio: fabrica });
    expect(res.status).toBe(400);
    const texto = await res.text();
    expect(JSON.parse(texto)).toEqual({ error: "parametro_no_reconocido" });
    for (const r of recibidos) expect(texto).not.toContain(r);
    expect(fabrica).not.toHaveBeenCalled();
    expect(servicio.ejecutar).not.toHaveBeenCalled();
  });

  it("?solo-contar=1 llama al servicio con soloContar: true; sin parametros, con false", async () => {
    const contar = dobles();
    const r1 = await handleRecifrarIntegraciones(peticion("?solo-contar=1"), {
      getSecret: () => SECRETO,
      servicio: contar.fabrica,
    });
    expect(r1.status).toBe(200);
    expect(contar.servicio.ejecutar).toHaveBeenCalledTimes(1);
    expect(contar.servicio.ejecutar).toHaveBeenCalledWith({ soloContar: true });

    const recifrar = dobles();
    const r2 = await handleRecifrarIntegraciones(peticion(""), { getSecret: () => SECRETO, servicio: recifrar.fabrica });
    expect(r2.status).toBe(200);
    expect(recifrar.servicio.ejecutar).toHaveBeenCalledTimes(1);
    expect(recifrar.servicio.ejecutar).toHaveBeenCalledWith({ soloContar: false });
  });
});

describe("SLT-268 R13 — la respuesta tiene solo las 7 claves del resumen, sin valores ni ids", () => {
  it("copia el resumen campo a campo: un campo de mas en el servicio no sale", async () => {
    // El doble devuelve, ademas del resumen, campos que nunca pueden salir. Un `...resumen` los filtraria.
    const { fabrica } = dobles(async (o) => ({
      ...resumenDe(o, { porVersion: { v1: 2, v9: 1 } }),
      clave: CLAVE_A,
      cifrado: CIFRADO,
      organizacionId: ID_EMPRESA,
      env: process.env.CRON_SECRET ?? SECRETO,
    }) as ResumenRecifrado);
    const res = await handleRecifrarIntegraciones(peticion("?solo-contar=1"), { getSecret: () => SECRETO, servicio: fabrica });
    expect(res.status).toBe(200);
    const texto = await res.text();
    const cuerpo = JSON.parse(texto) as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual(CLAVES_DEL_RESUMEN);
    expect(cuerpo).toEqual({
      soloContar: true,
      versionActiva: "v9",
      porVersion: { v1: 2, v9: 1 },
      ilegibles: 0,
      recifrados: 0,
      conflictos: 0,
      empresasConError: 0,
    });
    for (const prohibido of [CLAVE_A, CLAVE_B, CIFRADO, ID_EMPRESA, SECRETO]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});

describe("SLT-268 R14 — una empresa con error de base: 500 con el mismo resumen", () => {
  it("empresasConError > 0 -> 500 con las 7 claves, sin mensaje de error", async () => {
    const { fabrica } = dobles(async (o) => resumenDe(o, { empresasConError: 1 }));
    const res = await handleRecifrarIntegraciones(peticion(""), { getSecret: () => SECRETO, servicio: fabrica });
    expect(res.status).toBe(500);
    const cuerpo = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual(CLAVES_DEL_RESUMEN);
    expect(cuerpo.empresasConError).toBe(1);
    expect(cuerpo.recifrados).toBe(3);
  });
});

describe("SLT-268 R15 — un anillo invalido: 500 configuracion_boveda, sin valores y sin tocar la base", () => {
  it("con la composicion real de la ruta y EXTRA repitiendo una version: no recorre empresas", async () => {
    const recorrerEmpresas = vi.fn(async () => undefined);
    const prisma = { integracion: {} } as never;
    const env = {
      INTEGRACIONES_CLAVES_CIFRADO: `v1:${CLAVE_A}`,
      INTEGRACIONES_CLAVES_CIFRADO_EXTRA: `v1:${CLAVE_B}`,
      INTEGRACIONES_CLAVE_ACTIVA: "v1",
    };
    const { valor: res, texto: log } = await capturarConsola(() =>
      handleRecifrarIntegraciones(peticion(""), {
        getSecret: () => SECRETO,
        servicio: () => construirServicioRecifrado({ prisma, env, recorrerEmpresas }),
      }),
    );
    expect(res.status).toBe(500);
    const texto = await res.text();
    expect(JSON.parse(texto)).toEqual({ error: "configuracion_boveda" });
    expect(recorrerEmpresas).not.toHaveBeenCalled();
    for (const fuera of [CLAVE_A, CLAVE_B, CLAVE_A.slice(0, 8), CLAVE_B.slice(0, 8)]) {
      expect(texto).not.toContain(fuera);
      expect(log).not.toContain(fuera);
    }
    expect(texto).not.toMatch(/\bv[0-9]+\b/);
  });

  it("una ConfiguracionBovedaError del servicio -> 500 configuracion_boveda", async () => {
    const { fabrica } = dobles(async () => {
      throw new ConfiguracionBovedaError("INTEGRACIONES_CLAVE_ACTIVA no esta definida");
    });
    const res = await handleRecifrarIntegraciones(peticion(""), { getSecret: () => SECRETO, servicio: fabrica });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "configuracion_boveda" });
  });

  it("otro error cuyo mensaje lleva un cifrado: 500 recifrado_fallido, sin el mensaje en body ni log", async () => {
    const { fabrica } = dobles(async () => {
      const e = new Error(`Invalid prisma.integracion.updateMany() invocation: secretos = ${CIFRADO} ${ID_EMPRESA}`);
      (e as Error & { code?: string }).code = "P2028";
      throw e;
    });
    const { valor: res, texto: log } = await capturarConsola(() =>
      handleRecifrarIntegraciones(peticion(""), { getSecret: () => SECRETO, servicio: fabrica }),
    );
    expect(res.status).toBe(500);
    const texto = await res.text();
    expect(JSON.parse(texto)).toEqual({ error: "recifrado_fallido" });
    for (const fuera of [CIFRADO, ID_EMPRESA, "Invalid prisma"]) {
      expect(texto).not.toContain(fuera);
      expect(log).not.toContain(fuera);
    }
    // Lo que si va al log: el nombre y el codigo, para poder diagnosticar.
    expect(log).toContain("Error P2028");
  });
});

describe("SLT-268 R16 — el disparador no esta programado", () => {
  it("vercel.json no tiene un cron con el path de esta ruta", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: { path: string }[];
    };
    // Control: el archivo SI tiene crons; un JSON sin la clave pasaria el negativo sin comprobar nada.
    expect((vercel.crons ?? []).length).toBeGreaterThan(0);
    const paths = (vercel.crons ?? []).map((c) => c.path.split("?")[0]);
    expect(paths).not.toContain("/api/cron/recifrar-integraciones");
    expect(JSON.stringify(vercel)).not.toContain("recifrar-integraciones");
  });
});
