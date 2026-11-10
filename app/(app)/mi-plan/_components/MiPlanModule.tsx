import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import type { PendienteDeEmpresa, PlanConConsumo } from "@/lib/types/consumo-plan";

import { CambioDePlan, PendienteDelPlan, type PlanesDeMiPlan } from "./CambioDePlan";
import { PlanActivo } from "./PlanActivo";

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
  /** SLT-99 (R5–R10, R16–R19): los planes disponibles, el corte y lo que la confirmación necesita. */
  readonly planes: PlanesDeMiPlan;
}

/**
 * SLT-58 (design §6.4; R1–R7) — lo que la empresa ve de su plan. SLT-99 sustituye SLT-58 R11 («solo información»):
 * el maestro ve su plan activo (R3), el pendiente con «Cancelar cambio» (R16, R17), el consumo y el costeo del
 * período debajo, sin cambios (R21, P8), y los planes disponibles para cambiar de plan (R5–R8, R18–R20).
 */
export function MiPlanModule({ plan, pendienteSinPlan = null, planes }: MiPlanModuleProps) {
  const pendiente = plan?.cobro.pendiente ?? null;
  return (
    <div className="flex flex-col gap-6">
      {pendiente !== null && <PendienteDelPlan pendiente={pendiente} />}
      {plan !== null && <PlanActivo plan={plan} />}
      <ConsumoDelPlan plan={plan} textoSinPlan={MI_PLAN_TEXTOS.sinPlan} pendienteSinPlan={pendienteSinPlan} />
      <CambioDePlan planes={planes} plan={plan} pendiente={pendiente} />
    </div>
  );
}
