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

// ═══ Bodega · satélite: «A consolidar» (SLT-106), textos nuevos en trato «tú» ═══════════════════

export const DESCRIPCION_BODEGA_SATELITE =
  "Junta los cierres aprobados de tus mensajeros y envíalos a la central.";

/** «Bodega satélite · Norte. Junta…»; sin el nombre de la zona, «Bodega satélite. Junta…» (R203). */
export function descripcionColaSatelite(zonaNombre: string | null): string {
  return zonaNombre
    ? `Bodega satélite · ${zonaNombre}. ${DESCRIPCION_BODEGA_SATELITE}`
    : `Bodega satélite. ${DESCRIPCION_BODEGA_SATELITE}`;
}

/** El nombre de hoy del conmutador de la satélite; lo localizan tests y E2E (R190). */
export const TABS_COLA_CONSOLIDACION_LABEL = "Cierre de bodega por etapa";
export const PESTANA_A_CONSOLIDAR = "A consolidar";
export const PESTANA_SOLICITADOS = "Solicitados";

/** Los de hoy (R203): región, vacío y error de los cierres del día a consolidar. */
export const REGION_A_CONSOLIDAR = "Cierres del día a consolidar";
export const VACIO_A_CONSOLIDAR = "No hay cierres del día aprobados para consolidar.";
export const ERROR_A_CONSOLIDAR = "No se pudieron cargar los cierres a consolidar.";

export const COLUMNA_APROBADO = "Aprobado";
export const COLUMNA_PAGO_CORTO = "Pago";
export const COLUMNA_GANA_BODEGA = "Gana bodega";
export const COLUMNA_A_LA_CENTRAL = "A la central";

export const ACCION_VER_SU_CIERRE = "Ver su cierre";
export const nombreVerSuCierre = (mensajero: string) => `Ver el cierre de ${mensajero}`;

/** El nombre del grupo de tarjetas (R196). */
export const CIFRAS_A_CONSOLIDAR_LABEL = "Cifras a consolidar";
export const TARJETA_GANA_BODEGA = "Gana la bodega satélite";
export const TARJETA_CENTRAL_DEBE = "La central debe";
export const notaPagoMensajeros = (n: number) =>
  n === 1 ? "1 mensajero · se paga del efectivo" : `${n} mensajeros · se paga del efectivo`;
export const NOTA_GANA_BODEGA_VIEJO = "por devoluciones a origen";
export const NOTA_DEBE_LLEGAR = "recaudado − mensajeros − bodega";
export const NOTA_CENTRAL_DEBE = "el efectivo no alcanzó para pagar a todos los mensajeros";

/** R197: lo que pasará al solicitar, con el número de cierres del conjunto completo. */
export const pieSePuedeSolicitar = (n: number) =>
  n === 1
    ? "Se enviará el cierre aprobado a la central. No se puede deshacer."
    : `Se enviarán los ${n} cierres aprobados a la central. No se puede deshacer.`;
export const PIE_SIN_RESOLVER =
  "Se habilita cuando no quede ningún cierre de mensajero por resolver.";
export const BOTON_SOLICITAR_BODEGA = "Solicitar cierre de bodega";

// ═══ Bodega · satélite: «Solicitados» (SLT-107), textos en trato «tú» ═══════════════════════════

/** El nombre del grupo de tarjetas de «Solicitados» (R286). */
export const CIFRAS_SOLICITADOS_LABEL = "Cifras de los cierres de bodega solicitados";
export const TARJETA_POR_LLEGAR = "Por llegar a la central";
export const TARJETA_RECIBIDO_30_DIAS = "Recibido por la central (30 días)";
export const TARJETA_FALTA_POR_RECIBIR = "Falta por recibir";
export const notaPendientesConciliar = (n: number) =>
  n === 1 ? "1 cierre pendiente de conciliar" : `${n} cierres pendientes de conciliar`;
export const notaCierresDeBodega = (n: number) =>
  n === 1 ? "1 cierre de bodega" : `${n} cierres de bodega`;
export const notaLlegaronIncompletos = (n: number) =>
  n === 1 ? "1 llegó incompleto" : `${n} llegaron incompletos`;

/** R289: el pie de «Solicitados», sin botón. */
export const PIE_SOLICITADOS =
  '"Ver" abre el cierre de bodega con su dinero, sus gestiones, sus mensajeros y lo que marcó la central.';

/**
 * R289: región, vacío y error de hoy, sin cambios. Son los mismos textos que sigue pintando
 * `CierresBodegaSolicitadosLista` para la satélite sin zona (R202).
 */
export const REGION_SOLICITADOS = "Cierres de bodega solicitados";
export const VACIO_SOLICITADOS = "Aún no has solicitado ningún cierre de bodega.";
export const ERROR_SOLICITADOS = "No se pudieron cargar los cierres de bodega solicitados.";

/** R288: el nombre accesible de «Ver»; `folio` ya trae su «#» (`folioBodegaCola`). */
export const nombreVerCierreBodega = (folio: string) => `Ver el cierre de bodega ${folio}`;
