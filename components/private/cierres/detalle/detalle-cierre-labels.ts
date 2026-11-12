// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T1.2) — los textos del detalle
// único de cierre, en «tú» (D6, regla 7). Donde la cifra ya tenía nombre en el módulo de cierres se
// reutiliza su `*_LABEL`; los nombres nuevos son los del canvas aprobado (`Main.dc.html`).
//
// Ningún rótulo de aquí es «Debe» ni una «Ganancia» de la empresa (D3, R9): la única cifra de lo
// que gana la empresa es «Le queda a la empresa».

import { EMPRESA } from "@/lib/config/marca";
import { money } from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";

/** «1 tienda» / «2 tiendas». Los conteos son números enteros del servidor, no dinero. */
function cuantos(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export const DETALLE_CIERRE_PREFIJO = "Detalle del cierre";
export const DETALLE_CIERRE_BODEGA_PREFIJO = "Detalle del cierre de bodega";

// --- Cabecera (R2) ---
export const TU_CIERRE_TITULO = "Tu cierre del día";
export const tituloCierreMensajero = (nombre: string): string => `Cierre de ${nombre}`;
export const tituloCierreBodega = (zona: string): string => `Cierre de bodega · ${zona}`;
export const subtituloCierreBodega = (solicitadoPor: string, mensajeros: number): string =>
  `Bodega satélite · lo solicitó ${solicitadoPor} · ${cuantos(mensajeros, "mensajero", "mensajeros")}`;
/** El estado de un cierre del día que todavía no se ha solicitado (modo «en curso»). */
export const SIN_SOLICITAR_LABEL = "Sin solicitar";
export const FOLIO_NUEVO_LABEL = "Solicitud nueva";
export const FECHA_SOLICITADO = "Solicitado";
export const FECHA_APROBADO = "Aprobado";
export const FECHA_RECHAZADO = "Rechazado";
export const FECHA_RECIBIDO = "Recibido";
export const fechaConQuien = (fecha: string, quien: string | null | undefined): string =>
  quien ? `${fecha} por ${quien}` : fecha;
export const fechaVencido = (fecha: string): string => `Del ${fecha} · venció sin solicitarse`;
export const HOY_SIN_SOLICITAR = "Hoy · sin solicitar";

// --- Franja de atención (R4) ---
export const POR_REVISAR_TITULO = "Por revisar:";
export const incidentesSinIndemnizar = (n: number): string =>
  cuantos(n, "incidente sin indemnizar", "incidentes sin indemnizar");
export const rechazadosPorLaTienda = (n: number): string =>
  cuantos(n, "rechazado por la tienda", "rechazados por la tienda");
export const pagosAlMensajeroAjustados = (n: number): string =>
  cuantos(n, "pago al mensajero ajustado", "pagos al mensajero ajustados");
export const paquetesVuelvenABodega = (n: number): string =>
  n === 1 ? "1 paquete vuelve a bodega" : `${n} paquetes vuelven a bodega`;
export const FALTA_MARCAR_RECIBIDO = "falta marcar el dinero recibido";
export const CENTRAL_AUN_NO_MARCA = "la central aún no marca el dinero recibido";
export const VENCIDO_TITULO = "Vencido:";
export const VENCIDO_TEXTO =
  "El mensajero no lo envió a aprobación y está bloqueado. Destrabarlo es una excepción: queda como solicitado en su nombre.";
export const MOTIVO_RECHAZO_TITULO = "Motivo del rechazo:";
export const SIN_MOTIVO_RECHAZO = "La bodega no indicó un motivo.";
export const BLOQUEO_TITULO = "Tu cierre está bloqueado:";
export const ANTES_DE_CERRAR_TITULO = "Antes de cerrar:";

// --- Cifras (R6, R8) ---
export const CIFRAS_REGION_LABEL = "Cifras del cierre";
export const RECAUDADO_LABEL = "Recaudado";
export const SE_LE_PAGA_HOY_LABEL = "Se le paga hoy a la tienda";
export const DEBE_LLEGAR_A_LA_CENTRAL_LABEL = "Debe llegar a la central";
export const PAGO_A_MENSAJEROS_LABEL = "Pago a mensajeros";
export const LE_QUEDA_A_LA_EMPRESA_LABEL = `Le queda a ${EMPRESA.enFrase}`;
export const GESTIONES_LABEL = "Gestiones";
export const TU_GANANCIA_LABEL = "Tu ganancia";
export const METODOS_DEL_RECAUDADO_LABEL = "Métodos de pago de lo recaudado";

export const contextoTiendas = (tiendas: number, ganaLaTienda: string): string =>
  tiendas === 1
    ? `1 tienda · gana en total ${money(ganaLaTienda)}`
    : `${tiendas} tiendas · ganan en total ${money(ganaLaTienda)}`;
export const contextoPagoMensajero = (gestiones: number, ajustadas: number): string =>
  ajustadas > 0
    ? `${cuantos(gestiones, "gestión", "gestiones")} · ${cuantos(ajustadas, "ajustada", "ajustadas")}`
    : cuantos(gestiones, "gestión", "gestiones");
export const contextoPagoMensajeros = (mensajeros: number, ajustes: number): string =>
  ajustes > 0
    ? `${cuantos(mensajeros, "mensajero", "mensajeros")} · ${cuantos(ajustes, "ajuste", "ajustes")}`
    : cuantos(mensajeros, "mensajero", "mensajeros");
export const NOTA_LE_QUEDA_MENSAJERO = `sin ${IMPUESTO_ROTULO}, ya restados mensajero y bodega`;
export const NOTA_LE_QUEDA_BODEGA = `sin ${IMPUESTO_ROTULO}, ya restados mensajeros y satélite`;
// Texto propio y no el nombre del resultado: el participio plural suelto («entregadas») es el
// nombre de un estado retirado (ficha 455) y el nombre vigente pide su botón de información (456).
export const contextoGestiones = (entregadas: number, vuelven: number): string =>
  `${cuantos(entregadas, "entrega", "entregas")} · ${vuelven} vuelven o con novedad`;
export const contextoTuGanancia = (ajustados: number): string =>
  ajustados === 0
    ? ""
    : cuantos(ajustados, "pago ajustado por la bodega", "pagos ajustados por la bodega");
export const CONCILIACION_CONTEXTO = {
  pendiente: "Aún no se marca recibido",
  recibido: "Recibido completo",
  incompleto: "Recibido incompleto",
} as const;

// --- Pestañas (R10) ---
export const PESTANAS_LABEL = "Secciones del cierre";
export const PESTANA_DINERO = "Dinero";
export const PESTANA_GESTIONES = "Gestiones";
export const PESTANA_RECHAZOS = "Rechazados por la tienda";
export const PESTANA_PAGO = "Pago al mensajero";
export const PESTANA_CORREGIR = "Corregir";
export const PESTANA_MENSAJEROS = "Mensajeros";
export const PESTANA_CONCILIACION = "Conciliación";
export const conConteo = (label: string, n: number): string => `${label} (${n})`;

// --- Pie (R12) ---
export const ACCION_RECHAZAR = "Rechazar";
export const ACCION_APROBAR = "Aprobar";
export const ACCION_REVISAR_Y_APROBAR = "Revisar paquetes y aprobar";
export const ACCION_CERRAR = "Cerrar";
export const ACCION_DESTRABAR = "Destrabar cierre vencido";
export const ACCION_SOLICITAR = "Solicitar cierre";
export const ACCION_SOLICITAR_RECHAZADO = "Solicitar aprobación del cierre rechazado";
export const ACCION_SOLICITAR_VENCIDO = "Solicitar aprobación del cierre vencido";

export const pieAprobarConPaquetes = (paquetes: number, incidentes: number): string => {
  const confirmar = paquetes === 1 ? "confirmar 1 paquete" : `confirmar los ${paquetes} paquetes`;
  if (incidentes === 0) return `Aprobar pide ${confirmar}.`;
  const indemnizar =
    incidentes === 1 ? "indemnizar 1 incidente" : `indemnizar ${incidentes} incidentes`;
  return `Aprobar pide ${confirmar} e ${indemnizar}.`;
};
export const pieResumenMensajero = (recaudado: string, gestiones: number): string =>
  `${RECAUDADO_LABEL} ${money(recaudado)} · ${cuantos(gestiones, "gestión", "gestiones")}`;
export const PIE_DESTRABAR =
  "Destrabar lo deja como solicitado; después se aprueba o rechaza por la vía normal.";
export const pieBodega = (declarado: string, coletilla: string): string =>
  coletilla ? `Declarado ${money(declarado)} · ${coletilla}` : `Declarado ${money(declarado)}`;
export const PIE_BODEGA_CENTRAL_PENDIENTE = "márcalo recibido cuando llegue";
export const PIE_BODEGA_SATELITE_PENDIENTE = "la central lo marca recibido cuando llega";
export const PIE_MENSAJERO_EN_CURSO = "Se agrupan todas tus gestiones pendientes. No se puede deshacer.";
export const PIE_MENSAJERO_RECHAZADO = "Se envía con las gestiones que tenga al enviarlo.";
export const PIE_MENSAJERO_VENCIDO = "No se recalculan los montos ya registrados.";
export const PIE_MENSAJERO_LECTURA =
  "Los montos son los que quedaron congelados al solicitar el cierre.";
/**
 * SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R252) — un rechazado que
 * NO es el siguiente por enviar se abre en modal sin botón de envío. Texto propuesto en el spec: el
 * canvas no lo trae.
 */
export const PIE_MENSAJERO_RECHAZADO_SIN_ENVIO =
  "Lo envías desde esta página cuando sea el siguiente por enviar.";

// --- Pestaña «Corregir» (SLT-109, R248) ---
// Mudados de `CierreDiaModule.tsx` (ficha 477, R25/R26) sin cambiar un carácter: el panel suelto
// «Corregir el cierre rechazado» pasa a ser la pestaña «Corregir» del detalle único.
export const COMO_CORREGIR_TITULO = "Cómo corregir";
export const CORRECCION_EXPLICACION =
  "Si una gestión quedó mal, devuélvela a gestión: sale de este cierre, sus totales se recalculan y la orden vuelve a Entregas para que la gestiones de nuevo. Cuando termines, vuelve a enviar el cierre a aprobación.";
// Pregunta abierta 1 de la ficha 477 (por defecto: se acepta y se avisa en pantalla).
export const CORRECCION_AVISO_CORTE =
  "Envíalo hoy: si el corte de la noche llega antes, lo que corregiste pasa a un cierre nuevo.";
export const CORRECCION_ORDENES_TITULO = "Órdenes por volver a gestionar";
export const CORRECCION_REGESTIONADA = "Ya la volviste a gestionar";
export const CORRECCION_PENDIENTE = "Falta volver a gestionarla";
export const CORRECCION_IR_ENTREGAS = "Ir a Entregas";
export const RUTA_ENTREGAS = "/mis-asignaciones/reparto";

// --- El cierre de la página (SLT-109, R253, R256) ---
/** R253 — la lectura del cierre por reenviar falló: el mensajero no ve el detalle, pero puede enviarlo. */
export const REENVIABLE_ERROR = "No se pudo cargar el cierre que tienes que enviar. Recarga la página.";
/** R256 — el archivo de «Gestiones» del cierre en curso, que aún no tiene folio. */
export const DESCARGA_GESTIONES_HOY = "Gestiones del cierre de hoy";

// --- Dinero (R14, R16) ---
export const REPARTO_REGION_LABEL = "Reparto de lo recaudado";
export const REPARTO_TITULO = "¿A dónde va lo recaudado?";
// El reparto NO tiene rótulos propios: cada parte se llama como su cifra o su línea de cuenta
// (decisión de Carlos 2026-11-09, R9/R14/R16: una cifra, un nombre).
export const CUENTA_FACTURA_TITULO = "Lo que se le factura a la tienda";
export const FLETE_POR_ENTREGADO_LABEL = `Flete por entregado + ${IMPUESTO_ROTULO}`;
export const COMISION_COD_LABEL = `Comisión COD + ${IMPUESTO_ROTULO}`;
export const SALE_DE_LO_RECAUDADO_LABEL = "Sale de lo recaudado";
export const TOTAL_FACTURADO_LABEL = "Total facturado";
export const CUENTA_QUEDA_TITULO = `De lo facturado, le queda a ${EMPRESA.enFrase}`;
export const IVA_NO_ES_DE_LA_EMPRESA = `${IMPUESTO_ROTULO} (no es de ${EMPRESA.enFrase})`;
export const POR_TIENDA_TITULO = "Por tienda";
export const POR_TIENDA_COLUMNAS = {
  tienda: "Tienda",
  recaudado: RECAUDADO_LABEL,
  hoy: "Se le paga hoy",
  gana: "Gana en total",
} as const;

// --- Pestañas que rellena S2 (SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)») ---
/** R17, D27 — estado vacío de «Rechazados por la tienda». */
export const RECHAZOS_VACIO = "Este cierre no tiene paquetes rechazados por la tienda.";
/** R21 — título del archivo de «Descargar» en «Gestiones». */
export const tituloDescargaGestiones = (folio: string): string => `Gestiones del cierre ${folio}`;
/** R82 — encabezado de `ingresoEmpresa.total` en la descarga del detalle. */
export const COBRO_A_LA_TIENDA_COL = "Cobro a la tienda";
/** R82 — se llama como su cifra y su pestaña en el detalle (D20: una cifra, un nombre). */
export const PAGO_AL_MENSAJERO_COL = PESTANA_PAGO;

// --- Pestañas que rellena S6 (SLT-104 «Detalle de cierre de bodega en el detalle único (central)») ---
// Los textos del canvas (`Main.dc.html`, rama bodega): columnas de «Mensajeros», «Ver su cierre» y la
// cuenta de «Conciliación». Los nombres de cifra que ya existían se reutilizan (D20).
/** R42 — nombre accesible de la tabla de «Mensajeros». */
export const MENSAJEROS_REGION_LABEL = "Mensajeros del cierre de bodega";
/** R42, R114 — las columnas de «Mensajeros», en el orden del canvas. */
export const MENSAJEROS_COLUMNAS = {
  mensajero: "Mensajero",
  gestiones: GESTIONES_LABEL,
  recaudado: RECAUDADO_LABEL,
  pago: "Pago",
  aLaCentral: "A la central",
  senales: "Señales",
} as const;
/** R114 — Señales sin gestiones ajustadas. */
export const SIN_SENALES = "—";
/** R42, R115 — el enlace de cada fila y su nombre accesible (único por mensajero). */
export const VER_SU_CIERRE = "Ver su cierre";
export const verElCierreDe = (mensajero: string): string => `Ver el cierre de ${mensajero}`;
/** R117 — la cuenta de «Conciliación» se titula como su pestaña. */
export const CONCILIACION_TITULO = PESTANA_CONCILIACION;
/** R117 — quién marcó el dinero recibido, bajo la cuenta. */
export const AUN_NADIE = "Aún nadie";
export const marcoQuien = (quien: string): string => `Marcó: ${quien}`;
