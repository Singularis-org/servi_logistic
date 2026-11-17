/**
 * SLT-156 — «ningún dato se recorta» (R490-R493).
 *
 * En el móvil no hay tooltip: un dato con «…» y `title` no se puede leer. Por eso el texto de una
 * orden, gestión o cierre envuelve en varias líneas (partiendo una palabra sin espacios si hace
 * falta) y la guía y los importes van en una columna propia que no se encoge ni se parte.
 */

/** Texto de dato que envuelve: nunca `truncate`, `text-ellipsis` ni `line-clamp`. */
export const TEXTO_ENTERO = "min-w-0 whitespace-normal wrap-anywhere";

/** Guía e importes: columna fija, sin partir ni encoger. Los importes añaden `text-right`. */
export const COLUMNA_FIJA = "shrink-0 whitespace-nowrap tabular-nums";

/**
 * Área táctil de 44 × 44 px solo en móvil, para controles compartidos con escritorio
 * (en escritorio no cambia nada).
 */
export const TACTIL_MOVIL = "max-md:min-h-11 max-md:min-w-11";

/**
 * SLT-165 (R493), promovido por SLT-162 (dos consumidores): el botón de desplegar de una `DataTable`
 * (el único `button[aria-expanded]` de la fila) a 44 × 44 px en el teléfono. Va en el contenedor de
 * la tabla, por selector de descendiente: la `DataTable` no cambia.
 */
export const DESPLEGABLE_TACTIL =
  "max-md:[&_button[aria-expanded]]:min-h-11 max-md:[&_button[aria-expanded]]:min-w-11";

/**
 * SLT-162 (R766): «Descargar» de una `DataTable` en el teléfono a todo el ancho y 44 px de alto,
 * encima de la lista (la barra de la tabla ya va encima). Va en el contenedor de la tabla, por
 * selector de descendiente sobre el botón de `DescargarDatasetButton` (`data-slot="button"` con
 * nombre accesible «Descargar …») y su envoltorio. En escritorio no cambia nada.
 */
export const DESCARGA_MOVIL =
  "max-md:[&_div:has(>[data-slot=button][aria-label^=Descargar])]:w-full " +
  "max-md:[&_[data-slot=button][aria-label^=Descargar]]:w-full " +
  "max-md:[&_[data-slot=button][aria-label^=Descargar]]:min-h-11";
