/**
 * SLT-156 — «ningún dato se recorta» (R490-R493).
 *
 * En el móvil no hay tooltip: un dato con «…» y `title` no se puede leer. Por eso el texto de una
 * orden, gestión o cierre envuelve en varias líneas (partiendo una palabra sin espacios si hace
 * falta) y la guía y los importes van en una columna propia que no se encoge ni se parte.
 */

/** Texto de dato que envuelve: nunca `truncate`, `text-ellipsis` ni `line-clamp`. */
export const TEXTO_ENTERO = "min-w-0 whitespace-normal wrap-anywhere"

/** Guía e importes: columna fija, sin partir ni encoger. Los importes añaden `text-right`. */
export const COLUMNA_FIJA = "shrink-0 whitespace-nowrap tabular-nums"

/**
 * Área táctil de 44 × 44 px solo en móvil, para controles compartidos con escritorio
 * (en escritorio no cambia nada).
 */
export const TACTIL_MOVIL = "max-md:min-h-11 max-md:min-w-11"
