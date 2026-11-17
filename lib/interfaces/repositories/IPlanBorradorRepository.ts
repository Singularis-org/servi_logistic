import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { GeneralDeCrear, IdPasoBorrador, ValoresDelPaso } from "@/lib/types/plan-borrador";

// SLT-129 (design §1.1, §5.4) — los borradores de planes del superadmin, de plataforma. Los implementa
// `PlanesRepository` (alternativa E): consumir el borrador va dentro de sus transacciones de crear y editar.

/** Una fila de `plan_borrador`. `pasos` sin validar: quien lee los vuelve a pasar por su esquema. */
export interface BorradorLeido {
  id: string;
  planId: string | null;
  pasos: Record<string, unknown>;
  iniciadoPorNombre: string;
  createdAt: Date;
  updatedAt: Date;
}

/** R10: una fila de la lista, con el nombre del plan del cambio (`null` en una creación). */
export interface BorradorListado extends BorradorLeido {
  nombreDelPlan: string | null;
}

/** Tras guardar un paso: las claves de `pasos` (sin orden) y el instante del guardado. */
export interface BorradorGuardado {
  borradorId: string;
  pasos: string[];
  actualizadoAt: Date;
}

export type ResultadoGuardarCambio =
  | ({ estado: "ok" } & BorradorGuardado)
  | { estado: "not_found" }
  | { estado: "archivado" };

export interface IPlanBorradorRepository extends Pick<IPlanesRepository, "plan"> {
  /** R2: un borrador de creación con General, el iniciador congelado y la fecha. */
  crearBorrador(general: GeneralDeCrear, actorUsuarioId: string): Promise<BorradorGuardado>;
  /** R4: reemplaza solo ese paso. `null` si no hay un borrador de creación con ese id (R8). */
  guardarPasoDeCreacion(borradorId: string, paso: IdPasoBorrador, valores: ValoresDelPaso): Promise<BorradorGuardado | null>;
  /** R4, R5, R8: en el único borrador de cambio del plan, que crea si no existe; el plan bajo FOR SHARE. */
  guardarPasoDeCambio(
    planId: string,
    paso: IdPasoBorrador,
    valores: ValoresDelPaso,
    actorUsuarioId: string,
  ): Promise<ResultadoGuardarCambio>;
  /** R14: `false` si no existía. */
  descartar(borradorId: string): Promise<boolean>;
  borrador(borradorId: string): Promise<BorradorLeido | null>;
  /** R9: el borrador de cambio del plan, o `null`. */
  borradorDelPlan(planId: string): Promise<BorradorLeido | null>;
  /** R10: todos, de creación y de cambio, de todos los superadmins; el último guardado primero. */
  borradores(): Promise<BorradorListado[]>;
}
