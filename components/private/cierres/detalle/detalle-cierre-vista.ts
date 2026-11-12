// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T1.1) — la lógica PURA del
// detalle único de cierre. Elige, ordena y CUENTA (gestiones, tiendas, ajustes): los importes son
// siempre el STRING del servidor tal cual, sin convertirlos ni operar con ellos (R71). Se prueba sin
// montar nada (`tests/unit/utils/detalle-cierre-vista.test.ts`).

import type { CierreDestinoTipo, CierreEstado } from "@/lib/types/cierre";
import type {
  CierreGrupos,
  CierreOrdenSinGestion,
  CierrePasadoDTO,
  CierreRechazoDeTienda,
  CierreTotales,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreDetalleAdminServiceResult } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type { ParteDeTienda } from "@/lib/utils/ingreso-empresa";
import type { BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import { avisoBloqueo } from "@/lib/constants/bloqueo-mensajero";
import { METODO_LABEL } from "@/lib/constants/metodo-pago-label";
import { vuelveABodegaElPaquete } from "@/lib/types/gestion-retorno";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { horaCostaRica } from "@/lib/utils/hora-cr";
import { esMontoCero } from "@/components/shared/monto-cliente";
import {
  CASCADA_CENTRAL_TITULO,
  DESTINO_TIPO_LABEL,
  FALTA_POR_RECIBIR_LABEL,
  GANA_BODEGA_SATELITE_LABEL,
  PARA_LA_CENTRAL_LABEL,
  RECIBIDO_LABEL,
  estadoConciliacionDe,
  hayGestionEnModeloNuevo,
  type EstadoConciliacion,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import {
  FLETE_DEV_CON_IVA_LABEL,
  FLETE_NO_ENTREGADAS_CON_IVA_LABEL,
  INGRESO_BODEGA_RECHAZOS_MANUAL_LABEL,
  INGRESO_BODEGA_RECHAZOS_SLA_LABEL,
  ORDEN_RESULTADOS,
  PAGO_MENSAJERO_LABEL,
  rotuloIngresoBodega,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { money } from "@/lib/config/moneda";
import { hrefDetalleCierre } from "@/lib/utils/cierre-enlace";
import { lineasCascadaCentral } from "@/app/(app)/cierres-admin/_components/cascadas-bodega";
import { marcaDeVariasTiendas } from "@/app/(app)/cierres-admin/_components/DesglosePorTienda";

import { pagosAjustados } from "../cola/cola-cierres-labels";
import type { ItemGestion } from "../fila/fila-gestion-vista";
import * as L from "./detalle-cierre-labels";

// ═══ Props del componente (design.md > 1. Detalle del cierre) ═══════════════════════════════════

export type TipoDetalle = "mensajero" | "bodega";
export type Audiencia = "central" | "satelite" | "mensajero";
export type Modo = "decidir" | "solo lectura" | "vencido" | "en curso" | "rechazado";
export type Marco = "modal" | "pagina";

/** Los conteos de un cierre de mensajero. Son enteros (cuántas gestiones), nunca dinero. */
export interface ConteosMensajero {
  gestiones: number;
  entregadas: number;
  /** Gestiones que no se entregaron: vuelven a bodega, quedaron con novedad o son incidentes. */
  noEntregadas: number;
  pagosAjustados: number;
  incidentesSinIndemnizar: number;
  rechazosDeTienda: number;
  /** Paquetes que bodega tiene que confirmar al aprobar (gestiones que vuelven + barridas). */
  paquetesVuelven: number;
  tiendas: number;
}

/** El dinero de la EMPRESA de un cierre de mensajero. No viaja a la audiencia mensajero (R9). */
export interface DineroEmpresaMensajero {
  pagoTienda: string;
  cobradoSobreRecaudado: string;
  ganaLaTienda: string;
  totalIngresoBodegaRechazos: string;
  ivaFacturado: string;
  netoEmpresa: string;
  totalesIngreso: Pick<
    TotalesIngresoEmpresa,
    "fleteConIva" | "comisionConIva" | "fleteDevolucionConIva" | "total"
  >;
  partesPorTienda: readonly ParteDeTienda[];
  modeloNuevo: boolean;
  /** Reparto en % ya derivado en el servidor (S13, R70): [tienda, empresa]. Ausente = sin barra. */
  porcentajesReparto?: readonly number[] | null;
}

export interface DetalleMensajeroVista {
  mensajeroNombre: string;
  /** Destino ya legible: «Bodega central · GAM». */
  destino: string;
  /** `null` = aún no solicitado (modo «en curso»). */
  folio: string | null;
  /** `null` = aún no solicitado (modo «en curso»). */
  estado: CierreEstado | null;
  solicitadoAt: string | null;
  resueltoAt: string | null;
  resueltoPorNombre?: string | null;
  reprogramadasRetenidasHoy: number;
  motivoRechazo: string | null;
  totales: CierreTotales;
  totalPagoMensajero: string;
  /** `null` con audiencia mensajero: el dinero de la empresa no llega a su pantalla (R9). */
  empresa: DineroEmpresaMensajero | null;
  conteos: ConteosMensajero;
  /**
   * SLT-100 (R81): de dónde salió el ingreso de bodega (plazo vencido / manual), los STRING del
   * servidor. Solo en el modelo viejo; `null` o ausente = no se pinta la nota.
   */
  desgloseIngresoBodega?: { sla: string; manual: string } | null;
  /** Bloqueo del mensajero (audiencia mensajero, vencido): lo redacta `avisoBloqueo`. */
  bloqueo?: BloqueoDetalle | null;
  /** Por qué no puede solicitar todavía (audiencia mensajero, en curso). `null` = sí puede. */
  motivoBloqueo?: string | null;
}

export interface DetalleBodegaVista {
  zonaNombre: string;
  solicitadoPorNombre: string;
  folio: string;
  solicitadoAt: string;
  conciliado: boolean;
  faltaPorRecibir: string;
  /** SLT-104 (R43): el monto marcado como recibido; `null` = sin marca (se pinta «—», nunca ₡0). */
  montoRecibido: string | null;
  conciliadoAt: string | null;
  conciliadoPorNombre: string | null;
  totales: CierreTotales;
  totalPagoMensajero: string;
  totalIngresoBodegaRechazos: string;
  paraLaCentral: string;
  efectivoCubreDescuentos: boolean;
  pagoTienda: string;
  cobradoSobreRecaudado: string;
  ivaFacturado: string;
  netoEmpresa: string;
  totalesIngreso: DineroEmpresaMensajero["totalesIngreso"];
  partesPorTienda: readonly ParteDeTienda[];
  modeloNuevo: boolean;
  /** [central, mensajeros, bodega satélite] ya derivado en el servidor (S13, R70). */
  porcentajesReparto?: readonly number[] | null;
  /**
   * `mensajeros` = mensajeros DISTINTOS (cabecera y contexto de «Pago a mensajeros»); `cierres` = cierres
   * del día incluidos, que son las filas de «Mensajeros» y su conteo en la pestaña (SLT-104 PA2, R121).
   */
  conteos: { gestiones: number; mensajeros: number; cierres: number; pagosAjustados: number };
}

// ═══ Cabecera (R2) ════════════════════════════════════════════════════════════════════════════

/** Folio corto y estable: los últimos 8 del id, como el comprobante de hoy (`cierre-factura.tsx`). */
export function folioDe(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** «2026-11-07 18:42» en el calendario y la hora de Costa Rica; «—» si el instante no vale. */
export function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "—";
  return `${fechaCalendarioCR(instante)} ${horaCostaRica(iso)}`;
}

const FECHA_RESOLUCION: Partial<Record<CierreEstado, string>> = {
  aprobado: L.FECHA_APROBADO,
  rechazado: L.FECHA_RECHAZADO,
};

export function fechasMensajero(d: DetalleMensajeroVista): string {
  if (d.estado === null) return L.HOY_SIN_SOLICITAR;
  if (d.estado === "vencido") return L.fechaVencido(fechaHora(d.solicitadoAt));
  const solicitado = `${L.FECHA_SOLICITADO} ${fechaHora(d.solicitadoAt)}`;
  const resolucion = FECHA_RESOLUCION[d.estado];
  if (!resolucion || !d.resueltoAt) return solicitado;
  return `${solicitado} · ${L.fechaConQuien(`${resolucion} ${fechaHora(d.resueltoAt)}`, d.resueltoPorNombre)}`;
}

export function fechasBodega(d: DetalleBodegaVista): string {
  const solicitado = `${L.FECHA_SOLICITADO} ${fechaHora(d.solicitadoAt)}`;
  if (!d.conciliadoAt) return solicitado;
  return `${solicitado} · ${L.fechaConQuien(`${L.FECHA_RECIBIDO} ${fechaHora(d.conciliadoAt)}`, d.conciliadoPorNombre)}`;
}

export function estadoConciliacionBodega(d: DetalleBodegaVista): EstadoConciliacion {
  return estadoConciliacionDe({ conciliado: d.conciliado, faltaPorRecibir: d.faltaPorRecibir });
}

/**
 * SLT-100 (R79) — el modo del detalle que abren la central y la satélite, por el estado del cierre:
 * solo un `solicitado` se decide por la vía normal y un `vencido` se destraba (feature 111).
 */
export function modoAdminDe(estado: CierreEstado): Modo {
  if (estado === "solicitado") return "decidir";
  if (estado === "vencido") return "vencido";
  return "solo lectura";
}

// ═══ Cifras (R6, R7, R8) ═══════════════════════════════════════════════════════════════════════

export type CifraId =
  | "recaudado"
  | "paraTienda"
  | "paraCentral"
  | "pago"
  | "leQueda"
  | "gestiones"
  | "tuGanancia"
  // SLT-106 (R196): las tarjetas de «A consolidar» de la satélite.
  | "ganaBodega"
  | "centralDebe"
  // SLT-107 (R286): las tarjetas de «Solicitados» de la satélite.
  | "porLlegar"
  | "recibido30Dias"
  | "faltaPorRecibir";

export interface Cifra {
  id: CifraId;
  label: string;
  /** STRING del servidor, sin tocar (`esMonto`) o el conteo ya escrito. `null` = no llegó. */
  valor: string | null;
  esMonto: boolean;
  contexto: string;
  /** Bajo «Recaudado» van los métodos de pago que no valen cero (R7). */
  conMetodos: boolean;
  destacada: boolean;
  /** SLT-106 (R196): caja en tono de aviso («La central debe»). Ausente = tono normal. */
  aviso?: boolean;
}

function cifra(
  id: CifraId,
  label: string,
  valor: string | null,
  contexto = "",
  extra: Partial<Pick<Cifra, "esMonto" | "conMetodos" | "destacada">> = {},
): Cifra {
  return { id, label, valor, contexto, esMonto: true, conMetodos: false, destacada: false, ...extra };
}

export function cifrasDe(tipo: "mensajero", audiencia: Audiencia, detalle: DetalleMensajeroVista): Cifra[];
export function cifrasDe(tipo: "bodega", audiencia: Audiencia, detalle: DetalleBodegaVista): Cifra[];
export function cifrasDe(
  tipo: TipoDetalle,
  audiencia: Audiencia,
  detalle: DetalleMensajeroVista | DetalleBodegaVista,
): Cifra[] {
  if (tipo === "bodega") return cifrasBodega(detalle as DetalleBodegaVista);
  const d = detalle as DetalleMensajeroVista;
  const recaudado = cifra("recaudado", L.RECAUDADO_LABEL, d.totales.general, "", { conMetodos: true });
  if (audiencia === "mensajero") {
    return [
      recaudado,
      cifra(
        "gestiones",
        L.GESTIONES_LABEL,
        String(d.conteos.gestiones),
        L.contextoGestiones(d.conteos.entregadas, d.conteos.noEntregadas),
        { esMonto: false },
      ),
      cifra("tuGanancia", L.TU_GANANCIA_LABEL, d.totalPagoMensajero, L.contextoTuGanancia(d.conteos.pagosAjustados), {
        destacada: true,
      }),
    ];
  }
  const e = d.empresa;
  return [
    recaudado,
    cifra(
      "paraTienda",
      L.SE_LE_PAGA_HOY_LABEL,
      e?.pagoTienda ?? null,
      e ? L.contextoTiendas(d.conteos.tiendas, e.ganaLaTienda) : "",
    ),
    cifra(
      "pago",
      PAGO_MENSAJERO_LABEL,
      d.totalPagoMensajero,
      L.contextoPagoMensajero(d.conteos.gestiones, d.conteos.pagosAjustados),
    ),
    cifra("leQueda", L.LE_QUEDA_A_LA_EMPRESA_LABEL, e?.netoEmpresa ?? null, L.NOTA_LE_QUEDA_MENSAJERO, {
      destacada: true,
    }),
  ];
}

function cifrasBodega(d: DetalleBodegaVista): Cifra[] {
  return [
    cifra("recaudado", L.RECAUDADO_LABEL, d.totales.general, "", { conMetodos: true }),
    cifra(
      "paraCentral",
      L.DEBE_LLEGAR_A_LA_CENTRAL_LABEL,
      d.paraLaCentral,
      L.CONCILIACION_CONTEXTO[estadoConciliacionBodega(d)],
    ),
    cifra(
      "pago",
      L.PAGO_A_MENSAJEROS_LABEL,
      d.totalPagoMensajero,
      L.contextoPagoMensajeros(d.conteos.mensajeros, d.conteos.pagosAjustados),
    ),
    cifra("leQueda", L.LE_QUEDA_A_LA_EMPRESA_LABEL, d.netoEmpresa, L.NOTA_LE_QUEDA_BODEGA, {
      destacada: true,
    }),
  ];
}

export interface MetodoVisible {
  metodo: "efectivo" | "SINPE" | "transferencia";
  label: string;
  monto: string;
}

/** Efectivo, SINPE y transferencia, en ese orden, sin los que valen cero (R7, D4). */
export function metodosVisibles(totales: CierreTotales): MetodoVisible[] {
  const todos: MetodoVisible[] = [
    { metodo: "efectivo", label: METODO_LABEL.efectivo, monto: totales.efectivo },
    { metodo: "SINPE", label: METODO_LABEL.SINPE, monto: totales.simpe },
    { metodo: "transferencia", label: METODO_LABEL.transferencia, monto: totales.transferencia },
  ];
  return todos.filter((m) => !esMontoCero(m.monto));
}

// ═══ Franja de atención (R4) ═══════════════════════════════════════════════════════════════════

export interface AvisoFranja {
  titulo: string;
  partes: string[];
  tono: "atencion" | "peligro";
}

export function avisosDe(tipo: "mensajero", audiencia: Audiencia, modo: Modo, detalle: DetalleMensajeroVista): AvisoFranja[];
export function avisosDe(tipo: "bodega", audiencia: Audiencia, modo: Modo, detalle: DetalleBodegaVista): AvisoFranja[];
export function avisosDe(
  tipo: TipoDetalle,
  audiencia: Audiencia,
  modo: Modo,
  detalle: DetalleMensajeroVista | DetalleBodegaVista,
): AvisoFranja[] {
  if (tipo === "bodega") return avisosBodega(audiencia, modo, detalle as DetalleBodegaVista);
  const d = detalle as DetalleMensajeroVista;
  if (audiencia === "mensajero") return avisosDelMensajero(modo, d);
  if (modo === "vencido") return [{ titulo: L.VENCIDO_TITULO, partes: [L.VENCIDO_TEXTO], tono: "peligro" }];
  if (modo !== "decidir") return [];
  const c = d.conteos;
  const partes = [
    c.incidentesSinIndemnizar > 0 ? L.incidentesSinIndemnizar(c.incidentesSinIndemnizar) : null,
    c.rechazosDeTienda > 0 ? L.rechazadosPorLaTienda(c.rechazosDeTienda) : null,
    c.pagosAjustados > 0 ? L.pagosAlMensajeroAjustados(c.pagosAjustados) : null,
    c.paquetesVuelven > 0 ? L.paquetesVuelvenABodega(c.paquetesVuelven) : null,
  ].filter((p): p is string => p !== null);
  return partes.length === 0 ? [] : [{ titulo: L.POR_REVISAR_TITULO, partes, tono: "atencion" }];
}

/**
 * SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R4, R246): la franja de
 * bloqueo sale en CUALQUIER modo mientras el mensajero esté bloqueado (antes, solo en `vencido`), y es
 * el único sitio de la página que la pinta. En `rechazado` va detrás del motivo; en `en curso`, antes
 * de «Antes de cerrar:». `avisoBloqueo` devuelve `""` sin bloqueo: entonces no hay franja.
 */
function avisosDelMensajero(modo: Modo, d: DetalleMensajeroVista): AvisoFranja[] {
  const avisos: AvisoFranja[] = [];
  if (modo === "rechazado") {
    const motivo = d.motivoRechazo?.trim() ? `«${d.motivoRechazo.trim()}»` : L.SIN_MOTIVO_RECHAZO;
    avisos.push({ titulo: L.MOTIVO_RECHAZO_TITULO, partes: [motivo], tono: "peligro" });
  }
  const bloqueo = d.bloqueo ? avisoBloqueo(d.bloqueo, { conCta: false }) : "";
  if (bloqueo) avisos.push({ titulo: L.BLOQUEO_TITULO, partes: [bloqueo], tono: "peligro" });
  if (modo === "en curso" && d.motivoBloqueo) {
    avisos.push({ titulo: L.ANTES_DE_CERRAR_TITULO, partes: [d.motivoBloqueo], tono: "atencion" });
  }
  return avisos;
}

function avisosBodega(audiencia: Audiencia, modo: Modo, d: DetalleBodegaVista): AvisoFranja[] {
  if (modo !== "decidir") return [];
  const partes = [
    d.conteos.pagosAjustados > 0 ? L.pagosAlMensajeroAjustados(d.conteos.pagosAjustados) : null,
    d.conciliado ? null : audiencia === "satelite" ? L.CENTRAL_AUN_NO_MARCA : L.FALTA_MARCAR_RECIBIDO,
  ].filter((p): p is string => p !== null);
  return partes.length === 0 ? [] : [{ titulo: L.POR_REVISAR_TITULO, partes, tono: "atencion" }];
}

// ═══ Pestañas (R10) ═══════════════════════════════════════════════════════════════════════════

export type PestanaId = "dinero" | "gestiones" | "rechazos" | "pago" | "corregir" | "mensajeros" | "conciliacion";

export interface Pestana {
  id: PestanaId;
  label: string;
}

export interface OpcionesPestanas {
  gestiones: number;
  rechazos?: number;
  mensajeros?: number;
  /** El cierre está aprobado y quien mira puede pagar: lo decide el servidor (R10, R18). */
  conPago?: boolean;
}

export function pestanasDe(
  tipo: TipoDetalle,
  audiencia: Audiencia,
  modo: Modo,
  opciones: OpcionesPestanas,
): Pestana[] {
  const gestiones: Pestana = { id: "gestiones", label: L.conConteo(L.PESTANA_GESTIONES, opciones.gestiones) };
  const dinero: Pestana = { id: "dinero", label: L.PESTANA_DINERO };
  if (tipo === "bodega") {
    return [
      dinero,
      gestiones,
      { id: "mensajeros", label: L.conConteo(L.PESTANA_MENSAJEROS, opciones.mensajeros ?? 0) },
      { id: "conciliacion", label: L.PESTANA_CONCILIACION },
    ];
  }
  // D11: siempre visible, también con 0 rechazos.
  const rechazos: Pestana = { id: "rechazos", label: L.conConteo(L.PESTANA_RECHAZOS, opciones.rechazos ?? 0) };
  if (audiencia === "mensajero") {
    const corregir: Pestana[] = modo === "rechazado" ? [{ id: "corregir", label: L.PESTANA_CORREGIR }] : [];
    return [...corregir, gestiones, rechazos];
  }
  const pago: Pestana[] =
    audiencia === "central" && opciones.conPago === true ? [{ id: "pago", label: L.PESTANA_PAGO }] : [];
  return [dinero, gestiones, rechazos, ...pago];
}

// ═══ Pie (R12) ════════════════════════════════════════════════════════════════════════════════

export type AccionId =
  | "rechazar"
  | "aprobar"
  | "destrabar"
  | "solicitar"
  | "solicitarRechazado"
  | "solicitarVencido"
  | "conciliacion"
  | "cerrar";

export interface AccionPie {
  id: AccionId;
  /** Vacío en «conciliacion»: sus botones los pone `ConciliacionAcciones`. */
  label: string;
  variante: "principal" | "secundaria" | "peligro";
}

export interface PermisosPie {
  /** Las acciones que quien monta el detalle ofrece (tiene su callback, o su nodo). */
  disponibles: ReadonlySet<AccionId>;
  /** Paquetes que vuelven: cambia el rótulo de «Aprobar» (R12). */
  paquetesVuelven?: number;
}

function accionesDeLaTabla(tipo: TipoDetalle, audiencia: Audiencia, modo: Modo, paquetes: number): AccionPie[] {
  const cerrar = (variante: AccionPie["variante"]): AccionPie => ({ id: "cerrar", label: L.ACCION_CERRAR, variante });
  if (tipo === "bodega") {
    if (audiencia !== "central") return [cerrar("principal")];
    const conciliacion: AccionPie = { id: "conciliacion", label: "", variante: "principal" };
    return modo === "decidir" ? [cerrar("secundaria"), conciliacion] : [conciliacion, cerrar("principal")];
  }
  if (audiencia === "mensajero") {
    if (modo === "en curso") return [{ id: "solicitar", label: L.ACCION_SOLICITAR, variante: "principal" }];
    // SLT-109 (R252): un rechazado que no es el siguiente por enviar se abre en modal sin envío; quien
    // lo monta no pasa `solicitarRechazado` y le queda «Cerrar». En la página no hay `onCerrar`.
    if (modo === "rechazado")
      return [
        { id: "solicitarRechazado", label: L.ACCION_SOLICITAR_RECHAZADO, variante: "principal" },
        cerrar("principal"),
      ];
    if (modo === "vencido")
      return [{ id: "solicitarVencido", label: L.ACCION_SOLICITAR_VENCIDO, variante: "principal" }];
    return [cerrar("principal")];
  }
  if (modo === "decidir") {
    return [
      { id: "rechazar", label: L.ACCION_RECHAZAR, variante: "peligro" },
      { id: "aprobar", label: paquetes > 0 ? L.ACCION_REVISAR_Y_APROBAR : L.ACCION_APROBAR, variante: "principal" },
    ];
  }
  if (modo === "vencido") {
    return [cerrar("secundaria"), { id: "destrabar", label: L.ACCION_DESTRABAR, variante: "peligro" }];
  }
  return [cerrar("principal")];
}

/** Las acciones del pie, en orden, sin las que quien monta no ofrece (permiso ausente = no aparece). */
export function accionesDe(tipo: TipoDetalle, audiencia: Audiencia, modo: Modo, permisos: PermisosPie): AccionPie[] {
  return accionesDeLaTabla(tipo, audiencia, modo, permisos.paquetesVuelven ?? 0).filter((a) =>
    permisos.disponibles.has(a.id),
  );
}

/**
 * La línea de contexto del pie. `disponibles` (opcional) son las acciones que ofrece quien monta: un
 * rechazado sin `solicitarRechazado` dice dónde se envía (SLT-109, R252).
 */
export function pieTextoDe(
  tipo: "mensajero",
  audiencia: Audiencia,
  modo: Modo,
  detalle: DetalleMensajeroVista,
  disponibles?: ReadonlySet<AccionId>,
): string;
export function pieTextoDe(tipo: "bodega", audiencia: Audiencia, modo: Modo, detalle: DetalleBodegaVista): string;
export function pieTextoDe(
  tipo: TipoDetalle,
  audiencia: Audiencia,
  modo: Modo,
  detalle: DetalleMensajeroVista | DetalleBodegaVista,
  disponibles?: ReadonlySet<AccionId>,
): string {
  if (tipo === "bodega") {
    const d = detalle as DetalleBodegaVista;
    const pendiente = modo === "decidir" && !d.conciliado;
    const coletilla = !pendiente
      ? ""
      : audiencia === "satelite"
        ? L.PIE_BODEGA_SATELITE_PENDIENTE
        : L.PIE_BODEGA_CENTRAL_PENDIENTE;
    return L.pieBodega(d.paraLaCentral, coletilla);
  }
  const d = detalle as DetalleMensajeroVista;
  if (audiencia === "mensajero") {
    if (modo === "en curso") return L.PIE_MENSAJERO_EN_CURSO;
    if (modo === "rechazado") {
      return disponibles && !disponibles.has("solicitarRechazado")
        ? L.PIE_MENSAJERO_RECHAZADO_SIN_ENVIO
        : L.PIE_MENSAJERO_RECHAZADO;
    }
    if (modo === "vencido") return L.PIE_MENSAJERO_VENCIDO;
    return L.PIE_MENSAJERO_LECTURA;
  }
  if (modo === "vencido") return L.PIE_DESTRABAR;
  if (modo === "decidir" && d.conteos.paquetesVuelven > 0) {
    return L.pieAprobarConPaquetes(d.conteos.paquetesVuelven, d.conteos.incidentesSinIndemnizar);
  }
  return L.pieResumenMensajero(d.totales.general, d.conteos.gestiones);
}

// ═══ Dinero (R14, R15, R16) ═══════════════════════════════════════════════════════════════════

/** Cómo entra una línea en su cuenta: sin operador (una partida más), sumando o restando. */
export type SignoLinea = "neutro" | "suma" | "resta";

export interface LineaCuenta {
  label: string;
  /** STRING del servidor tal cual. */
  monto: string;
  signo: SignoLinea;
  /** «subtotal»: raya punteada encima. «total»: raya continua y negrita (R15). */
  tipo: "partida" | "subtotal" | "total";
  notas?: readonly string[];
  /**
   * SLT-104 (R43): se pinta «—» en lugar de `money(monto)`; `monto` queda "" y la línea no es un
   * importe (las identidades de la pantalla la saltan). Apagado por defecto: las cuentas de antes no cambian.
   */
  sinImporte?: boolean;
}

export interface CuentaVista {
  titulo: string;
  lineas: LineaCuenta[];
}

export interface ParteReparto {
  label: string;
  monto: string;
  /** Entero ya derivado en el servidor (S13); `null` = todavía no llega. */
  porcentaje: number | null;
}

export interface DineroVista {
  reparto: ParteReparto[];
  cuentas: CuentaVista[];
  /** Solo con dos o más tiendas (el umbral de `marcaDeVariasTiendas`). */
  porTienda: readonly ParteDeTienda[] | null;
}

function reparto(partes: [string, string][], porcentajes: readonly number[] | null | undefined): ParteReparto[] {
  return partes.map(([label, monto], i) => ({ label, monto, porcentaje: porcentajes?.[i] ?? null }));
}

const partida = (label: string, monto: string, signo: SignoLinea = "neutro"): LineaCuenta => ({
  label,
  monto,
  signo,
  tipo: "partida",
});

function cuentaFactura(t: DineroEmpresaMensajero["totalesIngreso"], cobrado: string, modeloNuevo: boolean): CuentaVista {
  return {
    titulo: L.CUENTA_FACTURA_TITULO,
    lineas: [
      partida(L.FLETE_POR_ENTREGADO_LABEL, t.fleteConIva),
      partida(L.COMISION_COD_LABEL, t.comisionConIva),
      { label: L.SALE_DE_LO_RECAUDADO_LABEL, monto: cobrado, signo: "neutro", tipo: "subtotal" },
      partida(modeloNuevo ? FLETE_NO_ENTREGADAS_CON_IVA_LABEL : FLETE_DEV_CON_IVA_LABEL, t.fleteDevolucionConIva, "suma"),
      { label: L.TOTAL_FACTURADO_LABEL, monto: t.total, signo: "neutro", tipo: "total" },
    ],
  };
}

function cuentaQueda(
  total: string,
  iva: string,
  pago: [string, string],
  bodega: [string, string],
  neto: string,
  notasBodega?: readonly string[],
): CuentaVista {
  const lineaBodega = partida(bodega[0], bodega[1], "resta");
  return {
    titulo: L.CUENTA_QUEDA_TITULO,
    lineas: [
      partida(L.TOTAL_FACTURADO_LABEL, total),
      partida(L.IVA_NO_ES_DE_LA_EMPRESA, iva, "resta"),
      partida(pago[0], pago[1], "resta"),
      notasBodega && notasBodega.length > 0 ? { ...lineaBodega, notas: notasBodega } : lineaBodega,
      { label: L.LE_QUEDA_A_LA_EMPRESA_LABEL, monto: neto, signo: "neutro", tipo: "total" },
    ],
  };
}

/**
 * SLT-100 (R81, D25) — la nota del origen del ingreso de bodega, con los rótulos de hoy
 * (`INGRESO_BODEGA_RECHAZOS_*_LABEL`). `money()` es formato, no aritmética (R71).
 */
export function notaOrigenIngresoBodega(d: { sla: string; manual: string }): string {
  return `${INGRESO_BODEGA_RECHAZOS_SLA_LABEL} ${money(d.sla)} · ${INGRESO_BODEGA_RECHAZOS_MANUAL_LABEL} ${money(d.manual)}`;
}

/**
 * Los rótulos de `lineasCascadaCentral` que en el detalle único se llaman como su cifra: dentro de
 * «Dinero» una cifra tiene un solo nombre (R9; decisión de Carlos 2026-11-09). La función compartida
 * no cambia: el detalle viejo de bodega sigue con sus rótulos hasta que S6 lo sustituya.
 */
const ROTULO_UNICO_CENTRAL: Readonly<Record<string, string>> = {
  [PAGO_MENSAJERO_LABEL]: L.PAGO_A_MENSAJEROS_LABEL,
  [PARA_LA_CENTRAL_LABEL]: L.DEBE_LLEGAR_A_LA_CENTRAL_LABEL,
};

/** La cascada «Lo que va a la central» de hoy (`lineasCascadaCentral`), en formato de cuenta. */
function cuentaCentral(d: DetalleBodegaVista): CuentaVista {
  const lineas = lineasCascadaCentral(
    {
      general: d.totales.general,
      totalPagoMensajero: d.totalPagoMensajero,
      totalIngresoBodegaRechazos: d.totalIngresoBodegaRechazos,
      paraLaCentral: d.paraLaCentral,
      efectivoCubreDescuentos: d.efectivoCubreDescuentos,
    },
    d.modeloNuevo,
  );
  return {
    titulo: CASCADA_CENTRAL_TITULO,
    lineas: lineas.map((l) => ({
      label: ROTULO_UNICO_CENTRAL[l.label] ?? l.label,
      monto: l.monto,
      signo: l.signo,
      tipo: l.destacado ? "total" : "partida",
      notas: l.notas,
    })),
  };
}

export function lineasDinero(tipo: "mensajero", detalle: DetalleMensajeroVista): DineroVista | null;
export function lineasDinero(tipo: "bodega", detalle: DetalleBodegaVista): DineroVista;
export function lineasDinero(
  tipo: TipoDetalle,
  detalle: DetalleMensajeroVista | DetalleBodegaVista,
): DineroVista | null {
  if (tipo === "bodega") {
    const d = detalle as DetalleBodegaVista;
    return {
      reparto: reparto(
        [
          [L.DEBE_LLEGAR_A_LA_CENTRAL_LABEL, d.paraLaCentral],
          [L.PAGO_A_MENSAJEROS_LABEL, d.totalPagoMensajero],
          [GANA_BODEGA_SATELITE_LABEL, d.totalIngresoBodegaRechazos],
        ],
        d.porcentajesReparto,
      ),
      cuentas: [
        cuentaCentral(d),
        cuentaFactura(d.totalesIngreso, d.cobradoSobreRecaudado, d.modeloNuevo),
        cuentaQueda(
          d.totalesIngreso.total,
          d.ivaFacturado,
          [L.PAGO_A_MENSAJEROS_LABEL, d.totalPagoMensajero],
          [GANA_BODEGA_SATELITE_LABEL, d.totalIngresoBodegaRechazos],
          d.netoEmpresa,
        ),
      ],
      porTienda: marcaDeVariasTiendas(d.partesPorTienda) === null ? null : d.partesPorTienda,
    };
  }
  const d = detalle as DetalleMensajeroVista;
  const e = d.empresa;
  if (!e) return null;
  return {
    reparto: reparto(
      [
        [L.SE_LE_PAGA_HOY_LABEL, e.pagoTienda],
        [L.SALE_DE_LO_RECAUDADO_LABEL, e.cobradoSobreRecaudado],
      ],
      e.porcentajesReparto,
    ),
    cuentas: [
      cuentaFactura(e.totalesIngreso, e.cobradoSobreRecaudado, e.modeloNuevo),
      cuentaQueda(
        e.totalesIngreso.total,
        e.ivaFacturado,
        [PAGO_MENSAJERO_LABEL, d.totalPagoMensajero],
        [rotuloIngresoBodega(e.modeloNuevo), e.totalIngresoBodegaRechazos],
        e.netoEmpresa,
        // R81: la misma regla con la que la pintaba el modal (`CierreFacturaDetalle`).
        !e.modeloNuevo && d.desgloseIngresoBodega ? [notaOrigenIngresoBodega(d.desgloseIngresoBodega)] : undefined,
      ),
    ],
    porTienda: marcaDeVariasTiendas(e.partesPorTienda) === null ? null : e.partesPorTienda,
  };
}

// ═══ De los resultados del servidor a la vista (T0.2) ═════════════════════════════════════════

type DetalleAdminOk = Omit<Extract<CierreDetalleAdminServiceResult, { status: "ok" }>, "status">;
type DetalleBodegaOk = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;

function destinoLegible(tipo: CierreDestinoTipo, zona: string): string {
  return zona ? `${DESTINO_TIPO_LABEL[tipo]} · ${zona}` : DESTINO_TIPO_LABEL[tipo];
}

/** El detalle del cierre de mensajero que ven la central y la satélite (`verCierreDetalle`). */
export function vistaMensajeroDesdeAdmin(r: DetalleAdminOk): DetalleMensajeroVista {
  const gestiones = Object.values(r.grupos).flat();
  const paquetesVuelven =
    gestiones.filter((g) => vuelveABodegaElPaquete({ origen: "gestion", resultado: g.resultado })).length +
    r.ordenesSinGestion.filter(() => vuelveABodegaElPaquete({ origen: "barrida" })).length;
  const modeloNuevo = hayGestionEnModeloNuevo(r.grupos);
  const desglose = r.desgloseIngresoBodegaRechazos;
  return {
    mensajeroNombre: r.cierre.mensajeroNombre,
    destino: destinoLegible(r.cierre.destinoTipo, r.cierre.destinoZonaNombre),
    folio: folioDe(r.cierre.cierreId),
    estado: r.cierre.estado,
    solicitadoAt: r.cierre.solicitadoAt,
    resueltoAt: r.cierre.resueltoAt,
    resueltoPorNombre: r.resueltoPorNombre ?? null,
    reprogramadasRetenidasHoy: r.cierre.reprogramadasRetenidasHoy ?? 0,
    motivoRechazo: r.cierre.motivoRechazo,
    totales: r.cierre.totales,
    totalPagoMensajero: r.cierre.totalPagoMensajero,
    empresa: {
      pagoTienda: r.pagoTienda,
      cobradoSobreRecaudado: r.cobradoSobreRecaudado,
      ganaLaTienda: r.ganaLaTienda,
      totalIngresoBodegaRechazos: r.cierre.totalIngresoBodegaRechazos,
      ivaFacturado: r.ivaFacturado,
      netoEmpresa: r.netoEmpresa,
      totalesIngreso: r.totalesIngreso,
      partesPorTienda: r.partesPorTienda,
      modeloNuevo,
      // SLT-111 (R267): el reparto del servidor, tal cual; sin él no hay barra.
      porcentajesReparto: r.porcentajesReparto ?? null,
    },
    // R81: oculto en el modelo nuevo (el origen solo existe para un rechazo) o sin desglose.
    desgloseIngresoBodega:
      modeloNuevo || desglose?.sla === undefined || desglose?.manual === undefined
        ? null
        : { sla: desglose.sla, manual: desglose.manual },
    conteos: {
      gestiones: gestiones.length,
      entregadas: r.grupos.entregado.length,
      noEntregadas: gestiones.length - r.grupos.entregado.length,
      pagosAjustados: gestiones.filter((g) => (g.ajustesPago?.length ?? 0) > 0).length,
      incidentesSinIndemnizar: r.grupos.incidente.filter((g) => g.indemnizacion === null).length,
      rechazosDeTienda: r.rechazosDeTienda.length,
      paquetesVuelven,
      tiendas: r.partesPorTienda.length,
    },
  };
}

/** Lo que `verCierrePasado` trae junto al cierre, ya guardado por `/cierre-dia`. */
export interface DetallePasadoMensajero {
  grupos: CierreGrupos;
  ordenesSinGestion: readonly CierreOrdenSinGestion[];
  rechazosDeTienda: readonly CierreRechazoDeTienda[];
}

/**
 * SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (R150) — un cierre PASADO del propio
 * mensajero (`verCierrePasado`), para el detalle único con audiencia mensajero. Mismo patrón que
 * `vistaMensajeroDesdeAdmin`, sin el dinero de la empresa (`empresa: null`, R9): al mensajero no le
 * llega. El destino es solo el tipo, como en la tira de comprobantes: el DTO no trae la zona. Los
 * importes son los STRING congelados del servidor, tal cual (R71).
 */
export function vistaMensajeroDesdeCierreDia(
  c: CierrePasadoDTO,
  d: DetallePasadoMensajero,
): DetalleMensajeroVista {
  const gestiones = Object.values(d.grupos).flat();
  const paquetesVuelven =
    gestiones.filter((g) => vuelveABodegaElPaquete({ origen: "gestion", resultado: g.resultado })).length +
    d.ordenesSinGestion.filter(() => vuelveABodegaElPaquete({ origen: "barrida" })).length;
  return {
    // Con audiencia mensajero el título es «Tu cierre del día»: el nombre no se pinta.
    mensajeroNombre: "",
    destino: destinoLegible(c.destinoTipo, ""),
    folio: folioDe(c.cierreId),
    estado: c.estado,
    solicitadoAt: c.solicitadoAt,
    resueltoAt: c.resueltoAt ?? null,
    // Es un dato de la cola del admin: el mensajero no lo recibe.
    reprogramadasRetenidasHoy: 0,
    motivoRechazo: c.motivoRechazo ?? null,
    totales: c.totales,
    totalPagoMensajero: c.totalPagoMensajero,
    empresa: null,
    conteos: {
      gestiones: gestiones.length,
      entregadas: d.grupos.entregado.length,
      noEntregadas: gestiones.length - d.grupos.entregado.length,
      // Al mensajero no le llegan ajustes (SLT-56 Q2) ni indemnización (158); «Tiendas» solo la usa
      // una cifra de la empresa.
      pagosAjustados: 0,
      incidentesSinIndemnizar: 0,
      rechazosDeTienda: d.rechazosDeTienda.length,
      paquetesVuelven,
      tiendas: 0,
    },
  };
}

// ═══ El cierre que pinta /cierre-dia (SLT-109) ════════════════════════════════════════════════

/**
 * SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» — la lectura del cierre
 * por reenviar (`bloqueo.aReenviarPrimero`) que hace `page.tsx` con `verCierrePasado`. `error` =
 * `no_encontrada`, `forbidden` o una excepción (R253): la página no hace `notFound()`, el mensajero
 * tiene que poder enviarlo.
 */
export type CierreReenviable =
  | {
      estado: "ok";
      cierre: CierrePasadoDTO;
      grupos: CierreGrupos;
      ordenesSinGestion: CierreOrdenSinGestion[];
      sinGestionRegistrado: boolean;
      rechazosDeTienda: CierreRechazoDeTienda[];
    }
  | { estado: "error"; reenviableEstado: "vencido" | "rechazado" };

/** Lo que `listarCierreDia` y `estadoBloqueoMensajero` dan a la página, más el reenviable. */
export interface EntradaCierreDeLaPagina {
  grupos: CierreGrupos;
  totales: CierreTotales;
  totalPagoMensajero: string;
  motivoBloqueo: string | null;
  puedesSolicitar: boolean;
  bloqueo: BloqueoDetalle;
  reenviable?: CierreReenviable;
}

export type CierreDeLaPagina =
  | { modo: "en curso"; detalle: DetalleMensajeroVista }
  | { modo: "rechazado" | "vencido"; detalle: DetalleMensajeroVista; cierreId: string }
  | { modo: "error"; reenviableEstado: "vencido" | "rechazado" };

/**
 * R241 — el cierre de HOY, aún sin solicitar: sin folio, sin destino (PA2: `listarCierreDia` no lo
 * emite, se decide al solicitar), sin el dinero de la empresa (R9) y con los conteos contados de los
 * grupos (enteros, nunca dinero; R71). «Rechazados por la tienda» en 0 (PA3: los rechazos se vinculan
 * al solicitar). `motivoBloqueo` solo cuando no puede solicitar: es lo que pinta «Antes de cerrar:».
 */
export function vistaMensajeroEnCurso(e: EntradaCierreDeLaPagina): DetalleMensajeroVista {
  // `?? []`: los dobles de los tests pasan a veces grupos parciales.
  const gestiones = Object.values(e.grupos).flatMap((g) => g ?? []);
  const entregadas = e.grupos.entregado?.length ?? 0;
  return {
    mensajeroNombre: "",
    destino: "",
    folio: null,
    estado: null,
    solicitadoAt: null,
    resueltoAt: null,
    reprogramadasRetenidasHoy: 0,
    motivoRechazo: null,
    totales: e.totales,
    totalPagoMensajero: e.totalPagoMensajero,
    empresa: null,
    conteos: {
      gestiones: gestiones.length,
      entregadas,
      noEntregadas: gestiones.length - entregadas,
      pagosAjustados: 0,
      incidentesSinIndemnizar: 0,
      rechazosDeTienda: 0,
      paquetesVuelven: gestiones.filter((g) =>
        vuelveABodegaElPaquete({ origen: "gestion", resultado: g.resultado }),
      ).length,
      tiendas: 0,
    },
    bloqueo: e.bloqueo,
    motivoBloqueo: e.puedesSolicitar ? null : e.motivoBloqueo,
  };
}

/**
 * R240 (S11-PA2, PA1 de SLT-109) — qué cierre pinta `/cierre-dia`: el que pide acción. Con un cierre
 * por reenviar, ESE (`aReenviarPrimero`, el re-solicitable más viejo: el mismo que mueve
 * `solicitarCierre`, que no recibe id), en su modo; si su lectura falló, `error` (R253) y nunca el en
 * curso. Sin nada que reenviar, el de hoy.
 */
export function cierreDeLaPagina(e: EntradaCierreDeLaPagina): CierreDeLaPagina {
  const porReenviar = e.bloqueo.aReenviarPrimero;
  if (porReenviar && (porReenviar.estado === "vencido" || porReenviar.estado === "rechazado")) {
    const error: CierreDeLaPagina = { modo: "error", reenviableEstado: porReenviar.estado };
    const r = e.reenviable;
    if (r?.estado !== "ok" || r.cierre.cierreId !== porReenviar.cierreId) return error;
    const estado = r.cierre.estado;
    if (estado !== "vencido" && estado !== "rechazado") return error;
    return {
      modo: estado,
      cierreId: r.cierre.cierreId,
      detalle: { ...vistaMensajeroDesdeCierreDia(r.cierre, r), bloqueo: e.bloqueo },
    };
  }
  return { modo: "en curso", detalle: vistaMensajeroEnCurso(e) };
}

/** El detalle agregado de un cierre de bodega (`verDetalle` de `CierresBodegaAdminService`). */
export function vistaBodegaDesdeAdmin(r: DetalleBodegaOk): DetalleBodegaVista {
  const c = r.cierre;
  return {
    zonaNombre: c.zonaNombre,
    solicitadoPorNombre: c.solicitadoPorNombre,
    folio: folioDe(c.cierreBodegaId),
    solicitadoAt: c.solicitadoAt,
    conciliado: c.conciliado,
    faltaPorRecibir: c.faltaPorRecibir,
    montoRecibido: c.montoRecibido,
    conciliadoAt: c.conciliadoAt,
    conciliadoPorNombre: c.conciliadoPorNombre,
    totales: c.totales,
    totalPagoMensajero: c.totalPagoMensajero,
    totalIngresoBodegaRechazos: c.totalIngresoBodegaRechazos,
    paraLaCentral: r.paraLaCentral,
    efectivoCubreDescuentos: r.efectivoCubreDescuentos,
    pagoTienda: r.pagoTienda,
    cobradoSobreRecaudado: r.cobradoSobreRecaudado,
    ivaFacturado: r.ivaFacturado,
    netoEmpresa: r.netoEmpresa,
    totalesIngreso: r.totalesIngreso,
    partesPorTienda: r.partesPorTienda,
    modeloNuevo: r.cierres.some((cd) => hayGestionEnModeloNuevo(cd.grupos)),
    // SLT-111 (R267): el reparto del servidor, tal cual; sin él no hay barra.
    porcentajesReparto: r.porcentajesReparto ?? null,
    conteos: {
      gestiones: r.cierres.reduce((n, cd) => n + Object.values(cd.grupos).flat().length, 0),
      mensajeros: new Set(r.cierres.map((cd) => cd.mensajeroId)).size,
      cierres: r.cierres.length,
      pagosAjustados: r.cierres.reduce((n, cd) => n + (cd.gestionesAjustadas ?? 0), 0),
    },
  };
}

// ═══ Bodega · central: lo que S6 añade (SLT-104 «Detalle de cierre de bodega en el detalle único (central)») ═══

type CierreDelDiaDeBodega = DetalleBodegaOk["cierres"][number];

/**
 * R111 — el modo del detalle de bodega que abre la central: sin marca de recibido se decide (marcar);
 * con marca (recibido o recibido incompleto) es solo lectura. Sale de `conciliado`, que llega del servidor.
 */
export function modoBodegaDe(c: { conciliado: boolean }): "decidir" | "solo lectura" {
  return c.conciliado ? "solo lectura" : "decidir";
}

/**
 * R41, R113, R120 — las gestiones de todos los cierres del día, en el orden de la lista única: por
 * resultado (`ORDEN_RESULTADOS`) y, dentro de cada uno, el de `cierres[]` del servidor y luego el de sus
 * gestiones. Cada una con SU mensajero y la fecha en que se solicitó SU cierre del día (PA3); sin esa
 * fecha, `null` (nota sin fecha), nunca la del cierre de bodega.
 */
export function gestionesDeBodega(cierres: readonly CierreDelDiaDeBodega[]): ItemGestion[] {
  return ORDEN_RESULTADOS.flatMap((resultado) =>
    cierres.flatMap((cd) =>
      (cd.grupos[resultado] ?? []).map((gestion) => ({
        gestion,
        mensajeroNombre: cd.mensajeroNombre,
        congeladoAt: cd.solicitadoAt ?? null,
      })),
    ),
  );
}

/** R42, R114 — una fila de «Mensajeros». Los importes, STRING del servidor tal cual (R71). */
export interface FilaMensajeroBodega {
  cierreDiaId: string;
  mensajero: string;
  /** Conteo de gestiones de ese cierre del día (entero, no dinero). */
  gestiones: number;
  recaudado: string;
  pago: string;
  aLaCentral: string;
  senal: string;
  href: string;
}

/** R42, R114, R115 — una fila por cierre del día, en el orden de `cierres[]`, sin derivar importes. */
export function filasMensajeros(cierres: readonly CierreDelDiaDeBodega[]): FilaMensajeroBodega[] {
  return cierres.map((cd) => {
    const ajustadas = cd.gestionesAjustadas ?? 0;
    return {
      cierreDiaId: cd.cierreDiaId,
      mensajero: cd.mensajeroNombre,
      gestiones: Object.values(cd.grupos).flat().length,
      recaudado: cd.totales.general,
      pago: cd.totalPagoMensajero,
      aLaCentral: cd.paraLaCentral,
      senal: ajustadas > 0 ? pagosAjustados(ajustadas) : L.SIN_SENALES,
      href: hrefDetalleCierre(cd.cierreDiaId),
    };
  });
}

/**
 * R43, R117 — la cuenta de «Conciliación»: lo que debe llegar, lo recibido («—» sin marca: la línea va
 * con `sinImporte`, nunca con "0.00") y lo que falta, como total. Los tres STRING tal cual del servidor.
 * SLT-114 (R236): pide solo esos tres campos, para que la fila de la conciliación de `/wallet/satelites`
 * pinte las MISMAS líneas desde su consolidación, sin una copia.
 */
export function cuentaConciliacion(
  d: Pick<DetalleBodegaVista, "paraLaCentral" | "montoRecibido" | "faltaPorRecibir">,
): CuentaVista {
  const recibido: LineaCuenta =
    d.montoRecibido === null
      ? { label: RECIBIDO_LABEL, monto: "", signo: "resta", tipo: "partida", sinImporte: true }
      : partida(RECIBIDO_LABEL, d.montoRecibido, "resta");
  return {
    titulo: L.CONCILIACION_TITULO,
    lineas: [
      partida(L.DEBE_LLEGAR_A_LA_CENTRAL_LABEL, d.paraLaCentral),
      recibido,
      { label: FALTA_POR_RECIBIR_LABEL, monto: d.faltaPorRecibir, signo: "neutro", tipo: "total" },
    ],
  };
}

/** R43, R117 — «Marcó: <nombre> · <fecha y hora>» o «Marcó: Aún nadie» sin marca. */
export function marcaConciliacion(d: DetalleBodegaVista): string {
  if (!d.conciliado || !d.conciliadoAt) return L.marcoQuien(L.AUN_NADIE);
  const partes = [d.conciliadoPorNombre, fechaHora(d.conciliadoAt)].filter((p): p is string => Boolean(p));
  return L.marcoQuien(partes.join(" · "));
}
