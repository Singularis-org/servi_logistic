// SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (T2.1) — la lógica PURA y los
// textos de la cola con rol mensajero (`design.md > Lógica pura`). Archivo propio para no tocar
// `cola-cierres-vista.ts` ni `cola-cierres-labels.ts`, que son de la cola de la central y la
// satélite (R163). Ningún importe se convierte a número: el pendiente se compara como TEXTO con
// `hayPendienteDeLiquidar` y el resto lo pinta `money()` en el `.tsx` (R71).

import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import {
  DESTINO_TIPO_LABEL,
  ESTADO_LABEL,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import { hayPendienteDeLiquidar } from "@/app/(app)/cierres-admin/_components/PendienteLiquidarBadge";
import type { FilterOption, FilterSelection } from "@/components/shared/FilterComponent";
import {
  ESTADOS_FILTRO_CIERRES,
  type FiltrosColaPropia,
} from "@/lib/types/filtros-cierres";

// ═══ Textos (trato tú, R180) ════════════════════════════════════════════════════════════════════

export const DESCRIPCION_PROPIA = "Tus cierres enviados a aprobación y cómo terminaron.";
export const PESTANA_PROPIA = "Cierres solicitados";
export const TABLIST_PROPIA = "Tus cierres";
export const REGION_PROPIA = "Cierres solicitados";
/** R160: los de hoy, sin cambiar una letra. */
export const VACIO_PROPIA = "Aún no has solicitado ningún cierre.";
export const ERROR_PROPIA = "No se pudieron cargar tus cierres solicitados.";

/** «Ver» de la fila; su nombre accesible añade el día del cierre (`TablaColaPropia.tsx`). */
export const VER_PROPIA = "Ver";

export const PAGO_PENDIENTE = "Pendiente de pago";
export const PAGO_LIQUIDADO = "Liquidado";
/** R157: aprobado sin el pendiente emitido por el servidor (PA1 de SLT-108). */
export const PAGO_SIN_DATO = "Sin dato";
export const MOTIVO_SIN_TEXTO = "La bodega no indicó un motivo.";
/** R157: cualquier estado que no es aprobado ni rechazado. */
export const PAGO_NULO = "—";

// ═══ Columnas (R60, R156) ═══════════════════════════════════════════════════════════════════════

export type ColumnaPropiaId =
  | "folio"
  | "solicitado"
  | "destino"
  | "estado"
  | "recaudado"
  | "ganancia"
  | "pago"
  | "acciones";

export interface ColumnaPropia {
  id: ColumnaPropiaId;
  label: string;
  align?: "right";
  /** La cabecera no se ve pero tiene nombre para el lector. */
  soloLector?: boolean;
}

/** Folio · Solicitado · Destino · Estado · Recaudado · Ganancia · Pago · acciones. */
export function columnasColaPropia(): ColumnaPropia[] {
  return [
    { id: "folio", label: "Folio" },
    { id: "solicitado", label: "Solicitado" },
    { id: "destino", label: "Destino" },
    { id: "estado", label: "Estado" },
    // Los dos importes alineados a la derecha, como en la cola de la central.
    { id: "recaudado", label: "Recaudado", align: "right" },
    { id: "ganancia", label: "Ganancia", align: "right" },
    { id: "pago", label: "Pago" },
    { id: "acciones", label: "Acciones", soloLector: true },
  ];
}

// ═══ Celdas (R156, R157) ════════════════════════════════════════════════════════════════════════

/** R156: el rótulo del tipo de destino, sin la zona. */
export function destinoPropio(c: Pick<CierrePasadoDTO, "destinoTipo">): string {
  return DESTINO_TIPO_LABEL[c.destinoTipo];
}

export type PagoPropio =
  | { tipo: "motivo"; texto: string }
  | { tipo: "pendiente" }
  | { tipo: "liquidado" }
  | { tipo: "sinDato" }
  | { tipo: "nulo" };

/**
 * R157. Un aprobado sin string (campo ausente o `null`) es «Sin dato»: el servicio no lo calculó, y
 * decir «Liquidado» ahí afirmaría una deuda saldada que nadie leyó.
 */
export function pagoPropioDe(
  c: Pick<CierrePasadoDTO, "estado" | "motivoRechazo" | "pendientePagoMensajero">,
): PagoPropio {
  if (c.estado === "rechazado") {
    const motivo = c.motivoRechazo?.trim();
    return { tipo: "motivo", texto: motivo ? `Motivo: «${motivo}»` : MOTIVO_SIN_TEXTO };
  }
  if (c.estado === "aprobado") {
    const pendiente = c.pendientePagoMensajero;
    if (typeof pendiente !== "string") return { tipo: "sinDato" };
    return hayPendienteDeLiquidar(pendiente) ? { tipo: "pendiente" } : { tipo: "liquidado" };
  }
  return { tipo: "nulo" };
}

export function textoPagoPropio(p: PagoPropio): string {
  switch (p.tipo) {
    case "motivo":
      return p.texto;
    case "pendiente":
      return PAGO_PENDIENTE;
    case "liquidado":
      return PAGO_LIQUIDADO;
    case "sinDato":
      return PAGO_SIN_DATO;
    case "nulo":
      return PAGO_NULO;
  }
}

// ═══ Barra de filtros (SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero») ══════
// Textos en tú (R180). La barra (`FiltrosColaPropiaBarra.tsx`) solo los monta; la traducción de la
// selección al contrato del servidor vive aquí para probarse sin montar nada.

/** R177: la guía del campo de búsqueda. */
export const BUSCA_POR_FOLIO = "Busca por folio";
/** R176: el vacío cuando hay algún filtro puesto. */
export const VACIO_FILTRADO_PROPIA = "Ningún cierre coincide con los filtros.";
/** Nombre accesible de la `section` de la barra. */
export const BARRA_PROPIA = "Filtros de tus cierres";
export const FILTRO_FECHA_PROPIA = "Fecha de solicitud";
export const FILTRO_ESTADO_PROPIA = "Estado";

/** Claves de los CONTROLES de la barra (no del contrato del servidor, que es `desde`/`hasta`/`estados`). */
export const CLAVE_FECHA_PROPIA = "fecha";
export const CLAVE_ESTADO_PROPIA = "estado";

/**
 * R177: los cuatro estados que acepta el borde, con su etiqueta legible y SIN `group`: aquí hay una
 * sola lista, así que agruparlos por pestaña (como en `/cierres-admin`) no diría nada.
 */
export function opcionesEstadoPropias(): FilterOption[] {
  return ESTADOS_FILTRO_CIERRES.map((estado) => ({ value: estado, label: ESTADO_LABEL[estado] }));
}

type EstadoFiltro = (typeof ESTADOS_FILTRO_CIERRES)[number];

/**
 * La selección de `FilterComponent` y el término del buscador → el bloque `filtros` del servidor.
 * La fecha viaja como la terna `[atajo, desde, hasta]`; un extremo `""` no se fijó. Una lista de
 * estados vacía es la AUSENCIA del filtro (el borde rechaza `[]`). El folio va recortado; el resto de
 * la normalización la hace el servidor (R171). Las claves ausentes no viajan, ni como `undefined`.
 */
export function aFiltrosPropios(seleccion: FilterSelection, termino: string): FiltrosColaPropia {
  const [, desde = "", hasta = ""] = seleccion[CLAVE_FECHA_PROPIA] ?? [];
  const estados = seleccion[CLAVE_ESTADO_PROPIA] ?? [];
  const folio = termino.trim();
  return {
    ...(desde === "" ? {} : { desde }),
    ...(hasta === "" ? {} : { hasta }),
    // `FilterComponent` solo emite valores declarados (los de `opcionesEstadoPropias`).
    ...(estados.length === 0 ? {} : { estados: estados as [EstadoFiltro, ...EstadoFiltro[]] }),
    ...(folio === "" ? {} : { folio }),
  };
}
