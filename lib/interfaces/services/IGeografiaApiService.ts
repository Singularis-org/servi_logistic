import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { GeografiaResponse, UbicacionDTO } from "@/lib/types/api-v2";

/**
 * SLT-45 (design §6) — resultado del catalogo geografico de v2. Como el resto del canal, la
 * autorizacion y la ausencia NO lanzan: el borde traduce `forbidden` a 403 y `not_found` al 404
 * uniforme (`NotFoundError`).
 */
export type CatalogoV2Result =
  | { status: "ok"; catalogo: GeografiaResponse }
  | { status: "forbidden" }
  | { status: "not_found" };

/** SLT-45 (design §4.3, R20) — la ruta de la ubicacion de una orden propia, de la raiz al nodo. */
export type UbicacionDeOrdenResult =
  | { status: "ok"; ubicacion: UbicacionDTO[] }
  | { status: "forbidden" }
  | { status: "not_found" };

export interface IGeografiaApiService {
  /**
   * La ruta publica (R21) del lugar de la orden `ordenId`, si es del dueño de la key. El lugar se
   * lee de las FK viejas (`findLugarDeOrdenForOwner`) y la ruta sale del catalogo de la empresa.
   * Una orden ajena, borrada o inexistente da `not_found` (el borde responde el 404 uniforme).
   */
  ubicacionDeOrden(actor: Actor, ordenId: string): Promise<UbicacionDeOrdenResult>;

  /**
   * El pais pedido, sus tipos de nivel y todos sus nodos con el activo en cascada (R22). Solo el
   * rol `apiKey`. Solo se sirve el pais de la empresa de la key: un pais ajeno y uno que no existe
   * dan el mismo `not_found` (R23; RLS de SLT-43 R12).
   */
  catalogo(actor: Actor, paisId: string): Promise<CatalogoV2Result>;
}
