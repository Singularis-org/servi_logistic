// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T1.1) — la lógica PURA del
// detalle único de cierre. Elige, ordena y CUENTA (gestiones, tiendas, ajustes): los importes son
// siempre el STRING del servidor tal cual, sin convertirlos ni operar con ellos (R71). Se prueba sin
// montar nada (`tests/unit/utils/detalle-cierre-vista.test.ts`).

import type { CierreDestinoTipo, CierreEstado } from "@/lib/types/cierre";
import type {
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
  GANA_BODEGA_SATELITE_LABEL,
  estadoConciliacionDe,
  hayGestionEnModeloNuevo,
  type EstadoConciliacion,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import {
  FLETE_DEV_CON_IVA_LABEL,
  FLETE_NO_ENTREGADAS_CON_IVA_LABEL,
  PAGO_MENSAJERO_LABEL,
  rotuloIngresoBodega,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { lineasCascadaCentral } from "@/app/(app)/cierres-admin/_components/cascadas-bodega";
import { marcaDeVariasTiendas } from "@/app/(app)/cierres-admin/_components/DesglosePorTienda";

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
  conteos: { gestiones: number; mensajeros: number; pagosAjustados: number };
}

// ═══ Cabecera (R2) ════════════════════════════════════════════════════════════════════════════

/**
 * Folio corto y estable: los últimos 8 del id, como el comprobante de hoy (`cierre-factura.tsx`).
 *
 * @sin-superficie S1 de SLT-95 es el componente base sin montar; lo monta S2 (SLT-100) en /cierres-admin
 */
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

// ═══ Cifras (R6, R7, R8) ═══════════════════════════════════════════════════════════════════════

export type CifraId = "recaudado" | "paraTienda" | "paraCentral" | "pago" | "leQueda" | "gestiones" | "tuGanancia";

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

function avisosDelMensajero(modo: Modo, d: DetalleMensajeroVista): AvisoFranja[] {
  if (modo === "rechazado") {
    const motivo = d.motivoRechazo?.trim() ? `«${d.motivoRechazo.trim()}»` : L.SIN_MOTIVO_RECHAZO;
    return [{ titulo: L.MOTIVO_RECHAZO_TITULO, partes: [motivo], tono: "peligro" }];
  }
  if (modo === "vencido" && d.bloqueo) {
    const texto = avisoBloqueo(d.bloqueo, { conCta: false });
    return texto ? [{ titulo: L.BLOQUEO_TITULO, partes: [texto], tono: "peligro" }] : [];
  }
  if (modo === "en curso" && d.motivoBloqueo) {
    return [{ titulo: L.ANTES_DE_CERRAR_TITULO, partes: [d.motivoBloqueo], tono: "atencion" }];
  }
  return [];
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
    if (modo === "rechazado")
      return [{ id: "solicitarRechazado", label: L.ACCION_SOLICITAR_RECHAZADO, variante: "principal" }];
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

export function pieTextoDe(tipo: "mensajero", audiencia: Audiencia, modo: Modo, detalle: DetalleMensajeroVista): string;
export function pieTextoDe(tipo: "bodega", audiencia: Audiencia, modo: Modo, detalle: DetalleBodegaVista): string;
export function pieTextoDe(
  tipo: TipoDetalle,
  audiencia: Audiencia,
  modo: Modo,
  detalle: DetalleMensajeroVista | DetalleBodegaVista,
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
    if (modo === "rechazado") return L.PIE_MENSAJERO_RECHAZADO;
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
): CuentaVista {
  return {
    titulo: L.CUENTA_QUEDA_TITULO,
    lineas: [
      partida(L.TOTAL_FACTURADO_LABEL, total),
      partida(L.IVA_NO_ES_DE_LA_EMPRESA, iva, "resta"),
      partida(pago[0], pago[1], "resta"),
      partida(bodega[0], bodega[1], "resta"),
      { label: L.LE_QUEDA_A_LA_EMPRESA_LABEL, monto: neto, signo: "neutro", tipo: "total" },
    ],
  };
}

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
      label: l.label,
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
          [L.A_LA_CENTRAL, d.paraLaCentral],
          [L.A_LOS_MENSAJEROS, d.totalPagoMensajero],
          [L.A_LA_BODEGA_SATELITE, d.totalIngresoBodegaRechazos],
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
        [L.A_LA_TIENDA_HOY, e.pagoTienda],
        [L.SE_LO_COBRA_LA_EMPRESA, e.cobradoSobreRecaudado],
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
      ),
    ],
    porTienda: marcaDeVariasTiendas(e.partesPorTienda) === null ? null : e.partesPorTienda,
  };
}

// ═══ De los resultados del servidor a la vista (T0.2) ═════════════════════════════════════════

type DetalleAdminOk = Extract<CierreDetalleAdminServiceResult, { status: "ok" }>;
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
  return {
    mensajeroNombre: r.cierre.mensajeroNombre,
    destino: destinoLegible(r.cierre.destinoTipo, r.cierre.destinoZonaNombre),
    folio: folioDe(r.cierre.cierreId),
    estado: r.cierre.estado,
    solicitadoAt: r.cierre.solicitadoAt,
    resueltoAt: r.cierre.resueltoAt,
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
    },
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
    conteos: {
      gestiones: r.cierres.reduce((n, cd) => n + Object.values(cd.grupos).flat().length, 0),
      mensajeros: new Set(r.cierres.map((cd) => cd.mensajeroId)).size,
      pagosAjustados: r.cierres.reduce((n, cd) => n + (cd.gestionesAjustadas ?? 0), 0),
    },
  };
}
