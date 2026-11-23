import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ResultadoActualizacionZonasDTO, VistaPreviaZonasDTO } from "@/lib/types/actualizacion-zonas";

/**
 * SLT-224 (design §3b.2) — el boton «Actualizar zonas» de `/ordenes`. La autorizacion (maestro y
 * admin) la valida la Server Action antes de instanciar el servicio (R1714).
 */
export interface IActualizacionZonasService {
  /** R1715: cuantas se actualizarian, agrupadas por zona actual -> nueva, y las saltadas. Sin escribir. */
  vistaPrevia(): Promise<VistaPreviaZonasDTO>;
  /** R1717/R1718: actualiza en una transaccion y devuelve cuantas y las saltadas con su motivo. */
  actualizar(actor: Actor): Promise<ResultadoActualizacionZonasDTO>;
}
