import { describe, it, expect, vi } from "vitest";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import type { ICierreDiaRepository } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FiltrosColaPropia } from "@/lib/types/filtros-cierres";

// SLT-138 (R169, R171, R172, R173) — el servicio de «Cierres solicitados» con el bloque `filtros`:
// qué le llega al repositorio, cuándo se lee la zona del país y cuándo NO se lee la base.
// Que el repositorio traduzca bien esos filtros a SQL lo prueba
// `tests/integration/db/cierre-dia-filtros-propios.test.ts`.

const MENSAJERO: Actor = { usuarioId: "m-a", rol: "mensajero" };
const PAGINA = { page: 1, pageSize: 25 };

function montar() {
  const findCierresByMensajeroPaginado = vi.fn(async () => ({ items: [], total: 0 }));
  const findCierresByMensajero = vi.fn(async () => []);
  const repo = {
    findCierresByMensajeroPaginado,
    findCierresByMensajero,
  } as unknown as ICierreDiaRepository;
  const zonaHoraria = vi.fn(async () => "America/Costa_Rica");
  const reglas: Pick<IReglasPaisEmpresa, "zonaHoraria"> = { zonaHoraria };
  const svc = new CierreDiaService(
    repo,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    reglas,
  );
  return { svc, findCierresByMensajeroPaginado, findCierresByMensajero, zonaHoraria };
}

async function ambos(filtros: FiltrosColaPropia | undefined) {
  const m = montar();
  const pagina = await m.svc.listarCierresPasadosPaginado({ ...PAGINA, filtros }, MENSAJERO);
  const archivo = await m.svc.listarCierresPasadosCompleto(MENSAJERO, filtros);
  return { ...m, pagina, archivo };
}

describe("SLT-138 — CierreDiaService con los filtros del mensajero", () => {
  it("sin filtros (o con un bloque que no recorta), la llamada al repo es la de antes (R173)", async () => {
    for (const filtros of [undefined, {}, { folio: "   " }, { folio: "#" }]) {
      const m = await ambos(filtros);
      const etiqueta = JSON.stringify(filtros);
      expect(m.findCierresByMensajeroPaginado.mock.calls[0], etiqueta).toEqual([
        "m-a",
        { skip: 0, take: 25 },
      ]);
      expect(m.findCierresByMensajero.mock.calls[0], etiqueta).toEqual(["m-a"]);
      expect(m.zonaHoraria, etiqueta).not.toHaveBeenCalled();
    }
  });

  it("folio imposible → cero cierres y total 0 SIN llamar al repositorio ni leer la zona (R171)", async () => {
    for (const folio of ["ZZ", "3F2A00010", "3F-2A", "%"]) {
      const m = await ambos({ folio, desde: "2026-11-04" });
      expect(m.pagina, folio).toEqual({ status: "ok", items: [], page: 1, pageSize: 25, total: 0 });
      expect(m.archivo, folio).toEqual({ status: "ok", items: [], total: 0 });
      expect(m.findCierresByMensajeroPaginado, folio).not.toHaveBeenCalled();
      expect(m.findCierresByMensajero, folio).not.toHaveBeenCalled();
      expect(m.zonaHoraria, folio).not.toHaveBeenCalled();
    }
  });

  it("con rango, lee la zona y pasa los límites en hora del país; límite superior exclusivo (R169)", async () => {
    const m = await ambos({ desde: "2026-11-04", hasta: "2026-11-04" });
    const esperado = {
      solicitadoDesde: new Date("2026-11-04T06:00:00.000Z"),
      solicitadoHasta: new Date("2026-11-05T06:00:00.000Z"),
    };
    expect(m.findCierresByMensajeroPaginado.mock.calls[0]).toEqual(["m-a", { skip: 0, take: 25 }, esperado]);
    expect(m.findCierresByMensajero.mock.calls[0]).toEqual(["m-a", esperado]);
    expect(m.zonaHoraria).toHaveBeenCalledTimes(2); // una por operación
  });

  it("sin rango no lee la zona; el estado y el folio normalizado viajan tal cual (R170, R171)", async () => {
    const m = await ambos({ estados: ["aprobado"], folio: " #3f2a " });
    const esperado = { estados: ["aprobado"], folio: "3F2A" };
    expect(m.findCierresByMensajeroPaginado.mock.calls[0]).toEqual(["m-a", { skip: 0, take: 25 }, esperado]);
    expect(m.findCierresByMensajero.mock.calls[0]).toEqual(["m-a", esperado]);
    expect(m.zonaHoraria).not.toHaveBeenCalled();
  });

  it("un actor que no es mensajero → forbidden antes de todo, con o sin filtros", async () => {
    const admin: Actor = { usuarioId: "u-admin", rol: "admin" };
    const m = montar();
    const filtros = { desde: "2026-11-04", folio: "ZZ" };
    expect(await m.svc.listarCierresPasadosPaginado({ ...PAGINA, filtros }, admin)).toEqual({
      status: "forbidden",
    });
    expect(await m.svc.listarCierresPasadosCompleto(admin, filtros)).toEqual({ status: "forbidden" });
    expect(m.findCierresByMensajeroPaginado).not.toHaveBeenCalled();
    expect(m.findCierresByMensajero).not.toHaveBeenCalled();
    expect(m.zonaHoraria).not.toHaveBeenCalled();
  });
});
