import { z } from "zod";

// SLT-215 (design §3.1) — las piezas de importe y descuento que comparten `lib/types/planes.ts`, `rastro.ts` y
// `niveles.ts`. Viven en un módulo hoja, sin imports de la app, porque `lib/types/planes.ts` importa
// `nivelesSchema` y `niveles.ts` necesita estas piezas: si siguieran en `planes.ts` o en `rastro.ts`, el ciclo
// dejaría una de las dos a medio evaluar al cargarse. `planes.ts` y `rastro.ts` las reexportan con su nombre de
// siempre.

/**
 * Porcentaje de descuento de un período (SLT-86 R10; antes, sobre el anual): texto, hasta dos decimales, `> 0` y `≤ 100` (R3). Se
 * compara en centésimas enteras, así que no hay redondeo de coma flotante. SLT-83 (R2): el mismo rango
 * vale para el costo por orden porcentual. SLT-215 (R4): y para el descuento de un nivel.
 */
export const porcentajeSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((s) => {
    const [entero, decimales = ""] = s.split(".");
    const centesimas = Number.parseInt(entero, 10) * 100 + Number.parseInt(decimales.padEnd(2, "0"), 10);
    return centesimas > 0 && centesimas <= 10_000;
  });

/** SLT-86 (R10), SLT-215 (R4): un descuento trae una sola forma. */
export const SOLO_UNA_FORMA = "Un descuento es porcentaje o monto fijo, no los dos.";

/** Texto con dos decimales y sin ceros a la izquierda, sin pasar por `Number` («007.5» → «7.50»). */
export function importeCanonico(texto: string): string {
  const [entero, decimales = ""] = texto.split(".");
  return `${entero.replace(/^0+(?=\d)/, "")}.${decimales.padEnd(2, "0")}`;
}
