import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi } from "vitest";

import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import type {
  CierreAdminResumenRow,
  ICierresAdminRepository,
} from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { SenalesColaCierre } from "@/lib/interfaces/services/ICierresAdminService";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T1.2; R109) — las señales de la
// cola en el SERVICIO, con dobles. El SQL y su `WHERE` se prueban en
// `tests/integration/db/cierres-cola-senales-sql-real.test.ts`; aquí, CONTANDO llamadas:
//   1. UNA llamada a `contarSenalesPorCierre` por página, con los ids de la página (la mutación «una
//      por fila» da N llamadas => ROJO), también con la página vacía;
//   2. cada fila lleva lo que dijo el conteo, y la que no sale en el mapa, los tres a 0;
//   3. un repositorio sin el método deja las filas SIN `senalesCola` (no afirma «0») y no rompe;
//   4. el repositorio real lo implementa y el composition root lo pasa al servicio.

const MAESTRO: Actor = { usuarioId: "adm", rol: "maestro" };
const AHORA = new Date("2026-11-10T13:00:00.000Z");
const CERO = { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" };

function row(over: Partial<CierreAdminResumenRow> & { cierreId: string }): CierreAdminResumenRow {
  return {
    pagoIndependienteEfectivo: false, // SLT-123: la marca es obligatoria en la fila del repositorio
    mensajeroId: `m-${over.cierreId}`,
    mensajeroNombre: "Ana Mensajera",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z-central",
    destinoZonaNombre: "Central",
    totales: CERO,
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-11-09T22:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    ...over,
  };
}

function fakeRepo(overrides: Partial<ICierresAdminRepository> = {}): ICierresAdminRepository {
  return {
    findCierresByAlcance: vi.fn(async () => [] as CierreAdminResumenRow[]),
    findHistoricoPaginado: vi.fn(async () => ({ items: [] as CierreAdminResumenRow[], total: 0 })),
    findColaPaginada: vi.fn(async () => ({ items: [] as CierreAdminResumenRow[], total: 0 })),
    findCierreByIdEnAlcance: vi.fn(async () => null),
    ...overrides,
  } as unknown as ICierresAdminRepository;
}

/** Doble del conteo: devuelve el mapa pedido para los ids que se le pasan. */
function conteoDoble(senales: Record<string, SenalesColaCierre>) {
  return vi.fn(async (ids: readonly string[]) => {
    const m = new Map<string, SenalesColaCierre>();
    for (const id of ids) if (senales[id]) m.set(id, senales[id]);
    return m;
  });
}

function newService(repo: ICierresAdminRepository) {
  const zonaRepo = { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository;
  const ordenRepo = {
    contarCierresAbiertosPorMensajero: vi.fn(async () => new Map()),
    findUsuarioZonaId: vi.fn(async () => null),
    findEstatusIdByValue: vi.fn(async () => null),
  } as unknown as IOrdenRepository;
  const signedUrls = { createSignedUrls: vi.fn(async () => ({})) } as unknown as ISignedUrlProvider;
  const liquidacion = {
    sumarVigentesPorCierre: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "0.00"]))),
    obtenerCierreParaPago: vi.fn(async () => null),
  };
  const premios = {
    sumarPremiosVivosPorCierre: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "0.00"]))),
  };
  return new CierresAdminService(
    repo,
    zonaRepo,
    ordenRepo,
    signedUrls,
    liquidacion,
    premios,
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    () => AHORA,
    reglasPaisFijas(),
  );
}

const pagina = { page: 1, pageSize: 10 };
const A1: SenalesColaCierre = { incidentesSinIndemnizar: 1, pagosAjustados: 2, vuelvenABodega: 6 };

