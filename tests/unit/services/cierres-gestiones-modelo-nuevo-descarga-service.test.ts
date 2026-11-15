import { describe, it, expect, vi } from "vitest";

import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { CierresBodegaAdminService } from "@/lib/services/CierresBodegaAdminService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { filtrosConLimites, type FiltrosDescargaGestiones } from "@/lib/types/filtros-cierres";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import type { ICierresBodegaAdminRepository } from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  CierreGestionDescargaRow,
  RechazoTiendaDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import { dobleCierresAdmin } from "@/tests/fixtures/dobles/cierres-admin-repository";

// La mecanica del tope (N entra, N+1 no) no depende del valor real: se fija en 2.
vi.mock("@/lib/config/descarga", async (original) => {
  const real = await original<typeof import("@/lib/config/descarga")>();
  return { ...real, descargaConfig: { ...real.descargaConfig, MAX_FILAS: 2 } };
});

/**
 * SLT-113 «Excel del modelo nuevo de cierres» (T2.5; R372, R376) — lo que los dos servicios de la
 * descarga «Detalle» añaden: la hoja de rechazos SOLO si hay un cierre del modelo nuevo, con el
 * alcance y los recortes de la hoja de gestiones, y el dia del cargo de fulfillment anulado para
 * quien no es la central. Con dobles: el SQL lo mide
 * `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts`.
 */

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };
const M1 = "11111111-1111-4111-8111-111111111111";
const FILTROS: FiltrosDescargaGestiones = { mensajeroIds: [M1], desde: "2026-11-01", hasta: "2026-11-30" };

/** Una fila tal como la emite el repositorio (todos los campos del modelo nuevo presentes). */
function fila(numRemision: string, cierreModelo: "viejo" | "nuevo"): CierreGestionDescargaRow {
  return {
    mensajeroNombre: "Mario Uno",
    cierreSolicitadoAt: "2026-11-06T18:00:00.000Z",
    fechaGestion: "2026-11-06",
    diaReparto: null,
    fechaCreacionOrden: "2026-11-01",
    numGuia: 101,
    numRemision,
    destinatario: "Dest",
    direccion: null,
    zonaNombre: "Centro",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: null,
    producto: "Caja",
    tiendaNombre: "Tienda Fila",
    intentosContactoTienda: 0,
    intentosEntrega: 1,
    resultado: "entregado",
    montoRecibido: "25000.00",
    pagos: [{ metodo: "efectivo", monto: "25000.00" }],
    motivo: null,
    fechaReprogramacion: null,
    esRechazoSla: false,
    causaIncidente: null,
    indemnizacion: null,
    pagoMensajero: "1800.00",
    ingresoBodegaRechazo: "0.00",
    ingresoEmpresa: {
      montoCobrar: "25000.00",
      cobraComision: true,
      esCentral: false,
      esZonaEspecial: false,
      fleteOrigen: "normal",
      fleteDevolucionOrigen: "normal",
      flete: "3500.00",
      ivaFlete: "455.00",
      fleteDevolucion: null,
      ivaFleteDevolucion: null,
      comisionCod: "500.00",
      ivaComisionCod: "65.00",
      fleteConIva: "3955.00",
      fleteDevolucionConIva: null,
      comisionConIva: "565.00",
      total: "4520.00",
      fulfillment: "600.00",
      ivaFulfillment: "78.00",
      tarifa: null,
      tarifaModelo: "nuevo",
      ivaIncluido: "520.00",
      fulfillmentConIva: "678.00",
      ivaPctFulfillment: "13.00",
      fulfillmentCargadoAt: "2026-11-07T02:30:00.000Z",
      conceptosTarifa: [],
    },
    folioCierre: "ABCD1234",
    cierreModelo,
    pagoPorTarifa: null,
    ajustesPago: [],
    tarifaFaltante: false,
    fulfillmentCargadoDia: cierreModelo === "nuevo" ? "2026-11-06" : null,
  };
}

const R1: RechazoTiendaDescargaDTO = {
  folioCierre: "ABCD1234",
  numGuia: 7,
  destinatario: "Dest R1",
  motivo: "No lo pidió",
  tiendaNombre: "Tienda Fila",
  fechaRechazo: "2026-11-05",
};

