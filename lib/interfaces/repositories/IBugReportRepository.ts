import type { BugReportStatus } from "@prisma/client";

import type {
  BugReportCreado,
  CambioEstadoDTO,
  NuevoBugReport,
  ReporteDetalleDatos,
  ReporteFilaDTO,
} from "@/lib/types/reporte-bug";

// SLT-87 (design §6) — la escritura de `bug_report`, tabla de plataforma.
// SLT-97 (design §5) — las lecturas del superadmin y el cambio de estado con su historial.

/** Lo que pide el servicio, ya traducido de los filtros de la pantalla (design §4, §7). */
export interface ConsultaDeReportes {
  /** `null` = todos los estados. */
  estados: readonly BugReportStatus[] | null;
  organizationId: string | null;
  /** Inicio del día UTC de «Desde», inclusivo. */
  desde: Date | null;
  /** Inicio del día UTC siguiente a «Hasta», exclusivo (R9). */
  hastaExclusivo: Date | null;
  pagina: number;
  tamano: number;
}

export interface PaginaDeReportes {
  /** Los que cumplen los filtros, sin los borrados (R11, R13). */
  total: number;
  filas: ReporteFilaDTO[];
}

export interface DetalleDeReporte {
  reporte: ReporteDetalleDatos;
  /** Del más reciente al más antiguo (R22). */
  historial: CambioEstadoDTO[];
}

export interface PedidoDeCambioDeEstado {
  reporteId: string;
  destino: BugReportStatus;
  /** `null` = sin nota (R20). */
  nota: string | null;
  actorUsuarioId: string;
}

export type ResultadoDeCambioDeEstado =
  | { resultado: "ok" }
  | { resultado: "transicion_invalida"; actual: BugReportStatus }
  | { resultado: "not_found" };

export interface IBugReportRepository {
  /**
   * Guarda el reporte con el nombre del usuario en ese momento (R13). `null` si el usuario no está en
   * esa empresa (cuenta movida o borrada entre la sesión y el envío): no escribe nada (R11).
   */
  crear(datos: NuevoBugReport): Promise<BugReportCreado | null>;

  /** R5, R7–R10, R13: del más reciente al más antiguo, sin los borrados; el total y una página. */
  listar(consulta: ConsultaDeReportes): Promise<PaginaDeReportes>;

  /** R14, R15, R22: `null` si no existe o está borrado. */
  detalle(id: string): Promise<DetalleDeReporte | null>;

  /**
   * R17, R18, R21: lee el estado, comprueba la transición y escribe el estado y la entrada del historial
   * en una sola transacción. Una transición inválida no escribe nada.
   */
  cambiarEstado(pedido: PedidoDeCambioDeEstado): Promise<ResultadoDeCambioDeEstado>;
}