describe("SLT-102 (R109) — UNA lectura de las señales por página", () => {
  it("la cola paginada con 3 filas: UNA llamada con los 3 ids (la mutación «una por fila» da 3 => ROJO)", async () => {
    const contar = conteoDoble({ c1: A1 });
    const filas = [row({ cierreId: "c1" }), row({ cierreId: "c2", estado: "vencido" }), row({ cierreId: "c3" })];
    const service = newService(
      fakeRepo({
        findColaPaginada: vi.fn(async () => ({ items: filas, total: 37 })),
        contarSenalesPorCierre: contar,
      }),
    );

    const r = await service.listarPendientesCierresAdminPaginado(pagina, MAESTRO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(contar).toHaveBeenCalledTimes(1);
    expect(contar.mock.calls[0][0]).toEqual(["c1", "c2", "c3"]);
    expect(r.items.map((i) => [i.cierreId, i.senalesCola])).toEqual([
      ["c1", { incidentesSinIndemnizar: 1, pagosAjustados: 2, vuelvenABodega: 6 }],
      ["c2", { incidentesSinIndemnizar: 0, pagosAjustados: 0, vuelvenABodega: 0 }],
      ["c3", { incidentesSinIndemnizar: 0, pagosAjustados: 0, vuelvenABodega: 0 }],
    ]);
  });

  it("el histórico paginado (aprobado y rechazado): UNA llamada y el campo en las dos filas", async () => {
    const contar = conteoDoble({ h2: { incidentesSinIndemnizar: 0, pagosAjustados: 1, vuelvenABodega: 3 } });
    const filas = [
      row({ cierreId: "h1", estado: "aprobado", resueltoAt: "2026-11-10T01:00:00.000Z" }),
      row({ cierreId: "h2", estado: "rechazado", resueltoAt: "2026-11-10T02:00:00.000Z", motivoRechazo: "x" }),
    ];
    const service = newService(
      fakeRepo({
        findHistoricoPaginado: vi.fn(async () => ({ items: filas, total: 12 })),
        contarSenalesPorCierre: contar,
      }),
    );

    const r = await service.listarHistoricoCierresAdminPaginado(pagina, MAESTRO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(contar).toHaveBeenCalledTimes(1);
    expect(contar.mock.calls[0][0]).toEqual(["h1", "h2"]);
    expect(r.items.map((i) => [i.cierreId, i.senalesCola])).toEqual([
      ["h1", { incidentesSinIndemnizar: 0, pagosAjustados: 0, vuelvenABodega: 0 }],
      ["h2", { incidentesSinIndemnizar: 0, pagosAjustados: 1, vuelvenABodega: 3 }],
    ]);
  });

  it("la página vacía también hace UNA llamada, con la lista vacía", async () => {
    const contar = conteoDoble({});
    const service = newService(fakeRepo({ contarSenalesPorCierre: contar }));

    const r = await service.listarPendientesCierresAdminPaginado(pagina, MAESTRO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.items).toEqual([]);
    expect(contar).toHaveBeenCalledTimes(1);
    expect(contar.mock.calls[0][0]).toEqual([]);
  });

  it("sin el método en el repositorio, las filas no llevan `senalesCola` (no afirman «0»)", async () => {
    const filas = [row({ cierreId: "c1" })];
    const service = newService(fakeRepo({ findColaPaginada: vi.fn(async () => ({ items: filas, total: 1 })) }));

    const r = await service.listarPendientesCierresAdminPaginado(pagina, MAESTRO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).not.toHaveProperty("senalesCola");
  });
});

describe("SLT-102 (R109) — el repositorio real lo implementa y el composition root lo pasa", () => {
  it("`CierresAdminRepository` implementa `contarSenalesPorCierre`", () => {
    expect(typeof CierresAdminRepository.prototype.contarSenalesPorCierre).toBe("function");
  });

  it("`lib/actions/cierres-admin.ts` construye el servicio con `new CierresAdminRepository(`", () => {
    const fuente = readFileSync(path.join(process.cwd(), "lib", "actions", "cierres-admin.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fuente).toMatch(/new CierresAdminService\(\s*new CierresAdminRepository\(/);
  });
});
