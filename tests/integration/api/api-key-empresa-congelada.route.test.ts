import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";

// SLT-121 · T3.1 (design §6.2, §6.3; R13) — la API por key con la empresa congelada por mora.
//
// Las seis rutas de escritura se llaman con un autenticador falso que da una key válida de una empresa y SIN
// servicios inyectados: corren sus constructores de producción sobre un cliente de Prisma espía, que anota
// cualquier método de modelo o SQL que el cuerpo de la ruta llegara a ejecutar. Con la empresa congelada no
// puede aparecer ninguno («sin efectos»). La puerta tampoco se inyecta: es la de producción
// (`exigirEmpresaOperativa()` con su lector por defecto), y solo se sustituye la lectura del repositorio, que
// anota con qué contexto se la llamó. La lectura real contra Postgres la prueba
// `tests/integration/repositories/mora-empresa-repository.test.ts` (R33).

const estado = vi.hoisted(() => ({
  congelada: false,
  lecturas: [] as (ContextoDatos | undefined)[],
  llamadas: [] as string[],
}));

vi.mock("@/lib/repositories/MoraEmpresaRepository", () => ({
  MoraEmpresaRepository: class {
    async estaCongelada() {
      estado.lecturas.push(contextoActual());
      return estado.congelada;
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
const ACTOR = { usuarioId: "u-key", rol: "apiKey" as const };
const autenticar = async () => ({ status: "ok" as const, actor: ACTOR, apiKeyId: "k-1", organizacionId: EMPRESA });

const { handleListadoApi } = await import("@/app/api/ordenes/api-key/route");
const { handleCancelarApi } = await import("@/app/api/ordenes/api-key/[numGuia]/cancelar/route");
const { handleCargaApi } = await import("@/app/api/ordenes/api-key/carga/route");
const { handleCargaGenerateApi } = await import("@/app/api/ordenes/api-key/carga/[cargaId]/generate/route");
const { handleCotizacionApi } = await import("@/app/api/ordenes/api-key/cotizacion/route");
const { handleHabilitarApi } = await import("@/app/api/ordenes/api-key/habilitar/route");
const { handleConsultaOrdenApi, handleEliminarOrdenApi } = await import("@/app/api/ordenes/api-key/orden/[id]/route");
const { handleGenerarPdfOrdenApi } = await import("@/app/api/ordenes/api-key/orden/[id]/generate/route");

function peticion(metodo: string, ruta: string, cuerpo?: unknown): Request {
  return new Request(`http://localhost/api/ordenes/api-key${ruta}`, {
    method: metodo,
    headers: { authorization: "Bearer svl_prueba", "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

const ID = randomUUID();
const deps = { autenticar };

const FILA = {
  num_remision: "REM-1",
  destinatario: "Ana",
  telefono: "88887777",
  provincia: "San José",
  canton: "San José",
  distrito: "Carmen",
  producto: "Caja",
};

/** Las seis rutas de escritura (design §6.2), con una petición válida que llegaría al service. */
const ESCRITURAS: [string, () => Promise<Response>][] = [
  ["POST /carga", () => handleCargaApi(peticion("POST", "/carga", { ordenes: [FILA] }), deps)],
  ["POST /carga/[cargaId]/generate", () => handleCargaGenerateApi(peticion("POST", `/carga/${ID}/generate`), ID, deps)],
  [
    "POST /habilitar",
    () => handleHabilitarApi(peticion("POST", "/habilitar", { ordenes: [{ num_guia: 10234, nota: "Llamar antes" }] }), deps),
  ],
  ["PUT /[numGuia]/cancelar", () => handleCancelarApi(peticion("PUT", "/10234/cancelar"), "10234", deps)],
  ["POST /orden/[id]/generate", () => handleGenerarPdfOrdenApi(peticion("POST", `/orden/${ID}/generate`), ID, deps)],
  ["DELETE /orden/[id]", () => handleEliminarOrdenApi(peticion("DELETE", `/orden/${ID}`), ID, deps)],
];

/** Las mismas seis con un cuerpo o un path inválido: sin la puerta responderían 422. */
const ESCRITURAS_INVALIDAS: [string, () => Promise<Response>][] = [
  ["POST /carga", () => handleCargaApi(peticion("POST", "/carga", { ordenes: "no" }), deps)],
  ["POST /carga/[cargaId]/generate", () => handleCargaGenerateApi(peticion("POST", "/carga/x/generate"), "x", deps)],
  ["POST /habilitar", () => handleHabilitarApi(peticion("POST", "/habilitar", { nada: 1 }), deps)],
  ["PUT /[numGuia]/cancelar", () => handleCancelarApi(peticion("PUT", "/abc/cancelar"), "abc", deps)],
  ["POST /orden/[id]/generate", () => handleGenerarPdfOrdenApi(peticion("POST", "/orden/%20/generate"), "", deps)],
  ["DELETE /orden/[id]", () => handleEliminarOrdenApi(peticion("DELETE", "/orden/%20"), "", deps)],
];

const CUERPO_403 = {
  status: "error",
  code: "FORBIDDEN",
  message: "Empresa suspendida por falta de pago.",
  details: { codigo: "empresa_congelada" },
};

beforeEach(() => {
  estado.congelada = false;
  estado.lecturas = [];
  estado.llamadas = [];
});

describe("SLT-121 · R13 — la API por key con la empresa congelada", () => {
  it("control: son las seis rutas de escritura de design §6.2", () => {
    expect(ESCRITURAS.map(([n]) => n)).toHaveLength(6);
    expect(ESCRITURAS_INVALIDAS.map(([n]) => n)).toEqual(ESCRITURAS.map(([n]) => n));
  });

  it.each(ESCRITURAS)("%s → 403 con el cuerpo exacto y sin tocar la base", async (_nombre, llamar) => {
    estado.congelada = true;
    const res = await llamar();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(CUERPO_403);
    expect(estado.llamadas).toEqual([]);
  });

  it.each(ESCRITURAS)("%s lee el congelamiento una vez, con la empresa de la key", async (_nombre, llamar) => {
    estado.congelada = true;
    await llamar();
    expect(estado.lecturas).toEqual([{ tipo: "empresa", organizacionId: EMPRESA }]);
  });

  it.each(ESCRITURAS_INVALIDAS)("%s con entrada inválida → 403, no 422 (auth → puerta → cuerpo)", async (_n, llamar) => {
    estado.congelada = true;
    const res = await llamar();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(CUERPO_403);
  });

  it.each(ESCRITURAS_INVALIDAS)("control: %s con la empresa al día sigue respondiendo 422", async (_n, llamar) => {
    const res = await llamar();
    expect(res.status).toBe(422);
  });

  it.each(ESCRITURAS)("control: %s con la empresa al día pasa la puerta y llega a la base", async (_n, llamar) => {
    const res = await llamar();
    expect(await res.clone().text()).not.toContain("empresa_congelada");
    expect(estado.llamadas.length).toBeGreaterThan(0);
  });

  it("una key sin credencial válida sigue en 401 y no consulta el congelamiento", async () => {
    estado.congelada = true;
    const res = await handleCancelarApi(peticion("PUT", "/10234/cancelar"), "10234", {
      autenticar: async () => ({ status: "unauthenticated" as const }),
    });
    expect(res.status).toBe(401);
    expect(estado.lecturas).toEqual([]);
  });

  it("el descongelamiento vale desde la petición siguiente (sin memoria entre peticiones)", async () => {
    const llamar = ESCRITURAS[5][1];
    estado.congelada = true;
    expect((await llamar()).status).toBe(403);
    estado.congelada = false;
    const res = await llamar();
    expect(await res.text()).not.toContain("empresa_congelada");
    expect(estado.lecturas).toHaveLength(2);
  });
});

describe("SLT-121 · R13 — las consultas y la cotización responden igual con la empresa congelada", () => {
  beforeEach(() => {
    estado.congelada = true;
  });

  it("GET / (listado) → 200 y no consulta el congelamiento", async () => {
    const res = await handleListadoApi(peticion("GET", "/"), {
      autenticar,
      lecturaService: {
        listar: vi.fn(async () => ({ items: [], pagination: { limit: 50, offset: 0, total: 0 } })),
        detallePorOrdenId: vi.fn(),
      } as never,
    });
    expect(res.status).toBe(200);
    expect(estado.lecturas).toEqual([]);
  });

  it("GET /orden/[id] (detalle) → 200 y no consulta el congelamiento", async () => {
    const detalle = { numGuia: 10234 };
    const res = await handleConsultaOrdenApi(peticion("GET", `/orden/${ID}`), ID, {
      autenticar,
      resolucionService: { resolver: vi.fn(async () => ({ status: "ok", orden: { id: ID } })) } as never,
      detallePorOrdenId: async () => detalle as never,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(detalle);
    expect(estado.lecturas).toEqual([]);
  });

  it("POST /cotizacion → 200 (no escribe) y no consulta el congelamiento", async () => {
    const resumen = { filas: [], errores: [] };
    const res = await handleCotizacionApi(peticion("POST", "/cotizacion", { ordenes: [FILA] }), {
      autenticar,
      cotizacionService: { cotizar: vi.fn(async () => ({ status: "ok", resumen })) } as never,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(resumen);
    expect(estado.lecturas).toEqual([]);
  });
});
