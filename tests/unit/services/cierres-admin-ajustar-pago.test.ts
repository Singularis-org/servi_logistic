import { describe, it, expect, vi } from "vitest";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import type {
  AjustarPagoMensajeroResult,
  GestionEditableDelCierre,
  ICierresAdminRepository,
} from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { CierreResultado } from "@/lib/interfaces/services/ICierreDiaService";

// SLT-56 (T6) — LAS GUARDIAS del AJUSTE del pago al mensajero (design §4.3), con dobles del
// repositorio. Lo que se afirma en cada rechazo es que NO SE LLEGA A ESCRIBIR: cero llamadas a
// `ajustarPagoMensajeroEnCierre`.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: el SQL. Que el sello del WHERE (estado + alcance + pago anterior)
// guarde de verdad lo mide `tests/integration/db/ajuste-pago-mensajero-cierre.int.test.ts` contra
// Postgres real; una mutación del WHERE pasaría en verde por aquí.

const MAESTRO: Actor = { usuarioId: "adm", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "adm-2", rol: "admin" };
const ADMIN_SATELITE: Actor = { usuarioId: "adm-sat", rol: "adminSatelite" };
const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };
const ADMIN_TIENDA: Actor = { usuarioId: "t1", rol: "adminTienda" };

const GESTION = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const MOTIVO = "el mensajero hizo dos viajes por la misma orden";

const AJUSTE = {
  creadoAt: "2026-10-29T15:00:00.000Z",
  actorNombre: "Ana Admin",
  actorRol: "maestro" as const,
  pagoAnterior: "1500.00",
  pagoNuevo: "2000.00",
  motivo: MOTIVO,
};

const ENTRADA = { gestionId: GESTION, pagoAnterior: "1500.00", pagoNuevo: "2000.00", motivo: MOTIVO };

function editable(overrides: Partial<GestionEditableDelCierre> = {}): GestionEditableDelCierre {
  return {
    gestionId: GESTION,
    cierreId: "c-1",
    cierreEstado: "solicitado",
    resultado: "entregado",
    montoRecibido: "10000.00",
    pagoMensajero: "1500.00",
    pagos: [{ metodo: "efectivo", monto: "10000.00" }],
    ...overrides,
  };
}

const UPDATED: AjustarPagoMensajeroResult = {
  status: "updated",
  pagoMensajero: "2000.00",
  totalPagoMensajero: "5000.00",
  ajuste: AJUSTE,
};

function fakeRepo(overrides: Partial<ICierresAdminRepository> = {}): ICierresAdminRepository {
  return {
    findCierresByAlcance: vi.fn(async () => []),
    findHistoricoPaginado: vi.fn(async () => ({ items: [], total: 0 })),
    findColaPaginada: vi.fn(async () => ({ items: [], total: 0 })),
    findHistoricoCompleto: vi.fn(async () => []),
    findColaCompleta: vi.fn(async () => []),
    findCierreByIdEnAlcance: vi.fn(async () => null),
    resolverCierre: vi.fn(async () => "updated" as const),
    forzarSolicitudVencido: vi.fn(async () => "updated" as const),
    findGestionesIncidenteDelCierre: vi.fn(async () => []),
    findGestionesRetornablesDelCierre: vi.fn(async () => []),
    findGestionesPorAlcanceCompleto: vi.fn(async () => []),
    findCatalogoFiltros: vi.fn(async () => ({ zonas: [], mensajeros: [], mensajerosFiltro: [] })),
    findGestionEditableEnCierre: vi.fn(async () => editable()),
    actualizarPagosGestion: vi.fn(async () => ({ status: "conflict" as const })),
    corregirResultadoGestionEnCierre: vi.fn(async () => ({ status: "conflict" as const })),
    ajustarPagoMensajeroEnCierre: vi.fn(async () => UPDATED),
    ...overrides,
  };
}

function fakeOrdenRepo(zonaDelActor: string | null = "z-sat") {
  return {
    findUsuarioZonaId: vi.fn(async () => zonaDelActor),
    findEstatusIdByValue: vi.fn(async () => "os-x"),
  } as unknown as IOrdenRepository;
}

function newService(repo: ICierresAdminRepository, ordenRepo = fakeOrdenRepo()) {
  const zonaRepo = { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository;
  const signedUrls = {
    createSignedUrl: vi.fn(),
    createSignedUrls: vi.fn(async () => ({})),
  } as unknown as ISignedUrlProvider;
  return new CierresAdminService(
    repo,
    zonaRepo,
    ordenRepo,
    signedUrls,
    {
      sumarVigentesPorCierre: vi.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, "0.00"])),
      ),
      obtenerCierreParaPago: vi.fn(async () => null),
    },
    {
      sumarPremiosVivosPorCierre: vi.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, "0.00"])),
      ),
    },
    sinRetenidas(),
  );
}

