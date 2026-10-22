import { describe, it, expect, vi } from "vitest";

import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { conPagos } from "@/tests/fixtures/cierre-pagos";
import type { ICierresAdminRepository } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  IngresoEmpresaDTO,
  TarifaSnapshotDTO,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreGestionDescargaDTO } from "@/lib/interfaces/services/ICierresAdminService";

/**
 * FICHA 481 (2026-10-15, «solo lo debe ver la central») — el fulfillment congelado de la fila
 * (`ingresoEmpresa.tarifa.fulfillment`) no sale del servidor hacia la adminSatelite, en los DOS
 * caminos que se lo daban: el detalle del cierre de mensajero (`verCierreDetalle`) y el conjunto
 * de la hoja «Detalle» del Excel (`listarGestionesCierresAdminCompleto`).
 *
 * El dato llega del repositorio CON fulfillment ("1500.00") en todos los casos: lo que se mide es
 * que el SERVICIO lo anula para la satelite y lo deja intacto para maestro/admin. El resto de la
 * tarifa y del ingreso (montos, `total`) sale igual para los tres: aqui no se recalcula nada.
 */

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };

const TARIFA: TarifaSnapshotDTO = {
  tarifaId: "tf-1",
  valorFlete: "2500.00",
  valorFleteGam: "2000.00",
  valorFleteDevuelto: "1500.00",
  valorFleteDevueltoGam: "1200.00",
  comisionCod: "3.00",
  ivaFlete: "13.00",
  ivaComisionCod: "13.00",
  fulfillment: "1500.00",
  tarifaEspecial: null,
  tarifaEspecialDevuelta: null,
};

const INGRESO: IngresoEmpresaDTO = {
  montoCobrar: "10000.00",
  cobraComision: false,
  esCentral: false,
  esZonaEspecial: false,
  fleteOrigen: "normal",
  fleteDevolucionOrigen: "normal",
  flete: "2500.00",
  ivaFlete: "325.00",
  fleteDevolucion: null,
  ivaFleteDevolucion: null,
  comisionCod: null,
  ivaComisionCod: null,
  fleteConIva: "2825.00",
  fleteDevolucionConIva: null,
  comisionConIva: null,
  total: "2825.00",
  tarifa: TARIFA,
};

/** Lo que el repositorio entrega: SIEMPRE con fulfillment. Copia fresca por llamada. */
function ingreso(): IngresoEmpresaDTO {
  return { ...INGRESO, tarifa: { ...TARIFA } };
}

/** Lo que la satelite tiene que recibir: lo mismo, con el fulfillment anulado y nada mas. */
const INGRESO_SATELITE: IngresoEmpresaDTO = {
  ...INGRESO,
  tarifa: { ...TARIFA, fulfillment: null },
};

function gestionRow(): CierreGestionPendienteRow {
  return conPagos(
    {
      gestionId: "g1",
      ordenId: "o1",
      fechaGestion: "2026-10-14",
      numGuia: 1,
      numRemision: "REM-1",
      destinatario: "Dest",
      direccion: null,
      zonaNombre: "Cartago",
      provinciaNombre: "Cartago",
      cantonNombre: "Central",
      distritoNombre: null,
      producto: "Caja",
      tiendaId: "t1",
      tiendaNombre: "Tienda",
      resultado: "entregado",
      montoRecibido: "10000.00",
      metodoPago: "efectivo",
      motivo: null,
      fechaReprogramacion: null,
      evidenciaStoragePath: null, evidenciaStoragePaths: [],
      pagoMensajero: "0.00",
      ingresoBodegaRechazo: "0.00",
      esRechazoSla: false,
      desdeAyudaTienda: false,
      causaIncidente: null,
      indemnizacion: null,
      ingresoEmpresa: ingreso(),
    },
    undefined,
  );
}

function filaDescarga(): CierreGestionDescargaDTO {
  return {
    mensajeroNombre: "Ana",
    cierreSolicitadoAt: "2026-10-14T12:00:00.000Z",
    fechaGestion: "2026-10-14",
    diaReparto: "2026-10-14",
    fechaCreacionOrden: "2026-10-13",
    numGuia: 1,
    numRemision: "REM-1",
    destinatario: "Dest",
    direccion: null,
    zonaNombre: "Cartago",
    provinciaNombre: "Cartago",
    cantonNombre: "Central",
    distritoNombre: null,
    producto: "Caja",
    tiendaNombre: "Tienda",
    intentosContactoTienda: 0,
    intentosEntrega: 1,
    resultado: "entregado",
    montoRecibido: "10000.00",
    pagos: [{ metodo: "efectivo", monto: "10000.00" }],
    motivo: null,
    fechaReprogramacion: null,
    esRechazoSla: false,
    causaIncidente: null,
    indemnizacion: null,
    pagoMensajero: "0.00",
    ingresoBodegaRechazo: null,
    ingresoEmpresa: ingreso(),
  };
}

