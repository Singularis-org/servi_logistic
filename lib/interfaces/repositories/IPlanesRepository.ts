import type { CrearPlanInput, PlanDTO, TopeExcedido, VersionPlan } from "@/lib/types/planes";

// SL-24 (design §5, §16.5) — el catálogo de planes y su asignación, vistos y escritos por el
// superadmin, que no tiene empresa: la empresa SÍ es un argumento. Las escrituras vuelven a comprobar
// bajo cerrojo lo que el servicio ya comprobó (§4.4): entre las dos lecturas otra petición pudo
// archivar el plan o asignar otro.

export interface EmpresaDePlanes {
  id: string;
  nombre: string;
  planId: string | null;
}

export type ResultadoEdicion =
  | { estado: "ok"; cambio: boolean; avisos: TopeExcedido[] }
  | { estado: "not_found" }
  | { estado: "archivado" };

export type ResultadoArchivar = { estado: "ok"; cambio: boolean } | { estado: "not_found" };

export type ResultadoAsignar =
  | { estado: "ok"; cambio: boolean }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | { estado: "custom_de_otra_empresa" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[] };

export type ResultadoCancelarCambio =
  | { estado: "ok" }
  | { estado: "not_found" }
  | { estado: "sin_cambio_programado" };

export interface IPlanesRepository {
  empresa(organizacionId: string): Promise<EmpresaDePlanes | null>;
  plan(planId: string): Promise<PlanDTO | null>;
  /** Crea el plan, sus topes y sus módulos, con su fila `creado` de `plan_rastro` (R1, R29). */
  crear(input: CrearPlanInput, actorUsuarioId: string): Promise<string>;
  /**
   * Edición inmediata (§5.3): aplica la versión a todas las empresas del plan y devuelve las que ya
   * pasan algún tope nuevo, sin rechazar (R15–R17). Sin cambios reales no escribe nada.
   */
  editar(planId: string, version: VersionPlan, actorUsuarioId: string): Promise<ResultadoEdicion>;
  /** Archiva y cancela el cambio pendiente en la misma transacción (R6, R40). Repetido no escribe. */
  archivar(planId: string, actorUsuarioId: string): Promise<ResultadoArchivar>;
  /** Asigna o cambia el plan de una empresa y sincroniza sus módulos (§5.2; R9–R13). */
  asignar(organizacionId: string, planId: string, actorUsuarioId: string): Promise<ResultadoAsignar>;
  /** Borra el cambio pendiente y deja su fila `cambio_cancelado` (R39, R43). */
  cancelarCambio(planId: string, actorUsuarioId: string): Promise<ResultadoCancelarCambio>;
  /** Públicos y custom de esa empresa, no archivados (R7). */
  asignables(organizacionId: string): Promise<PlanDTO[]>;
  /** Solo públicos no archivados (R7; la lectura de SL-25). */
  publicos(): Promise<PlanDTO[]>;
}
