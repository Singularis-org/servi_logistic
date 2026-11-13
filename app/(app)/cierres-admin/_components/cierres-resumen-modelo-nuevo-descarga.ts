// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (S15b, design «Cliente») — el
// LIBRO del nivel «Resumen · una fila por cierre» cuando el conjunto tiene algún cierre del modelo
// nuevo: «Cierres», «Por tienda» y, si también hay cierres viejos, «Cierres modelo anterior» (la hoja
// de hoy de la pestaña, con las columnas marcadas en el selector).
//
// Módulo PURO: sin React, sin DOM, sin `.tsx` y sin ramificar por la bodega central (guardia de
// frontera de la feature 230). Ningún importe se calcula aquí (R380): solo se reparten filas en
// hojas y se une cada cierre con sus cifras del servidor.

import type { DescargaFilasResult } from "@/components/shared/DataTable";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import type {
  CierreAdminResumen,
  CifrasCierreDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { ListarPendientesCierresAdminCompletoResult } from "@/lib/types/cierres-admin";
import type { DescargaColumna, DescargaFila, DescargaHoja } from "@/lib/types/descarga";
import { folioCierre } from "@/lib/utils/folio-cierre";

import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";
import {
  COLUMNAS_POR_TIENDA,
  columnasCierresModeloNuevoPara,
  filaCierreModeloNuevo,
  filaPorTienda,
} from "./cierres-resumen-modelo-nuevo-descarga-columnas";

/** Nombres de las hojas del libro, en su orden (R378). */
export const HOJA_CIERRES = "Cierres";
export const HOJA_POR_TIENDA = "Por tienda";
export const HOJA_CIERRES_ANTERIOR = "Cierres modelo anterior";

/** La fila de hoy de la pestaña: `filaDescargaCierrePendiente` o `filaDescargaCierreHistorico`. */
export type FilaResumenAnterior = (item: CierreAdminResumen) => DescargaFila;

export interface LibroResumenCierresEntrada {
  items: readonly CierreAdminResumen[];
  cifras: readonly CifrasCierreDescargaDTO[] | undefined;
  /** Las columnas MARCADAS en el selector: solo valen para «Cierres modelo anterior» (R378). */
  columnasAnterior: DescargaColumna[];
  filaAnterior: FilaResumenAnterior;
  audiencia: AudienciaDescargaGestionesFundida;
}

/** El modelo es del CIERRE (R371): nuevo si alguna de sus filas congeladas lo es. */
function esModeloNuevo(item: CierreAdminResumen): boolean {
  return item.incluyeModeloNuevo === true;
}

/**
 * Las hojas del libro (R378), o `null` si el servidor no mandó cifras o ningún cierre del conjunto es
 * del modelo nuevo (R377: el archivo de hoy, sin cambiar nada). Cada cierre cae en UNA hoja. Un
 * cierre nuevo sin su entrada en `cifras` es un error: no se degrada a viejo en silencio.
 */
export function libroResumenCierres({
  items,
  cifras,
  columnasAnterior,
  filaAnterior,
  audiencia,
}: LibroResumenCierresEntrada): [DescargaHoja, ...DescargaHoja[]] | null {
  if (cifras === undefined) return null;
  const nuevos = items.filter(esModeloNuevo);
  if (nuevos.length === 0) return null;
  const anteriores = items.filter((item) => !esModeloNuevo(item));
  const porCierre = new Map(cifras.map((c) => [c.cierreId, c]));

  const filasCierres: DescargaFila[] = [];
  const filasTiendas: DescargaFila[] = [];
  for (const item of nuevos) {
    const suyas = porCierre.get(item.cierreId);
    if (suyas === undefined) {
      throw new Error("faltan las cifras de un cierre del modelo nuevo");
    }
    const folio = folioCierre(item.cierreId);
    filasCierres.push(filaCierreModeloNuevo({ folio, item, cifras: suyas }, audiencia));
    for (const parte of suyas.partesPorTienda) {
      filasTiendas.push(filaPorTienda({ folio, parte }));
    }
  }

  const hojas: [DescargaHoja, ...DescargaHoja[]] = [
    { titulo: HOJA_CIERRES, columnas: columnasCierresModeloNuevoPara(audiencia), filas: filasCierres },
    { titulo: HOJA_POR_TIENDA, columnas: COLUMNAS_POR_TIENDA, filas: filasTiendas },
  ];
  if (anteriores.length > 0) {
    hojas.push({
      titulo: HOJA_CIERRES_ANTERIOR,
      columnas: columnasAnterior,
      filas: anteriores.map(filaAnterior),
    });
  }
  return hojas;
}

/** La respuesta del «Resumen» de cualquiera de las dos pestañas (misma forma). */
type RespuestaResumen = ListarPendientesCierresAdminCompletoResult;

/**
 * Las filas del «Resumen» con UNA sola llamada a la acción. Si la respuesta es `ok` y trae cierres del
 * modelo nuevo, el libro de sus hojas; si no, EXACTAMENTE el resultado de hoy (`filasDesdeResultado`
 * con la fila de la pestaña y sus mensajes de error).
 */
export async function obtenerResumenCierres(
  accion: () => Promise<RespuestaResumen>,
  filaAnterior: FilaResumenAnterior,
  columnasMarcadas: DescargaColumna[],
  audiencia: AudienciaDescargaGestionesFundida,
): Promise<DescargaFilasResult> {
  const respuesta = await accion();
  if (respuesta.status === "ok") {
    const hojas = libroResumenCierres({
      items: respuesta.items,
      cifras: respuesta.cifrasModeloNuevo,
      columnasAnterior: columnasMarcadas,
      filaAnterior,
      audiencia,
    });
    if (hojas !== null) return { status: "ok", filas: hojas[0].filas, libro: { hojas } };
  }
  return filasDesdeResultado(respuesta, filaAnterior);
}
