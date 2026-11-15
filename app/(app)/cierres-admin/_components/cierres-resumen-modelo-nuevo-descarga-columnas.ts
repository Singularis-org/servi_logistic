// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (S15b, design «Hojas») — columnas
// y proyección de las hojas «Cierres» y «Por tienda» del nivel «Resumen · una fila por cierre». El
// libro (qué hojas, en qué orden) lo arma `cierres-resumen-modelo-nuevo-descarga.ts`.
//
// Lleva el sufijo `-descarga-columnas` porque declara columnas de export: así la guardia de datos
// sensibles lo carga y ejecuta sus proyecciones con su sonda, como a los demás. Por eso cada
// proyección recibe UN objeto de entrada: la sonda es un solo argumento.
//
// El FOLIO llega ya calculado en la entrada (lo saca el libro con `folioCierre`): una proyección de
// este módulo no lee nunca el id del cierre (R23 de la guardia: ningún identificador interno).
//
// Módulo PURO: sin React, sin DOM, sin `.tsx` y sin ramificar por la bodega central (guardia de
// frontera de la feature 230). MONEY-SAFE (R380): ningún importe se calcula aquí; cada celda de
// importe es el STRING del servidor tal cual, con su signo. La conversión a número de Excel la hace
// `celdaMonto` en el generador (`formato: "monto"`).

import type {
  CierreAdminResumen,
  CifrasCierreDescargaDTO,
  ParteDeTiendaDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { fechaDiaInstanteCR } from "@/lib/utils/fecha-dia-iso";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import { destinoCierre, ESTADO_LABEL } from "./cierre-labels";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";

// --- «Cierres» --------------------------------------------------------------------------------

/** La columna que es dato de la CENTRAL (R382, F481): la satélite no la recibe. */
const CLAVE_PAGO_ENTREGADO = "pagoEntregado";

/** Las 20 columnas de «Cierres» para la central, en el orden de R379. */
const COLUMNAS_CIERRES: DescargaColumna[] = [
  { clave: "folio", encabezado: "Folio" },
  { clave: "mensajero", encabezado: "Mensajero" },
  { clave: "destino", encabezado: "Destino" },
  { clave: "estado", encabezado: "Estado" },
  { clave: "solicitado", encabezado: "Solicitado" },
  { clave: "resuelto", encabezado: "Resuelto" },
  { clave: "efectivo", encabezado: "Efectivo", formato: "monto" },
  { clave: "sinpe", encabezado: "SINPE", formato: "monto" },
  { clave: "transferencia", encabezado: "Transferencia", formato: "monto" },
  { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
  { clave: "pagoTienda", encabezado: "Se le paga a la tienda", formato: "monto" },
  { clave: "ganaLaTienda", encabezado: "Gana la tienda en total", formato: "monto" },
  { clave: "pagoMensajero", encabezado: "Pago al mensajero", formato: "monto" },
  { clave: "pagoBodega", encabezado: "Pago a la bodega satélite", formato: "monto" },
  { clave: "totalFacturado", encabezado: "Total facturado", formato: "monto" },
  { clave: "ivaFacturado", encabezado: "IVA facturado", formato: "monto" },
  { clave: "netoEmpresa", encabezado: "Le queda a la empresa", formato: "monto" },
  { clave: "gestiones", encabezado: "Gestiones" },
  { clave: "pagosAjustados", encabezado: "Pagos ajustados" },
  { clave: CLAVE_PAGO_ENTREGADO, encabezado: "Pago entregado", formato: "monto" },
];

/** Columnas de «Cierres» para una audiencia: la satélite, sin «Pago entregado» (falla cerrado). */
export function columnasCierresModeloNuevoPara(
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaColumna[] {
  if (audiencia === "admin") return COLUMNAS_CIERRES;
  return COLUMNAS_CIERRES.filter((columna) => columna.clave !== CLAVE_PAGO_ENTREGADO);
}

/** Lo que proyecta UNA fila de «Cierres»: el cierre, sus cifras del servidor y su folio. */
export interface EntradaFilaCierreModeloNuevo {
  folio: string;
  item: CierreAdminResumen;
  cifras: CifrasCierreDescargaDTO;
}

/**
 * Proyecta UN cierre del modelo nuevo a UNA fila de «Cierres». Los datos descriptivos son los de la
 * hoja de hoy (mismo estado, destino y día calendario); los importes, los strings del servidor.
 * `null` → celda vacía (Resuelto sin resolver, Pagos ajustados sin señales, Pago entregado sin
 * aprobar).
 */
export function filaCierreModeloNuevo(
  { folio, item, cifras }: EntradaFilaCierreModeloNuevo,
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaFila {
  const fila: DescargaFila = {
    folio,
    mensajero: item.mensajeroNombre,
    destino: destinoCierre(item),
    estado: ESTADO_LABEL[item.estado] ?? item.estado,
    // SLT-81: la UI sigue en la zona de CR
    solicitado: fechaDiaInstanteCR(item.solicitadoAt, ZONA_CR),
    resuelto: item.resueltoAt === null ? null : fechaDiaInstanteCR(item.resueltoAt, ZONA_CR),
    efectivo: item.totales.efectivo,
    sinpe: item.totales.simpe,
    transferencia: item.totales.transferencia,
    recaudado: item.totales.general,
    pagoTienda: cifras.pagoTienda,
    ganaLaTienda: cifras.ganaLaTienda,
    pagoMensajero: item.totalPagoMensajero,
    pagoBodega: item.totalIngresoBodegaRechazos,
    totalFacturado: cifras.totalFacturado,
    ivaFacturado: cifras.ivaFacturado,
    netoEmpresa: cifras.netoEmpresa,
    gestiones: cifras.gestiones,
    pagosAjustados: item.senalesCola?.pagosAjustados ?? null,
  };
  // R382: lo de la central solo entra en la fila de la central (el servidor ya lo anula para la
  // satélite; aquí además no viaja la clave).
  if (audiencia === "admin") {
    fila[CLAVE_PAGO_ENTREGADO] = cifras.pagoEntregado;
  }
  return fila;
}

// --- «Por tienda» -----------------------------------------------------------------------------

/** Las 5 columnas de «Por tienda», en el orden de R379. */
export const COLUMNAS_POR_TIENDA: DescargaColumna[] = [
  { clave: "folio", encabezado: "Folio" },
  { clave: "tienda", encabezado: "Tienda" },
  { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
  { clave: "pagoTienda", encabezado: "Se le paga hoy", formato: "monto" },
  { clave: "ganaLaTienda", encabezado: "Gana en total", formato: "monto" },
];

/** Lo que proyecta UNA fila de «Por tienda»: una parte del reparto y el folio de su cierre. */
export interface EntradaFilaPorTienda {
  folio: string;
  parte: ParteDeTiendaDescargaDTO;
}

/** Proyecta UNA parte del reparto por tienda (R381) a UNA fila de «Por tienda». */
export function filaPorTienda({ folio, parte }: EntradaFilaPorTienda): DescargaFila {
  return {
    folio,
    tienda: parte.tiendaNombre,
    recaudado: parte.recaudado,
    pagoTienda: parte.pagoTienda,
    ganaLaTienda: parte.ganaLaTienda,
  };
}
