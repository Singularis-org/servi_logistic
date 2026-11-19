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
 * SLT-202 (Carlos, 2026-11-18: «escritorio = prod; la PWA del mensajero conserva los 44 px en el
 * móvil»): lo que medía `size="touch"`, solo por debajo de `md`. Va con el `size` que el botón tenía
 * en prod, que es el que manda desde `md`. Repite el alto, el relleno, el hueco, la letra y el
 * icono de `touch` para que el móvil quede igual que antes.
 */
export const BOTON_TACTIL_MOVIL =
  "max-md:h-11 max-md:gap-2 max-md:px-4 max-md:text-sm max-md:[&_svg:not([class*='size-'])]:size-4";

/** SLT-202: lo que medía `size="icon-touch"` (44 × 44), solo por debajo de `md`. */
export const ICONO_TACTIL_MOVIL = "max-md:size-11";

/**
 * SLT-190 (B1), promovido por SLT-193 (R916): área táctil de 44 × 44 px para el (i) de
 * `EstadoInfo` (caja de 16 + 2 × 14). Va en el envoltorio (`className`) y crece el
 * pseudo-elemento del botón, no su caja: la fila no cambia de alto.
 */
export const CLASE_INFO_TACTIL = "[&_button]:after:-inset-3.5";

/**
 * SLT-193 (R919): la misma área de 44 × 44 solo en móvil, para un (i) compartido con escritorio
 * (en escritorio sigue en 24 × 24).
 */
export const CLASE_INFO_TACTIL_MOVIL = "max-md:[&_button]:after:-inset-3.5";

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
