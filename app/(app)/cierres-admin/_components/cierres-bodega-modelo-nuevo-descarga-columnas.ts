// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (S15c, design «Hojas») — columnas y
// proyección de la hoja «Cierres» del «Resumen» de los cierres de bodega del modelo nuevo. «Por
// tienda» es la de SLT-140 tal cual (mismas cinco columnas sobre la misma forma de la parte), y el
// libro (qué hojas, en qué orden) lo arma `cierres-bodega-modelo-nuevo-descarga.ts`.
//
// Lleva el sufijo `-descarga-columnas` porque declara columnas de export: así la guardia de datos
// sensibles lo carga y ejecuta su proyección con su sonda. Por eso la proyección recibe UN objeto de
// entrada.
//
// El FOLIO llega ya calculado en la entrada (lo saca el libro con `folioCierre`): la proyección no lee
// nunca el id del cierre de bodega (R23 de la guardia: ningún identificador interno).
//
// Módulo PURO: sin React, sin DOM, sin `.tsx` y sin ramificar por la bodega central (guardia de
// frontera de la feature 230). MONEY-SAFE (R387): ningún importe se calcula aquí; cada celda de
// importe es el STRING del servidor tal cual, con su signo. La conversión a número de Excel la hace
// `celdaMonto` en el generador (`formato: "monto"`).

