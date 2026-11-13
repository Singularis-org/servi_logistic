import { describe, it, expect, vi } from "vitest";

import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { LecturaCifrasBodegaAusenteError } from "@/lib/services/cifras-bodega-descarga";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { ICierreBodegaRepository } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type {
  CierreDiaDeBodegaLoteRow,
  ICifrasBodegaLoteLectura,
} from "@/lib/interfaces/repositories/ICifrasBodegaLoteLectura";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { marcaPorEstado } from "@/tests/fixtures/marca-conciliacion";

// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T2.3; R384, R385, R386, R389) — la
// descarga de «Solicitados» de la satélite: cifras de sus cierres de bodega nuevos, con SU zona dentro
// de la lectura en lote y SIN «Pago entregado» (F481). Importes escritos a mano.
//
// Escenario: BS (nuevo, zona Centro) con general 30 000 SINPE, P 1 000, ingreso de bodega 0, y una
// gestión G2 de T2: entrega 30 000 SINPE, comisión 1 000 + IVA 130.

const SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };
const ZONA_ID = "z-centro";
const ZONA = "America/Costa_Rica";

const G2 = {
  resultado: "entregado",
  pagos: [{ metodo: "SINPE", monto: "30000.00" }],
  tiendaId: "tienda-t2",
  tiendaNombre: "T2",
  ingresoEmpresa: {
    montoCobrar: "30000.00",
    cobraComision: true,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: "1000.00",
    ivaComisionCod: "130.00",
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: "1130.00",
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    tarifaModelo: "nuevo",
    total: "1130.00",
  } satisfies IngresoEmpresaDTO,
} as unknown as CierreGestionPendienteRow; // solo lo que leen las cifras

function cabecera(cierreBodegaId: string, incluyeModeloNuevo: boolean): CierreBodegaResumen {
  return {
    cierreBodegaId,
    zonaId: ZONA_ID,
    zonaNombre: "Centro",
    solicitadoPorId: SATELITE.usuarioId,
    solicitadoPorNombre: "Sat Centro",
    estado: "solicitado",
    totales: { efectivo: "0.00", simpe: "30000.00", transferencia: "0.00", general: "30000.00" },
    totalPagoMensajero: "1000.00",
    totalIngresoBodegaRechazos: "0.00",
    cantidadCierres: 1,
    solicitadoAt: "2026-11-06T12:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    paraLaCentral: "29000.00",
    efectivoCubreDescuentos: false,
    ...marcaPorEstado("solicitado", "0.00"),
    incluyeModeloNuevo,
  };
}

const BS = cabecera("cb-bs", true);
const BV = cabecera("cb-bv", false);

const D_BS: CierreDiaDeBodegaLoteRow = {
  cierreBodegaId: "cb-bs",
  cierreDiaId: "cd-s1",
  estado: "aprobado",
  totalPagoMensajero: "1000.00",
  totalEfectivo: "0.00",
  pagoIndependienteEfectivo: true,
  gestionesAjustadas: 0,
  gestiones: [G2],
};

function montar(conjunto: CierreBodegaResumen[], opciones: { sinLote?: boolean } = {}) {
  const repo = {
    findCierresBodegaByZona: vi.fn(async () => conjunto),
  } as unknown as ICierreBodegaRepository;
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () => ZONA_ID),
  } as unknown as IOrdenRepository;
  const lote = { leerCierresDiaDeBodegas: vi.fn(async () => [D_BS]) };
  const zonaHoraria = vi.fn(async () => ZONA);
  const service = new CierreBodegaService(
    repo,
    ordenRepo,
    { zonaHoraria },
    undefined,
    opciones.sinLote ? undefined : (lote as ICifrasBodegaLoteLectura),
  );
  return { lote, zonaHoraria, service };
}

describe("SLT-141 — «Solicitados» de la satélite con cierres de bodega nuevos", () => {
  it("R389: pasa SU zona como alcance de la lectura en lote, solo con los ids de los nuevos", async () => {
    const m = montar([BV, BS]);

    await m.service.listarCierresBodegaSolicitadosCompleto(SATELITE);

    expect(m.lote.leerCierresDiaDeBodegas).toHaveBeenCalledTimes(1);
    expect(m.lote.leerCierresDiaDeBodegas).toHaveBeenCalledWith(
      ["cb-bs"],
      { lectura: "zona", zonaId: ZONA_ID },
      ZONA,
    );
  });

  it("R386 (F481): las cifras no llevan la clave `pagoEntregado`; R387: importes escritos a mano", async () => {
    const m = montar([BV, BS]);

    const r = await m.service.listarCierresBodegaSolicitadosCompleto(SATELITE);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.items).toEqual([BV, BS]);
    expect(r.total).toBe(2);
    expect(r.cifrasModeloNuevo).toHaveLength(1);
    expect(r.cifrasModeloNuevo?.[0]).not.toHaveProperty("pagoEntregado");
    expect(r.cifrasModeloNuevo).toEqual([
      {
        cierreBodegaId: "cb-bs",
        gestiones: 1,
        pagosAjustados: 0,
        totalFacturado: "1130.00",
        ivaFacturado: "130.00",
        netoEmpresa: "0.00", // (1 130 − 130) − 1 000 − 0
        ganaLaTienda: "28870.00", // 30 000 − 1 130
        partesPorTienda: [
          { tiendaId: "tienda-t2", tiendaNombre: "T2", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
        ],
      },
    ]);
  });

  it("R384: solo cierres viejos -> ni lectura en lote ni zona, y la respuesta de hoy sin la clave", async () => {
    const m = montar([BV]);

    const r = await m.service.listarCierresBodegaSolicitadosCompleto(SATELITE);

    expect(m.lote.leerCierresDiaDeBodegas).not.toHaveBeenCalled();
    expect(m.zonaHoraria).not.toHaveBeenCalled();
    expect(r).toEqual({ status: "ok", items: [BV], total: 1 });
    expect(r).not.toHaveProperty("cifrasModeloNuevo");
  });

  it("sin la lectura en lote y con un cierre nuevo -> lanza", async () => {
    await expect(
      montar([BS], { sinLote: true }).service.listarCierresBodegaSolicitadosCompleto(SATELITE),
    ).rejects.toBeInstanceOf(LecturaCifrasBodegaAusenteError);
  });
});
