/**
 * Feature 170 (T E.4, design §3/§7) — columnas de EXPORT del «Cierre del día» del MENSAJERO:
 * el histórico de cierres solicitados, y el encabezado «Ganancia» que usa también la descarga de
 * «Gestiones» del detalle de un cierre.
 *
 * SLT-115 «Retirar los componentes de cierre sustituidos» (R404): aquí vivían también los cinco
 * catálogos por resultado (entregadas, reprogramadas, devueltas, rechazadas, incidentes), con su
 * ámbito y su proyección. SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página»
 * (R256) los dejó sin consumidor al pasar las cinco secciones a UNA descarga, la de «Gestiones» del
 * detalle único; se retiraron. `tests/unit/guards/cierres-retirados.guardia.test.ts` fija la lista
 * exacta de exports.
 *
 * Esta pantalla enseña MENOS que las del admin, y a propósito: el mensajero no ve el ingreso de la
 * empresa (flete, comisión, IVA, total). Exportar aquí lo que el admin ve sería publicar por el
 * archivo lo que la pantalla oculta, que es exactamente lo que R24 prohíbe.
 *
 * Módulo PURO: sin React ni DOM. MONEY-SAFE: los montos viajan como el STRING del servidor,
 * TAL CUAL, sin `parseFloat`/`Number` y sin el símbolo de colón de `money`.
 */
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { fechaDiaInstanteCR } from "@/lib/utils/fecha-dia-iso";
import {
  DESTINO_TIPO_LABEL,
  ESTADO_LABEL,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";

import { ZONA_CR } from "@/lib/utils/fecha-cr";

/**
 * Encabezado del pago al mensajero EN SU PANTALLA. Aquí se llama "Ganancia" (y no "Pago
 * mensajero", como en las pantallas de admin): es su palabra para el mismo dato, y el
 * archivo usa la de la pantalla que lo produce (R8).
 */
export const GANANCIA_COL = "Ganancia";

/**
 * Identificador de ÁMBITO de la preferencia de columnas del histórico (314/R1, R10).
 *
 * No se llama `cierres-solicitados` a secas para no confundirse con `cierres-bodega-solicitados`:
 * éste es «los MÍOS», el conjunto de un solo mensajero.
 */
export const AMBITO_DESCARGA_DIA_CIERRES_PASADOS = "mis-cierres-solicitados";

// ---------------------------------------------------------------------------
// Histórico de cierres solicitados
// ---------------------------------------------------------------------------

export const COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS: DescargaColumna[] = [
  { clave: "estado", encabezado: "Estado" },
  { clave: "destino", encabezado: "Destino" },
  { clave: "efectivo", encabezado: "Efectivo" },
  { clave: "simpe", encabezado: "SINPE" },
  { clave: "transferencia", encabezado: "Transferencia" },
  { clave: "general", encabezado: "Total" },
  { clave: "ganancia", encabezado: GANANCIA_COL },
  { clave: "fecha", encabezado: "Fecha" },
];

/**
 * Proyecta un cierre pasado del mensajero. Estado y destino salen como ETIQUETA LEGIBLE (R8);
 * la fecha, como el DÍA calendario, igual que la tabla. Esta tabla NO muestra la zona del
 * destino (solo el tipo), y el archivo tampoco (R24).
 */
export function filaDescargaDiaCierrePasado(cierre: CierrePasadoDTO): DescargaFila {
  return {
    estado: ESTADO_LABEL[cierre.estado] ?? cierre.estado,
    destino: DESTINO_TIPO_LABEL[cierre.destinoTipo] ?? cierre.destinoTipo,
    efectivo: cierre.totales.efectivo, // STRING tal cual (money-safe)
    simpe: cierre.totales.simpe,
    transferencia: cierre.totales.transferencia,
    general: cierre.totales.general,
    ganancia: cierre.totalPagoMensajero,
    // SLT-81: la UI sigue en la zona de CR
    fecha: fechaDiaInstanteCR(cierre.solicitadoAt, ZONA_CR),
  };
}
