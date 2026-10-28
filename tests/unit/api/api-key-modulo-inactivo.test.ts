import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

// SL-23 · T11 (design §5.5, §3.7; R18, R33) — la API por key y la puerta de módulos.
//
// Las 9 rutas de `app/api/ordenes/api-key/**` (10 manejadores: `orden/[id]` tiene GET y DELETE) se
// llaman con un autenticador falso que da una key válida de una empresa. La lectura de módulos se
// sustituye por una lista en memoria. El cliente de Prisma es un espía: cualquier método de modelo
// o SQL que el cuerpo de la ruta llegara a ejecutar queda anotado: con Analítica apagada, `/analitica` no puede
// aparecer ninguno.

const estado = vi.hoisted(() => ({ activos: [] as string[], llamadas: [] as string[] }));

vi.mock("@/lib/repositories/ModulosActivosRepository", () => ({
  ModulosActivosRepository: class {
    async activos() {
      return [...estado.activos];
    }
  },
}));

vi.mock("@/lib/db/prisma-client", () => {
  const espia = (ruta: string): unknown =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === "then" ? undefined : espia(`${ruta}.${String(prop)}`)),
      apply: () => {
        estado.llamadas.push(ruta);
        return Promise.resolve(null);
      },
    });
  return { getPrismaClient: () => espia("prisma"), PRISMA_OMIT: {} };
});

const EMPRESA = randomUUID();
const autenticar = async () => ({
  status: "ok" as const,
  actor: { usuarioId: "u-key", rol: "adminTienda" as const },
  apiKeyId: "k-1",
  organizacionId: EMPRESA,
});

const { handleListadoApi } = await import("@/app/api/ordenes/api-key/route");
const { handleCancelarApi } = await import("@/app/api/ordenes/api-key/[numGuia]/cancelar/route");
const { handleCargaApi } = await import("@/app/api/ordenes/api-key/carga/route");
const { handleCargaGenerateApi } = await import("@/app/api/ordenes/api-key/carga/[cargaId]/generate/route");
const { handleCotizacionApi } = await import("@/app/api/ordenes/api-key/cotizacion/route");
const { handleHabilitarApi } = await import("@/app/api/ordenes/api-key/habilitar/route");
const { handleConsultaOrdenApi, handleEliminarOrdenApi } = await import("@/app/api/ordenes/api-key/orden/[id]/route");
const { handleGenerarPdfOrdenApi } = await import("@/app/api/ordenes/api-key/orden/[id]/generate/route");
const { handleAnaliticaApiKey } = await import("@/app/api/ordenes/api-key/analitica/route");

function peticion(metodo: string, ruta: string, cuerpo?: unknown): Request {
  return new Request(`http://localhost/api/ordenes/api-key${ruta}`, {
    method: metodo,
    headers: { authorization: "Bearer sk_prueba", "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

const ID = randomUUID();
const deps = { autenticar };

/** Cada manejador, con una petición que pasaría la autenticación. */
const RUTAS: [string, () => Promise<Response>][] = [
  ["GET /", () => handleListadoApi(peticion("GET", "/"), deps)],
  ["PUT /[numGuia]/cancelar", () => handleCancelarApi(peticion("PUT", "/G-1/cancelar", {}), "G-1", deps)],
  ["POST /carga", () => handleCargaApi(peticion("POST", "/carga", { ordenes: [] }), deps)],
  ["POST /carga/[cargaId]/generate", () => handleCargaGenerateApi(peticion("POST", `/carga/${ID}/generate`), ID, deps)],
  ["POST /cotizacion", () => handleCotizacionApi(peticion("POST", "/cotizacion", {}), deps)],
  ["POST /habilitar", () => handleHabilitarApi(peticion("POST", "/habilitar", {}), deps)],
  ["GET /orden/[id]", () => handleConsultaOrdenApi(peticion("GET", `/orden/${ID}`), ID, deps)],
  ["DELETE /orden/[id]", () => handleEliminarOrdenApi(peticion("DELETE", `/orden/${ID}`), ID, deps)],
  ["POST /orden/[id]/generate", () => handleGenerarPdfOrdenApi(peticion("POST", `/orden/${ID}/generate`), ID, deps)],
  ["GET /analitica", () => handleAnaliticaApiKey(peticion("GET", "/analitica"), deps)],
];

beforeEach(() => {
  estado.activos = [];
  estado.llamadas = [];
});

/** El `details.codigo` de la respuesta, si es JSON; `undefined` si no lo es (p. ej. un PDF). */
async function codigoDe(res: Response): Promise<string | undefined> {
  try {
    return ((await res.json()) as { details?: { codigo?: string } }).details?.codigo;
  } catch {
    return undefined;
  }
}

// 2026-10-27 (decisión del humano): «API e integraciones» pasó al núcleo. La key ya no exige ningún
// módulo; solo `/analitica` sigue exigiendo Analítica (R33).
describe("SL-23 · API por key: núcleo desde el 2026-10-27 (R18)", () => {
  it("control: son las 9 rutas (10 manejadores)", () => {
    expect(RUTAS).toHaveLength(10);
  });

  it.each(RUTAS.filter(([n]) => n !== "GET /analitica"))(
    "%s con TODOS los módulos apagados no responde modulo_inactivo",
    async (_nombre, llamar) => {
      const res = await llamar();
      expect(await codigoDe(res)).not.toBe("modulo_inactivo");
    },
  );

  it("con todos los módulos apagados, el cuerpo llega a la base", async () => {
    const res = await handleConsultaOrdenApi(peticion("GET", `/orden/${ID}`), ID, deps);
    expect(res.status).not.toBe(403);
    expect(estado.llamadas.length).toBeGreaterThan(0);
  });
});

describe("SL-23 · /api/ordenes/api-key/analitica exige Analítica (R33)", () => {
  it("con Analítica apagada → 403 con details.modulo = analitica, sin leer", async () => {
    const res = await handleAnaliticaApiKey(peticion("GET", "/analitica"), deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "FORBIDDEN",
      details: { codigo: "modulo_inactivo", modulo: "analitica" },
    });
    expect(estado.llamadas).toEqual([]);
  });

  it("con Analítica encendida, la puerta deja pasar", async () => {
    estado.activos = ["analitica"];
    const res = await handleAnaliticaApiKey(peticion("GET", "/analitica"), deps);
    // Lo que responda despues (el rol de la key, la validacion) ya no es la puerta de modulos.
    expect(await codigoDe(res)).not.toBe("modulo_inactivo");
  });
});
