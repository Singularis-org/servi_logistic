import { describe, it, expect, vi } from "vitest";

import { CierresBodegaAdminService } from "@/lib/services/CierresBodegaAdminService";
import {
  LecturaCifrasBodegaAusenteError,
  type LecturasPagoEntregadoBodega,
} from "@/lib/services/cifras-bodega-descarga";
import { LecturaPagadoSateliteAusenteError } from "@/lib/utils/pendiente-cierre";
import type { CierreBodegaResumenRow } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type { ICierresBodegaAdminRepository } from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import type {
  CierreDiaDeBodegaLoteRow,
  ICifrasBodegaLoteLectura,
} from "@/lib/interfaces/repositories/ICifrasBodegaLoteLectura";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { marcaPorEstado } from "@/tests/fixtures/marca-conciliacion";

// El tope se fija en 2 para probar (e) sin construir miles de filas (patron de
// `cierres-bodega-admin-completo.test.ts`).
vi.mock("@/lib/config/descarga", async (original) => {
  const real = await original<typeof import("@/lib/config/descarga")>();
  return { ...real, descargaConfig: { ...real.descargaConfig, MAX_FILAS: 2 } };
});

// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T2.3; R384, R385, R387, R388, R389) —
// las dos descargas de la central («Por conciliar» y «Conciliados») con `cifrasModeloNuevo`.
//
// Todos los importes esperados están ESCRITOS A MANO (son el contrato), nunca copiados de la salida.
// Escenario BN de `design.md > Verificación`: snapshots agregados 70 000 / 30 000 / 0 / 100 000, P
// 3 000, ingreso de bodega 500; G1 T1 entrega 70 000 efectivo (flete 4 000 + IVA 520, con un ajuste);
// G2 T2 entrega 30 000 SINPE (comisión 1 000 + IVA 130); G3 T1 rechazo (flete devolución 2 000 + IVA
// 260); D1 aprobado con la marca, E 70 000 y un `pago_satelite` de 3 000.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ZONA = "America/Costa_Rica";

function ingreso(c: Partial<IngresoEmpresaDTO> & { total: string }): IngresoEmpresaDTO {
  return {
    montoCobrar: null,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    tarifaModelo: "nuevo",
    ...c,
  };
}

/**
 * Una gestión con SOLO lo que leen las cifras (resultado, pagos, tienda, desglose). El resto de la
 * fila no interviene en ningún importe; el doble se tipa como la fila del lote.
 */
function gestion(g: {
  resultado: "entregado" | "devolucion_a_origen_por_rechazo";
  pagos: { metodo: "efectivo" | "SINPE"; monto: string }[];
  tiendaId: string;
  tiendaNombre: string;
  ingresoEmpresa: IngresoEmpresaDTO;
}): CierreGestionPendienteRow {
  return g as unknown as CierreGestionPendienteRow;
}

const G1 = gestion({
  resultado: "entregado",
  pagos: [{ metodo: "efectivo", monto: "70000.00" }],
  tiendaId: "tienda-t1",
  tiendaNombre: "T1",
  ingresoEmpresa: ingreso({
    montoCobrar: "70000.00",
    flete: "4000.00",
    ivaFlete: "520.00",
    fleteConIva: "4520.00",
    total: "4520.00",
  }),
});
const G2 = gestion({
  resultado: "entregado",
  pagos: [{ metodo: "SINPE", monto: "30000.00" }],
  tiendaId: "tienda-t2",
  tiendaNombre: "T2",
  ingresoEmpresa: ingreso({
    montoCobrar: "30000.00",
    cobraComision: true,
    comisionCod: "1000.00",
    ivaComisionCod: "130.00",
    comisionConIva: "1130.00",
    total: "1130.00",
  }),
});
const G3 = gestion({
  resultado: "devolucion_a_origen_por_rechazo",
  pagos: [],
  tiendaId: "tienda-t1",
  tiendaNombre: "T1",
  ingresoEmpresa: ingreso({
    fleteDevolucion: "2000.00",
    ivaFleteDevolucion: "260.00",
    fleteDevolucionConIva: "2260.00",
    total: "2260.00",
  }),
});

