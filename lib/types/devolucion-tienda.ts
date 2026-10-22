import { z } from "zod";
import { GESTION_MIME_EXTENSION, type GestionMimeType } from "@/lib/config/gestion";
import { evidenciasSchema } from "@/lib/types/gestion-orden";

// FICHA 419 — la bodega CENTRAL cierra la devolucion a la tienda con un COMPROBANTE.
// Validacion de borde (zod) y resultados tipados de las dos Server Actions
// (`lib/actions/devolucion-tienda.ts`). Este archivo viaja al bundle del navegador (el modal
// valida con el MISMO schema): no importa Prisma ni nada de servidor.

/**
 * Tope de ordenes por lote (R5, decision del humano del 2026-10-21: 300). Cubre en un solo lote
 * las 247 ordenes paradas en `devolviendo_a_tienda` medidas en produccion.
 */
export const TOPE_ORDENES_POR_LOTE = 300;

/**
 * Carpeta del comprobante dentro del bucket privado `gestion-evidencias` (design D2). El nombre
 * del objeto es `devolucion-tienda/<uuid aleatorio>.<ext>`: SIN ids de tienda, orden ni usuario
 * (R23).
 */
export const PREFIJO_COMPROBANTE_DEVOLUCION_TIENDA = "devolucion-tienda/";

/** Ruta del objeto en el bucket. `uuid` lo genera quien llama (inyectable para los tests). */
export function rutaComprobanteDevolucionTienda(uuid: string, contentType: GestionMimeType): string {
  return `${PREFIJO_COMPROBANTE_DEVOLUCION_TIENDA}${uuid}.${GESTION_MIME_EXTENSION[contentType]}`;
}

/**
 * Entrada de `confirmarEntregaTienda` (R3/R4/R5). `evidencias` es el MISMO schema de la 119/158:
 * imagen jpeg/png/webp, no vacia, <= 5 MB por archivo, 1..3 archivos. Los ids de orden se
 * deduplican en el servicio; el tope se aplica a lo que llega.
 */
export const confirmarEntregaTiendaSchema = z.object({
  tiendaId: z.string().uuid("tienda del lote invalida"),
  ordenIds: z
    .array(z.string().uuid("identificador de orden invalido"))
    .min(1, "selecciona al menos una orden")
    .max(TOPE_ORDENES_POR_LOTE, `maximo ${TOPE_ORDENES_POR_LOTE} ordenes por lote`),
  evidencias: evidenciasSchema,
});
export type ConfirmarEntregaTiendaActionInput = z.infer<typeof confirmarEntregaTiendaSchema>;

/** Entrada de `verComprobanteDevolucionTienda` (R22). */
export const verComprobanteDevolucionTiendaSchema = z.object({
  ordenId: z.string().uuid(),
});

/**
 * Desenlace POR ORDEN pedida (R7). `numGuia` es `null` en `no_encontrada` (no se revela nada de
 * una orden inexistente o borrada) y cuando la orden aun no tiene guia.
 */
export type DesenlaceOrden =
  | {
      ordenId: string;
      numGuia: number | null;
      desenlace: "devuelta_a_tienda" | "ya_devuelta" | "tienda_distinta" | "no_encontrada";
    }
  | { ordenId: string; numGuia: number | null; desenlace: "estado_invalido"; estado: string };

export type DesenlaceOrdenValue = DesenlaceOrden["desenlace"];

/**
 * Resultado de `confirmarEntregaTienda`.
 * - `ok`: al menos una orden paso a `devuelta_a_tienda`; `devueltas` las cuenta.
 * - `ninguna_devuelta`: ninguna era elegible; no se guardo el comprobante (R11).
 * - `forbidden`: el actor no es maestro/admin (R2).
 * - `comprobante_no_guardado`: fallo la subida de un archivo; ninguna orden cambio (R12).
 * - `validation_error`: borde zod (R3/R4/R5) o tienda del lote inexistente / no es tienda.
 * - `unauthenticated`: sin sesion.
 */
export type ConfirmarEntregaTiendaResult =
  | { status: "ok"; devueltas: number; desenlaces: DesenlaceOrden[] }
  | { status: "ninguna_devuelta"; desenlaces: DesenlaceOrden[] }
  | { status: "forbidden" }
  | { status: "comprobante_no_guardado" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };

/** Un archivo del comprobante, ya firmado. Nunca lleva la ruta interna (R23). */
export interface ComprobanteArchivoFirmado {
  url: string;
  contentType: string;
  indice: number;
}

/**
 * Resultado de `verComprobanteDevolucionTienda` (R22). `no_encontrado` es el MISMO para un rol
 * ajeno, una orden sin comprobante y una orden inexistente: no revela si existe.
 */
export type VerComprobanteDevolucionTiendaResult =
  | {
      status: "ok";
      /** Instante ISO de la confirmacion del lote. */
      confirmadoAt: string;
      /** Nombre de quien confirmo (maestro/admin). */
      confirmadoPor: string;
      archivos: ComprobanteArchivoFirmado[];
    }
  | { status: "no_encontrado" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };
