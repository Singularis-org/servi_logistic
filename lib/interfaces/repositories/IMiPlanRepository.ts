import type { FuenteDelCosto, UsoDelPlan } from "@/lib/types/consumo-plan";
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

export interface PlanDeLaEmpresaLeido {
  vigente: VersionPlan;
  /** El ancla del ciclo de órdenes; con plan nunca es nula (CHECK de SL-24). */
  ancla: Date;
  /** SLT-58 (§11.4, R34): el inicio del ciclo corto, `null` fuera de él. Opcional como en `PlanConUsoLeido`. */
  cortoDesde?: Date | null;
  uso: UsoDelPlan;
  cambio: CambioProgramadoLeido | null;
  /** SLT-66 (R18, §3.2): el costo por orden que cobrará la próxima orden y de dónde sale. */
  costoVigente: { monto: string; fuente: FuenteDelCosto };
}

export interface IMiPlanRepository {
  /** `null` si la empresa no tiene plan (R6). */
  planDeLaEmpresa(): Promise<PlanDeLaEmpresaLeido | null>;
}