describe("SLT-56/R1 — maestro y admin ajustan en la central", () => {
  it("maestro y admin → ok, con alcance central y el motivo recortado hasta el repo", async () => {
    for (const actor of [MAESTRO, ADMIN]) {
      const repo = fakeRepo();
      const r = await newService(repo).ajustarPagoMensajeroGestion(
        { ...ENTRADA, motivo: `  ${MOTIVO}  ` },
        actor,
      );
      expect(r, actor.rol).toEqual({
        status: "ok",
        gestionId: GESTION,
        pagoMensajero: "2000.00",
        totalPagoMensajero: "5000.00",
        ajuste: AJUSTE,
      });
      const alcanceCentral = { destinoTipo: "bodega_central", destinoZonaId: null };
      expect(repo.findGestionEditableEnCierre).toHaveBeenCalledWith(GESTION, alcanceCentral);
      expect(vi.mocked(repo.ajustarPagoMensajeroEnCierre).mock.calls[0]![0]).toEqual({
        gestionId: GESTION,
        alcance: alcanceCentral,
        pagoAnterior: "1500.00",
        pagoNuevo: "2000.00",
        motivo: MOTIVO,
        ajustadoPor: actor.usuarioId,
      });
    }
  });
});

describe("SLT-56/R2 — el adminSatelite ajusta en su bodega sin paso intermedio", () => {
  it("adminSatelite con zona → ok en una sola escritura, acotado a su satélite", async () => {
    const repo = fakeRepo();
    const r = await newService(repo, fakeOrdenRepo("z-sat")).ajustarPagoMensajeroGestion(
      ENTRADA,
      ADMIN_SATELITE,
    );
    expect(r.status).toBe("ok");
    const alcanceSat = { destinoTipo: "bodega_satelite", destinoZonaId: "z-sat" };
    expect(repo.findGestionEditableEnCierre).toHaveBeenCalledWith(GESTION, alcanceSat);
    // Una sola escritura y directa: no hay aprobación de la central en medio.
    expect(repo.ajustarPagoMensajeroEnCierre).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repo.ajustarPagoMensajeroEnCierre).mock.calls[0]![0].alcance).toEqual(alcanceSat);
    expect(repo.resolverCierre).not.toHaveBeenCalled();
  });
});

describe("SLT-56/R3 — fuera de alcance es «no encontrada»", () => {
  it("adminSatelite sin zona → no_encontrada sin tocar el repo", async () => {
    const repo = fakeRepo();
    const r = await newService(repo, fakeOrdenRepo(null)).ajustarPagoMensajeroGestion(
      ENTRADA,
      ADMIN_SATELITE,
    );
    expect(r).toEqual({ status: "no_encontrada" });
    expect(repo.findGestionEditableEnCierre).not.toHaveBeenCalled();
    expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
  });

  it("adminSatelite de otra bodega (la gestión no está en su alcance) → no_encontrada sin escribir", async () => {
    const repo = fakeRepo({ findGestionEditableEnCierre: vi.fn(async () => null) });
    const r = await newService(repo, fakeOrdenRepo("z-otra")).ajustarPagoMensajeroGestion(
      ENTRADA,
      ADMIN_SATELITE,
    );
    expect(r).toEqual({ status: "no_encontrada" });
    expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
  });

  it("el repo dice `fuera_de_alcance` en la escritura → no_encontrada", async () => {
    const repo = fakeRepo({
      ajustarPagoMensajeroEnCierre: vi.fn(async () => ({ status: "fuera_de_alcance" as const })),
    });
    const r = await newService(repo).ajustarPagoMensajeroGestion(ENTRADA, MAESTRO);
    expect(r).toEqual({ status: "no_encontrada" });
  });
});

describe("SLT-56/R4 — cualquier otro rol es `forbidden`", () => {
  it("mensajero y adminTienda → forbidden sin llamar al repositorio", async () => {
    for (const actor of [MENSAJERO, ADMIN_TIENDA]) {
      const repo = fakeRepo();
      const r = await newService(repo).ajustarPagoMensajeroGestion(ENTRADA, actor);
      expect(r, actor.rol).toEqual({ status: "forbidden" });
      expect(repo.findGestionEditableEnCierre).not.toHaveBeenCalled();
      expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
    }
  });
});

