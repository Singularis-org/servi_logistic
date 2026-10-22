import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
  IngresoEmpresaDTO,
  TarifaSnapshotDTO,
} from "@/lib/interfaces/services/ICierreDiaService";

/**
 * FICHA 478 — dobles de la gestión del detalle de cierre (mismo DTO en el comprobante de
 * mensajero y en el detalle de bodega). Los importes llevan céntimos a propósito: con cifras
 * redondas `money()` no pinta decimales y un literal mal formateado pasaría igual.
 */
export function tarifa478(over: Partial<TarifaSnapshotDTO> = {}): TarifaSnapshotDTO {
  return {
    tarifaId: "t-478",
    valorFlete: "2500.00",
    valorFleteGam: "2000.00",
    valorFleteDevuelto: "1500.00",
    valorFleteDevueltoGam: "1200.00",
    comisionCod: "10",
    ivaFlete: "13",
    ivaComisionCod: "13",
    fulfillment: null,
    tarifaEspecial: null,
    tarifaEspecialDevuelta: null,
    ...over,
  };
}

export function ingreso478(over: Partial<IngresoEmpresaDTO> = {}): IngresoEmpresaDTO {
  return {
    montoCobrar: null,
    cobraComision: true,
    esCentral: true,
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
    total: "0.00",
    tarifa: tarifa478(),
    ...over,
  };
}

export function gestion478(
  over: Partial<CierreDetalleGestion> & { gestionId: string; resultado: CierreResultado },
): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-09-01",
    numGuia: 5000,
    numRemision: "REM-0",
    destinatario: "Sin nombre",
    direccion: null,
    zonaNombre: "",
    provinciaNombre: "",
    cantonNombre: "",
    distritoNombre: null,
    producto: "Caja",
    tiendaNombre: "",
    montoRecibido: null,
    metodoPago: null,
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

export function grupos478(over: Partial<CierreGrupos> = {}): CierreGrupos {
  return {
    entregado: [],
    reprogramado: [],
    novedad: [],
    devolucion_a_origen_por_rechazo: [],
    incidente: [],
    ...over,
  };
}

/** La entrega «completa»: cobro mixto, tienda, ubicación, conceptos, fulfillment y evidencia. */
export const ENTREGA_478 = gestion478({
  gestionId: "ge1",
  resultado: "entregado",
  numGuia: 5001,
  numRemision: "REM-E1",
  destinatario: "Carla Entregada",
  producto: "Caja mediana",
  direccion: "Calle Sol 12",
  zonaNombre: "GAM",
  provinciaNombre: "San José",
  cantonNombre: "Central",
  distritoNombre: "Carmen",
  tiendaNombre: "Tienda Norte",
  montoRecibido: "8000.50",
  metodoPago: null,
  pagos: [
    { metodo: "efectivo", monto: "5000.25" },
    { metodo: "SINPE", monto: "3000.25" },
  ],
  pagoMensajero: "1200.40",
  evidenciaUrl: "https://signed.example/ent.jpg?token=e1", evidenciaUrls: ["https://signed.example/ent.jpg?token=e1"],
  ingresoEmpresa: ingreso478({
    montoCobrar: "8000.50",
    flete: "2000.00",
    ivaFlete: "260.00",
    comisionCod: "707.96",
    ivaComisionCod: "92.04",
    fleteConIva: "2260.00",
    comisionConIva: "800.00",
    total: "3060.00",
    tarifa: tarifa478({ fulfillment: "350.50" }),
  }),
});
