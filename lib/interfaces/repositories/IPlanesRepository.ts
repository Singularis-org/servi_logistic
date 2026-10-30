import type { TipoCorreoCambioPlan, TopePasado } from "@/lib/planes/mensajes";
import type { CambiosDelPlan } from "@/lib/planes/rastro";
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

/**
 * Programar o reemplazar el cambio pendiente (§16.2). `cambio: false` = la versión es la vigente y no
 * había pendiente: no se escribió nada. `cambioId` es la programación nueva (null sin cambio).
 */
export type ResultadoProgramar =
  | { estado: "ok"; cambio: boolean; avisos: TopeExcedido[]; cambioId: string | null }
  | { estado: "not_found" }
  | { estado: "archivado" };

/**
 * Aplicar un cambio programado (§16.3). `sin_pendiente`: reemplazado, cancelado o ya aplicado;
 * `aun_no_rige`: el reloj no llegó a `vigente_desde`. Los dos terminan sin escribir nada.
 */
export type ResultadoAplicar = { estado: "aplicado" } | { estado: "sin_pendiente" } | { estado: "aun_no_rige" };

/** Lo que identifica una programación concreta: va en el payload de `plan_aplicar_cambio`. */
export interface CambioPendiente {
  planId: string;
  cambioId: string;
}

/**
 * T12 (§16.4) — el payload de `plan_aviso_correo`: uno por empresa destino (su `organizacion_id` es
 * el del trabajo). Sin datos personales: los maestros se leen al enviar. Las fechas, en ISO.
 */
export interface AvisoCorreoPlan {
  /** La programación (programado, recordatorio, cancelado); `null` en la edición inmediata. */
  cambioId: string | null;
  planId: string;
  /** El nombre que rige al encolar: el que conoce el maestro (el nuevo va en `cambios`). */
  planNombre: string;
  tipo: TipoCorreoCambioPlan;
  cambios: CambiosDelPlan;
  vigenteDesde: string | null;
  /** §16.2: la fecha del pendiente al que reemplaza este cambio, o `null`. */
  reemplazaA: string | null;
  topesPasados: TopePasado[];
}

/** Lo que el envío de un aviso lee al correr: la empresa y sus maestros activos (P7). */
export interface DestinatariosDelAviso {
  empresaNombre: string;
  maestros: { email: string; nombre: string }[];
}

/** El recordatorio repartido (§16.4), o nada porque la programación ya no está pendiente (R39). */
export type ResultadoRecordatorio = { estado: "repartido"; empresas: number } | { estado: "sin_pendiente" };

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
  /**
   * Programa la versión para `vigenteDesde` (R37), reemplazando el pendiente si lo hay (R39), con sus
   * filas de `plan_rastro` (R43) y el trabajo que la aplicará, todo en una transacción (§16.2). No toca
   * la versión vigente. Devuelve los avisos de R16 contra el uso de hoy, sin rechazar. En la misma
   * transacción encola los recordatorios que caen después de `ahora` y los correos de guardado (R41,
   * R42; T12).
   */
  programarCambio(
    planId: string,
    version: VersionPlan,
    vigenteDesde: Date,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoProgramar>;
  /**
   * `plan_recordatorio_cambio` (§16.4): si ESA programación sigue pendiente, encola un
   * `plan_aviso_correo` por empresa que tiene el plan AHORA, con sus topes pasados contra la versión
   * pendiente. Una vez por empresa por `dedupe_key` (R42).
   */
  repartirRecordatorio(cambio: CambioPendiente, dias: 7 | 1): Promise<ResultadoRecordatorio>;
  /**
   * El envío de `plan_aviso_correo`: la empresa y sus maestros activos. Con `cambioPendiente`, `null`
   * si esa programación ya no está pendiente (recordatorio de un cambio cancelado o reemplazado).
   */
  destinatariosDelAviso(organizacionId: string, cambioPendiente: string | null): Promise<DestinatariosDelAviso | null>;
  /**
   * Aplica ESA programación si sigue pendiente y ya rige en `ahora` (R38, §16.3). Idempotente: si fue
   * reemplazada, cancelada o ya aplicada, no hace nada (R39).
   */
  aplicarCambioProgramado(cambio: CambioPendiente, ahora: Date): Promise<ResultadoAplicar>;
  /** Las programaciones con `vigente_desde <= ahora` que siguen pendientes (barrido de §16.3). */
  cambiosVencidos(ahora: Date): Promise<CambioPendiente[]>;
  /** Públicos y custom de esa empresa, no archivados (R7). */
  asignables(organizacionId: string): Promise<PlanDTO[]>;
  /** Solo públicos no archivados (R7; la lectura de SL-25). */
  publicos(): Promise<PlanDTO[]>;
}