function repoAdmin(filas: CierreGestionDescargaRow[]) {
  return dobleCierresAdmin({
    findGestionesPorAlcanceCompleto: vi.fn(async () => filas),
    findRechazosTiendaModeloNuevoCompleto: vi.fn(async () => [R1]),
  });
}

function servicioAdmin(repo: ReturnType<typeof repoAdmin>) {
  return new CierresAdminService(
    repo,
    { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository,
    {
      findUsuarioZonaId: vi.fn(async () => "z-centro"),
      findEstatusIdByValue: vi.fn(async () => null),
    } as unknown as IOrdenRepository,
    { createSignedUrls: vi.fn(async () => []) } as unknown as ISignedUrlProvider,
    {
      sumarVigentesPorCierre: vi.fn(async () => new Map()),
      obtenerCierreParaPago: vi.fn(async () => null),
    } as never,
    { sumarPremiosVivosPorCierre: vi.fn(async () => ({})) },
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
}

function repoBodega(filas: CierreGestionDescargaRow[]) {
  const findGestionesDeCierresBodegaCompleto = vi.fn(async () => filas);
  const findRechazosTiendaDeCierresBodegaModeloNuevoCompleto = vi.fn(async () => [R1]);
  return {
    findGestionesDeCierresBodegaCompleto,
    findRechazosTiendaDeCierresBodegaModeloNuevoCompleto,
  } as unknown as ICierresBodegaAdminRepository & {
    findGestionesDeCierresBodegaCompleto: typeof findGestionesDeCierresBodegaCompleto;
    findRechazosTiendaDeCierresBodegaModeloNuevoCompleto: typeof findRechazosTiendaDeCierresBodegaModeloNuevoCompleto;
  };
}

function servicioBodega(repo: ReturnType<typeof repoBodega>) {
  return new CierresBodegaAdminService(
    repo,
    { createSignedUrls: vi.fn(async () => []) } as unknown as ISignedUrlProvider,
    reglasPaisFijas(),
  );
}

describe("SLT-113 — servicio de la descarga «Detalle» de /cierres-admin", () => {
  it("R372 (a): todo del modelo viejo -> no se piden rechazos y la respuesta no lleva la clave", async () => {
    const repo = repoAdmin([fila("V-1", "viejo")]);

    const r = await servicioAdmin(repo).listarGestionesCierresAdminCompleto(MAESTRO, FILTROS);

    expect(repo.findRechazosTiendaModeloNuevoCompleto).not.toHaveBeenCalled();
    expect(r).toEqual({ status: "ok", items: [fila("V-1", "viejo")], total: 1 });
    expect(Object.keys(r).sort()).toEqual(["items", "status", "total"]);
  });

  it("R372 (b): un cierre nuevo -> UNA llamada con el alcance y los recortes de la hoja de gestiones", async () => {
    const repo = repoAdmin([fila("V-1", "viejo"), fila("N-1", "nuevo")]);

    const r = await servicioAdmin(repo).listarGestionesCierresAdminCompleto(SATELITE, FILTROS);

    expect(repo.findRechazosTiendaModeloNuevoCompleto).toHaveBeenCalledTimes(1);
    const filtrosRepo = filtrosConLimites(FILTROS, ZONA_CR);
    expect(repo.findRechazosTiendaModeloNuevoCompleto).toHaveBeenCalledWith(
      { destinoTipo: "bodega_satelite", destinoZonaId: "z-centro" },
      filtrosRepo,
      ZONA_CR,
    );
    // Los MISMOS argumentos que la lectura de gestiones: el conjunto de cierres es uno solo.
    expect(repo.findGestionesPorAlcanceCompleto).toHaveBeenCalledWith(
      { destinoTipo: "bodega_satelite", destinoZonaId: "z-centro" },
      filtrosRepo,
      ZONA_CR,
    );
    expect(r.status === "ok" ? r.rechazosDeTienda : r.status).toEqual([R1]);
  });

  it("R376 (c): la satelite recibe el dia del cargo y el fulfillment en null; la central, intactos", async () => {
    const sat = await servicioAdmin(repoAdmin([fila("N-1", "nuevo")])).listarGestionesCierresAdminCompleto(
      SATELITE,
      FILTROS,
    );
    const central = await servicioAdmin(repoAdmin([fila("N-1", "nuevo")])).listarGestionesCierresAdminCompleto(
      MAESTRO,
      FILTROS,
    );
    if (sat.status !== "ok" || central.status !== "ok") throw new Error("se esperaba ok");

    expect(sat.items[0]!.fulfillmentCargadoDia).toBeNull();
    expect(sat.items[0]!.ingresoEmpresa).toMatchObject({
      fulfillment: null,
      ivaFulfillment: null,
      fulfillmentConIva: null,
      ivaPctFulfillment: null,
      fulfillmentCargadoAt: null,
    });
    // Lo que no es fulfillment no se toca.
    expect(sat.items[0]!.ingresoEmpresa?.total).toBe("4520.00");

    expect(central.items[0]!.fulfillmentCargadoDia).toBe("2026-11-06");
    expect(central.items[0]!.ingresoEmpresa).toMatchObject({
      fulfillment: "600.00",
      ivaFulfillment: "78.00",
      fulfillmentConIva: "678.00",
      ivaPctFulfillment: "13.00",
      fulfillmentCargadoAt: "2026-11-07T02:30:00.000Z",
    });
  });

  it("R372 (d): mas gestiones que el tope -> limite_excedido sin pedir los rechazos", async () => {
    const repo = repoAdmin([fila("N-1", "nuevo"), fila("N-2", "nuevo"), fila("N-3", "nuevo")]);

    const r = await servicioAdmin(repo).listarGestionesCierresAdminCompleto(MAESTRO, FILTROS);

    expect(r).toEqual({ status: "limite_excedido", total: 3, limite: 2 });
    expect(repo.findRechazosTiendaModeloNuevoCompleto).not.toHaveBeenCalled();
  });
});

describe("SLT-113 — servicio de la descarga «Detalle» de cierres de bodega", () => {
  it("R372 (a): todo viejo -> sin rechazos ni clave", async () => {
    const repo = repoBodega([fila("V-1", "viejo")]);

    const r = await servicioBodega(repo).listarGestionesCierresBodegaCompleto(MAESTRO, FILTROS);

    expect(repo.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto).not.toHaveBeenCalled();
    expect(Object.keys(r).sort()).toEqual(["items", "status", "total"]);
  });

  it("R372 (b): un cierre nuevo -> UNA llamada con los mismos recortes, y la respuesta los lleva", async () => {
    const repo = repoBodega([fila("N-1", "nuevo")]);

    const r = await servicioBodega(repo).listarGestionesCierresBodegaCompleto(MAESTRO, FILTROS);

    expect(repo.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto).toHaveBeenCalledTimes(1);
    expect(repo.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto).toHaveBeenCalledWith(
      filtrosConLimites(FILTROS, ZONA_CR),
      ZONA_CR,
    );
    expect(r).toEqual({
      status: "ok",
      items: [fila("N-1", "nuevo")],
      total: 1,
      rechazosDeTienda: [R1],
    });
  });

  it("R372 (d): por encima del tope -> limite_excedido sin pedir los rechazos", async () => {
    const repo = repoBodega([fila("N-1", "nuevo"), fila("N-2", "nuevo"), fila("N-3", "nuevo")]);

    const r = await servicioBodega(repo).listarGestionesCierresBodegaCompleto(MAESTRO, FILTROS);

    expect(r).toEqual({ status: "limite_excedido", total: 3, limite: 2 });
    expect(repo.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto).not.toHaveBeenCalled();
  });

  it("(e): sin acceso total -> forbidden sin tocar el repositorio", async () => {
    const repo = repoBodega([fila("N-1", "nuevo")]);

    const r = await servicioBodega(repo).listarGestionesCierresBodegaCompleto(SATELITE, FILTROS);

    expect(r).toEqual({ status: "forbidden" });
    expect(repo.findGestionesDeCierresBodegaCompleto).not.toHaveBeenCalled();
    expect(repo.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto).not.toHaveBeenCalled();
  });
});
