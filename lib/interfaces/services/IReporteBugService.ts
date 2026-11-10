import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EntornoDelReporte, EnviarReporteBugInput } from "@/lib/types/reporte-bug";

// SLT-87 (design §5) — enviar un reporte de problema. Resultados de dominio, sin HTTP: `unauthenticated`
// y `validation_error` los resuelve la Server Action antes de llamar aquí.

/** R9: «enviado» no lleva ni el id ni ningún dato del reporte. */
export type EnviarReporteBugServiceResult = { status: "enviado" } | { status: "forbidden" };

export interface IReporteBugService {
  /**
   * Solo un usuario de empresa (R11). Guarda y después manda una copia por destinatario; un fallo del
   * correo se registra y no cambia la respuesta (R15–R17). Un fallo al guardar se propaga.
   */
  enviar(actor: Actor, entrada: EnviarReporteBugInput, entorno: EntornoDelReporte): Promise<EnviarReporteBugServiceResult>;
}
