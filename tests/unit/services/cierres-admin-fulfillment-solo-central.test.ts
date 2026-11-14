import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { dobleCierresAdmin } from "@/tests/fixtures/dobles/cierres-admin-repository";

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
  tarifaModelo: "viejo",
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
  // SLT-52 (R46, R47): el fulfillment congelado de la fila y su IVA (viejo: la columna e IVA 0).
  fulfillment: "1500.00",
  ivaFulfillment: "0.00",
  tarifa: TARIFA,
};

/**
 * SLT-52 (R46) — la misma fila congelada con el modelo NUEVO: sin fila de `tarifas` (`tarifa: null`)
 * y el fulfillment del concepto congelado, 450.00 al 13 % -> IVA 58.50 (a mano).
 */
const INGRESO_NUEVO: IngresoEmpresaDTO = {
  ...INGRESO,
  fulfillment: "450.00",
  ivaFulfillment: "58.50",
  tarifa: null,
  tarifaModelo: "nuevo",
};

/** Que fila entrega el doble del repositorio; la cambia solo el bloque del modelo nuevo. */
let filaDelRepo: IngresoEmpresaDTO = INGRESO;

/** Lo que el repositorio entrega: SIEMPRE con fulfillment. Copia fresca por llamada. */
function ingreso(): IngresoEmpresaDTO {
  return { ...filaDelRepo, tarifa: filaDelRepo.tarifa === null ? null : { ...filaDelRepo.tarifa } };
}

/** Lo que la satelite tiene que recibir: lo mismo, con el fulfillment anulado y nada mas. */
const INGRESO_SATELITE: IngresoEmpresaDTO = {
  ...INGRESO,
  fulfillment: null,
  ivaFulfillment: null,
  tarifa: { ...TARIFA, fulfillment: null },
};

/** SLT-101: campos de la fila (no del ingreso) que solo pone el bloque de las cifras nuevas. */
let extraDeLaFila: Partial<CierreGestionPendienteRow> = {};

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
      ...extraDeLaFila,
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

/**
 * SLT-149: las formas que devolvia el doble anterior, que no traian todos los campos del contrato.
 * Se conservan tal cual (R436): completarlas podria cambiar lo que el servicio pinta.
 */
type DetalleDelRepo = NonNullable<
  Awaited<ReturnType<ICierresAdminRepository["findCierreByIdEnAlcance"]>>
>;
type FilasDescargaDelRepo = Awaited<
  ReturnType<ICierresAdminRepository["findGestionesPorAlcanceCompleto"]>
>;

function newService() {
  const repo = dobleCierresAdmin({
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
    }) as unknown as DetalleDelRepo),
    findGestionesPorAlcanceCompleto: vi.fn(async () => [filaDescarga()] as FilasDescargaDelRepo),
  });

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
    undefined,
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
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

describe("SLT-52 R46 — el fulfillment del modelo nuevo y su IVA tambien son solo de la central", () => {
  beforeEach(() => {
    filaDelRepo = INGRESO_NUEVO;
  });
  afterEach(() => {
    filaDelRepo = INGRESO;
  });

  it("adminSatelite: fulfillment e IVA anulados (null, nunca \"0.00\") en el detalle y en el Excel", async () => {
    const esperado = { ...INGRESO_NUEVO, fulfillment: null, ivaFulfillment: null };
    expect(await ingresoDelDetalle(SATELITE)).toEqual(esperado);
    expect(await ingresoDeLaDescarga(SATELITE)).toEqual(esperado);
  });

  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ])("%s: recibe 450.00 y su IVA 58.50 tal cual", async (_n, actor) => {
    expect(await ingresoDelDetalle(actor)).toEqual(INGRESO_NUEVO);
    expect(await ingresoDeLaDescarga(actor)).toEqual(INGRESO_NUEVO);
  });
});

