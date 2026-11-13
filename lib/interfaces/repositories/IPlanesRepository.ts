import type { PlanRastroAccion } from "@prisma/client";

import type { CambioDelPlanLeido, PlanConUsoLeido } from "@/lib/planes/consumo";
import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import type { MotivoNoAplicada, TipoCorreoCambioPlan, TopePasado } from "@/lib/planes/mensajes";
import type { DiasDeRecordatorio } from "@/lib/planes/recepcion";
import type { CambiosDelPlan } from "@/lib/planes/rastro";
import type {
  AccionDeAsignacion,
  CrearPlanInput,
  PlanDTO,
  PrecioPlan,
  TipoCobro,
  TopeExcedido,
  TopesPlan,
  VersionPlan,
} from "@/lib/types/planes";

// SL-24 (design §5, §16.5) — el catálogo de planes y su asignación, vistos y escritos por el
// superadmin, que no tiene empresa: la empresa SÍ es un argumento. Las escrituras vuelven a comprobar
// bajo cerrojo lo que el servicio ya comprobó (§4.4): entre las dos lecturas otra petición pudo
// archivar el plan o asignar otro.

export interface EmpresaDePlanes {
  id: string;
  nombre: string;
  planId: string | null;
}

/**
 * SLT-118 (design §3.2; R37, P12): la edición pasa la periodicidad de órdenes a `mensual` y `empresas` empresas
 * tienen el plan, o lo tienen como cambio pendiente, con tipo de cobro quincenal. Nada se escribió.
 */
export type PeriodicidadIncompatibleAlEditar = { estado: "periodicidad_incompatible"; empresas: number };

/**
 * SLT-128 (design §3.4; R14–R16): el pendiente del plan ya llegó a alguna empresa (o el plan está partido por
 * uno anterior) y la operación dejaría empresas del mismo plan en versiones que nadie programó. Nada se
 * escribió.
 */
export type CambioAMedias = { estado: "cambio_a_medias" };

export type ResultadoEdicion =
  | { estado: "ok"; cambio: boolean; avisos: TopeExcedido[] }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | PeriodicidadIncompatibleAlEditar
  /** SLT-128 (R16, P7): edición «De inmediato» con el plan partido. */
  | CambioAMedias;

export type ResultadoArchivar =
  | { estado: "ok"; cambio: boolean }
  | { estado: "not_found" }
  /** SLT-128 (R15): el pendiente aún no llegó a todas sus empresas. */
  | CambioAMedias;

/**
 * SLT-99 (design §3) — la empresa del maestro, para «Mi plan». `hayPendiente` es de quien sea (P3); el actor
 * del pendiente no sale de la base (SLT-86 R32).
 */
export interface EmpresaParaElMaestro {
  planId: string | null;
  planEsCustom: boolean;
  tipoCobro: TipoCobro;
  hayPendiente: boolean;
}

/** SLT-99 (R11–R15, R18): `vigenteDesde` es el corte (`AAAA-MM-DD`); `null` = pidió su plan activo (R15). */
export type ResultadoCambioDelMaestro =
  | { estado: "ok"; vigenteDesde: string | null }
  | { estado: "sin_plan" }
  | { estado: "no_disponible" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[] };

/** SLT-99 (R16, R18): `sin_plan` = la empresa no tiene plan y el pendiente es su primera asignación. */
export type ResultadoCancelarDelMaestro = { estado: "ok" } | { estado: "sin_plan" } | { estado: "sin_cambio_programado" };

/**
 * SLT-86 (R15, R25; review m4): un precio que puede regir a un plan desde `desde` (`null` = desde siempre).
 * `programado` = el precio de su cambio programado, que aún no está en el historial.
 */
export interface PrecioDesdeLeido {
  planId: string;
  desde: Date | null;
  precio: PrecioPlan;
  programado: boolean;
}

