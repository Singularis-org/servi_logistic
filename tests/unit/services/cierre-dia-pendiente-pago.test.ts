import { describe, it, expect, vi } from "vitest";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import type { ICierreDiaRepository } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { ITarifaZonaMensajeroRepository } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type {
  CierrePasadoDTO,
  LecturasPendienteCierre,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-137 (R164, R165) — el pendiente de pago de cada cierre en «Cierres solicitados».
//
// Con dobles: aqui se mide la forma (cuantas lecturas, con que ids, que estado lleva `null`). El
// SQL de las lecturas y el `WHERE` del actor se prueban contra Postgres real en
// `tests/integration/db/cierre-dia-pendiente-pago.test.ts`.

const MENSAJERO: Actor = { usuarioId: "m-1", rol: "mensajero" };

function cierre(
  cierreId: string,
  estado: CierrePasadoDTO["estado"],
  pagoDebido = "4500.00",
  efectivo = "1000.00",
): CierrePasadoDTO {
  return {
    cierreId,
    estado,
    destinoTipo: "bodega_central",
    destinoZonaId: "z-central",
    totales: { efectivo, simpe: "0.00", transferencia: "0.00", general: efectivo },
    totalPagoMensajero: pagoDebido,
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-11-01T15:00:00.000Z",
  };
}

function repoConPagina(items: CierrePasadoDTO[]) {
  const findCierresByMensajero = vi.fn(async () => items);
  const repo = {
    findCierresByMensajeroPaginado: vi.fn(async () => ({ items, total: items.length })),
    findCierresByMensajero,
  } as unknown as ICierreDiaRepository;
  return { repo, findCierresByMensajero };
}

function lecturas(pagados: Record<string, string> = {}, premios: Record<string, string> = {}) {
  const sumarVigentesPorCierre = vi.fn<(ids: string[]) => Promise<Record<string, string>>>(
    async () => pagados,
  );
  const sumarPremiosVivosPorCierre = vi.fn<(ids: string[]) => Promise<Record<string, string>>>(
    async () => premios,
  );
  const pendientes: LecturasPendienteCierre = {
    liquidaciones: { sumarVigentesPorCierre },
    premios: { sumarPremiosVivosPorCierre },
  };
  return { pendientes, sumarVigentesPorCierre, sumarPremiosVivosPorCierre };
}

function servicio(repo: ICierreDiaRepository, pendientes?: LecturasPendienteCierre) {
  return new CierreDiaService(
    repo,
    {} as unknown as IZonaRepository,
    {} as unknown as IOrdenRepository,
    {} as unknown as ISignedUrlProvider,
    {} as unknown as ITarifaZonaMensajeroRepository,
    undefined,
    undefined,
    reglasPaisFijas(),
    pendientes,
  );
}

async function pagina(svc: CierreDiaService, pageSize = 10) {
  const r = await svc.listarCierresPasadosPaginado({ page: 1, pageSize }, MENSAJERO);
  if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
  return r.items;
}

describe("SLT-137 — pendiente de pago en el listado paginado del mensajero", () => {
  it("lee pagos y premios UNA vez por pagina, sea de 1 o de 10 cierres (R165)", async () => {
    const uno = [cierre("c-1", "aprobado")];
    const diez = Array.from({ length: 10 }, (_, i) => cierre(`c-${i + 1}`, "aprobado"));

    for (const items of [uno, diez]) {
      const l = lecturas();
      await pagina(servicio(repoConPagina(items).repo, l.pendientes));
      expect(l.sumarVigentesPorCierre).toHaveBeenCalledTimes(1);
      expect(l.sumarPremiosVivosPorCierre).toHaveBeenCalledTimes(1);
    }
  });

  it("solo los aprobados llegan a las lecturas y los demas estados salen null (R164)", async () => {
    const items = [
      cierre("c-apr", "aprobado"),
      cierre("c-sol", "solicitado"),
      cierre("c-rec", "rechazado"),
      cierre("c-ven", "vencido"),
    ];
    const l = lecturas({ "c-apr": "1000.00" }, {});

    const filas = await pagina(servicio(repoConPagina(items).repo, l.pendientes));

    expect(l.sumarVigentesPorCierre).toHaveBeenCalledWith(["c-apr"]);
    expect(l.sumarPremiosVivosPorCierre).toHaveBeenCalledWith(["c-apr"]);
    // P 4 500, E 1 000 → generado 3 500; menos 1 000 pagado → 2 500.
    expect(filas.map((f) => [f.cierreId, f.pendientePagoMensajero])).toEqual([
      ["c-apr", "2500.00"],
      ["c-sol", null],
      ["c-rec", null],
      ["c-ven", null],
    ]);
  });

  it("suma el premio vivo y nunca da negativo (R164)", async () => {
    const items = [
      cierre("c-premio", "aprobado", "1000.00", "0.00"),
      cierre("c-sobrepagado", "aprobado", "2000.00", "5000.00"),
    ];
    const l = lecturas({ "c-sobrepagado": "300.00" }, { "c-premio": "250.00" });

    const filas = await pagina(servicio(repoConPagina(items).repo, l.pendientes));

    expect(filas.map((f) => f.pendientePagoMensajero)).toEqual(["1250.00", "0.00"]);
  });

  it("con una pagina sin aprobados las lecturas se llaman igual, con la lista vacia (R165)", async () => {
    const l = lecturas();
    const filas = await pagina(servicio(repoConPagina([cierre("c-sol", "solicitado")]).repo, l.pendientes));

    expect(l.sumarVigentesPorCierre).toHaveBeenCalledWith([]);
    expect(l.sumarPremiosVivosPorCierre).toHaveBeenCalledWith([]);
    expect(filas[0].pendientePagoMensajero).toBeNull();
  });

  it("sin las lecturas inyectadas ningun item trae la propiedad (R165: nada inventado)", async () => {
    const items = [cierre("c-apr", "aprobado"), cierre("c-sol", "solicitado")];

    const filas = await pagina(servicio(repoConPagina(items).repo));

    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f).not.toHaveProperty("pendientePagoMensajero");
  });

  it("el archivo de «Descargar» (listado completo) no lee pagos ni premios (R159)", async () => {
    const items = [cierre("c-apr", "aprobado")];
    const l = lecturas();
    const { repo, findCierresByMensajero } = repoConPagina(items);

    const r = await servicio(repo, l.pendientes).listarCierresPasadosCompleto(MENSAJERO);

    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    expect(findCierresByMensajero).toHaveBeenCalledTimes(1);
    expect(l.sumarVigentesPorCierre).not.toHaveBeenCalled();
    expect(l.sumarPremiosVivosPorCierre).not.toHaveBeenCalled();
    expect(r.items[0]).not.toHaveProperty("pendientePagoMensajero");
  });

  it("un rol que no es mensajero no llega a leer pagos ni premios (la autorizacion de la 37 va antes)", async () => {
    const l = lecturas();
    const r = await servicio(repoConPagina([cierre("c-apr", "aprobado")]).repo, l.pendientes)
      .listarCierresPasadosPaginado({ page: 1, pageSize: 10 }, { usuarioId: "a-1", rol: "admin" });

    expect(r.status).toBe("forbidden");
    expect(l.sumarVigentesPorCierre).not.toHaveBeenCalled();
  });
});
