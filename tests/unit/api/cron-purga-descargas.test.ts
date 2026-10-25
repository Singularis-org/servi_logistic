import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { PurgaDescargasResultado } from "@/lib/interfaces/services/IPurgaDescargasService";
import type { IAlmacenDescargas } from "@/lib/interfaces/external/IAlmacenDescargas";
import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import type { AlmacenStorageClientLike, ObjetoListado } from "@/lib/storage/SupabaseAlmacenDescargas";

// Ficha 470 (T2.3, R17–R20) — el cron de purga de las descargas temporales. Los dobles del composition
// root impiden que ningun camino construya el Storage real (el `.env` local apunta a PRODUCCION).
const infra = vi.hoisted(() => ({
  almacenCtor: vi.fn<(...args: unknown[]) => void>(),
  serviceCtor: vi.fn<(...args: unknown[]) => void>(),
  ejecutar: vi.fn<(now: Date) => Promise<PurgaDescargasResultado>>(async () => ({ objetosBorrados: 0, quedaPendiente: false })),
  // SL-19 (R21): el GET real recorre las empresas con `paraCadaEmpresa`, que las lista con este
  // cliente. Una sola empresa: el composition root se sigue construyendo una vez.
  prisma: vi.fn<() => unknown>(() => ({ organizacion: { findMany: async () => [{ id: "org-doble" }] } })),
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: infra.prisma }));

vi.mock("@/lib/storage/SupabaseAlmacenDescargas", () => ({
  SupabaseAlmacenDescargas: class {
    constructor(...args: unknown[]) {
      infra.almacenCtor(...args);
    }
  },
}));
vi.mock("@/lib/services/PurgaDescargasService", async (original) => {
  const real = await original<typeof import("@/lib/services/PurgaDescargasService")>();
  return {
    ...real,
    PurgaDescargasService: class {
      ejecutar = infra.ejecutar;
      constructor(...args: unknown[]) {
        infra.serviceCtor(...args);
      }
    },
  };
});

import { GET, handlePurgaDescargas, maxDuration, runtime } from "@/app/api/cron/purga-descargas/route";

const SECRETO = "s3cr3t";
const conAuth = (token?: string) =>
  new Request("http://localhost/api/cron/purga-descargas", token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  infra.almacenCtor.mockClear();
  infra.serviceCtor.mockClear();
  infra.ejecutar.mockClear();
});

describe("R19 — sin el secreto correcto: 401 y NADA se construye ni se lee", () => {
  it.each([
    ["sin header", conAuth(), SECRETO],
    ["secreto incorrecto", conAuth("otro"), SECRETO],
    ["secreto no configurado (null)", conAuth(SECRETO), null],
    ["secreto no configurado (vacio)", conAuth(""), ""],
  ])("%s ⇒ 401", async (_caso, req, esperado) => {
    const service = { ejecutar: vi.fn() };
    const res = await handlePurgaDescargas(req, { getSecret: () => esperado, service });
    expect(res.status).toBe(401);
    expect(service.ejecutar).not.toHaveBeenCalled();
    expect(infra.almacenCtor).not.toHaveBeenCalled();
    expect(infra.serviceCtor).not.toHaveBeenCalled();
  });

  it("el GET real sin header tambien es 401 sin construir nada", async () => {
    const res = await GET(conAuth());
    expect(res.status).toBe(401);
    expect(infra.almacenCtor).not.toHaveBeenCalled();
  });
});

describe("R20 — 200 con SOLO conteos", () => {
  // SL-19 (m3 de la revision): siempre por el camino real, recorriendo empresas (aqui, una).
  const unaEmpresa = (): ClienteDeOrganizaciones => ({
    organizacion: { findMany: vi.fn(async () => [{ id: "11111111-1111-4111-8111-111111111111" }]) },
  });

  it("el cuerpo es exactamente { objetosBorrados, quedaPendiente, empresas }", async () => {
    const service = { ejecutar: vi.fn(async () => ({ objetosBorrados: 7, quedaPendiente: true, ruta: "tmp/x.json.gz" }) as never) };
    const res = await handlePurgaDescargas(conAuth(SECRETO), { getSecret: () => SECRETO, service, empresas: unaEmpresa() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objetosBorrados: 7, quedaPendiente: true, empresas: { procesadas: 1, fallidas: [] } });
  });

  it("un fallo del servicio en una empresa queda en empresas.fallidas, sin rutas", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const service = { ejecutar: vi.fn(async () => Promise.reject(new Error("fallo al borrar descargas temporales: tmp/x.json.gz"))) };
      const res = await handlePurgaDescargas(conAuth(SECRETO), { getSecret: () => SECRETO, service, empresas: unaEmpresa() });
      expect(res.status).toBe(200);
      const cuerpo = await res.json();
      expect(cuerpo).toEqual({
        objetosBorrados: 0,
        quedaPendiente: false,
        empresas: { procesadas: 0, fallidas: ["11111111-1111-4111-8111-111111111111"] },
      });
      expect(JSON.stringify(cuerpo)).not.toMatch(/tmp\//);
    } finally {
      consola.mockRestore();
    }
  });

  it("si no se pueden listar las empresas, sale con codigo de error (no 200) y sin tocar el servicio", async () => {
    const service = { ejecutar: vi.fn() };
    const empresas: ClienteDeOrganizaciones = {
      organizacion: { findMany: vi.fn(async () => Promise.reject(new Error("sin base"))) },
    };
    const res = await handlePurgaDescargas(conAuth(SECRETO), { getSecret: () => SECRETO, service, empresas });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(service.ejecutar).not.toHaveBeenCalled();
  });
});