/**
 * SLT-86 (design §5.1; R2, R16–R18) — la fecha elegida para un cambio de empresa y desde cuándo rige.
 *   · `inicio`: la primera asignación (R2; rango de SLT-58 R30). Con fecha de hoy o pasada se aplica en el
 *     acto y los topes ya pasados se avisan (SLT-58 R36, R42); con fecha futura queda pendiente (P4 = a).
 *     `elegida: false` es la asignación sin fecha de SL-24: rige desde hoy y un tope ya pasado la rechaza
 *     (SLT-58 P14).
 *   · `cambio`: un cambio a una empresa que ya tiene plan (R16). Con fecha de hoy se aplica en el acto y un
 *     tope ya pasado la rechaza (R18); con fecha futura queda pendiente y se avisa.
 */
export interface EfectoElegido {
  clase: "inicio" | "cambio";
  /** `AAAA-MM-DD` de la plataforma: va al historial delante del tipo (R30). */
  fecha: string;
  /** Las 00:00 de la plataforma de `fecha`: la entrada nueva (R2, R17). */
  desde: Date;
  elegida: boolean;
}

export type ResultadoAsignar =
  /**
   * `avisos`: los topes que la empresa ya pasa y que no rechazaron (primera asignación con fecha, o un
   * cambio con fecha futura; R18). `pendiente`: se guardó como cambio pendiente y aún no rige (R17, R20).
   * `vigenteDesde`: SLT-118 (R30–R32): la fecha real del pendiente (`AAAA-MM-DD`), que puede ser posterior
   * a la elegida; solo viene con `pendiente: true`.
   */
  | { estado: "ok"; cambio: boolean; avisos: TopeExcedido[]; pendiente: boolean; vigenteDesde?: string }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | { estado: "custom_de_otra_empresa" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[] }
  /** R31 (carrera) y R16: la clase de fecha no casa con la empresa bajo el cerrojo. Nada se escribió. */
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  /** SLT-118 (R37, P12): tipo quincenal con un plan de órdenes mensuales, bajo el cerrojo. Nada se escribió. */
  | { estado: "periodicidad_incompatible" };

/**
 * Ajuste planes-custom (D2, D4, D6) — la asignación que acompaña a un custom al crearlo: su fecha (de
 * inicio o de efecto, como en `asignar`) y el tipo de cobro.
 */
export interface AsignacionAlCrear {
  efecto: EfectoElegido;
  tipoCobro: TipoCobro;
}

/**
 * Ajuste planes-custom (D2): crear y asignar un custom en una transacción. Si la asignación se rechaza,
 * vuelve su rechazo y NO queda nada escrito (ni el plan ni su rastro). `avisos` y `pendiente`, los de
 * `asignar`.
 */
export type ResultadoCrearYAsignar =
  | { estado: "ok"; planId: string; avisos: TopeExcedido[]; pendiente: boolean; vigenteDesde?: string }
  | Exclude<ResultadoAsignar, { estado: "ok" }>;

/**
 * SLT-58 (R37): lo que la asignación avisaría, sin escribir nada. SLT-86 (R8): solo usuarios y API keys,
 * que no dependen de la fecha; sin el siguiente ciclo, que solo servía al aviso de órdenes.
 */
export interface VistaPreviaLeida {
  avisos: TopeExcedido[];
}

export type ResultadoCancelarCambio =
  | { estado: "ok" }
  | { estado: "not_found" }
  | { estado: "sin_cambio_programado" };

/**
 * SLT-128 (R14; P1, P8): «Cancelar cambio» del PLAN, que además se niega si alguna empresa ya recibió el
 * pendiente o el plan está partido. Aparte del de empresa (`cancelarCambioEmpresa`), que no cambia.
 */
export type ResultadoCancelarCambioDelPlan = ResultadoCancelarCambio | CambioAMedias;

/**
 * Programar o reemplazar el cambio pendiente (§16.2). `cambio: false` = la versión es la vigente y no
 * había pendiente: no se escribió nada. `cambioId` es la programación nueva (null sin cambio).
 */
