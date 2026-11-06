import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SLT-45 (T4.1, design §2.3) — LOS COMPOSITION ROOTS PASAN EL CATALOGO GEOGRAFICO.
 *
 * `BulkOrdenService` y `CotizacionOrdenService` reciben `ICatalogoGeograficoRepository` como ULTIMO
 * parametro, OPCIONAL para que los dobles de los tests existentes compilen sin cambios (R32). Lo
 * opcional tiene un coste que este repo ya midio (feature 415): un composition root que importa la
 * dependencia y no la pasa deja la suite verde y el camino muerto. Sin el catalogo, la via v1 corre
 * sin la comprobacion de forma del pais (R5) y nada se pone rojo.
 *
 * Aqui se ejercita cada route handler SIN `deps.bulkService` / `deps.cotizacionService`, para que
 * corra el builder de produccion, y se mira con que se construyo el servicio. Los servicios son el
 * codigo real (una subclase que solo anota los argumentos del constructor); lo unico sustituido es
 * la frontera con la base (`getPrismaClient`) y el metodo de negocio, que aqui no interesa.
 */

const construidos = vi.hoisted(() => ({
  bulk: [] as unknown[][],
  cotizacion: [] as unknown[][],
}));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({}),
  PRISMA_OMIT: { orden: { busquedaTexto: true } },
}));

vi.mock("@/lib/services/BulkOrdenService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/BulkOrdenService")>();
  class BulkOrdenServiceAnotado extends real.BulkOrdenService {
    constructor(...args: ConstructorParameters<typeof real.BulkOrdenService>) {
      super(...args);
      construidos.bulk.push(args);
    }
    override async cargarViaApi() {
      return { status: "forbidden" as const };
    }
    override async cargarMasiva() {
      return { status: "forbidden" as const };
    }
  }
  return { ...real, BulkOrdenService: BulkOrdenServiceAnotado };
});

vi.mock("@/lib/services/CotizacionOrdenService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/CotizacionOrdenService")>();
  class CotizacionOrdenServiceAnotado extends real.CotizacionOrdenService {
    constructor(...args: ConstructorParameters<typeof real.CotizacionOrdenService>) {
      super(...args);
      construidos.cotizacion.push(args);
    }
    override async cotizar() {
      return { status: "forbidden" as const };
    }
  }
  return { ...real, CotizacionOrdenService: CotizacionOrdenServiceAnotado };
});

const { CatalogoGeograficoRepository } = await import(
  "@/lib/repositories/CatalogoGeograficoRepository"
);
const { handleCargaApi } = await import("@/app/api/ordenes/api-key/carga/route");
const { handleCotizacionApi } = await import("@/app/api/ordenes/api-key/cotizacion/route");
const { handleCargaMasivaChunk } = await import("@/app/api/ordenes/carga-masiva/chunk/route");

const ACTOR_KEY = { usuarioId: "u-key-1", rol: "apiKey" as const };
const autenticar = async () => ({ status: "ok" as const, actor: ACTOR_KEY, apiKeyId: "k1" });

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { authorization: "Bearer svl_secreto", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** El ultimo argumento del constructor de la unica instancia construida en la peticion. */
function ultimoArgumento(llamadas: unknown[][]): unknown {
  expect(llamadas).toHaveLength(1);
  const args = llamadas[0];
  return args[args.length - 1];
}

beforeEach(() => {
  construidos.bulk.length = 0;
  construidos.cotizacion.length = 0;
});

describe("SLT-45/T4.1 — cada composition root inyecta el catalogo geografico (design §2.3)", () => {
  it("POST /api/ordenes/api-key/carga construye BulkOrdenService con el catalogo", async () => {
    const res = await handleCargaApi(
      post("http://localhost/api/ordenes/api-key/carga", { ordenes: [{ num_remision: "R-1" }] }),
      { autenticar },
    );

    // El metodo anotado devuelve `forbidden`: se llego al builder de produccion.
    expect(res.status).toBe(403);
    expect(ultimoArgumento(construidos.bulk)).toBeInstanceOf(CatalogoGeograficoRepository);
  });

  it("POST /api/ordenes/api-key/cotizacion construye CotizacionOrdenService con el catalogo", async () => {
    const res = await handleCotizacionApi(
      post("http://localhost/api/ordenes/api-key/cotizacion", { ordenes: [{ num_remision: "R-1" }] }),
      { autenticar },
    );

    expect(res.status).toBe(403);
    expect(ultimoArgumento(construidos.cotizacion)).toBeInstanceOf(CatalogoGeograficoRepository);
  });

  it("POST /api/ordenes/carga-masiva/chunk construye BulkOrdenService con el catalogo", async () => {
    const res = await handleCargaMasivaChunk(
      post("http://localhost/api/ordenes/carga-masiva/chunk", { rows: [{ num_remision: "R-1" }] }),
      { getActor: async () => ({ usuarioId: "u-tienda-1", rol: "adminTienda" as const }) },
    );

    expect(res.status).toBe(403);
    expect(ultimoArgumento(construidos.bulk)).toBeInstanceOf(CatalogoGeograficoRepository);
  });
});