describe("SLT-56/R5 — cierre no abierto es `conflict`", () => {
  it.each(["aprobado", "rechazado"] as const)(
    "cierre %s → conflict sin escribir",
    async (estado) => {
      const repo = fakeRepo({
        findGestionEditableEnCierre: vi.fn(async () => editable({ cierreEstado: estado })),
      });
      const r = await newService(repo).ajustarPagoMensajeroGestion(ENTRADA, MAESTRO);
      expect(r).toEqual({ status: "conflict" });
      expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
    },
  );

  it("cierre vencido sigue abierto → ok", async () => {
    const repo = fakeRepo({
      findGestionEditableEnCierre: vi.fn(async () => editable({ cierreEstado: "vencido" })),
    });
    const r = await newService(repo).ajustarPagoMensajeroGestion(ENTRADA, MAESTRO);
    expect(r.status).toBe("ok");
  });

  it("💰 el cierre se APRUEBA entre la lectura y la escritura: el repo responde conflict y el servicio también", async () => {
    // La lectura vio `solicitado`; el sello del WHERE (estado abierto) ya no casa porque otro admin
    // aprobó en medio. El servicio no reintenta ni traduce a ok: el dinero del cierre aprobado no se toca.
    const repo = fakeRepo({
      ajustarPagoMensajeroEnCierre: vi.fn(async () => ({ status: "conflict" as const })),
    });
    const r = await newService(repo).ajustarPagoMensajeroGestion(ENTRADA, MAESTRO);
    expect(r).toEqual({ status: "conflict" });
    expect(repo.ajustarPagoMensajeroEnCierre).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-56/R6 — se ajusta cualquier resultado, también los que pagan 0", () => {
  it.each<[CierreResultado, string | null]>([
    ["entregado", "1500.00"],
    ["devolucion_a_origen_por_rechazo", "0.00"],
    ["novedad", "0.00"],
    ["reprogramado", "0.00"],
    ["incidente", "0.00"],
  ])("resultado %s (pago vigente %s) → ok", async (resultado, vigente) => {
    const repo = fakeRepo({
      findGestionEditableEnCierre: vi.fn(async () =>
        editable({ resultado, pagoMensajero: vigente, montoRecibido: null, pagos: [] }),
      ),
    });
    const r = await newService(repo).ajustarPagoMensajeroGestion(
      { ...ENTRADA, pagoAnterior: vigente!, pagoNuevo: "800.00" },
      MAESTRO,
    );
    expect(r.status).toBe("ok");
    expect(repo.ajustarPagoMensajeroEnCierre).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-56/R7 — el motivo es obligatorio", () => {
  it.each(["", "   ", "\n\t "])("motivo %j → validation_error.motivo sin escribir", async (motivo) => {
    const repo = fakeRepo();
    const r = await newService(repo).ajustarPagoMensajeroGestion({ ...ENTRADA, motivo }, MAESTRO);
    expect(r.status).toBe("validation_error");
    expect(r.status === "validation_error" && r.fieldErrors.motivo?.length).toBe(1);
    expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
  });
});

describe("SLT-56/R8 — el valor nuevo igual al vigente no es un ajuste", () => {
  it.each(["1500.00", "1500", "1500.0"])(
    "pagoNuevo %s con vigente 1500.00 → validation_error.pagoNuevo sin escribir",
    async (pagoNuevo) => {
      const repo = fakeRepo();
      const r = await newService(repo).ajustarPagoMensajeroGestion({ ...ENTRADA, pagoNuevo }, MAESTRO);
      expect(r.status).toBe("validation_error");
      expect(r.status === "validation_error" && r.fieldErrors.pagoNuevo?.length).toBe(1);
      expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
    },
  );
});

describe("SLT-56/R9 — pago desfasado es `conflict`", () => {
  it("la pantalla mostraba 1200.00 y el vigente es 1500.00 → conflict sin escribir", async () => {
    const repo = fakeRepo();
    const r = await newService(repo).ajustarPagoMensajeroGestion(
      { ...ENTRADA, pagoAnterior: "1200.00" },
      MAESTRO,
    );
    expect(r).toEqual({ status: "conflict" });
    expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
  });

  it("gestión sin pago congelado (NULL) → conflict sin escribir", async () => {
    const repo = fakeRepo({
      findGestionEditableEnCierre: vi.fn(async () => editable({ pagoMensajero: null })),
    });
    const r = await newService(repo).ajustarPagoMensajeroGestion(ENTRADA, MAESTRO);
    expect(r).toEqual({ status: "conflict" });
    expect(repo.ajustarPagoMensajeroEnCierre).not.toHaveBeenCalled();
  });

  it("`1500` y `1500.00` son el mismo importe: no es desfase", async () => {
    const repo = fakeRepo();
    const r = await newService(repo).ajustarPagoMensajeroGestion(
      { ...ENTRADA, pagoAnterior: "1500" },
      MAESTRO,
    );
    expect(r.status).toBe("ok");
  });
});