export type ResultadoProgramar =
  | { estado: "ok"; cambio: boolean; avisos: TopeExcedido[]; cambioId: string | null }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | PeriodicidadIncompatibleAlEditar;

/**
 * Aplicar un cambio programado (§16.3). `sin_pendiente`: reemplazado, cancelado o ya aplicado;
 * `aun_no_rige`: el reloj no llegó a `vigente_desde`. Los dos terminan sin escribir nada.
 * SLT-128 (design §3.2; R10): `espera` = el pendiente del plan rige pero alguna empresa aún no lo recibió; el
 * plan no se promueve hasta que lo reciba la última. Tampoco escribe nada.
 */
export type ResultadoAplicar =
  | { estado: "aplicado" }
  | { estado: "sin_pendiente" }
  | { estado: "aun_no_rige" }
  | { estado: "espera" };

/**
 * SLT-128 (design §14.3; R8, R28): lo que devuelve `recibirCambio`. `no_aplicada` = una regla del plan impide
 * aplicarle la versión a ESA empresa: la recepción queda marcada con su motivo, la empresa conserva su versión y
 * el trabajo termina sin error (no se reintenta).
 */
export type ResultadoRecibir = ResultadoAplicar | { estado: "no_aplicada"; motivo: MotivoNoAplicada };

/** Lo que identifica una programación concreta: va en el payload de `plan_aplicar_cambio`. */
export interface CambioPendiente {
  planId: string;
  cambioId: string;
}

/**
 * SLT-128 (design §3.3, §4; R5): la recepción de ESA programación por UNA empresa. La empresa va en
 * `jobs.organizacion_id` del `plan_aplicar_cambio` con empresa; un pendiente reemplazado o cancelado ya no la
 * tiene.
 */
export interface RecepcionPendiente extends CambioPendiente {
  organizacionId: string;
}

/**
 * SLT-86 (R20): lo que identifica un cambio de empresa pendiente concreto. La empresa va en
 * `jobs.organizacion_id` de `plan_aplicar_cambio_empresa` y `cambioId` en su payload: un trabajo de un
 * pendiente reemplazado o cancelado no lo encuentra.
 */
export interface CambioDeEmpresaPendiente {
  organizacionId: string;
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
  /** SLT-128 (R22): también `recordatorio_3`, el de 3 días antes de la recepción. */
  tipo: TipoCorreoCambioPlan;
  cambios: CambiosDelPlan;
  /** SLT-128 (R20): la recepción de ESA empresa, no la F del plan. */
  vigenteDesde: string | null;
  /** §16.2: la fecha del pendiente al que reemplaza este cambio, o `null`. SLT-128: la recepción anterior de esa empresa. */
  reemplazaA: string | null;
  topesPasados: TopePasado[];
}

/**
 * SLT-128 (design §14.4; R28): el payload de `plan_aviso_correo` del tipo `no_aplicada`. Nace SIN empresa
 * (`organizacion_id` NULL): va a cada dirección de `PLAN_CHANGE_ALERT_EMAILS`, que lee el manejador al enviar.
 * Es la variante `no_aplicada` del aviso de cambio de plan; la de los maestros es `AvisoCorreoPlan`. Fechas en ISO.
 */
export interface AvisoNoAplicadaPlan {
  tipo: "no_aplicada";
  planId: string;
  cambioId: string;
  empresaId: string;
  /** El nombre de la empresa al marcar. */
  empresa: string;
  /** El nombre del plan que rige al marcar. */
  plan: string;
  /** La recepción que no se aplicó. */
  recibeAt: string;
  motivo: MotivoNoAplicada;
}

/** Lo que el envío de un aviso lee al correr: la empresa y sus maestros activos (P7). */
export interface DestinatariosDelAviso {
  empresaNombre: string;
  maestros: { email: string; nombre: string }[];
}