function cabecera(
  cierreBodegaId: string,
  incluyeModeloNuevo: boolean,
  over: Partial<CierreBodegaResumenRow> = {},
): CierreBodegaResumenRow {
  return {
    cierreBodegaId,
    zonaId: "z-centro",
    zonaNombre: "Centro",
    solicitadoPorId: "u-sat",
    solicitadoPorNombre: "Sat Centro",
    estado: "aprobado",
    totales: { efectivo: "500.00", simpe: "0.00", transferencia: "0.00", general: "500.00" },
    totalPagoMensajero: "50.00",
    totalIngresoBodegaRechazos: "0.00",
    cantidadCierres: 1,
    solicitadoAt: "2026-11-06T12:00:00.000Z",
    resueltoAt: "2026-11-06T13:00:00.000Z",
    motivoRechazo: null,
    paraLaCentral: "450.00",
    efectivoCubreDescuentos: true,
    ...marcaPorEstado("aprobado", "500.00"),
    incluyeModeloNuevo,
    ...over,
  };
}

const BN = cabecera("cb-bn-b0de9a01", true, {
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  totalIngresoBodegaRechazos: "500.00",
  paraLaCentral: "96500.00",
});
const BV = cabecera("cb-bv-viejo", false);

function dia(over: Partial<CierreDiaDeBodegaLoteRow> & Pick<CierreDiaDeBodegaLoteRow, "cierreBodegaId" | "cierreDiaId">): CierreDiaDeBodegaLoteRow {
  return {
    estado: "aprobado",
    totalPagoMensajero: "0.00",
    totalEfectivo: "0.00",
    pagoIndependienteEfectivo: false,
    gestionesAjustadas: 0,
    gestiones: [],
    ...over,
  };
}

const D1 = dia({
  cierreBodegaId: BN.cierreBodegaId,
  cierreDiaId: "cd-d1",
  totalPagoMensajero: "3000.00",
  totalEfectivo: "70000.00",
  pagoIndependienteEfectivo: true,
  gestionesAjustadas: 1,
  gestiones: [G1, G2, G3],
});

interface Montaje {
  repo: { findHistoricoCompleto: ReturnType<typeof vi.fn>; findColaCompleta: ReturnType<typeof vi.fn> };
  lote: { leerCierresDiaDeBodegas: ReturnType<typeof vi.fn> };
  pagos: {
    sumarVigentesPorCierre: ReturnType<typeof vi.fn>;
    sumarPremiosVivosPorCierre: ReturnType<typeof vi.fn>;
    sumarPagadoSatelitePorCierre: ReturnType<typeof vi.fn>;
  };
  zonaHoraria: ReturnType<typeof vi.fn>;
  service: CierresBodegaAdminService;
}

function montar(
  conjunto: CierreBodegaResumenRow[],
  filas: CierreDiaDeBodegaLoteRow[],
  lecturas: {
    vigentes?: Record<string, string>;
    premios?: Record<string, string>;
    satelite?: Record<string, string>;
  } = {},
  opciones: { sinLote?: boolean; sinPagos?: boolean; sinLecturaSatelite?: boolean } = {},
): Montaje {
  const repo = {
    findHistoricoCompleto: vi.fn(async () => conjunto),
    findColaCompleta: vi.fn(async () => conjunto),
  };
  const lote = { leerCierresDiaDeBodegas: vi.fn(async () => filas) };
  const pagos = {
    sumarVigentesPorCierre: vi.fn(async () => lecturas.vigentes ?? {}),
    sumarPremiosVivosPorCierre: vi.fn(async () => lecturas.premios ?? {}),
    sumarPagadoSatelitePorCierre: vi.fn(async () => lecturas.satelite ?? {}),
  };
  const zonaHoraria = vi.fn(async () => ZONA);
  const lecturasPago: LecturasPagoEntregadoBodega = {
    liquidaciones: { sumarVigentesPorCierre: pagos.sumarVigentesPorCierre },
    premios: opciones.sinLecturaSatelite
      ? { sumarPremiosVivosPorCierre: pagos.sumarPremiosVivosPorCierre }
      : {
          sumarPremiosVivosPorCierre: pagos.sumarPremiosVivosPorCierre,
          sumarPagadoSatelitePorCierre: pagos.sumarPagadoSatelitePorCierre,
        },
  };
  const service = new CierresBodegaAdminService(
    repo as unknown as ICierresBodegaAdminRepository,
    { createSignedUrls: vi.fn(async () => ({})) } as unknown as ISignedUrlProvider,
    { zonaHoraria },
    undefined,
    opciones.sinLote ? undefined : (lote as ICifrasBodegaLoteLectura),
    opciones.sinPagos ? undefined : lecturasPago,
  );
  return { repo, lote, pagos, zonaHoraria, service };
}

