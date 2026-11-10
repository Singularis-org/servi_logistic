import { describe, expect, it, vi } from "vitest";
import { RolValue, type BugReportStatus } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type {
  ConsultaDeReportes,
  DetalleDeReporte,
  IBugReportRepository,
  PaginaDeReportes,
  ResultadoDeCambioDeEstado,
} from "@/lib/interfaces/repositories/IBugReportRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ReportesBugPlataformaService } from "@/lib/services/ReportesBugPlataformaService";
import { filtrosReportesSchema, TRANSICIONES_REPORTE, type ReporteFilaDTO } from "@/lib/types/reporte-bug";

// SLT-97 (design §4; R2, R4, R5, R7, R9, R11, R15, R17, R18, R20) — el servicio del módulo de reportes
// con un repositorio doble. El SQL (filtros, orden, transacción y triggers) está en
// `tests/integration/db/bug-report.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "sa-1", rol: "superadmin" };
const ROLES_DE_EMPRESA: Actor[] = Object.values(RolValue)
  .filter((rol) => !(ROLES_PLATAFORMA as readonly string[]).includes(rol))
  .map((rol) => ({ usuarioId: `u-${rol}`, rol, organizacionId: "org-1" }));

const REPORTE_ID = "6f1c1d5e-2b8a-4c1e-9f3a-1b2c3d4e5f60";

const FILA: ReporteFilaDTO = {
  id: REPORTE_ID,
  creadoEn: "2026-11-09T14:05:00.000Z",
  estado: "new",
  empresa: "Envíos Uno",
  usuario: "Ana Pérez",
  rol: "maestro",
  resumen: "No carga el mapa",
};

function detalleEn(estado: BugReportStatus): DetalleDeReporte {
  return {
    reporte: {
      id: REPORTE_ID,
      descripcion: "No carga el mapa",
      empresa: "Envíos Uno",
      usuario: "Ana Pérez",
      correo: "ana@empresa.example",
      rol: "maestro",
      pagina: "/ordenes",
      navegador: "Mozilla/5.0",
      ventana: { ancho: 390, alto: 844 },
      appInstalada: true,
      creadoEn: "2026-11-09T14:05:00.000Z",
      estado,
      organizacionId: "org-1",
      imagenes: [],
    },
    historial: [],
  };
}

function repoDoble(o: { total?: number; detalle?: DetalleDeReporte | null; cambio?: ResultadoDeCambioDeEstado } = {}) {
  const repo = {
    crear: vi.fn(),
    listar: vi.fn<(c: ConsultaDeReportes) => Promise<PaginaDeReportes>>(async () => ({
      total: o.total ?? 1,
      filas: [FILA],
    })),
    detalle: vi.fn<IBugReportRepository["detalle"]>(async () => (o.detalle === undefined ? detalleEn("new") : o.detalle)),
    cambiarEstado: vi.fn<IBugReportRepository["cambiarEstado"]>(async () => o.cambio ?? { resultado: "ok" }),
  } satisfies IBugReportRepository;
  return repo;
}

const filtros = (entrada: Record<string, unknown> = {}) => filtrosReportesSchema.parse(entrada);

