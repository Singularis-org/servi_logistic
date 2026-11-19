// SLT-101 «Fila de gestión única y lista con filtros» — dobles de una gestión de cierre para los
// tests de la fila (`fila-gestion-vista`, `FilaGestion`, `GestionesCierre`). Los importes son los del
// design (`design.md > Verificación > Componentes`) y del canvas (`Fila2.dc.html`), escritos a mano.
import type {
  CierreDetalleGestion,
  IngresoEmpresaDTO,
} from "@/lib/interfaces/services/ICierreDiaService";

export function gestionFila(over: Partial<CierreDetalleGestion> & { gestionId: string }): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-11-07",
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Beto Ruiz",
    direccion: "Calle 1, Barrio Amón, San José",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja",
    tiendaNombre: "Tienda Norte",
    resultado: "entregado",
    montoRecibido: "25000.00",
    metodoPago: null,
    pagos: [
      { metodo: "efectivo", monto: "15000.00" },
      { metodo: "SINPE", monto: "10000.00" },
      { metodo: "transferencia", monto: "0.00" },
    ],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null,
    evidenciaUrls: [],
    pagoMensajero: "1500.00",
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

/** Modelo VIEJO, entrega GAM: tarifa 4 000, IVA 13 %, comisión 4 % de 25 000 con IVA 13 %. */
export function ingresoViejo(over: Partial<IngresoEmpresaDTO> = {}): IngresoEmpresaDTO {
  return {
    montoCobrar: "25000.00",
    cobraComision: true,
    esCentral: true,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: "4000.00",
    ivaFlete: "520.00",
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: "1000.00",
    ivaComisionCod: "130.00",
    fleteConIva: "4520.00",
    fleteDevolucionConIva: null,
    comisionConIva: "1130.00",
    total: "5650.00",
    fulfillment: "300.00",
    ivaFulfillment: "0.00",
    tarifa: {
      tarifaId: "t-1",
      valorFlete: "3000.00",
      valorFleteGam: "4000.00",
      valorFleteDevuelto: "1500.00",
      valorFleteDevueltoGam: "2000.00",
      comisionCod: "4.00",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
      fulfillment: "300.00",
      tarifaEspecial: null,
      tarifaEspecialDevuelta: null,
    },
    tarifaModelo: "viejo",
    ivaIncluido: "650.00",
    fulfillmentConIva: "300.00",
    ivaPctFulfillment: null,
    fulfillmentCargadoAt: null,
    conceptosTarifa: [],
    ...over,
  };
}

/** Modelo NUEVO = el canvas (`Fila2.dc.html`). */
export function ingresoNuevo(over: Partial<IngresoEmpresaDTO> = {}): IngresoEmpresaDTO {
  return {
    montoCobrar: "25000.00",
    cobraComision: true,
    esCentral: true,
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
    // 09:00 de Costa Rica del 6 de noviembre.
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
      {
        concepto: "comisionCod",
        modo: "porcentaje",
        valor: "2.00",
        ivaPct: "13.00",
        base: "25000.00",
        nivel: "zona",
        zonaNombre: "GAM",
        grupoNombre: null,
        vehiculoNombre: null,
      },
    ],
    ...over,
  };
}

/** La gestión del canvas: modelo nuevo, pago congelado 2 500 ajustado a 1 800. */
export function gestionCanvas(over: Partial<CierreDetalleGestion> = {}): CierreDetalleGestion {
  return gestionFila({
    gestionId: "g-canvas",
    pagos: [
      { metodo: "efectivo", monto: "15000.00" },
      { metodo: "SINPE", monto: "10000.00" },
    ],
    pagoMensajero: "1800.00",
    ingresoEmpresa: ingresoNuevo(),
    pagoPorTarifa: {
      importe: "2500.00",
      modo: "monto",
      valor: "2500.00",
      base: null,
      nivel: "mensajero",
      zonaNombre: null,
      grupoNombre: null,
      vehiculoNombre: null,
      ajuste: { signo: "resta", monto: "700.00" },
    },
    ajustesPago: [
      {
        // 19:02 de Costa Rica del 7 de noviembre.
        creadoAt: "2026-11-08T01:02:00.000Z",
        actorNombre: "Carlos R.",
        actorRol: "admin",
        pagoAnterior: "2500.00",
        pagoNuevo: "1800.00",
        motivo: "Entrega compartida con Luis",
      },
    ],
    ...over,
  });
}

/** `solicitadoAt` del cierre del canvas: 18:42 de Costa Rica del 7 de noviembre. */
export const CONGELADO_AT = "2026-11-08T00:42:00.000Z";
