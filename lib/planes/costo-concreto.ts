import type { PlanDTO, VersionPlan } from "@/lib/types/planes";

// SLT-66 (design §4.2.1; R28, R20) — si un plan tiene costo concreto. Puro y sin `@prisma/client`:
// lo importan el servicio, `costeo.ts` (que llega a componentes cliente) y la pantalla.

/** Lo que el predicado mira de un plan: vale para un `PlanDTO` y para una `VersionPlan`. */
export type PlanParaCosto = Pick<VersionPlan, "precio" | "costoPorOrden" | "costoPorOrdenPorcentual">;

/**
 * R28: base con forma «monto» y costo por orden del plan no nulo. Mira la forma, no el importe: un
 * mensual o un costo de `"0.00"` son concretos. SLT-83 (R5): un porcentaje también lo es, con mínimo o
 * sin él.
 */
export function tieneCostoConcreto(plan: PlanParaCosto): boolean {
  return plan.precio.tipo === "monto" && (plan.costoPorOrden !== null || plan.costoPorOrdenPorcentual !== null);
}

/** Lo que `esPlanDisponible` mira de un plan del catálogo. */
export type PlanParaDisponible = Pick<PlanDTO, "visibilidad" | "archivado">;

/**
 * SLT-99 (design §3 paso 3; R5, R12) — si el maestro puede elegir el plan: público y no archivado. Decisión del
 * humano del 2026-11-10 (modifica SLT-66 R28–R29): ya no exige costo concreto, ni en el vigente ni en su cambio
 * programado; sin costo por orden rige la tarifa global y sin costo base, cuota 0. La misma regla que la lista
 * del carrusel (`publicos()`).
 */
export function esPlanDisponible(plan: PlanParaDisponible): boolean {
  return plan.visibilidad === "publico" && !plan.archivado;
}
