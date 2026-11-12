/**
 * SLT-103 (R137-R140) — Textos de los diálogos del módulo de cierres, en «tú» y separados de la
 * lógica (patrón `*-labels.ts` del módulo), para i18n futuro.
 */

/** Visor único de evidencia (R137, R139). */
export const VISOR_EVIDENCIA_TEXTO = {
  titulo: "Evidencia de la gestión",
  alt: "Evidencia fotográfica de la gestión",
  cerrar: "Cerrar",
  anterior: "Anterior",
  siguiente: "Siguiente",
  /** `aria-label` del grupo «Anterior»/«Siguiente». */
  navegacion: "Fotos de la evidencia",
} as const;

const VER_EVIDENCIA = "Ver evidencia";

/** «Orden REM-011 · Andrés Mora» (canvas Dialogos l.183). */
export function contextoEvidencia(numRemision: string, destinatario: string): string {
  return `Orden ${numRemision} · ${destinatario}`;
}

/**
 * Descripción del visor. Con una foto no se dice «foto 1 de 1» (R138): devuelve el contexto (o
 * `undefined`). Con n > 1, «<contexto> · foto i de n» o «Foto i de n» sin contexto (R139).
 * `i` es 1-based.
 */
export function descripcionVisor(i: number, n: number, contexto?: string): string | undefined {
  if (n <= 1) return contexto;
  return contexto ? `${contexto} · foto ${i} de ${n}` : `Foto ${i} de ${n}`;
}

/** n ≤ 1 → «Ver evidencia» (o la base dada); n > 1 → «<base> (n)» (R54, R138). */
export function etiquetaVerEvidencia(n: number, base: string = VER_EVIDENCIA): string {
  return n > 1 ? `${base} (${n})` : base;
}

/** Resumen de «Solicitar cierre del día» (R55, R140). */
export const RESUMEN_SOLICITUD_TEXTO = {
  region: "Resumen del cierre a solicitar",
  gestiones: "Gestiones",
  recaudado: "Recaudado",
  tuGanancia: "Tu ganancia",
} as const;

/**
 * SLT-106 (R48, R207): el resumen del diálogo «Solicitar cierre de bodega» de la satélite, con las
 * mismas cifras que las tarjetas de «A consolidar».
 */
export const RESUMEN_SOLICITUD_BODEGA_TEXTO = {
  region: "Resumen del cierre de bodega a solicitar",
  recaudado: "Recaudado",
  pagoMensajeros: "Pago a mensajeros",
  ganaBodega: "Gana la bodega satélite",
  debeLlegar: "Debe llegar a la central",
} as const;