describe("R17 — el corte es now − RETENCION_MINUTOS exacto", () => {
  it("PurgaDescargasService pide al almacen el corte exacto y el tope por corrida", async () => {
    const { PurgaDescargasService, MAX_OBJETOS_POR_CORRIDA } = await vi.importActual<typeof import("@/lib/services/PurgaDescargasService")>(
      "@/lib/services/PurgaDescargasService",
    );
    const purgarAnterioresA = vi.fn<IAlmacenDescargas["purgarAnterioresA"]>(async () => ({ borrados: 3, quedaPendiente: false }));
    const almacen: IAlmacenDescargas = { guardar: vi.fn(), firmar: vi.fn(), purgarAnterioresA };
    const leer = vi.fn(() => ({ RETENCION_MINUTOS: 60 }));
    const now = new Date("2026-10-02T12:00:00.000Z");
    const r = await new PurgaDescargasService(almacen, leer).ejecutar(now);
    expect(purgarAnterioresA).toHaveBeenCalledWith(new Date("2026-10-02T11:00:00.000Z"), MAX_OBJETOS_POR_CORRIDA);
    expect(MAX_OBJETOS_POR_CORRIDA).toBe(5000);
    expect(r).toEqual({ objetosBorrados: 3, quedaPendiente: false });
    // La retencion se lee EN CADA corrida.
    leer.mockReturnValue({ RETENCION_MINUTOS: 15 });
    await new PurgaDescargasService(almacen, leer).ejecutar(now);
    expect(purgarAnterioresA).toHaveBeenLastCalledWith(new Date("2026-10-02T11:45:00.000Z"), 5000);
  });

  it("el GET real construye el almacen con el bucket «descargas» y pasa el reloj al servicio", async () => {
    vi.stubEnv("CRON_SECRET", SECRETO);
    try {
      const res = await GET(conAuth(SECRETO));
      expect(res.status).toBe(200);
      expect(infra.almacenCtor).toHaveBeenCalledWith(undefined, "descargas");
      expect(infra.ejecutar).toHaveBeenCalledTimes(1);
      expect(infra.ejecutar.mock.calls[0][0]).toBeInstanceOf(Date);
      expect(await res.json()).toEqual({ objetosBorrados: 0, quedaPendiente: false, empresas: { procesadas: 1, fallidas: [] } });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("runtime nodejs y maxDuration 60", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
  });
});

describe("R18 — vercel.json la programa al menos cada 15 minutos", () => {
  it("la ruta esta en los crons con */15 (o mas frecuente)", () => {
    const json = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entradas = json.crons.filter((c) => c.path === "/api/cron/purga-descargas");
    expect(entradas).toHaveLength(1);
    const m = /^\*\/(\d+) \* \* \* \*$/.exec(entradas[0].schedule) ?? /^(\*) \* \* \* \*$/.exec(entradas[0].schedule);
    expect(m, `cadencia no reconocida: ${entradas[0].schedule}`).not.toBeNull();
    const cada = m![1] === "*" ? 1 : Number(m![1]);
    expect(cada).toBeLessThanOrEqual(15);
  });
});

/* -------------------------------------------------------------------------- */
/* SL-19 · R21 — una purga por empresa, con el almacen y el servicio reales    */
/* -------------------------------------------------------------------------- */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AHORA = new Date("2026-10-25T12:00:00.000Z");
const VIEJO = "2026-10-25T09:00:00.000Z"; // fuera de la retencion de 60 min
const RECIENTE = "2026-10-25T11:50:00.000Z"; // dentro

/**
 * Bucket en memoria con rutas completas. `list` devuelve los hijos directos del prefijo, como
 * Storage; `listaFalla` hace fallar el listado de la carpeta de esa empresa.
 */
function bucketDoble(inicial: Record<string, string>, listaFalla?: string) {
  const objetos = new Map(Object.entries(inicial));
  const list = vi.fn(async (prefijo: string) => {
    if (listaFalla !== undefined && prefijo.startsWith(`${listaFalla}/`)) {
      return { data: null, error: { message: "timeout", statusCode: "500" } };
    }
    const data: ObjetoListado[] = [...objetos.entries()]
      .filter(([k]) => k.startsWith(`${prefijo}/`) && !k.slice(prefijo.length + 1).includes("/"))
      .map(([k, creado]) => ({ name: k.slice(prefijo.length + 1), id: k, created_at: creado }))
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    return { data, error: null };
  });
  const remove = vi.fn(async (paths: string[]) => {
    for (const p of paths) objetos.delete(p);
    return { data: [], error: null };
  });
  const cliente = {
    from: () => ({ list, remove, upload: vi.fn(), createSignedUrl: vi.fn() }),
    createBucket: vi.fn(),
  } as unknown as AlmacenStorageClientLike;
  return { cliente, list, remove, restantes: () => [...objetos.keys()].sort() };
}

async function serviceReal(cliente: AlmacenStorageClientLike) {
  const { SupabaseAlmacenDescargas } = await vi.importActual<typeof import("@/lib/storage/SupabaseAlmacenDescargas")>(
    "@/lib/storage/SupabaseAlmacenDescargas",
  );
  const { PurgaDescargasService } = await vi.importActual<typeof import("@/lib/services/PurgaDescargasService")>(
    "@/lib/services/PurgaDescargasService",
  );
  return new PurgaDescargasService(new SupabaseAlmacenDescargas(cliente, "descargas"), () => ({ RETENCION_MINUTOS: 60 }));
}

const empresasDoble = (ids: string[]): ClienteDeOrganizaciones => ({
  organizacion: { findMany: vi.fn(async () => ids.map((id) => ({ id }))) },
});

describe("SL-19 · R21 — la purga corre en la carpeta de cada empresa", () => {
  const SEMBRADO = {
    [`${ORG_A}/tmp/a1.json.gz`]: VIEJO,
    [`${ORG_A}/tmp/a2.json.gz`]: VIEJO,
    [`${ORG_B}/tmp/b1.json.gz`]: VIEJO,
    [`${ORG_B}/tmp/b2.json.gz`]: RECIENTE,
    // Lo de antes de SL-19, fuera de toda carpeta: no es de ninguna empresa y la purga no lo alcanza.
    "tmp/raiz.json.gz": VIEJO,
  };

  it("dos empresas: purga lo vencido de cada carpeta y responde con los conteos sumados", async () => {
    const b = bucketDoble(SEMBRADO);
    const res = await handlePurgaDescargas(conAuth(SECRETO), {
      getSecret: () => SECRETO,
      now: () => AHORA,
      service: await serviceReal(b.cliente),
      empresas: empresasDoble([ORG_A, ORG_B]),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objetosBorrados: 3, quedaPendiente: false, empresas: { procesadas: 2, fallidas: [] } });
    expect(b.restantes()).toEqual([`${ORG_B}/tmp/b2.json.gz`, "tmp/raiz.json.gz"]);
    expect(b.list.mock.calls.map((c) => c[0])).toEqual([`${ORG_A}/tmp`, `${ORG_B}/tmp`]);
  });

  it("el fallo de una empresa no frena a la otra: 200, la otra purgada y la fallida en el resumen", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const b = bucketDoble(SEMBRADO, ORG_A);
      const res = await handlePurgaDescargas(conAuth(SECRETO), {
        getSecret: () => SECRETO,
        now: () => AHORA,
        service: await serviceReal(b.cliente),
        empresas: empresasDoble([ORG_A, ORG_B]),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ objetosBorrados: 1, quedaPendiente: false, empresas: { procesadas: 1, fallidas: [ORG_A] } });
      expect(b.restantes()).toEqual([
        `${ORG_A}/tmp/a1.json.gz`,
        `${ORG_A}/tmp/a2.json.gz`,
        `${ORG_B}/tmp/b2.json.gz`,
        "tmp/raiz.json.gz",
      ]);
    } finally {
      consola.mockRestore();
    }
  });

  it("sin empresas: 200 en cero, sin tocar Storage", async () => {
    const b = bucketDoble(SEMBRADO);
    const res = await handlePurgaDescargas(conAuth(SECRETO), {
      getSecret: () => SECRETO,
      now: () => AHORA,
      service: await serviceReal(b.cliente),
      empresas: empresasDoble([]),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objetosBorrados: 0, quedaPendiente: false, empresas: { procesadas: 0, fallidas: [] } });
    expect(b.list).not.toHaveBeenCalled();
    expect(b.remove).not.toHaveBeenCalled();
  });
});
