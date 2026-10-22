/**
 * SL-15 (R17) — el nombre heredado del producto de origen, en un solo sitio.
 *
 * Se arma por partes para que este archivo no contenga la palabra literal: la guardia
 * `sin-nombre-heredado` lo recorre como a cualquier otro y no le da excepcion. Lo importan esa
 * guardia y las aserciones de ausencia (R21), que asi no repiten el patron.
 *
 * Distingue mayusculas a proposito: `OrdenExistente`, `ordenExacta` u `ordenExigido` son nombres
 * propios de este dominio y no el nombre heredado (design §1, falsos positivos).
 */
const RAIZ = "orden" + "ex";

export const NOMBRE_HEREDADO = {
  /** Forma en minusculas: claves, rutas, nombres de base. */
  minusculas: RAIZ,
  /** Forma con mayuscula inicial: textos e identificadores. */
  capital: RAIZ.charAt(0).toUpperCase() + RAIZ.slice(1),
  /** Forma en mayusculas: constantes. */
  mayusculas: RAIZ.toUpperCase(),
  /** Prefijo heredado de las API keys y los secretos de webhook. */
  prefijoLlave: "ord" + "x_",
} as const;

/** Las cuatro formas que vigila la guardia, sin bandera `i` ni `g` (sin estado entre llamadas). */
export const PATRON_NOMBRE_HEREDADO = new RegExp(
  [
    NOMBRE_HEREDADO.capital,
    NOMBRE_HEREDADO.minusculas,
    NOMBRE_HEREDADO.mayusculas,
    NOMBRE_HEREDADO.prefijoLlave,
  ].join("|"),
);

/** true si el texto contiene alguna de las cuatro formas. */
export function contieneNombreHeredado(texto: string): boolean {
  return PATRON_NOMBRE_HEREDADO.test(texto);
}