/** El recordatorio repartido (§16.4), o nada porque la programación ya no está pendiente (R39). */
export type ResultadoRecordatorio = { estado: "repartido"; empresas: number } | { estado: "sin_pendiente" };

/* -------------------------------------------------------------------------- */
/* SLT-58 (design §3.2) — las lecturas del superadmin                          */
/* -------------------------------------------------------------------------- */

/** R13: una fila del catálogo, archivados incluidos. */
export interface PlanDelCatalogoLeido {
  plan: PlanDTO;
  empresaNombre: string | null;
  empresas: number;
  /** El instante en que rige el pendiente, o `null`. */
  vigenteDesdePendiente: Date | null;
}

/** R16: una fila de `plan_rastro`, tal cual (los `cambios` son los que escribió `escribirRastro`). */
export interface FilaRastroLeida {
  id: string;
  accion: PlanRastroAccion;
  cambios: CambiosDelPlan;
  actorNombre: string;
  creadoAt: Date;
}

/**
 * SLT-128 (design §3.6; R11): el pendiente del detalle con cuántas de sus recepciones ya se aplicaron
 * (`recibidas`) de cuántas tiene (`total`). Un plan sin empresas tiene `0` de `0`.
 */
export type PendienteDelDetalleLeido = CambioDelPlanLeido & { recibidas: number; total: number };

/**
 * SLT-128 (design §14.3; R28): una empresa del plan que no recibió el cambio y sigue con su versión anterior: una
 * recepción no aplicada del pendiente o, ya promovido el plan, su `plan_version_empresa` marcada. `desde` es el
 * instante en que quedó no aplicada.
 */
export interface NoAplicadaLeida {
  empresaId: string;
  empresa: string;
  motivo: MotivoNoAplicada;
  desde: Date;
}

/** R16: el plan, su pendiente (con la versión ya validada), sus empresas y su rastro. */
export interface DetallePlanLeido {
  plan: PlanDTO;
  empresaNombre: string | null;
  pendiente: PendienteDelDetalleLeido | null;
  /** SLT-128 (R28): las empresas que no recibieron el cambio, por nombre. Vacío si no hay ninguna. */
  noAplicadas: NoAplicadaLeida[];
  empresas: { id: string; nombre: string }[];
  /** Del más reciente al más antiguo, como mucho 100. */
  rastro: FilaRastroLeida[];
}

/** R21: una fila del historial de la empresa con una de `ACCIONES_DE_ASIGNACION` (D16). */
export interface AsignacionLeida {
  creadoAt: Date;
  /** `null` si el actor no resolvió al congelarlo. */
  actorNombre: string | null;
  /** La `entidad_etiqueta` congelada. */
  planNombre: string;
  /**
   * Ajuste planes-custom (D16): la acción de la fila. `plan_tipo_cobro_cambiado` es el cambio de solo el
   * tipo (D10); `plan_asignado`, una asignación.
   */
  accion: AccionDeAsignacion;
  /** Ajuste planes-custom (D14): `valor_anterior` y `valor_nuevo` tal cual (los lee `tipoCobroDelHistorial`). */
  valorAnterior: string | null;
  valorNuevo: string | null;
}

/**
 * Ajuste planes-custom (D10): cambiar solo el tipo de cobro. `cambio: false` = ya tenía ese tipo, sin
 * pendiente, y no se escribió nada (SLT-86 R19). `pendiente`: se guardó para su fecha de efecto (R17).
 * `sin_plan`: la empresa no tiene plan bajo el cerrojo. `vigenteDesde`: SLT-118 (R32), la fecha real del
 * pendiente (`AAAA-MM-DD`); solo viene con `pendiente: true`.
 */
export type ResultadoCambiarTipoCobro =
  | { estado: "ok"; cambio: boolean; pendiente: boolean; vigenteDesde?: string }
  | { estado: "not_found" }
  | { estado: "sin_plan" }
  /** SLT-118 (R37, P12): tipo quincenal con el plan de órdenes mensuales de la empresa. Nada se escribió. */
  | { estado: "periodicidad_incompatible" };

