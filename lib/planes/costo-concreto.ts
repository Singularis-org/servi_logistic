import type { VersionPlan } from "@/lib/types/planes";

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
