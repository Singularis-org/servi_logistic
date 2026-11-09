import type { BugReportCreado, NuevoBugReport } from "@/lib/types/reporte-bug";

// SLT-87 (design §6) — la escritura de `bug_report`, tabla de plataforma. En esta entrega solo se crea;
// las lecturas del superadmin llegan con SLT-97.

export interface IBugReportRepository {
  /**
   * Guarda el reporte con el nombre del usuario en ese momento (R13). `null` si el usuario no está en
   * esa empresa (cuenta movida o borrada entre la sesión y el envío): no escribe nada (R11).
   */
  crear(datos: NuevoBugReport): Promise<BugReportCreado | null>;
}
