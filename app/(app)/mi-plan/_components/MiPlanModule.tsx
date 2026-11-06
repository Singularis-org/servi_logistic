import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import type { PendienteDeEmpresa, PlanConConsumo } from "@/lib/types/consumo-plan";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n (design §6.5). */
export const MI_PLAN_TEXTOS = {
  titulo: "Mi plan",
  sinPlan: "Tu empresa no tiene plan asignado: sin límites",
} as const;

export interface MiPlanModuleProps {
  readonly plan: PlanConConsumo | null;
  /**
   * SLT-86 (R26; decisión del 2026-11-05): sin plan, la primera asignación pendiente; `null` si no hay.
   * Con plan, el pendiente viene en `plan.cobro.pendiente`.
   */
  readonly pendienteSinPlan?: PendienteDeEmpresa | null;
}

/**
 * SLT-58 (design §6.4; R1–R7, R11) — lo que la empresa ve de su plan. Solo información: sin botones
 * ni formularios, porque pedir o cambiar de plan no es cosa de la empresa (R11; SL-25 fuera de alcance).
 * SLT-86 (R26): el cambio pendiente se ve, pero cancelarlo es cosa del superadmin.
 */
export function MiPlanModule({ plan, pendienteSinPlan = null }: MiPlanModuleProps) {
  const pendiente = plan?.cobro.pendiente ?? null;
  return (
    <div className="flex flex-col gap-4">
      {pendiente !== null && <p className="text-sm font-medium">{TEXTOS_TIPO_COBRO.pendiente(pendiente)}</p>}
      <ConsumoDelPlan plan={plan} textoSinPlan={MI_PLAN_TEXTOS.sinPlan} pendienteSinPlan={pendienteSinPlan} />
    </div>
  );
}
