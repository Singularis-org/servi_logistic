import { EMPRESA } from "@/lib/config/marca";
import type { WalletMovimientoCategoria } from "@/lib/types/wallet";

/**
 * FICHA 458-B (R4) — el nombre legible de un egreso de caja cuando su `descripcion` falta.
 *
 * `WalletEgresoService.reversarEgreso` escribia `Reverso de: ${descripcion ?? id}`: si la fila no
 * traia descripcion, el libro pintaba un uuid (C4.2 del inventario). Aqui la caida es un NOMBRE, y
 * nunca un identificador. Los textos son los del libro de la caja (`CATEGORIA_LABEL`, 461 §7.2)
 * escritos otra vez a proposito: `lib/` no importa de `app/`. Cualquier otra categoria (no deberia
 * llegar: solo se reversan egresos) cae en «un movimiento de la caja».
 */
const NOMBRE_EGRESO: Partial<Record<WalletMovimientoCategoria, string>> = {
  egreso_sueldo: "Sueldo",
  egreso_gasto_variable: `Gasto de ${EMPRESA.enFrase}`,
  egreso_gasto_fijo: `Gasto fijo de ${EMPRESA.enFrase}`,
  egreso_gasto: `Otro gasto de ${EMPRESA.enFrase}`,
  egreso_indemnizacion: `Indemnización que ${EMPRESA.enFrase} paga por un incidente`,
};

export function nombreDelEgresoAnulable(categoria: WalletMovimientoCategoria): string {
  return NOMBRE_EGRESO[categoria] ?? "un movimiento de la caja";
}
