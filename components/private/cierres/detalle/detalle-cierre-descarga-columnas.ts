/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (R21, R82, D26) — las columnas de
 * «Descargar» en la pestaña «Gestiones» del detalle único: una fila por gestión del cierre ya leído,
 * las mismas siete para la central y para la satélite. SLT-101 «Fila de gestión única y lista con
 * filtros» (R91) añade «Señales» al final, con el MISMO texto que la celda de la tabla para la
 * audiencia que descarga (`textoSenales`).
 *
 * Módulo PURO: sin React ni DOM. MONEY-SAFE (R71): cada importe es el STRING del servidor tal cual,
 * sin `money()` (rompería la celda como número) y sin convertirlo. Un importe ausente sale `null`
 * —celda vacía—, nunca `"0"`.
 *
 * Lo que NO sale: `gestionId` ni `ordenId` (uuid internos).
 */
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { RECIBIDO_LABEL, RESULTADO_FILA_LABEL } from "@/app/(app)/cierres-admin/_components/cierre-labels";
import { RESULTADO_COL } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";

import { COL_MENSAJERO, COL_SENALES } from "../fila/fila-gestion-labels";
import { textoSenales, type AudienciaFila } from "../fila/fila-gestion-vista";
import { COBRO_A_LA_TIENDA_COL, PAGO_AL_MENSAJERO_COL } from "./detalle-cierre-labels";
import { GANANCIA_COL } from "@/app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas";

/** Las siete columnas de R82 y «Señales» (R91), en su orden. */
export const COLUMNAS_DESCARGA_DETALLE_CIERRE: DescargaColumna[] = [
  { clave: "numGuia", encabezado: "Nº Guía" },
  { clave: "destinatario", encabezado: "Destinatario" },
  { clave: "tienda", encabezado: "Tienda" },
  { clave: "resultado", encabezado: RESULTADO_COL },
  { clave: "recibido", encabezado: RECIBIDO_LABEL },
  { clave: "cobroTienda", encabezado: COBRO_A_LA_TIENDA_COL },
  { clave: "pagoMensajero", encabezado: PAGO_AL_MENSAJERO_COL },
  { clave: "senales", encabezado: COL_SENALES },
];

/**
 * SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (R113): las del detalle de
 * bodega, con «Mensajero» tras «Tienda» (la columna que la tabla pinta en ese sitio). Las de
 * mensajero no cambian.
 */
export const COLUMNAS_DESCARGA_DETALLE_BODEGA: DescargaColumna[] = [
  ...COLUMNAS_DESCARGA_DETALLE_CIERRE.slice(0, 3),
  { clave: "mensajero", encabezado: COL_MENSAJERO },
  ...COLUMNAS_DESCARGA_DETALLE_CIERRE.slice(3),
];

/**
 * R113 — una gestión del detalle de bodega a su fila: la de mensajero más su mensajero. Las señales,
 * con el texto de la audiencia «solo lectura», que es la de la fila que se ve (R31).
 */
export function filaDescargaDetalleBodega(g: CierreDetalleGestion, mensajeroNombre: string | undefined): DescargaFila {
  return { ...filaDescargaDetalleCierre(g, "solo lectura"), mensajero: mensajeroNombre ?? null };
}

/**
 * Una gestión del detalle a su fila: el resultado con su etiqueta legible, los importes crudos y
 * las señales de esa audiencia (`null` sin señales: celda vacía, R91).
 */
export function filaDescargaDetalleCierre(g: CierreDetalleGestion, audiencia: AudienciaFila): DescargaFila {
  return {
    numGuia: g.numGuia,
    destinatario: g.destinatario,
    tienda: g.tiendaNombre,
    resultado: RESULTADO_FILA_LABEL[g.resultado],
    recibido: g.montoRecibido,
    cobroTienda: g.ingresoEmpresa?.total ?? null,
    pagoMensajero: g.pagoMensajero,
    senales: textoSenales(g, audiencia) || null,
  };
}

/**
 * SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (R152) — las columnas de
 * «Descargar» del detalle cuando lo mira el propio mensajero: «Ganancia» (su pago) en lugar del par
 * «Cobro a la tienda» / «Pago al mensajero». Ni una cifra del dinero de la empresa (R9).
 */
export const COLUMNAS_DESCARGA_DETALLE_MENSAJERO: DescargaColumna[] = [
  { clave: "numGuia", encabezado: "Nº Guía" },
  { clave: "destinatario", encabezado: "Destinatario" },
  { clave: "tienda", encabezado: "Tienda" },
  { clave: "resultado", encabezado: RESULTADO_COL },
  { clave: "recibido", encabezado: RECIBIDO_LABEL },
  { clave: "ganancia", encabezado: GANANCIA_COL },
  { clave: "senales", encabezado: COL_SENALES },
];

/** R152 — una gestión del detalle a la fila del mensajero; las señales, las que él ve en la fila. */
export function filaDescargaDetalleMensajero(g: CierreDetalleGestion): DescargaFila {
  return {
    numGuia: g.numGuia,
    destinatario: g.destinatario,
    tienda: g.tiendaNombre,
    resultado: RESULTADO_FILA_LABEL[g.resultado],
    recibido: g.montoRecibido,
    ganancia: g.pagoMensajero,
    senales: textoSenales(g, "mensajero") || null,
  };
}