/**
 * SLT-101 «Fila de gestión única y lista con filtros» (R94; R66, R95, R96 de paso) — los tres campos
 * nuevos del fulfillment («Se cobró», su % de IVA y la fecha del cargo) son dato de la central: la
 * satelite los recibe `null`. Lo demas de las cifras nuevas (IVA incluido, tarifa de cada concepto,
 * pago por tarifa, «Sin tarifa de pago») no es fulfillment y le llega igual que a la central (R25).
 * Literales escritos a mano: 450,00 + 58,50 = 508,50.
 */
describe("SLT-101 R94 — «Se cobró», su % de IVA y la fecha del cargo solo llegan a la central", () => {
  const INGRESO_CIFRAS: IngresoEmpresaDTO = {
    ...INGRESO_NUEVO,
    ivaIncluido: "520.00",
    fulfillmentConIva: "508.50",
    ivaPctFulfillment: "13.00",
    fulfillmentCargadoAt: "2026-11-06T15:00:00.000Z",
    conceptosTarifa: [
      {
        concepto: "flete",
        modo: "monto",
        valor: "3500.00",
        ivaPct: "13.00",
        base: null,
        nivel: "grupo",
        zonaNombre: "GAM",
        grupoNombre: "San José centro",
        vehiculoNombre: null,
      },
    ],
  };
  const PAGO_POR_TARIFA = {
    importe: "2500.00",
    modo: "monto" as const,
    valor: "2500.00",
    base: null,
    nivel: "mensajero" as const,
    zonaNombre: null,
    grupoNombre: null,
    vehiculoNombre: null,
    ajuste: { signo: "resta" as const, monto: "700.00" },
  };

  beforeEach(() => {
    filaDelRepo = INGRESO_CIFRAS;
    extraDeLaFila = { pagoPorTarifa: PAGO_POR_TARIFA, tarifaFaltante: true };
  });
  afterEach(() => {
    filaDelRepo = INGRESO;
    extraDeLaFila = {};
  });

  async function gestionDelDetalle(actor: Actor) {
    const r = await newService().verCierreDetalle("c1", actor);
    if (r.status !== "ok") throw new Error(`esperaba ok, llego ${r.status}`);
    return r.grupos.entregado[0];
  }

  it("adminSatelite: los tres campos del fulfillment llegan null; el resto de las cifras, intacto", async () => {
    const g = await gestionDelDetalle(SATELITE);
    expect(g.ingresoEmpresa).toEqual({
      ...INGRESO_CIFRAS,
      fulfillment: null,
      ivaFulfillment: null,
      fulfillmentConIva: null,
      ivaPctFulfillment: null,
      fulfillmentCargadoAt: null,
    });
    expect(g.pagoPorTarifa).toEqual(PAGO_POR_TARIFA);
    expect(g.tarifaFaltante).toBe(true);
  });

  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ])("%s: recibe «Se cobró» 508.50, 13.00 y la fecha del cargo tal cual", async (_n, actor) => {
    const g = await gestionDelDetalle(actor);
    expect(g.ingresoEmpresa?.fulfillmentConIva).toBe("508.50");
    expect(g.ingresoEmpresa?.ivaPctFulfillment).toBe("13.00");
    expect(g.ingresoEmpresa?.fulfillmentCargadoAt).toBe("2026-11-06T15:00:00.000Z");
    expect(g.ingresoEmpresa).toEqual(INGRESO_CIFRAS);
    // R66/R96: `toDetalleDTO` pasa el pago por tarifa y la señal de la fila sin re-derivarlos.
    expect(g.pagoPorTarifa).toEqual(PAGO_POR_TARIFA);
    expect(g.tarifaFaltante).toBe(true);
  });

  it("hoja «Detalle» del Excel: la satelite tampoco recibe los tres campos", async () => {
    expect(await ingresoDeLaDescarga(SATELITE)).toEqual({
      ...INGRESO_CIFRAS,
      fulfillment: null,
      ivaFulfillment: null,
      fulfillmentConIva: null,
      ivaPctFulfillment: null,
      fulfillmentCargadoAt: null,
    });
  });
});
