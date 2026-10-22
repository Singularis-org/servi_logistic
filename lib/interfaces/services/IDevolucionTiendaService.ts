import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EvidenciaArchivo } from "@/lib/interfaces/services/IMisAsignacionesService";
import type {
  ConfirmarEntregaTiendaResult,
  VerComprobanteDevolucionTiendaResult,
} from "@/lib/types/devolucion-tienda";

// FICHA 419 — contrato del servicio de la confirmacion CENTRAL de entrega a la tienda.
// Logica de negocio pura (sin HTTP, sin Prisma). `unauthenticated` lo agrega el borde.

export interface ConfirmarEntregaTiendaInput {
  tiendaId: string;
  ordenIds: string[];
  /** Binarios ya leidos del FormData por el borde. */
  evidencias: EvidenciaArchivo[];
}

export type ConfirmarEntregaTiendaServiceResult = Exclude<
  ConfirmarEntregaTiendaResult,
  { status: "unauthenticated" }
>;

export type VerComprobanteDevolucionTiendaServiceResult = Exclude<
  VerComprobanteDevolucionTiendaResult,
  { status: "unauthenticated" } | { status: "validation_error" }
>;

export interface IDevolucionTiendaService {
  /**
   * R1-R15: maestro/admin confirma que la tienda recibio N ordenes, con comprobante obligatorio.
   * Pasa a `devuelta_a_tienda` SOLO las elegibles en el instante de escribir y devuelve un
   * desenlace por orden pedida.
   */
  confirmarEntrega(
    input: ConfirmarEntregaTiendaInput,
    actor: Actor,
  ): Promise<ConfirmarEntregaTiendaServiceResult>;

  /** R22/R23: URLs firmadas del comprobante de la orden; `no_encontrado` si no aplica. */
  verComprobante(
    ordenId: string,
    actor: Actor,
  ): Promise<VerComprobanteDevolucionTiendaServiceResult>;
}
