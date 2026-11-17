import type { FiltrosCierresBodega } from "@/lib/types/filtros-cierres";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ListarCierresBodegaSolicitadosCompletoServiceResult } from "@/lib/interfaces/services/ICierreBodegaService";

/**
 * SLT-176 (R696) — la descarga de «Cierres de bodega solicitados» de la satelite, en un servicio de
 * SOLO LECTURA. Antes vivia en `ICierreBodegaService`, que escribe dinero; de alli llegaba por import
 * a las cifras de presentacion (guardia R631). El tipo de resultado sigue en `ICierreBodegaService`.
 */
export interface ICierresBodegaSateliteDescargaService {
  /**
   * Feature 184 — Tanda B (R1/R4/R6/R10): el CONJUNTO de «Cierres de bodega solicitados» de la
   * zona del actor, sin recorte, para producir el archivo.
   *
   * Mismo guard y misma resolucion de zona que su hermana paginada. Los filtros son los de la
   * pagina sin `page`/`pageSize`, validados en el borde (R17). El tope de filas se evalua aqui
   * (R6): superarlo NO entrega filas ni un conjunto truncado. Sin zona -> conjunto vacio, no
   * `forbidden`.
   */
  listarCierresBodegaSolicitadosCompleto(
    actor: Actor,
    filtros?: FiltrosCierresBodega,
  ): Promise<ListarCierresBodegaSolicitadosCompletoServiceResult>;
}
