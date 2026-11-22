import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IBulkOrdenService } from "@/lib/interfaces/services/IBulkOrdenService";

// SLT-121 · T3.1 (design §6.2; R14) — la carga masiva por pantalla con la empresa congelada por mora.
//
// `POST /api/ordenes/carga-masiva/chunk` se llama con una sesión de tienda simulada. La puerta es la de
// producción (`exigirEmpresaOperativa()` con su lector por defecto); solo se sustituye la lectura del
// repositorio. El cliente de Prisma es un espía: el service de producción (sin inyectar) anotaría ahí
// cualquier lectura o escritura. Con la empresa congelada el lote entero se rechaza sin llegar a él.

const estado = vi.hoisted(() => ({ congelada: false, lecturas: 0, llamadas: [] as string[] }));

vi.mock("@/lib/repositories/MoraEmpresaRepository", () => ({
  MoraEmpresaRepository: class {
    async estaCongelada() {
      estado.lecturas += 1;
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

const { handleCargaMasivaChunk } = await import("@/app/api/ordenes/carga-masiva/chunk/route");

const TIENDA: Actor = { usuarioId: "store1", rol: "adminTienda" };
const ROW = {
  num_remision: "REM-1",
  destinatario: "Ana",
  telefono: "88887777",
  provincia: "San José",
  canton: "San José",
  distrito: "Carmen",
  producto: "Caja",
};

function peticion(body: unknown): Request {
  return new Request("http://localhost/api/ordenes/carga-masiva/chunk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function serviceQueAnota(): IBulkOrdenService {
  return {
    cargarMasiva: vi.fn().mockResolvedValue({
      status: "ok",
      summary: { total: 1, creadas: 1, duplicadas: 0, conError: 0, filas: [], cargaId: "11111111-1111-4111-8111-111111111111" },
    }),
    cargarViaApi: vi.fn(),
  };
}

const CUERPO_403 = {
  status: "error",
  code: "FORBIDDEN",
  message: "Empresa suspendida por falta de pago.",
  details: { codigo: "empresa_congelada" },
};

beforeEach(() => {
  estado.congelada = false;
  estado.lecturas = 0;
  estado.llamadas = [];
});

describe("SLT-121 · R14 — carga masiva por pantalla con la empresa congelada", () => {
  it.each([
    ["la carga", { rows: [ROW, { ...ROW, num_remision: "REM-2" }] }],
    ["la validación previa (dryRun)", { rows: [ROW], dryRun: true }],
    ["un chunk siguiente del mismo lote", { rows: [ROW], cargaId: "11111111-1111-4111-8111-111111111111" }],
  ])("%s → 403 con «Empresa suspendida por falta de pago.» y cero órdenes", async (_n, cuerpo) => {
    estado.congelada = true;
    const res = await handleCargaMasivaChunk(peticion(cuerpo), { getActor: async () => TIENDA });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(CUERPO_403);
    // El service de producción no llegó a correr: ni una lectura ni una escritura en la base.
    expect(estado.llamadas).toEqual([]);
    expect(estado.lecturas).toBe(1);
  });

  it("con un service inyectado, tampoco se le llama: el lote entero se rechaza", async () => {
    estado.congelada = true;
    const service = serviceQueAnota();
    const res = await handleCargaMasivaChunk(peticion({ rows: [ROW] }), { getActor: async () => TIENDA, bulkService: service });
    expect(res.status).toBe(403);
    expect(service.cargarMasiva).not.toHaveBeenCalled();
  });

  it("un cuerpo inválido recibe el 403, no el 422 (sesión → puerta → cuerpo)", async () => {
    estado.congelada = true;
    const res = await handleCargaMasivaChunk(peticion({ rows: [] }), { getActor: async () => TIENDA });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(CUERPO_403);
  });

  it("sin sesión sigue en 401 y otro rol en 403 genérico, sin consultar el congelamiento", async () => {
    estado.congelada = true;
    const sinSesion = await handleCargaMasivaChunk(peticion({ rows: [ROW] }), { getActor: async () => null });
    const maestro = await handleCargaMasivaChunk(peticion({ rows: [ROW] }), {
      getActor: async () => ({ usuarioId: "m1", rol: "maestro" }),
    });
    expect(sinSesion.status).toBe(401);
    expect(maestro.status).toBe(403);
    expect(await maestro.text()).not.toContain("empresa_congelada");
    expect(estado.lecturas).toBe(0);
  });

  it("control: con la empresa al día el chunk llega al service y responde 200", async () => {
    const service = serviceQueAnota();
    const res = await handleCargaMasivaChunk(peticion({ rows: [ROW] }), { getActor: async () => TIENDA, bulkService: service });
    expect(res.status).toBe(200);
    expect(service.cargarMasiva).toHaveBeenCalledTimes(1);
    expect(estado.lecturas).toBe(1);
  });
});
