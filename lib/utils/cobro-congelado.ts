import { Prisma } from "@prisma/client";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { TarifaPago } from "@/lib/types/tarifa-flexible";
import {
  tarifaDe,
  type CierreDetalleRow,
  type ConceptoCongeladoRow,
  type TarifaCongeladaRow,
} from "@/lib/utils/cierre-detalle";
import { tarifaDeLaGestion, type TarifasDePago } from "@/lib/utils/cierre-totales";
import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";

// SLT-52 (T7, design §13) — la base del % del pago rebasada al cobro CONGELADO del cierre. Vivia en
// `cierre-totales.ts` (T5.5) y se mudo aqui, sin cambiar una linea de logica, para cortar el ciclo
// de import `cierre-totales` <-> `ingreso-empresa`: `ingreso-empresa` usa `computeTotales`
// (`partesPorTienda`, ficha 396) y esto usa `derivarIngresoOrden` (la MISMA cuenta que cobra la
// tienda). Este modulo depende de los dos y ninguno de los dos depende de el.

/**
 * SLT-52 (T5.5, design §13) — lo que `baseDelCobroCongelado` lee del cobro congelado de UNA orden
 * en un cierre: las entradas de la formula, la tarifa vieja (columnas `tarifa_*`) y los conceptos
 * del nuevo. Es un subconjunto de `DETALLE_SELECT`, asi que sirve la fila leida de `cierre_detail`
 * y la que `crearCierre` tiene en memoria al congelarla.
 */
export type CobroCongeladoDeOrden = TarifaCongeladaRow &
  Pick<CierreDetalleRow, "montoCobrar" | "cobraComision" | "esCentral" | "esZonaEspecial"> & {
    conceptos: readonly ConceptoCongeladoRow[];
  };

/**
 * SLT-52 (T5.5, design §13, R28, R52-R55) — la base del % del pago (mensajero y satelite): el flete
 * SIN IVA que ESE cierre le cobra a la tienda por ESA gestion. Es la misma cuenta del cobro al
 * aprobar —`derivarIngresoOrden` sobre `tarifaDe(detalle)` y el pedido congelado—, no una copia:
 * `ingreso_flete` si el resultado es `entregado`, `ingreso_flete_devolucion` si no, `0.00` si no
 * aporta (concepto ausente o sin tarifa, R28/R54).
 *
 * Sirve a los dos modelos de cobro: en el nuevo es `fleteSinIvaDeGestion` sobre lo congelado; en el
 * viejo es el flete devuelto del viejo congelado (R54), que es lo unico que puede cobrar un rechazo.
 * Nada vivo entra aqui: ni el valor de hoy ni el `monto_cobrar` de hoy (R52). Texto escala 2.
 */
export function baseDelCobroCongelado(
  resultado: CierreGestionPendienteRow["resultado"],
  detalle: CobroCongeladoDeOrden,
): string {
  const ingreso = derivarIngresoOrden(
    {
      resultado,
      esCentral: detalle.esCentral,
      esZonaEspecial: detalle.esZonaEspecial,
      montoCobrar: detalle.montoCobrar === null ? null : detalle.montoCobrar.toFixed(2),
      cobraComision: detalle.cobraComision,
    },
    tarifaDe(detalle, detalle.conceptos),
  );
  const flete = resultado === "entregado" ? ingreso.ingreso_flete : ingreso.ingreso_flete_devolucion;
  return (flete ?? new Prisma.Decimal(0)).toFixed(2);
}

/**
 * SLT-52 (T5.5, design §13.2) — la tarifa de pago de cada gestion con la base REBASADA al cobro
 * congelado de su orden. Solo cambia el `baseFlete` de las del modelo nuevo; el viejo no tiene base
 * y pasa tal cual (R36). `cobroDe` solo se llama para las del nuevo: es quien lanza
 * `CierreDetalleFaltanteError` si el cierre no tiene el detalle de esa orden (69/R14, sin fallback).
 */
export function rebasarConElCobroCongelado(
  gestiones: readonly { gestionId: string; ordenId: string; resultado: CierreGestionPendienteRow["resultado"] }[],
  tarifas: TarifasDePago,
  cobroDe: (ordenId: string) => CobroCongeladoDeOrden,
): Map<string, TarifaPago | null> {
  const rebasadas = new Map<string, TarifaPago | null>(tarifas);
  for (const g of gestiones) {
    const t = tarifaDeLaGestion(tarifas, g.gestionId);
    if (t === null || t.modelo !== "nuevo") continue;
    rebasadas.set(g.gestionId, {
      ...t,
      baseFlete: baseDelCobroCongelado(g.resultado, cobroDe(g.ordenId)),
    });
  }
  return rebasadas;
}