import type {
  CierreBodegaResumen,
  CifrasCierreBodegaDescargaDTO,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { fechaDiaInstanteCR } from "@/lib/utils/fecha-dia-iso";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import {
  DESTINO_TIPO_LABEL,
  ESTADO_CONCILIACION_LABEL,
  estadoConciliacionDe,
} from "./cierre-labels";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";

/** La columna que es dato de la CENTRAL (R386, F481): la satélite no la recibe. */
const CLAVE_PAGO_ENTREGADO = "pagoEntregado";

/** Las 26 columnas de «Cierres» de bodega para la central, en el orden de `design.md > Hojas`. */
export const COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO: DescargaColumna[] = [
  { clave: "folio", encabezado: "Folio" },
  { clave: "bodega", encabezado: "Bodega" },
  { clave: "destino", encabezado: "Destino" },
  { clave: "estado", encabezado: "Estado" },
  { clave: "solicitado", encabezado: "Solicitado" },
  { clave: "resuelto", encabezado: "Resuelto" },
  { clave: "efectivo", encabezado: "Efectivo", formato: "monto" },
  { clave: "sinpe", encabezado: "SINPE", formato: "monto" },
  { clave: "transferencia", encabezado: "Transferencia", formato: "monto" },
  { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
  { clave: "paraLaCentral", encabezado: "Debe llegar a la central", formato: "monto" },
  { clave: "ganaLaTienda", encabezado: "Gana la tienda en total", formato: "monto" },
  { clave: "pagoMensajero", encabezado: "Pago al mensajero", formato: "monto" },
  { clave: "pagoBodega", encabezado: "Pago a la bodega satélite", formato: "monto" },
  { clave: "totalFacturado", encabezado: "Total facturado", formato: "monto" },
  { clave: "ivaFacturado", encabezado: "IVA facturado", formato: "monto" },
  { clave: "netoEmpresa", encabezado: "Le queda a la empresa", formato: "monto" },
  { clave: "gestiones", encabezado: "Gestiones" },
  { clave: "pagosAjustados", encabezado: "Pagos ajustados" },
  { clave: CLAVE_PAGO_ENTREGADO, encabezado: "Pago entregado", formato: "monto" },
  { clave: "cierresIncluidos", encabezado: "Cierres incluidos" },
  { clave: "recibido", encabezado: "Recibido", formato: "monto" },
  { clave: "faltaPorRecibir", encabezado: "Falta por recibir", formato: "monto" },
  { clave: "estadoConciliacion", encabezado: "Estado de conciliación" },
  { clave: "conciliadoPor", encabezado: "Conciliado por" },
  { clave: "conciliadoEl", encabezado: "Conciliado el" },
];

/** Columnas de «Cierres» de bodega para una audiencia: la satélite, sin «Pago entregado» (falla cerrado). */
export function columnasCierresBodegaModeloNuevoPara(
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaColumna[] {
  if (audiencia === "admin") return COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO;
  return COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO.filter((columna) => columna.clave !== CLAVE_PAGO_ENTREGADO);
}

/**
 * Las cifras de un cierre de bodega tal como llegan a cualquiera de las dos audiencias: la central
 * trae además `pagoEntregado` (`CifrasCierreBodegaCentralDescargaDTO`); la satélite no tiene la clave.
 */
export type CifrasCierreBodegaDescarga = CifrasCierreBodegaDescargaDTO & {
  pagoEntregado?: string | null;
};

/** Lo que proyecta UNA fila de «Cierres»: el cierre de bodega, sus cifras del servidor y su folio. */
export interface EntradaFilaCierreBodegaModeloNuevo {
  folio: string;
  item: CierreBodegaResumen;
  cifras: CifrasCierreBodegaDescarga;
}

/** Día calendario en la zona del país, como las fechas del archivo de hoy; vacío si no hay fecha. */
function diaCR(iso: string | null): string | null {
  // SLT-81: la UI sigue en la zona de CR
  return iso === null ? null : fechaDiaInstanteCR(iso, ZONA_CR);
}

/**
 * Proyecta UN cierre de bodega del modelo nuevo a UNA fila de «Cierres». Los datos descriptivos son
 * los de la fila de hoy de la cola (Bodega, Estado con el vocabulario de la conciliación, Recibido,
 * Falta por recibir, Conciliado por, Cierres incluidos; PA2); los importes, los strings del servidor.
 * `null` → celda vacía (Resuelto sin resolver, Recibido sin conciliar —nunca 0—, Pago entregado con
 * algún cierre del día sin aprobar).
 */
export function filaCierreBodegaModeloNuevo(
  { folio, item, cifras }: EntradaFilaCierreBodegaModeloNuevo,
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaFila {
  // PA2: un cierre de bodega siempre va a la central; el texto es el que la pantalla da a ese destino.
  // `CierreBodegaResumen` no trae el nombre de la zona central, así que sale solo el tipo.
  const estado = ESTADO_CONCILIACION_LABEL[estadoConciliacionDe(item)];
  const fila: DescargaFila = {
    folio,
    bodega: item.zonaNombre,
    destino: DESTINO_TIPO_LABEL.bodega_central,
    estado,
    solicitado: diaCR(item.solicitadoAt),
    resuelto: diaCR(item.resueltoAt),
    efectivo: item.totales.efectivo,
    sinpe: item.totales.simpe,
    transferencia: item.totales.transferencia,
    recaudado: item.totales.general,
    paraLaCentral: item.paraLaCentral,
    ganaLaTienda: cifras.ganaLaTienda,
    pagoMensajero: item.totalPagoMensajero,
    pagoBodega: item.totalIngresoBodegaRechazos,
    totalFacturado: cifras.totalFacturado,
    ivaFacturado: cifras.ivaFacturado,
    netoEmpresa: cifras.netoEmpresa,
    gestiones: cifras.gestiones,
    pagosAjustados: cifras.pagosAjustados,
  };
  // R386: lo de la central solo entra en la fila de la central (el servidor ya no se lo manda a la
  // satélite; aquí además no viaja la clave).
  if (audiencia === "admin") {
    fila[CLAVE_PAGO_ENTREGADO] = cifras.pagoEntregado ?? null;
  }
  fila.cierresIncluidos = item.cantidadCierres;
  fila.recibido = item.montoRecibido;
  fila.faltaPorRecibir = item.faltaPorRecibir;
  fila.estadoConciliacion = estado;
  fila.conciliadoPor = item.conciliadoPorNombre;
  fila.conciliadoEl = diaCR(item.conciliadoAt);
  return fila;
}
