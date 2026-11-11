// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T2.1) — la lógica PURA de la cola
// (`design.md > cola-cierres-vista.ts`). Elige y ordena textos; los importes son el STRING del
// servidor y solo los toca `money()` en el `.tsx` (R71). Se prueba sin montar nada
// (`tests/unit/utils/cola-cierres-vista.test.ts`).

import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import { fechaHora, folioDe } from "@/components/private/cierres/detalle/detalle-cierre-vista";
import {
  MENSAJERO_BLOQUEADO_LABEL,
  RECHAZADO_BLOQUEANTE_LABEL,
  RECHAZADO_BLOQUEANTE_NOTA,
  notaMensajeroBloqueado,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import {
  estadoConciliacionDe,
  hayFaltantePorRecibir,
  notaRetieneReprogramadas,
  retieneReprogramadas,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import { hayPendienteDeLiquidar } from "@/app/(app)/cierres-admin/_components/PendienteLiquidarBadge";

import * as L from "./cola-cierres-labels";

// ═══ Props del componente (design.md > ColaCierres) ═════════════════════════════════════════════

/** «bodega»: SLT-127 (central); el rol satélite de bodega lo añade SLT-106. */
export type TipoCola = "mensajero" | "bodega";
/** «mensajero» lo añade SLT-108. */
export type RolCola = "central" | "satelite";
export type PestanaCola = "pendientes" | "resueltos";

// ═══ Columnas (R33, R34) ════════════════════════════════════════════════════════════════════════

export type ColumnaColaId =
  | "folio"
  | "mensajero"
  | "fecha"
  | "estado"
  | "recaudado"
  | "pago"
  | "pagoEntregado"
  | "senales"
  | "acciones"
  // SLT-127 (R44): las de la cola de bodega.
  | "bodega"
  | "solicito"
  | "cierres"
  | "debeLlegar"
  | "recibido"
  | "falta"
  | "conciliacion";

export interface ColumnaCola {
  id: ColumnaColaId;
  label: string;
  align?: "right";
  /** La cabecera no se ve (canvas: rótulo vacío) pero tiene nombre para el lector. */
  soloLector?: boolean;
}

/**
 * Las columnas en el orden del canvas: Folio · Mensajero · Solicitado/Resuelto · Estado · Recaudado ·
 * Pago al mensajero · (Pago entregado: solo central en Resueltos) · Señales · acciones.
 */
export function columnasCola(
  tipo: TipoCola,
  rol: RolCola,
  pestana: PestanaCola,
): ColumnaCola[] {
  if (tipo === "bodega") return COLUMNAS_BODEGA.map((c) => ({ ...c }));
  const resueltos = pestana === "resueltos";
  return [
    { id: "folio", label: L.COLUMNA_FOLIO },
    { id: "mensajero", label: L.COLUMNA_MENSAJERO },
    { id: "fecha", label: resueltos ? L.COLUMNA_RESUELTO : L.COLUMNA_SOLICITADO },
    { id: "estado", label: L.COLUMNA_ESTADO },
    { id: "recaudado", label: L.COLUMNA_RECAUDADO, align: "right" },
    { id: "pago", label: L.COLUMNA_PAGO, align: "right" },
    ...(rol === "central" && resueltos
      ? [{ id: "pagoEntregado" as const, label: L.COLUMNA_PAGO_ENTREGADO }]
      : []),
    { id: "senales", label: L.COLUMNA_SENALES },
    { id: "acciones", label: L.COLUMNA_ACCIONES, soloLector: true },
  ];
}

// ═══ Celdas (R101) ══════════════════════════════════════════════════════════════════════════════

export function folioCola(c: Pick<CierreAdminResumen, "cierreId">): string {
  return `#${folioDe(c.cierreId)}`;
}

export function fechaCola(
  c: Pick<CierreAdminResumen, "solicitadoAt" | "resueltoAt">,
  pestana: PestanaCola,
): string {
  return fechaHora(pestana === "resueltos" ? c.resueltoAt : c.solicitadoAt);
}

// ═══ Pago entregado (R103) ══════════════════════════════════════════════════════════════════════

export type PagoEntregado =
  | { tipo: "nulo" }
  | { tipo: "liquidado" }
  | { tipo: "pendiente"; monto: string };

/**
 * `null` → «—» (no aprobado); un importe que no es mayor que cero → «Liquidado»; mayor que cero →
 * «Pendiente <monto>». La comparación es de TEXTO (`hayPendienteDeLiquidar`), sin convertir nada.
 */
export function pagoEntregadoDe(pendiente: string | null): PagoEntregado {
  if (pendiente === null) return { tipo: "nulo" };
  if (!hayPendienteDeLiquidar(pendiente)) return { tipo: "liquidado" };
  return { tipo: "pendiente", monto: pendiente };
}

// ═══ Señales (R102, R110) ═══════════════════════════════════════════════════════════════════════

export interface SenalCola {
  texto: string;
  /** Nota larga (nombre accesible y `title`). `null` = la señal no tiene nota (R110). */
  nota: string | null;
}

/**
 * En este orden y solo las que apliquen: mensajero bloqueado (con su conteo), bloqueante hasta
 * re-solicitud (rechazado), paquetes reprogramados retenidos y, si el servidor las emite, las tres
 * de R110 que valgan más de cero. Sin `bloqueoMensajero` no se afirma ni se niega el bloqueo.
 */
export function senalesDe(c: CierreAdminResumen): SenalCola[] {
  const senales: SenalCola[] = [];
  const b = c.bloqueoMensajero;
  if (b?.bloqueado) {
    senales.push({
      texto: `${MENSAJERO_BLOQUEADO_LABEL} · ${b.cierresAbiertos}`,
      nota: notaMensajeroBloqueado(b),
    });
  }
  if (c.estado === "rechazado") {
    senales.push({ texto: RECHAZADO_BLOQUEANTE_LABEL, nota: RECHAZADO_BLOQUEANTE_NOTA });
  }
  const retenidas = c.reprogramadasRetenidasHoy ?? 0;
  if (retenidas > 0) {
    senales.push({
      texto: retieneReprogramadas(retenidas),
      nota: notaRetieneReprogramadas(retenidas),
    });
  }
  const s = c.senalesCola;
  if (s) {
    if (s.incidentesSinIndemnizar > 0) {
      senales.push({ texto: L.incidentesSinIndemnizar(s.incidentesSinIndemnizar), nota: null });
    }
    if (s.pagosAjustados > 0) {
      senales.push({ texto: L.pagosAjustados(s.pagosAjustados), nota: null });
    }
    if (s.vuelvenABodega > 0) {
      senales.push({ texto: L.vuelvenABodega(s.vuelvenABodega), nota: null });
    }
  }
  return senales;
}

// ═══ Acciones (R33, R34, R105) ══════════════════════════════════════════════════════════════════

export type AccionFila = "verDecidir" | "ver" | "destrabar" | "registrarPago";

/**
 * Pendientes: «Ver / decidir» en lo resoluble, «Ver» + «Destrabar» en un vencido. Resueltos: «Ver»,
 * y «Registrar pago» solo para la central con permiso en un aprobado con pendiente mayor que cero.
 */
export function accionesFilaDe(
  c: Pick<CierreAdminResumen, "estado" | "pendientePagoMensajero">,
  rol: RolCola,
  pestana: PestanaCola,
  puedeRegistrarPago: boolean,
): AccionFila[] {
  if (pestana === "pendientes") {
    return c.estado === "vencido" ? ["ver", "destrabar"] : ["verDecidir"];
  }
  const pagable =
    rol === "central" &&
    puedeRegistrarPago &&
    c.estado === "aprobado" &&
    hayPendienteDeLiquidar(c.pendientePagoMensajero);
  return pagable ? ["ver", "registrarPago"] : ["ver"];
}

// ═══ Bodega · central (SLT-127: R44, R127, R129, R130) ══════════════════════════════════════════

/**
 * Folio · Bodega · Solicitó · Solicitado · Cierres · Debe llegar · Recibido · Falta · Estado ·
 * acciones, igual en «Por conciliar» y en «Conciliados» (canvas, rama bodega · central).
 */
const COLUMNAS_BODEGA: readonly ColumnaCola[] = [
  { id: "folio", label: L.COLUMNA_FOLIO },
  { id: "bodega", label: L.COLUMNA_BODEGA },
  { id: "solicito", label: L.COLUMNA_SOLICITO },
  { id: "fecha", label: L.COLUMNA_SOLICITADO },
  { id: "cierres", label: L.COLUMNA_CIERRES, align: "right" },
  { id: "debeLlegar", label: L.COLUMNA_DEBE_LLEGAR, align: "right" },
  { id: "recibido", label: L.COLUMNA_RECIBIDO, align: "right" },
  { id: "falta", label: L.COLUMNA_FALTA, align: "right" },
  { id: "conciliacion", label: L.COLUMNA_ESTADO },
  { id: "acciones", label: L.COLUMNA_ACCIONES, soloLector: true },
];

/** El nombre del `tablist` de cada tipo de cola (R99, R127). */
export function tablistCola(tipo: TipoCola): string {
  return tipo === "bodega" ? L.TABS_COLA_BODEGA_LABEL : L.TABS_COLA_MENSAJERO_LABEL;
}

export function folioBodegaCola(c: Pick<CierreBodegaResumen, "cierreBodegaId">): string {
  return `#${folioDe(c.cierreBodegaId)}`;
}

export type RecibidoCola = { tipo: "nulo" } | { tipo: "monto"; monto: string };

/** Sin marca → «—», NUNCA ₡0 (R129). El importe es el string del servidor, tal cual (R71). */
export function recibidoCola(c: Pick<CierreBodegaResumen, "montoRecibido">): RecibidoCola {
  return c.montoRecibido === null ? { tipo: "nulo" } : { tipo: "monto", monto: c.montoRecibido };
}

/** La Falta va resaltada solo si queda algo por llegar; un negativo (llegó de más) no (R129). */
export function faltaResaltada(c: Pick<CierreBodegaResumen, "faltaPorRecibir">): boolean {
  return hayFaltantePorRecibir(c.faltaPorRecibir);
}

export type AccionBodega = "verConciliar" | "verCorregir" | "ver";

/**
 * R130: pendiente → «Ver / conciliar»; incompleto → «Ver / corregir»; recibido → «Ver». Un
 * `rechazado` heredado llega sin marca: es «pendiente» y se ofrece «Ver / conciliar» (C1).
 */
export function accionBodegaDe(
  c: Pick<CierreBodegaResumen, "conciliado" | "faltaPorRecibir">,
): AccionBodega {
  const estado = estadoConciliacionDe(c);
  if (estado === "pendiente") return "verConciliar";
  if (estado === "incompleto") return "verCorregir";
  return "ver";
}
