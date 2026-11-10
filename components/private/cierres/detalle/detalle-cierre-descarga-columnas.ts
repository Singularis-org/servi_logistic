/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (R21, R82, D26) — las columnas de
 * «Descargar» en la pestaña «Gestiones» del detalle único: una fila por gestión del cierre ya leído,
 * las mismas siete para la central y para la satélite. «Señales» la añade SLT-101.
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

import { COBRO_A_LA_TIENDA_COL, PAGO_AL_MENSAJERO_COL } from "./detalle-cierre-labels";

/** Las siete columnas de R82, en su orden. */
export const COLUMNAS_DESCARGA_DETALLE_CIERRE: DescargaColumna[] = [
  { clave: "numGuia", encabezado: "Nº Guía" },
  { clave: "destinatario", encabezado: "Destinatario" },
  { clave: "tienda", encabezado: "Tienda" },
  { clave: "resultado", encabezado: RESULTADO_COL },
  { clave: "recibido", encabezado: RECIBIDO_LABEL },
  { clave: "cobroTienda", encabezado: COBRO_A_LA_TIENDA_COL },
  { clave: "pagoMensajero", encabezado: PAGO_AL_MENSAJERO_COL },
];

/** Una gestión del detalle a su fila: el resultado con su etiqueta legible, los importes crudos. */
export function filaDescargaDetalleCierre(g: CierreDetalleGestion): DescargaFila {
  return {
    numGuia: g.numGuia,
    destinatario: g.destinatario,
    tienda: g.tiendaNombre,
    resultado: RESULTADO_FILA_LABEL[g.resultado],
    recibido: g.montoRecibido,
    cobroTienda: g.ingresoEmpresa?.total ?? null,
    pagoMensajero: g.pagoMensajero,
  };
}
