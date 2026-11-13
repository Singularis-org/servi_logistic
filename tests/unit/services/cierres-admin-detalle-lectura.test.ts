import { describe, it, expect, vi } from "vitest";

import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import type {
  Alcance,
  AlcanceLecturaDetalle,
  CierreAdminResumenRow,
  ICierresAdminRepository,
} from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RolValue } from "@prisma/client";

/**
 * SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — PA1 / R116.
 *
 * La central (acceso total) gana LECTURA del detalle de un cierre del día de satélite, y nada más:
 *  - `verCierreDetalle` le pasa al repositorio la lectura ancha (`toda_la_empresa`);
 *  - las listas y TODAS las escrituras siguen con `bodega_central`, así que sobre el cierre de
 *    satélite responden `no_encontrada` como antes;
 *  - los roles sin acceso total no ganan nada (la satélite sigue con SU zona; el resto, `forbidden`).
 *
 * El doble del repositorio imita el WHERE: devuelve el cierre de satélite solo si el alcance que le
 * llega lo cubre. Así el test mira el resultado y, además, el alcance que viajó.
 * El SQL real (y la empresa) se prueba en `tests/integration/db/cierre-detalle-central-lee-satelite-sql-real.test.ts`.
 */

const ZONA_SAT = "z-sat-1";
const CIERRE_SAT = "c-sat";

const actor = (rol: RolValue, usuarioId = `u-${rol}`): Actor => ({ usuarioId, rol });
const MAESTRO = actor("maestro");
const ADMIN = actor("admin");
const ADMIN_SATELITE = actor("adminSatelite");
const SIN_ACCESO_TOTAL: readonly Actor[] = [
  actor("mensajero"),
  actor("adminTienda"),
  actor("apiKey"),
  actor("superadmin"),
];

const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };
const LECTURA_EMPRESA: AlcanceLecturaDetalle = { lectura: "toda_la_empresa" };

const RESUMEN_SAT: CierreAdminResumenRow = {
  pagoIndependienteEfectivo: false, // SLT-123: la marca es obligatoria en la fila del repositorio
  cierreId: CIERRE_SAT,
  mensajeroId: "m1",
  mensajeroNombre: "Ana Mensajera",
  estado: "aprobado",
  destinoTipo: "bodega_satelite",
  destinoZonaId: ZONA_SAT,
  destinoZonaNombre: "Satélite",
  totales: { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "500.00",
  solicitadoAt: "2026-11-09T20:00:00.000Z",
  resueltoAt: "2026-11-09T21:00:00.000Z",
  motivoRechazo: null,
};

/** ¿El alcance que llegó cubre el cierre de satélite? Es la regla del WHERE, en pequeño. */
function cubreSatelite(a: AlcanceLecturaDetalle): boolean {
  if ("lectura" in a) return true;
  return a.destinoTipo === "bodega_satelite" && (a.destinoZonaId === null || a.destinoZonaId === ZONA_SAT);
}

function fakeRepo(): ICierresAdminRepository {
  return {
    leerTopeIntentos: vi.fn(async () => 3),
    findCierresByAlcance: vi.fn(async () => [] as CierreAdminResumenRow[]),
    findHistoricoPaginado: vi.fn(async () => ({ items: [] as CierreAdminResumenRow[], total: 0 })),
    findColaPaginada: vi.fn(async () => ({ items: [] as CierreAdminResumenRow[], total: 0 })),
    findHistoricoCompleto: vi.fn(async () => [] as CierreAdminResumenRow[]),
    findColaCompleta: vi.fn(async () => [] as CierreAdminResumenRow[]),
    findCierreByIdEnAlcance: vi.fn(async (id: string, a: AlcanceLecturaDetalle) =>
      id === CIERRE_SAT && cubreSatelite(a)
        ? {
            cierre: RESUMEN_SAT,
            gestiones: [],
            sinGestion: [],
            sinGestionRegistrado: true,
            rechazosDeTienda: [],
            resueltoPorNombre: null,
          }
        : null,
    ),
    resolverCierre: vi.fn(async (input: { alcance: Alcance }) =>
      cubreSatelite(input.alcance) ? ("updated" as const) : ("fuera_de_alcance" as const),
    ),
    forzarSolicitudVencido: vi.fn(async (_id: string, a: Alcance) =>
      cubreSatelite(a) ? ("updated" as const) : ("fuera_de_alcance" as const),
    ),
    findGestionesIncidenteDelCierre: vi.fn(async () => []),
    findGestionesRetornablesDelCierre: vi.fn(async () => []),
    findBarridasDelCierre: vi.fn(async () => []),
    findGestionesPorAlcanceCompleto: vi.fn(async () => []),
    findCatalogoFiltros: vi.fn(async () => ({ zonas: [], mensajeros: [], mensajerosFiltro: [] })),
    // La gestion `g-sat` es del cierre de satelite: solo se encuentra con un alcance que lo cubra.
    findGestionEditableEnCierre: vi.fn(async () => null),
    actualizarPagosGestion: vi.fn(async () => ({ status: "conflict" as const })),
    corregirResultadoGestionEnCierre: vi.fn(async () => ({ status: "conflict" as const })),
    ajustarPagoMensajeroEnCierre: vi.fn(async () => ({ status: "conflict" as const })),
  } as unknown as ICierresAdminRepository;
}

function newService() {
  const repo = fakeRepo();
  const ordenRepo = {
    contarCierresAbiertosPorMensajero: vi.fn(async () => new Map()),
    findUsuarioZonaId: vi.fn(async () => ZONA_SAT),
    findEstatusIdByValue: vi.fn(async (v: string) => `s-${v}`),
  } as unknown as IOrdenRepository;
  const zonaRepo = { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository;
  const signedUrls: ISignedUrlProvider = {
    createSignedUrl: vi.fn(async (p: string) => `https://signed/${p}`),
    createSignedUrls: vi.fn(async () => ({})),
  };
  const liquidacionRepo = {
    sumarVigentesPorCierre: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "0.00"]))),
    obtenerCierreParaPago: vi.fn(async () => null),
  };
  const service = new CierresAdminService(
    repo,
    zonaRepo,
    ordenRepo,
    signedUrls,
    liquidacionRepo,
    { sumarPremiosVivosPorCierre: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "0.00"]))) },
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
  return { service, repo };
}

