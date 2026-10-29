// SLT-49 (R1, R5) — en qué estados le ofrece `/ordenes` a la tienda «Imprimir etiquetas» por lote.
//
// Módulo aparte, junto a `exclude-por-rol.ts` y por la misma razón: blindarlo con un test sin
// arrastrar la página. Los tres son los estados de RECOGIDA que la tienda ve en su filtro (decisión
// cerrada del 2026-10-28): el paquete todavía está en la tienda o un mensajero va a buscarlo, y la
// etiqueta es lo que la tienda le pega.
//
// Esto restringe solo la OFERTA del lote. El servidor no filtra por estado: la impresión por fila
// («Ver etiqueta») existe en cualquier estado; lo que el servidor sí limita es el DUEÑO
// (`resolverAlcanceEtiquetasOrden`).
export const ESTADOS_ETIQUETAS_TIENDA: ReadonlySet<string> = new Set([
  "por_recolectar_en_tienda",
  "recolectando",
  "mensajero_recogiendo_en_bodega",
]);

/**
 * R5 — por qué una orden de recogida no se puede marcar: no tiene guía, así que no hay etiqueta
 * que imprimir. Se bloquea aunque sea eliminable (P1 del spec, resuelta «R5 tal cual»).
 */
export const MOTIVO_SIN_GUIA = "Sin guía todavía";