/** Las dos descargas de la central: el mismo contrato en las dos (R385). */
const DESCARGAS = [
  ["Conciliados (histórico)", (s: CierresBodegaAdminService) => s.listarHistoricoCierresBodegaCompleto(MAESTRO)],
  ["Por conciliar (cola)", (s: CierresBodegaAdminService) => s.listarPendientesCierresBodegaCompleto(MAESTRO)],
] as const;

describe.each(DESCARGAS)("SLT-141 — %s de la central con cierres de bodega nuevos", (_nombre, descargar) => {
  it("(a) R384: solo cierres viejos -> ni la lectura en lote ni las de pago, y la respuesta de hoy sin la clave", async () => {
    const m = montar([BV], []);

    const r = await descargar(m.service);

    expect(m.lote.leerCierresDiaDeBodegas).not.toHaveBeenCalled();
    expect(m.pagos.sumarVigentesPorCierre).not.toHaveBeenCalled();
    expect(m.pagos.sumarPremiosVivosPorCierre).not.toHaveBeenCalled();
    expect(m.pagos.sumarPagadoSatelitePorCierre).not.toHaveBeenCalled();
    expect(m.zonaHoraria).not.toHaveBeenCalled(); // ni la zona: ninguna lectura mas que hoy
    // La respuesta de hoy: las filas tal cual (`toResumen` copia la fila) y el total. Sin `cifrasModeloNuevo`.
    expect(r).toEqual({ status: "ok", items: [{ ...BV }], total: 1 });
    expect(r).not.toHaveProperty("cifrasModeloNuevo");
  });

  it("(b) R385/R387/R388: conjunto mixto -> cifras SOLO de los nuevos, en el orden de items, con el lote del alcance total", async () => {
    const m = montar([BV, BN], [D1], { satelite: { "cd-d1": "3000.00" } });

    const r = await descargar(m.service);

    expect(m.lote.leerCierresDiaDeBodegas).toHaveBeenCalledTimes(1);
    expect(m.lote.leerCierresDiaDeBodegas).toHaveBeenCalledWith(
      [BN.cierreBodegaId], // el viejo no se pide (R384)
      { lectura: "toda_la_empresa" },
      ZONA,
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.items.map((i) => i.cierreBodegaId)).toEqual([BV.cierreBodegaId, BN.cierreBodegaId]);
    expect(r.total).toBe(2);
    expect(r.cifrasModeloNuevo).toEqual([
      {
        cierreBodegaId: "cb-bn-b0de9a01",
        gestiones: 3,
        pagosAjustados: 1,
        totalFacturado: "7910.00", // 4 520 + 1 130 + 2 260
        ivaFacturado: "910.00", // 520 + 130 + 260
        netoEmpresa: "3500.00", // 7 910 − 910 − 3 000 − 500
        ganaLaTienda: "92090.00", // 100 000 − 7 910
        // PA1: D1 con la marca: pendiente = 3 000 + 0 − 0 − 3 000 = 0; entregado = 3 000 − 0
        pagoEntregado: "3000.00",
        partesPorTienda: [
          // T1: 70 000 − 4 520 = 65 480; gana 70 000 − 4 520 − 2 260 = 63 220
          { tiendaId: "tienda-t1", tiendaNombre: "T1", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
          // T2: 30 000 − 1 130 = 28 870
          { tiendaId: "tienda-t2", tiendaNombre: "T2", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
        ],
      },
    ]);
  });

  it("(c) PA1: «Pago entregado» = Σ por cierre del día de (P + premios) − pendiente; null con uno sin aprobar", async () => {
    const BX = cabecera("cb-bx", true);
    const BY = cabecera("cb-by", true);
    // D2 sin la marca (regla de la 44): P 5 000, E 2 000, premios 1 000, pagos vigentes 2 500.
    //   generado = 5 000 − min(5 000, 2 000) = 3 000; pendiente = 3 000 + 1 000 − 2 500 = 1 500
    //   entregado = (5 000 + 1 000) − 1 500 = 4 500
    const D2 = dia({ cierreBodegaId: "cb-bx", cierreDiaId: "cd-d2", totalPagoMensajero: "5000.00", totalEfectivo: "2000.00" });
    // D3 con la marca (SLT-123/139): P 4 000, E 9 000, premios 500, pagos vigentes 1 000, satélite 1 200.
    //   generado = 4 000; pendiente = 4 000 + 500 − 1 000 − 1 200 = 2 300
    //   entregado = (4 000 + 500) − 2 300 = 2 200
    const D3 = dia({
      cierreBodegaId: "cb-bx",
      cierreDiaId: "cd-d3",
      totalPagoMensajero: "4000.00",
      totalEfectivo: "9000.00",
      pagoIndependienteEfectivo: true,
    });
    // BY: D4 aprobado y D5 aún solicitado -> vacío.
    const D4 = dia({ cierreBodegaId: "cb-by", cierreDiaId: "cd-d4", totalPagoMensajero: "1000.00" });
    const D5 = dia({ cierreBodegaId: "cb-by", cierreDiaId: "cd-d5", estado: "solicitado", totalPagoMensajero: "800.00" });
    const m = montar([BX, BY], [D2, D3, D4, D5], {
      vigentes: { "cd-d2": "2500.00", "cd-d3": "1000.00" },
      premios: { "cd-d2": "1000.00", "cd-d3": "500.00" },
      // D2 no lleva la marca: aunque viniera algo suyo, no cuenta. Solo se pide D3.
      satelite: { "cd-d3": "1200.00" },
    });

    const r = await descargar(m.service);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.cifrasModeloNuevo?.map((c) => [c.cierreBodegaId, c.pagoEntregado])).toEqual([
      ["cb-bx", "6700.00"], // 4 500 + 2 200
      ["cb-by", null],
    ]);
    // R389: una llamada por lectura para todo el lote; solo los aprobados; la satélite, solo los marcados.
    expect(m.pagos.sumarVigentesPorCierre).toHaveBeenCalledTimes(1);
    expect(m.pagos.sumarVigentesPorCierre).toHaveBeenCalledWith(["cd-d2", "cd-d3", "cd-d4"]);
    expect(m.pagos.sumarPremiosVivosPorCierre).toHaveBeenCalledTimes(1);
    expect(m.pagos.sumarPremiosVivosPorCierre).toHaveBeenCalledWith(["cd-d2", "cd-d3", "cd-d4"]);
    expect(m.pagos.sumarPagadoSatelitePorCierre).toHaveBeenCalledTimes(1);
    expect(m.pagos.sumarPagadoSatelitePorCierre).toHaveBeenCalledWith(["cd-d3"]);
  });

  it("(d) dependencia ausente con un cierre nuevo -> lanza, nunca un archivo sin cifras", async () => {
    await expect(descargar(montar([BN], [D1], {}, { sinLote: true }).service)).rejects.toBeInstanceOf(
      LecturaCifrasBodegaAusenteError,
    );
    await expect(descargar(montar([BN], [D1], {}, { sinPagos: true }).service)).rejects.toBeInstanceOf(
      LecturaCifrasBodegaAusenteError,
    );
    // D1 lleva la marca: sin la lectura de «pagado por la satélite», SLT-139 lanza.
    await expect(
      descargar(montar([BN], [D1], {}, { sinLecturaSatelite: true }).service),
    ).rejects.toBeInstanceOf(LecturaPagadoSateliteAusenteError);
    // Sin cierres nuevos, la ausencia no importa: la respuesta de hoy.
    const r = await descargar(montar([BV], [], {}, { sinLote: true, sinPagos: true }).service);
    expect(r).toEqual({ status: "ok", items: [{ ...BV }], total: 1 });
  });

  it("(e) tope excedido -> solo los conteos y el lote no se lee", async () => {
    const m = montar([BN, cabecera("cb-2", true), cabecera("cb-3", true)], [D1]);

    const r = await descargar(m.service);

    expect(r).toEqual({ status: "limite_excedido", total: 3, limite: 2 });
    expect(m.lote.leerCierresDiaDeBodegas).not.toHaveBeenCalled();
    expect(m.pagos.sumarVigentesPorCierre).not.toHaveBeenCalled();
  });
});