const llamadas = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls;

describe("SLT-104 R116 — la central LEE el detalle de un cierre del día de satélite", () => {
  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ])("%s: `verCierreDetalle` pide la lectura ancha y recibe el cierre de satélite", async (_n, quien) => {
    const { service, repo } = newService();
    const r = await service.verCierreDetalle(CIERRE_SAT, quien);
    expect(llamadas(repo.findCierreByIdEnAlcance)[0][1]).toEqual(LECTURA_EMPRESA);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.cierre.cierreId).toBe(CIERRE_SAT);
    expect(r.cierre.destinoTipo).toBe("bodega_satelite");
  });

  it("adminSatelite: sigue con SU zona (no gana la lectura ancha)", async () => {
    const { service, repo } = newService();
    const r = await service.verCierreDetalle(CIERRE_SAT, ADMIN_SATELITE);
    expect(llamadas(repo.findCierreByIdEnAlcance)[0][1]).toEqual({
      destinoTipo: "bodega_satelite",
      destinoZonaId: ZONA_SAT,
    });
    expect(r.status).toBe("ok");
  });

  it.each(SIN_ACCESO_TOTAL.map((a) => [a.rol, a] as const))(
    "%s: `forbidden`, sin tocar el repositorio",
    async (_rol, quien) => {
      const { service, repo } = newService();
      expect(await service.verCierreDetalle(CIERRE_SAT, quien)).toEqual({ status: "forbidden" });
      expect(repo.findCierreByIdEnAlcance).not.toHaveBeenCalled();
    },
  );
});

describe("SLT-104 R116 — la central NO gana escritura ni listas sobre el cierre de satélite", () => {
  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ])("%s: aprobar y rechazar → `no_encontrada`, con el alcance `bodega_central`", async (_n, quien) => {
    const { service, repo } = newService();
    expect(await service.aprobarCierre(CIERRE_SAT, quien)).toEqual({ status: "no_encontrada" });
    expect(await service.rechazarCierre(CIERRE_SAT, "intento", quien)).toEqual({ status: "no_encontrada" });
    const alcances = llamadas(repo.resolverCierre).map((c) => (c[0] as { alcance: Alcance }).alcance);
    expect(alcances).toEqual([ALCANCE_CENTRAL, ALCANCE_CENTRAL]);
  });

  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ])("%s: destrabar un vencido → `no_encontrada`, con `bodega_central`", async (_n, quien) => {
    const { service, repo } = newService();
    expect(await service.forzarSolicitudVencido(CIERRE_SAT, quien)).toEqual({ status: "no_encontrada" });
    expect(llamadas(repo.forzarSolicitudVencido)[0][1]).toEqual(ALCANCE_CENTRAL);
  });

  it("maestro: corregir métodos, corregir resultado y ajustar el pago buscan la gestión con `bodega_central`", async () => {
    const { service, repo } = newService();
    const input = { gestionId: "g-sat" } as never;
    expect((await service.actualizarPagosGestion(input, MAESTRO)).status).toBe("no_encontrada");
    expect((await service.corregirResultadoGestion(input, MAESTRO)).status).toBe("no_encontrada");
    expect((await service.ajustarPagoMensajeroGestion(input, MAESTRO)).status).toBe("no_encontrada");
    const alcances = llamadas(repo.findGestionEditableEnCierre).map((c) => c[1]);
    expect(alcances).toEqual([ALCANCE_CENTRAL, ALCANCE_CENTRAL, ALCANCE_CENTRAL]);
    expect(repo.actualizarPagosGestion).not.toHaveBeenCalled();
    expect(repo.corregirResultadoGestionEnCierre).not.toHaveBeenCalled();
    expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
  });

  it("maestro: las listas y el catálogo siguen con `bodega_central`", async () => {
    const { service, repo } = newService();
    await service.listarCierresAdmin(MAESTRO);
    await service.obtenerCatalogoFiltros(MAESTRO);
    expect(llamadas(repo.findCierresByAlcance)[0][0]).toEqual(ALCANCE_CENTRAL);
    expect(llamadas(repo.findCatalogoFiltros)[0][0]).toEqual(ALCANCE_CENTRAL);
  });
});