function newService() {
  const repo = {
    findCierreByIdEnAlcance: vi.fn(async () => ({
      sinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
      cierre: {
        cierreId: "c1",
        mensajeroId: "m1",
        mensajeroNombre: "Ana",
        estado: "solicitado" as const,
        destinoTipo: "bodega_satelite" as const,
        destinoZonaId: "z-sat",
        destinoZonaNombre: "Cartago",
        totales: { efectivo: "10000.00", simpe: "0.00", transferencia: "0.00", general: "10000.00" },
        totalPagoMensajero: "0.00",
        totalIngresoBodegaRechazos: "0.00",
        solicitadoAt: "2026-10-14T12:00:00.000Z",
        resueltoAt: null,
        motivoRechazo: null,
      },
      gestiones: [gestionRow()],
    })),
    findGestionesPorAlcanceCompleto: vi.fn(async () => [filaDescarga()]),
  } as unknown as ICierresAdminRepository;

  return new CierresAdminService(
    repo,
    { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository,
    {
      contarCierresAbiertosPorMensajero: vi.fn(async () => new Map()),
      findUsuarioZonaId: vi.fn(async () => "z-sat"),
      findEstatusIdByValue: vi.fn(async () => null),
    } as unknown as IOrdenRepository,
    {
      createSignedUrl: vi.fn(async () => null),
      createSignedUrls: vi.fn(async () => ({})),
    } as unknown as ISignedUrlProvider,
    {
      sumarVigentesPorCierre: vi.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, "0.00"])),
      ),
      obtenerCierreParaPago: vi.fn(async () => null),
    } as never,
    {
      sumarPremiosVivosPorCierre: vi.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, "0.00"])),
      ),
    },
    sinRetenidas(),
  );
}

async function ingresoDelDetalle(actor: Actor) {
  const r = await newService().verCierreDetalle("c1", actor);
  if (r.status !== "ok") throw new Error(`esperaba ok, llego ${r.status}`);
  return r.grupos.entregado[0].ingresoEmpresa;
}

async function ingresoDeLaDescarga(actor: Actor) {
  const r = await newService().listarGestionesCierresAdminCompleto(actor, {
    mensajeroIds: ["m1"],
  });
  if (r.status !== "ok") throw new Error(`esperaba ok, llego ${r.status}`);
  return r.items[0].ingresoEmpresa;
}

describe("ficha 481 — el fulfillment de la fila solo llega a la central", () => {
  describe("detalle del cierre de mensajero (verCierreDetalle)", () => {
    it("adminSatelite: la tarifa llega con fulfillment null y el resto intacto", async () => {
      expect(await ingresoDelDetalle(SATELITE)).toEqual(INGRESO_SATELITE);
    });

    it.each([
      ["maestro", MAESTRO],
      ["admin", ADMIN],
    ])("%s: recibe el fulfillment congelado tal cual", async (_n, actor) => {
      const ingresoRecibido = await ingresoDelDetalle(actor);
      expect(ingresoRecibido?.tarifa?.fulfillment).toBe("1500.00");
      expect(ingresoRecibido).toEqual(INGRESO);
    });
  });

  describe("hoja «Detalle» del Excel (listarGestionesCierresAdminCompleto)", () => {
    it("adminSatelite: la tarifa llega con fulfillment null y el resto intacto", async () => {
      expect(await ingresoDeLaDescarga(SATELITE)).toEqual(INGRESO_SATELITE);
    });

    it.each([
      ["maestro", MAESTRO],
      ["admin", ADMIN],
    ])("%s: recibe el fulfillment congelado tal cual", async (_n, actor) => {
      const ingresoRecibido = await ingresoDeLaDescarga(actor);
      expect(ingresoRecibido?.tarifa?.fulfillment).toBe("1500.00");
      expect(ingresoRecibido).toEqual(INGRESO);
    });
  });
});
