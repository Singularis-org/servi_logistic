import type { BugReportStatus } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  CambiarEstadoReporteInput,
  CambioEstadoDTO,
  FiltrosReportes,
  ReporteDetalleDTO,
  ReporteFilaDTO,
} from "@/lib/types/reporte-bug";

// SLT-97 (design §4) — el módulo de reportes del superadmin. Resultados de dominio, sin HTTP:
// `unauthenticated` y `validation_error` los resuelve la Server Action antes de llamar aquí.

type Forbidden = { status: "forbidden" };

/** R11: `pagina` es la efectiva, ya recortada a `[1, última]`. */
export type ListarReportesServiceResult =
  | { status: "ok"; items: ReporteFilaDTO[]; total: number; pagina: number }
  | Forbidden;

export type VerReporteServiceResult =
  | { status: "ok"; reporte: ReporteDetalleDTO; historial: CambioEstadoDTO[] }
  | { status: "not_found" }
  | Forbidden;

/** R18: `transicion_invalida` lleva el estado actual, para que la pantalla lo diga. */
export type CambiarEstadoReporteServiceResult =
  | { status: "ok"; estado: BugReportStatus }
  | { status: "transicion_invalida"; actual: BugReportStatus }
  | { status: "not_found" }
  | Forbidden;

export interface IReportesBugPlataformaService {
  /** R5, R7–R11, R13. Solo la plataforma (R2). */
  listar(actor: Actor, filtros: FiltrosReportes): Promise<ListarReportesServiceResult>;
  /** R14, R15, R17, R22. Solo la plataforma (R2). */
  detalle(actor: Actor, reporteId: string): Promise<VerReporteServiceResult>;
  /** R17, R18, R20, R21. Solo la plataforma (R2); no avisa a nadie (R4). */
  cambiarEstado(actor: Actor, entrada: CambiarEstadoReporteInput): Promise<CambiarEstadoReporteServiceResult>;
}
