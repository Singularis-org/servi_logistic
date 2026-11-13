// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (S15c, design «Cliente») — el LIBRO del
// «Resumen» de los cierres de bodega («Por conciliar», «Conciliados» y «Solicitados» de la satélite)
// cuando el conjunto tiene algún cierre de bodega del modelo nuevo: «Cierres», «Por tienda» y, si
// también hay cierres viejos, «Cierres modelo anterior» (el archivo de hoy de esa pestaña, con las
// columnas marcadas en el selector; PA3).
//
// Reusa de SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» los nombres de hoja y la
// hoja «Por tienda» (mismas cinco columnas sobre la misma forma de la parte).
//
// Módulo PURO: sin React, sin DOM, sin `.tsx` y sin ramificar por la bodega central (guardia de
// frontera de la feature 230). Ningún importe se calcula aquí (R387): solo se reparten filas en hojas
// y se une cada cierre de bodega con sus cifras del servidor.

import type { DescargaFilasResult } from "@/components/shared/DataTable";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { ListarCompletoResult } from "@/lib/types/descarga-listado";
import type { DescargaColumna, DescargaFila, DescargaHoja } from "@/lib/types/descarga";
import { folioCierre } from "@/lib/utils/folio-cierre";

import {
  columnasCierresBodegaModeloNuevoPara,
  filaCierreBodegaModeloNuevo,
  type CifrasCierreBodegaDescarga,
} from "./cierres-bodega-modelo-nuevo-descarga-columnas";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";
import { COLUMNAS_POR_TIENDA, filaPorTienda } from "./cierres-resumen-modelo-nuevo-descarga-columnas";
import {
  HOJA_CIERRES,
  HOJA_CIERRES_ANTERIOR,
  HOJA_POR_TIENDA,
} from "./cierres-resumen-modelo-nuevo-descarga";

/** La fila de hoy de la pestaña: `filaDescargaBodegaPendiente`, `…Resuelto` o `…Solicitado`. */
export type FilaResumenBodegaAnterior = (item: CierreBodegaResumen) => DescargaFila;

export interface LibroCierresBodegaEntrada {
  items: readonly CierreBodegaResumen[];
  cifras: readonly CifrasCierreBodegaDescarga[] | undefined;
  /** Las columnas MARCADAS en el selector: solo valen para «Cierres modelo anterior» (PA3). */
  columnasAnterior: DescargaColumna[];
  filaAnterior: FilaResumenBodegaAnterior;
  audiencia: AudienciaDescargaGestionesFundida;
}

/** El modelo es del CIERRE DE BODEGA: nuevo si alguno de sus cierres del día lo es (D40). */
function esModeloNuevo(item: CierreBodegaResumen): boolean {
  return item.incluyeModeloNuevo === true;
}

/**
 * Las hojas del libro (R385), o `null` si el servidor no mandó cifras o ningún cierre de bodega del
 * conjunto es del modelo nuevo (R384: el archivo de hoy, sin cambiar nada). Cada cierre de bodega cae
 * en UNA hoja y las filas siguen el orden de la lista. Un cierre nuevo sin su entrada en `cifras` es
 * un error: no se inventa una fila vacía ni se degrada a viejo en silencio.
 */
export function libroCierresBodega({
  items,
  cifras,
  columnasAnterior,
  filaAnterior,
  audiencia,
}: LibroCierresBodegaEntrada): [DescargaHoja, ...DescargaHoja[]] | null {
  if (cifras === undefined) return null;
  const nuevos = items.filter(esModeloNuevo);
  if (nuevos.length === 0) return null;
  const anteriores = items.filter((item) => !esModeloNuevo(item));
  const porCierre = new Map(cifras.map((c) => [c.cierreBodegaId, c]));

  const filasCierres: DescargaFila[] = [];
  const filasTiendas: DescargaFila[] = [];
  for (const item of nuevos) {
    const suyas = porCierre.get(item.cierreBodegaId);
    if (suyas === undefined) {
      throw new Error("faltan las cifras de un cierre de bodega del modelo nuevo");
    }
    const folio = folioCierre(item.cierreBodegaId);
    filasCierres.push(filaCierreBodegaModeloNuevo({ folio, item, cifras: suyas }, audiencia));
    for (const parte of suyas.partesPorTienda) {
      filasTiendas.push(filaPorTienda({ folio, parte }));
    }
  }

  const hojas: [DescargaHoja, ...DescargaHoja[]] = [
    {
      titulo: HOJA_CIERRES,
      columnas: columnasCierresBodegaModeloNuevoPara(audiencia),
      filas: filasCierres,
    },
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

/**
 * La respuesta de cualquiera de las tres descargas: la rama `ok` puede traer `cifrasModeloNuevo` (con
 * `pagoEntregado` la central; sin la clave la satélite).
 */
type RespuestaResumenBodega =
  | (Extract<ListarCompletoResult<CierreBodegaResumen>, { status: "ok" }> & {
      cifrasModeloNuevo?: CifrasCierreBodegaDescarga[];
    })
  | Exclude<ListarCompletoResult<CierreBodegaResumen>, { status: "ok" }>;

/**
 * Las filas del «Resumen» con UNA sola llamada a la acción. Si la respuesta es `ok` y trae cierres de
 * bodega del modelo nuevo, el libro de sus hojas; si no, EXACTAMENTE el resultado de hoy
 * (`filasDesdeResultado` con la fila de la pestaña y sus mensajes de error).
 */
export async function obtenerResumenCierresBodega(
  accion: () => Promise<RespuestaResumenBodega>,
  filaAnterior: FilaResumenBodegaAnterior,
  columnasMarcadas: DescargaColumna[],
  audiencia: AudienciaDescargaGestionesFundida,
): Promise<DescargaFilasResult> {
  const respuesta = await accion();
  if (respuesta.status === "ok") {
    const hojas = libroCierresBodega({
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