describe("SLT-97 — ReportesBugPlataformaService", () => {
  it("R2 — un actor que no es de plataforma da forbidden sin tocar el repositorio", async () => {
    for (const actor of ROLES_DE_EMPRESA) {
      const repo = repoDoble();
      const s = new ReportesBugPlataformaService(repo);
      expect(await s.listar(actor, filtros())).toEqual({ status: "forbidden" });
      expect(await s.detalle(actor, REPORTE_ID)).toEqual({ status: "forbidden" });
      expect(await s.cambiarEstado(actor, { reporteId: REPORTE_ID, estado: "resolved", nota: "" })).toEqual({
        status: "forbidden",
      });
      expect(repo.listar).not.toHaveBeenCalled();
      expect(repo.detalle).not.toHaveBeenCalled();
      expect(repo.cambiarEstado).not.toHaveBeenCalled();
      expect(repo.crear).not.toHaveBeenCalled();
    }
  });

  it("R4 — el servicio no recibe emisor de correo ni cola (el constructor solo recibe el repositorio)", () => {
    expect(ReportesBugPlataformaService.length).toBe(1);
  });

  it("R5 — sin filtros pide los estados new e in_review, todas las empresas, página 1 de 25", async () => {
    const repo = repoDoble();
    const r = await new ReportesBugPlataformaService(repo).listar(SUPERADMIN, filtros());
    expect(repo.listar).toHaveBeenCalledTimes(1);
    expect(repo.listar).toHaveBeenCalledWith({
      estados: ["new", "in_review"],
      organizationId: null,
      desde: null,
      hastaExclusivo: null,
      pagina: 1,
      tamano: 25,
    });
    expect(r).toEqual({ status: "ok", items: [FILA], total: 1, pagina: 1 });
  });

  it("R7 — «todos» no filtra por estado y un estado concreto pide solo ese", async () => {
    const repo = repoDoble();
    const s = new ReportesBugPlataformaService(repo);
    await s.listar(SUPERADMIN, filtros({ estado: "todos" }));
    await s.listar(SUPERADMIN, filtros({ estado: "resolved" }));
    expect(repo.listar.mock.calls.map(([c]) => c.estados)).toEqual([null, ["resolved"]]);
  });

  it("R8/R9 — la empresa pasa tal cual y las fechas son [desde 00:00Z, día siguiente a hasta 00:00Z)", async () => {
    const repo = repoDoble();
    const empresa = "0b6f0f43-6f1c-4d5e-8a2b-9c3d4e5f6a7b";
    await new ReportesBugPlataformaService(repo).listar(
      SUPERADMIN,
      filtros({ empresa, desde: "2026-02-28", hasta: "2026-12-31" }),
    );
    const c = repo.listar.mock.calls[0][0];
    expect(c.organizationId).toBe(empresa);
    expect(c.desde?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(c.hastaExclusivo?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("R11 — una página mayor que la última devuelve la última, y una menor que 1 la primera", async () => {
    const repo = repoDoble({ total: 60 });
    const s = new ReportesBugPlataformaService(repo);

    const mayor = await s.listar(SUPERADMIN, filtros({ pagina: "9" }));
    expect(mayor).toMatchObject({ status: "ok", total: 60, pagina: 3 });
    expect(repo.listar.mock.calls.map(([c]) => c.pagina)).toEqual([9, 3]);

    repo.listar.mockClear();
    const menor = await s.listar(SUPERADMIN, filtros({ pagina: "-4" }));
    expect(menor).toMatchObject({ status: "ok", pagina: 1 });
    expect(repo.listar.mock.calls.map(([c]) => c.pagina)).toEqual([1]);
  });

  it("R11 — sin ningún reporte la última página es la 1", async () => {
    const repo = repoDoble({ total: 0 });
    const r = await new ReportesBugPlataformaService(repo).listar(SUPERADMIN, filtros({ pagina: "2" }));
    expect(r).toMatchObject({ status: "ok", total: 0, pagina: 1 });
  });

  it("R17 — desde new acepta in_review, resolved y dismissed; desde in_review, resolved y dismissed", async () => {
    expect(TRANSICIONES_REPORTE).toEqual({
      new: ["in_review", "resolved", "dismissed"],
      in_review: ["resolved", "dismissed"],
      resolved: [],
      dismissed: [],
    });
    const destinos: Record<string, unknown> = {};
    for (const estado of ["new", "in_review", "resolved", "dismissed"] as const) {
      const r = await new ReportesBugPlataformaService(repoDoble({ detalle: detalleEn(estado) })).detalle(
        SUPERADMIN,
        REPORTE_ID,
      );
      destinos[estado] = r.status === "ok" ? r.reporte.destinosPermitidos : r.status;
    }
    expect(destinos).toEqual({
      new: ["in_review", "resolved", "dismissed"],
      in_review: ["resolved", "dismissed"],
      resolved: [],
      dismissed: [],
    });
  });

  it("R15 — el detalle de un reporte que el repositorio no encuentra es not_found", async () => {
    const r = await new ReportesBugPlataformaService(repoDoble({ detalle: null })).detalle(SUPERADMIN, REPORTE_ID);
    expect(r).toEqual({ status: "not_found" });
  });

  it("R18 — el resultado del repositorio se traduce: ok con el destino, transicion_invalida con el actual, not_found", async () => {
    const pedir = (cambio: ResultadoDeCambioDeEstado) =>
      new ReportesBugPlataformaService(repoDoble({ cambio })).cambiarEstado(SUPERADMIN, {
        reporteId: REPORTE_ID,
        estado: "dismissed",
        nota: "",
      });
    expect(await pedir({ resultado: "ok" })).toEqual({ status: "ok", estado: "dismissed" });
    expect(await pedir({ resultado: "transicion_invalida", actual: "resolved" })).toEqual({
      status: "transicion_invalida",
      actual: "resolved",
    });
    expect(await pedir({ resultado: "not_found" })).toEqual({ status: "not_found" });
  });

  it("R20/R21 — la nota vacía llega al repositorio como null, y el actor es el de la sesión", async () => {
    const repo = repoDoble();
    const s = new ReportesBugPlataformaService(repo);
    await s.cambiarEstado(SUPERADMIN, { reporteId: REPORTE_ID, estado: "in_review", nota: "" });
    await s.cambiarEstado(SUPERADMIN, { reporteId: REPORTE_ID, estado: "in_review", nota: "Lo miro" });
    expect(repo.cambiarEstado.mock.calls.map(([p]) => p)).toEqual([
      { reporteId: REPORTE_ID, destino: "in_review", nota: null, actorUsuarioId: "sa-1" },
      { reporteId: REPORTE_ID, destino: "in_review", nota: "Lo miro", actorUsuarioId: "sa-1" },
    ]);
  });
});
