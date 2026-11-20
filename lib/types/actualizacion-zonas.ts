import type { OrderStatusValue } from "@/lib/types/order-status";

/**
 * SLT-224 (design §3b, R1713-R1719) — el boton «Actualizar zonas» de `/ordenes`.
 *
 * Busca en la empresa las ordenes cuya zona no es la de su distrito, enseña cuantas se corregirian y
 * cuales se saltan y por que, y al confirmar las corrige con la regla compartida de la 366/377
 * (`lib/repositories/_shared/reconciliar-zona-ordenes.ts`).
 *
 * Solo viajan nombres de zona y la guia (o la remision): nunca un dato del destinatario.
 */

/**
 * Por que una orden con zona errada NO se actualiza, en este orden de precedencia (R1726, PR 2):
 *   · `estante_satelite` — esta en el estante de una satelite (`en_bodega_satelite`, 377);
 *   · `finalizada`       — esta en un estado terminal (`ESTADOS_TERMINALES`, R1721);
 *   · `devolucion`       — esta en un estado de devolucion (clase `devolucion` de `CLASE_RECONCILIACION_ZONA`, R1723);
 *   · `cobro_en_curso`   — un cierre sin aprobar o una gestion que decidio dinero sin cierre aprobado (R1722).
 * Los tres primeros salen de `CLASE_RECONCILIACION_ZONA`; el estado manda sobre el cobro. SLT-248
 * (R1804) quito el motivo de las reprogramadas: `reprogramado` y `novedad` ya se mueven.
 */
export type MotivoSaltada =
  | "estante_satelite"
  | "finalizada"
  | "devolucion"
  | "cobro_en_curso";

/** Una orden saltada, con lo que la pantalla enseña: su guia (o remision) y el motivo. */
export interface OrdenSaltadaDTO {
  guia: string;
  motivo: MotivoSaltada;
}

/** Cuantas ordenes pasan de una zona a otra. */
export interface GrupoActualizacionZonasDTO {
  zonaActual: string;
  zonaNueva: string;
  cantidad: number;
}

/** La vista previa (R1715): sin escribir nada. `total` es la suma de `cantidad` de los grupos. */
export interface VistaPreviaZonasDTO {
  grupos: GrupoActualizacionZonasDTO[];
  total: number;
  saltadas: OrdenSaltadaDTO[];
}

/** El resultado de confirmar (R1718): cuantas se actualizaron y las que quedaron saltadas. */
export interface ResultadoActualizacionZonasDTO {
  actualizadas: number;
  saltadas: OrdenSaltadaDTO[];
}

/**
 * Una orden con zona errada tal como la lee el repositorio: SIN filtro de estado ni de corte, para
 * que el servicio decida si se actualiza o se salta (y por que).
 */
export interface FilaZonaErrada {
  ordenId: string;
  distritoId: string;
  /** Guia, o remision si no hay guia, o «(sin guía)». */
  guia: string;
  estado: OrderStatusValue;
  /** Nombre de la zona actual de la orden. */
  zonaActual: string;
  /** Nombre de la zona de su distrito. */
  zonaNueva: string;
  /**
   * R1722: tiene un detalle de un cierre sin aprobar, o una gestion vigente con resultado
   * entregado, rechazo o incidente sin cierre o con un cierre sin aprobar.
   */
  cobroEnCurso: boolean;
}

/** Lo que devuelve la Server Action de la vista previa. */
export type VistaPreviaActualizacionZonasResult =
  | { status: "ok"; vistaPrevia: VistaPreviaZonasDTO }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

/** Lo que devuelve la Server Action que confirma. */
export type ActualizarZonasResult =
  | { status: "ok"; resultado: ResultadoActualizacionZonasDTO }
  | { status: "unauthenticated" }
  | { status: "forbidden" };
