// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T2.1) — los textos NUEVOS de la
// cola, en trato «tú» como el canvas (`specs/SLT-95-detalle-cierre-rediseno/canvas/project/
// ColaCierres.dc.html`, rama mensajero). Los textos que ya existían (región, vacío, error, notas de
// las señales, «Liquidado», «Registrar pago») se importan de donde viven; aquí solo va lo que la cola
// estrena. Módulo puro: ni React ni importes.

import type { AccionBodega, RolCola } from "./cola-cierres-vista";

// ═══ Descripción por rol (R106) ═════════════════════════════════════════════════════════════════

const DESCRIPCION_CENTRAL = "Revisa el cierre de cada mensajero y apruébalo o recházalo.";
const DESCRIPCION_SATELITE =
  "Revisa el cierre de cada mensajero de tu bodega y apruébalo o recházalo.";

/**
 * «Bodega central · GAM. Revisa…» con el nombre de la zona; sin zona (PA3: la central no tiene de
 * dónde sacarlo sin una lectura nueva), «Bodega central. Revisa…».
 */
export function descripcionCola(rol: RolCola, zonaNombre: string | null): string {
  const bodega = rol === "central" ? "Bodega central" : "Bodega satélite";
  const frase = rol === "central" ? DESCRIPCION_CENTRAL : DESCRIPCION_SATELITE;
  return zonaNombre ? `${bodega} · ${zonaNombre}. ${frase}` : `${bodega}. ${frase}`;
}

// ═══ Pie (R106) ═════════════════════════════════════════════════════════════════════════════════

export const PIE_PENDIENTES = "Un cierre vencido se puede destrabar como excepción.";

// ═══ Columnas (R33, R34) ════════════════════════════════════════════════════════════════════════

export const COLUMNA_FOLIO = "Folio";
export const COLUMNA_MENSAJERO = "Mensajero";
export const COLUMNA_SOLICITADO = "Solicitado";
export const COLUMNA_RESUELTO = "Resuelto";
export const COLUMNA_ESTADO = "Estado";
export const COLUMNA_RECAUDADO = "Recaudado";
export const COLUMNA_PAGO = "Pago al mensajero";
export const COLUMNA_PAGO_ENTREGADO = "Pago entregado";
export const COLUMNA_SENALES = "Señales";
/** El canvas deja la cabecera de las acciones en blanco; este nombre solo lo oye el lector. */
export const COLUMNA_ACCIONES = "Acciones";

// ═══ Pago entregado (R103) ══════════════════════════════════════════════════════════════════════

/** Prefijo del pendiente: «Pendiente ₡47.500». El importe lo pinta `money()` en el `.tsx`. */
export const PENDIENTE_PREFIJO = "Pendiente ";

// ═══ Botones de la fila (R105) ══════════════════════════════════════════════════════════════════

export const ACCION_VER_DECIDIR = "Ver / decidir";
export const ACCION_VER = "Ver";
export const ACCION_DESTRABAR = "Destrabar";

/** Nombres accesibles de hoy: los localizan los tests y los E2E. */
export const nombreVerVencido = (mensajero: string) => `Ver el cierre de ${mensajero}`;
export const nombreVerResuelto = (mensajero: string) => `Ver el cierre resuelto de ${mensajero}`;
export const nombreDestrabar = (mensajero: string) =>
  `Destrabar cierre vencido abandonado de ${mensajero}`;
export const nombreRegistrarPago = (mensajero: string) =>
  `Registrar pago del cierre de ${mensajero}`;

// ═══ Señales del servidor (R110) ════════════════════════════════════════════════════════════════

export const incidentesSinIndemnizar = (n: number) =>
  n === 1 ? "1 incidente sin indemnizar" : `${n} incidentes sin indemnizar`;
export const pagosAjustados = (n: number) =>
  n === 1 ? "1 pago ajustado" : `${n} pagos ajustados`;
export const vuelvenABodega = (n: number) =>
  n === 1 ? "1 vuelve a bodega" : `${n} vuelven a bodega`;

// ═══ Pestañas (R99, R127) ═══════════════════════════════════════════════════════════════════════

/** El nombre del `tablist` de la cola de mensajeros (el de hoy); lo localizan tests y E2E. */
export const TABS_COLA_MENSAJERO_LABEL = "Cierres del día por estado";

// ═══ Bodega · central (SLT-127), textos nuevos en trato «tú» ════════════════════════════════════

export const DESCRIPCION_BODEGA_CENTRAL =
  "Los cierres que mandan las bodegas satélite. Márcalos recibidos cuando llegue el dinero.";
export const PIE_POR_CONCILIAR =
  "Un cierre «Recibido incompleto» se queda aquí hasta que la diferencia se reciba o se corrija.";

export const TABS_COLA_BODEGA_LABEL = "Cierres de bodega por estado";
export const PESTANA_POR_CONCILIAR = "Por conciliar";
export const PESTANA_CONCILIADOS = "Conciliados";

export const REGION_POR_CONCILIAR = "Cierres de bodega por conciliar";
export const REGION_CONCILIADOS = "Cierres de bodega conciliados";
export const VACIO_POR_CONCILIAR = "No hay cierres de bodega por conciliar.";
export const VACIO_CONCILIADOS = "Aún no hay cierres de bodega conciliados.";
export const ERROR_POR_CONCILIAR = "No se pudieron cargar los cierres de bodega por conciliar.";
export const ERROR_CONCILIADOS = "No se pudieron cargar los cierres de bodega conciliados.";

export const COLUMNA_BODEGA = "Bodega";
export const COLUMNA_SOLICITO = "Solicitó";
export const COLUMNA_CIERRES = "Cierres";
export const COLUMNA_DEBE_LLEGAR = "Debe llegar";
export const COLUMNA_RECIBIDO = "Recibido";
export const COLUMNA_FALTA = "Falta";

export const ACCION_VER_CONCILIAR = "Ver / conciliar";
export const ACCION_VER_CORREGIR = "Ver / corregir";

/** Nombres accesibles de las tres acciones de la fila de bodega (R130). */
export function nombreAccionBodega(accion: AccionBodega, bodega: string): string {
  if (accion === "verConciliar") return `${ACCION_VER_CONCILIAR} el cierre de bodega de ${bodega}`;
  if (accion === "verCorregir") return `${ACCION_VER_CORREGIR} el cierre de bodega de ${bodega}`;
  return `${ACCION_VER} el cierre de bodega de ${bodega}`;
}
