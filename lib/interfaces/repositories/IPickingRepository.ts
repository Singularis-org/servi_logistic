// Ficha 476 (design §4.3) — lectura del informe de picking. SOLO LECTURA: ningun metodo escribe
// (R9). El numero de consultas no depende del numero de ordenes (R29).
import type {
  EntradaPorTienda,
  FilaPicking,
  TiendaFulfillment,
  TiendaPicking,
} from "@/lib/whatsapp-envios/informes/picking/tipos";

export interface IPickingRepository {
  /** La tienda del parametro (R7), con su rol, su estado y su marca de AHORA (`fulfillment` = `!seRecogeEnTienda`). `null` si no existe. */
  tiendaDelPicking(tiendaId: string): Promise<TiendaPicking | null>;
  /**
   * R6/R14/R26 — UNA sentencia: las ordenes no borradas, en `en_preparacion`, de `tiendaId` y solo
   * si esa tienda tiene `se_recoge_en_tienda = false` (SLT-94 R7); ordenadas por `clave_remision` (orden natural, 423).
   */
  ordenesEnPreparacion(tiendaId: string): Promise<FilaPicking[]>;
  /** R3 — las tiendas `adminTienda` ACTIVAS con `se_recoge_en_tienda = false` (SLT-94 R7; sin orden garantizado). */
  tiendasFulfillment(): Promise<TiendaFulfillment[]>;
  /** R3 — UNA sentencia: la entrada a preparacion de cada orden en preparacion de toda tienda con fulfillment. */
  entradasEnPreparacion(): Promise<EntradaPorTienda[]>;
}
