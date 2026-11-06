import type { PlanConUsoLeido } from "@/lib/planes/consumo";
import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import type { VersionPlan } from "@/lib/types/planes";

// SLT-58 (design §3.1) — el plan de la empresa del contexto, tal como lo devuelve
// `plan_de_la_empresa`, ya validado y con los roles en su clave de la app. La empresa no es un
// parámetro: sale de la sesión (R9).

/** El cambio programado del plan: solo la fecha y la versión, nunca los avisos ni el actor (R9). */
export interface CambioProgramadoLeido {
  /** El instante en que rige (las 00:00 de la plataforma del día elegido). */
  vigenteDesde: Date;
  version: VersionPlan;
}

/**
 * SLT-86 (R5, R15, R26, R27): lo mismo que pinta el detalle de empresa del superadmin (`PlanConUsoLeido`):
 * la entrada, el precio del período en curso y el cambio pendiente de la empresa, sin el actor (R32).
 */
export type PlanDeLaEmpresaLeido = PlanConUsoLeido;

/**
 * SLT-86 (R26, decisión del 2026-11-05): una empresa sin plan con su primera asignación pendiente
 * (P4 = a). «Mi plan» muestra «Sin límites» y «{Plan} empieza a regir el {fecha}».
 */
export interface SinPlanConPendienteLeido {
  sinPlan: true;
  pendiente: PendienteDeEmpresa;
}

/** `null` = sin plan y sin pendiente (SLT-58 R6). */
export type LecturaDeMiPlan = PlanDeLaEmpresaLeido | SinPlanConPendienteLeido | null;

/** SLT-86 (R26): la lectura es de una empresa sin plan con su primera asignación pendiente. */
export function esSinPlanConPendiente(l: LecturaDeMiPlan): l is SinPlanConPendienteLeido {
  return l !== null && "sinPlan" in l;
}

export interface IMiPlanRepository {
  planDeLaEmpresa(): Promise<LecturaDeMiPlan>;
}