/** R19, R21: el plan de una empresa con su uso, o `plan: null` si no tiene. */
export interface PlanDeEmpresaLeida {
  organizacionId: string;
  plan: (PlanConUsoLeido & { dto: PlanDTO }) | null;
  /**
   * SLT-86 (R26, decisión del 2026-11-05): sin plan, la primera asignación pendiente (P4 = a), o `null`.
   * Con plan, el pendiente va en `plan.pendiente`.
   */
  pendienteSinPlan: PendienteDeEmpresa | null;
  /** Del más reciente al más antiguo, como mucho 50. */
  asignaciones: AsignacionLeida[];
}

export interface IPlanesRepository {
  /** SLT-58 R13: todos los planes, también los archivados. */
  catalogo(): Promise<PlanDelCatalogoLeido[]>;
  /** SLT-58 R16: `null` si el plan no existe. */
  detalle(planId: string): Promise<DetallePlanLeido | null>;
  /** SLT-58 R19, R21: `null` si la empresa no existe. */
  planDeEmpresa(organizacionId: string): Promise<PlanDeEmpresaLeida | null>;
  empresa(organizacionId: string): Promise<EmpresaDePlanes | null>;
  plan(planId: string): Promise<PlanDTO | null>;
  /** Crea el plan, sus topes y sus módulos, con su fila `creado` de `plan_rastro` (R1, R29). */
  crear(input: CrearPlanInput, actorUsuarioId: string): Promise<string>;
  /**
   * Edición inmediata (§5.3): aplica la versión a todas las empresas del plan y devuelve las que ya
   * pasan algún tope nuevo, sin rechazar (R15–R17). Sin cambios reales no escribe nada. SLT-86 (§5.4;
   * R15, R22): si cambia el costo base o un descuento, añade la fila del historial de precio desde
   * `precioDesde` (las 00:00 de hoy) y no toca a ninguna empresa.
   */
  editar(planId: string, version: VersionPlan, actorUsuarioId: string, precioDesde: Date): Promise<ResultadoEdicion>;
  /**
   * Archiva y cancela el cambio pendiente en la misma transacción (R6, R40). SLT-86 (R21): también los
   * cambios de empresa pendientes hacia ese plan, primeras asignaciones incluidas, cada uno con su fila de
   * cancelación en el historial de la empresa (decisión del 2026-11-05). Repetido no escribe.
   */
  archivar(planId: string, actorUsuarioId: string): Promise<ResultadoArchivar>;
  /**
   * Asigna o cambia el plan de una empresa (§5.2; R9–R13). SLT-86 (§5.1; R2, R16–R19): con la fecha de
   * hoy o pasada se aplica en el acto (entrada = 00:00 de la fecha, módulos e historial); con fecha
   * futura se guarda como el pendiente de la empresa, que reemplaza al que hubiera, y se encola el trabajo
   * que lo aplica. Mismo plan y mismo tipo que rigen: cancela el pendiente, con su fila de cancelación
   * (decisión del 2026-11-05), o no hace nada si no lo hay.
   * `ahora` decide si la fecha ya rige; la clase de fecha se revalida bajo el cerrojo (R31).
   */
  asignar(
    organizacionId: string,
    planId: string,
    actorUsuarioId: string,
    efecto: EfectoElegido,
    tipoCobro: TipoCobro,
    ahora: Date,
  ): Promise<ResultadoAsignar>;
  /**
   * Ajuste planes-custom (D2): crea el custom (como `crear`) y se lo asigna a su empresa (como
   * `asignar`, con el mismo cerrojo, las mismas reglas y el mismo historial) en UNA transacción.
   */
  crearYAsignar(
    input: CrearPlanInput & { organizacionId: string },
    actorUsuarioId: string,
    asignacion: AsignacionAlCrear,
    ahora: Date,
  ): Promise<ResultadoCrearYAsignar>;
  /**
   * SLT-58 (§11.4; R37): los topes de usuarios y API keys del plan que la empresa ya pasa, con el mismo
   * uso que `asignar`. Solo lee. `null` si la empresa o el plan no existen.
   */
  vistaPreviaAsignacion(organizacionId: string, planId: string): Promise<VistaPreviaLeida | null>;
  /**
   * Ajuste planes-custom (D13): como `vistaPreviaAsignacion`, pero con los topes que se están escribiendo
   * en el form del custom (el plan aún no existe). Solo lee. `null` si la empresa no existe.
   */
  vistaPreviaConTopes(organizacionId: string, topes: TopesPlan): Promise<VistaPreviaLeida | null>;
  /**
   * Ajuste planes-custom (D10, D16) y SLT-86 (R16–R19): el tipo de cobro del plan que la empresa YA tiene,
   * con fecha de efecto, por el mismo camino que `asignar` con ese plan. No toca `plan_id` ni los módulos.
   */
  cambiarTipoCobro(
    organizacionId: string,
    tipoCobro: TipoCobro,
    efecto: EfectoElegido,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoCambiarTipoCobro>;
  /**
   * SLT-86 (R19, R26): «Cancelar cambio». Sin pendiente, `sin_cambio_programado`. Deja en el historial de la
   * empresa la fila `plan_cambio_empresa_cancelado` con `actorUsuarioId` (decisión del 2026-11-05).
   */
  cancelarCambioEmpresa(organizacionId: string, actorUsuarioId: string): Promise<ResultadoCancelarCambio>;
  /**
   * SLT-86 (§5.2; R17, R20): aplica ESE pendiente de la empresa si sigue ahí y ya rige en `ahora`: plan,
   * tipo, entrada, módulos y la fila de historial con el actor que lo programó. Un tope ya pasado no lo
   * impide (SLT-58 R36). Idempotente: reemplazado, cancelado o ya aplicado no escribe nada.
   */
  aplicarCambioDeEmpresa(cambio: CambioDeEmpresaPendiente, ahora: Date): Promise<ResultadoAplicar>;
  /** SLT-86 (R20): los pendientes de empresa con fecha `<= ahora` (barrido de `plan_cambios_vencidos`). */
  cambiosDeEmpresaVencidos(ahora: Date): Promise<CambioDeEmpresaPendiente[]>;
  /**
   * Borra el cambio pendiente y deja su fila `cambio_cancelado` (R39, R43). SLT-128 (R14): si el plan está
   * partido (alguna empresa ya lo recibió, o recibió uno anterior que este reemplazó), `cambio_a_medias`.
   */
  cancelarCambio(planId: string, actorUsuarioId: string): Promise<ResultadoCancelarCambioDelPlan>;
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
   * reemplazada, cancelada o ya aplicada, no hace nada (R39). SLT-118 (R37): si la versión pasa la periodicidad
   * a `mensual` y alguna empresa la tiene con tipo quincenal, LANZA sin escribir: el trabajo falla, como con una
   * versión que no valida.
   */
  aplicarCambioProgramado(cambio: CambioPendiente, ahora: Date): Promise<ResultadoAplicar>;
  /** Las programaciones con `vigente_desde <= ahora` que siguen pendientes (barrido de §16.3). */
  cambiosVencidos(ahora: Date): Promise<CambioPendiente[]>;
  /** Públicos y custom de esa empresa, no archivados (R7). */
  asignables(organizacionId: string): Promise<PlanDTO[]>;
  /**
   * SLT-86 (R15, R25; review m4): de esos planes, los precios que pueden regir desde `desde` en adelante: la
   * fila del historial vigente en `desde`, las posteriores y el precio de su cambio programado. De
   * plataforma: sin empresa.
   */
  preciosQueRigenDesde(planIds: readonly string[], desde: Date): Promise<PrecioDesdeLeido[]>;
  /** Solo públicos no archivados (R7; la lectura de SL-25). */
  publicos(): Promise<PlanDTO[]>;
}

/**
 * SLT-128 (design §3.3, §3.6, §4) — lo que usan los trabajos de la cola para el cambio programado por empresa.
 * Aparte de `IPlanesRepository`, como `IPlanesDelMaestroRepository`, para que los dobles de `PlanesService`,
 * que no los usan, no cambien; `PlanesRepository` implementa las tres.
 */
export interface IPlanesRecepcionesRepository {
  /**
   * SLT-128 (design §3.3; R2, R4–R8, R10): la empresa recibe ESA programación si su recepción sigue sin recibir
   * y ya rige en `ahora`: módulos contra la versión que tenía, precio, su versión propia y `recibido_at`. Si era
   * la última y F ya pasó, promueve el plan en la misma transacción. Idempotente: sin la recepción
   * (reemplazada, cancelada, ya recibida, no aplicada o la empresa salió) devuelve `sin_pendiente`. R8, R28: tipo
   * quincenal con órdenes mensuales NO lanza: marca la recepción `no_aplicada` con su motivo, encola el aviso a
   * la lista de alertas y, si ya no queda ninguna pendiente y F pasó, promueve el plan; devuelve `no_aplicada`.
   */
  recibirCambio(cambio: CambioPendiente, organizacionId: string, ahora: Date): Promise<ResultadoRecibir>;
  /**
   * SLT-128 (design §3.6; R5, R28): las recepciones pendientes (ni recibidas ni no aplicadas) con
   * `recibe_at <= ahora` (barrido de §4).
   */
  recepcionesVencidas(ahora: Date): Promise<RecepcionPendiente[]>;
  /**
   * SLT-128 (design §3.6, §4; R22): `plan_recordatorio_cambio` con empresa. Si esa empresa sigue en el plan y
   * su recepción de ESA programación sigue sin recibir con ESE `recibeAt`, encola su `plan_aviso_correo` con
   * los topes que ya pasa ahora. Una vez por empresa y fecha (`dedupe_key` con `recibeAt`).
   */
  repartirRecordatorioDeEmpresa(
    cambio: CambioPendiente,
    organizacionId: string,
    dias: DiasDeRecordatorio,
    recibeAt: Date,
  ): Promise<ResultadoRecordatorio>;
}

/**
 * SLT-99 (design §3) — lo que usa `MiPlanCambioService`: tres lecturas del catálogo y los tres métodos del
 * maestro. Aparte de `IPlanesRepository` para que los dobles de `PlanesService`, que no los usan, no cambien
 * (design §9, alternativa 5); `PlanesRepository` implementa las dos.
 */
export interface IPlanesDelMaestroRepository extends Pick<IPlanesRepository, "publicos" | "plan" | "preciosQueRigenDesde"> {
  /** SLT-99 (design §3): la empresa del maestro, sin cerrojo. `null` si no existe. */
  empresaParaElMaestro(organizacionId: string): Promise<EmpresaParaElMaestro | null>;
  /**
   * SLT-99 (design §3; R10–R15, R18): el maestro pide `planId` para su empresa. Bajo el cerrojo de la empresa:
   * el corte con el tipo vigente, la regla de plan disponible, el mismo plan (cancela el pendiente), los topes
   * por rol y API keys (rechaza sin escribir) y, si pasa, el pendiente de SLT-86 con el maestro como actor.
   */
  cambiarPlanPorLaEmpresa(
    organizacionId: string,
    planId: string,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoCambioDelMaestro>;
  /** SLT-99 (R16): cancela el pendiente de la empresa, sea de quien sea (P3), con el maestro como actor. */
  cancelarCambioPorLaEmpresa(organizacionId: string, actorUsuarioId: string): Promise<ResultadoCancelarDelMaestro>;
}
