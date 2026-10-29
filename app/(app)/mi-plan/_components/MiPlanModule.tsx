import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import type { PlanConConsumo } from "@/lib/types/consumo-plan";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n (design §6.5). */
export const MI_PLAN_TEXTOS = {
  titulo: "Mi plan",
  sinPlan: "Tu empresa no tiene plan asignado: sin límites",
  /** Lo que anuncia el `role="status"` de `loading.tsx` mientras llega el plan. */
  cargando: "Cargando",
} as const;

/**
 * SLT-58 (design §6.4; R1–R7, R11) — lo que la empresa ve de su plan. Solo información: sin botones
 * ni formularios, porque pedir o cambiar de plan no es cosa de la empresa (R11; SL-25 fuera de alcance).
 */
export function MiPlanModule({ plan }: { readonly plan: PlanConConsumo | null }) {
  return <ConsumoDelPlan plan={plan} textoSinPlan={MI_PLAN_TEXTOS.sinPlan} />;
}
