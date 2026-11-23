// SLT-113 «Excel del modelo nuevo de cierres» (S15a, design «Cliente de cierres») — el LIBRO del
// nivel «Detalle · una fila por gestión» cuando el conjunto tiene algún cierre del modelo nuevo:
// «Gestiones», «Rechazados por la tienda» y, si también hay cierres viejos, «Gestiones modelo
// anterior» (la hoja fundida de hoy, con las columnas marcadas en el selector).
//
// Módulo PURO: sin React, sin DOM, sin `.tsx` y sin ramificar por la bodega central (guardia de
// frontera de la feature 230). Ningún importe se calcula aquí: solo se reparten filas en hojas.

import type { CierreGestionDescargaDTO, RechazoTiendaDescargaDTO } from "@/lib/interfaces/services/ICierresAdminService";
import type { DescargaColumna, DescargaHoja } from "@/lib/types/descarga";
import type { FormatoMoneda } from "@/lib/config/moneda";

import {
  filaDescargaGestionFundida,
  type AudienciaDescargaGestionesFundida,
} from "./cierres-gestiones-fundida-descarga-columnas";
import {
  COLUMNAS_RECHAZOS_TIENDA,
  columnasGestionesModeloNuevoPara,
  filaGestionModeloNuevoEn,
  filaRechazoTienda,
} from "./cierres-gestiones-modelo-nuevo-descarga-columnas";

/** Nombres de las hojas del libro, en su orden (R372). */
export const HOJA_GESTIONES = "Gestiones";
export const HOJA_RECHAZOS_TIENDA = "Rechazados por la tienda";
export const HOJA_GESTIONES_ANTERIOR = "Gestiones modelo anterior";

export interface LibroGestionesEntrada {
  items: readonly CierreGestionDescargaDTO[];
  rechazos: readonly RechazoTiendaDescargaDTO[] | undefined;
  /** Las columnas MARCADAS en el selector: solo valen para «Gestiones modelo anterior» (PA6). */
  columnasAnterior: DescargaColumna[];
  audiencia: AudienciaDescargaGestionesFundida;
  /** SLT-244 (R7, R8): la moneda del país, para el texto de las tarifas. Obligatoria. */
  moneda: FormatoMoneda;
}

/**
 * Las hojas del libro (R372), o `null` si ningún cierre del conjunto es del modelo nuevo (R370: el
 * archivo de hoy, sin cambiar nada). El modelo es del CIERRE (R371), así que todas las gestiones de
 * un cierre caen en la misma hoja. Sin rechazos, «Rechazados por la tienda» sale con sus encabezados.
 */
export function libroGestiones({
  items,
  rechazos,
  columnasAnterior,
  audiencia,
  moneda,
}: LibroGestionesEntrada): [DescargaHoja, ...DescargaHoja[]] | null {
  const nuevas = items.filter((item) => item.cierreModelo === "nuevo");
  if (nuevas.length === 0) return null;
  const filaGestion = filaGestionModeloNuevoEn(moneda);
  const anteriores = items.filter((item) => item.cierreModelo !== "nuevo");
  const hojas: [DescargaHoja, ...DescargaHoja[]] = [
    {
      titulo: HOJA_GESTIONES,
      columnas: columnasGestionesModeloNuevoPara(audiencia),
      filas: nuevas.map((item) => filaGestion(item, audiencia)),
    },
    {
      titulo: HOJA_RECHAZOS_TIENDA,
      columnas: COLUMNAS_RECHAZOS_TIENDA,
      filas: (rechazos ?? []).map(filaRechazoTienda),
    },
  ];
  if (anteriores.length > 0) {
    hojas.push({
      titulo: HOJA_GESTIONES_ANTERIOR,
      columnas: columnasAnterior,
      filas: anteriores.map(filaDescargaGestionFundida),
    });
  }
  return hojas;
}
