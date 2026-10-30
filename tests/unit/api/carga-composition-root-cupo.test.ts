import { describe, it, expect, vi, beforeEach } from "vitest";

// SL-24 (design §6.1) — LOS DOS COMPOSITION ROOTS DE LA CARGA INYECTAN EL CUPO REAL.
//
// El 4º parámetro de `BulkOrdenService` es opcional (`SIN_CUPO`) para no tocar los constructores que
// ya existen. Eso abre el modo de fallo que este repo ya midió: un route que no lo pasa deja la
// comprobación previa muerta con la suite en verde (el trigger seguiría rechazando, pero sin la
// vista previa ni el rechazo entero de R21/R22). Aquí corre el `buildBulkService()` de producción de
// cada route —sin `deps.bulkService`— y se afirma que el 4º argumento es un `CupoPlanRepository`
// que lee del cliente de Prisma de la app.

const capturados: unknown[][] = [];

vi.mock("@/lib/services/BulkOrdenService", () => ({
  BulkOrdenService: class {
    constructor(...args: unknown[]) {
      capturados.push(args);
    }
    async cargarMasiva() {
      return { status: "ok", summary: { total: 0, creadas: 0, duplicadas: 0, conError: 0, filas: [], cargaId: null } };
    }
    async cargarViaApi() {
      return {
        status: "ok",
        summary: { total: 0, creadas: 0, duplicadas: 0, conError: 0, filas: [], errores: [], ordenes: [], cargaId: null },
        manifiestoOrdenIds: [],
      };
    }
  },
}));

const queryRaw = vi.fn(async () => [{ maximo: 7, usados: 3 }]);
const prismaFalso = { $queryRaw: queryRaw };

vi.mock("@/lib/db/prisma-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/prisma-client")>()),
  getPrismaClient: () => prismaFalso,
}));

const { handleCargaMasivaChunk } = await import("@/app/api/ordenes/carga-masiva/chunk/route");
const { handleCargaApi } = await import("@/app/api/ordenes/api-key/carga/route");
const { CupoPlanRepository } = await import("@/lib/repositories/CupoPlanRepository");

function peticion(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function cuartoArgumentoInyectado(): Promise<void> {
  expect(capturados).toHaveLength(1);
  const cupo = capturados[0]?.[3];
  expect(cupo).toBeInstanceOf(CupoPlanRepository);
  // Y lee del cliente de la app, con la función de la base y la empresa del contexto de la envoltura.
  await expect((cupo as InstanceType<typeof CupoPlanRepository>).cupoOrdenes()).resolves.toEqual({ maximo: 7, usados: 3 });
  const plantilla = (queryRaw.mock.calls[0] as unknown as [TemplateStringsArray])[0].join("?");
  expect(plantilla).toContain("plan_cupo_ordenes(current_setting('app.organizacion_id', true))");
}

describe("SL-24 — composition roots de la carga de órdenes", () => {
  beforeEach(() => {
    capturados.length = 0;
    queryRaw.mockClear();
  });

  it("carga masiva por sesión (chunk/route.ts) construye BulkOrdenService con CupoPlanRepository", async () => {
    const res = await handleCargaMasivaChunk(
      peticion("http://localhost/api/ordenes/carga-masiva/chunk", { rows: [{ num_remision: "R1" }], dryRun: true }),
      { getActor: async () => ({ usuarioId: "store1", rol: "adminTienda" }) },
    );
    expect(res.status).toBe(200);
    await cuartoArgumentoInyectado();
  });

  it("carga por API key (api-key/carga/route.ts) construye BulkOrdenService con CupoPlanRepository", async () => {
    const res = await handleCargaApi(
      peticion("http://localhost/api/ordenes/api-key/carga", { ordenes: [{ num_remision: "R1" }] }, {
        Authorization: "Bearer svl_secretovivo1234567890",
      }),
      { autenticar: async () => ({ status: "ok", actor: { usuarioId: "key-user-1", rol: "apiKey" }, apiKeyId: "k1" }) },
    );
    expect(res.status).toBe(200);
    await cuartoArgumentoInyectado();
  });

  it("sin plan o sin tope, CupoPlanRepository devuelve null", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(new CupoPlanRepository(prismaFalso as never).cupoOrdenes()).resolves.toBeNull();
  });
});
