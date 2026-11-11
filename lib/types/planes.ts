import type { ModuloApagable, PlanRastroAccion } from "@prisma/client";
import { z } from "zod";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import type { CambiosDelPlan } from "@/lib/planes/rastro";
import { montoCobroSchema } from "@/lib/types/cobro-plataforma";
import type { CambioPendienteVista, PendienteDeEmpresa, PlanConConsumo } from "@/lib/types/consumo-plan";
import type { HistorialAccionTipo } from "@/lib/types/historial-accion";

// SL-24 (design §5.1; R1–R3, R25, R37) — el borde de la gestión de planes por el superadmin. Todo
// llega sin tipar desde la action y se valida aquí antes de tocar la base. Los importes viajan como
// texto (`montoCobroSchema`, sin pasar por `Number`): la base los guarda en `DECIMAL(12,2)` y sus
// `CHECK` son la segunda red (design §16.1: «una versión inválida se rechaza igual en dos sitios»).

/**
 * Los roles que admiten tope (R25). `apiKey` y `superadmin` quedan fuera: las keys tienen el suyo. SLT-66
 * (R1): `maestro` tampoco; el `CHECK` de `plan_tope_rol` lo rechaza igual (20261031140000).
 */
export const ROLES_CON_TOPE = ["admin", "mensajero", "adminTienda", "adminSatelite"] as const;
export type RolConTope = (typeof ROLES_CON_TOPE)[number];

/**
 * Ajuste planes-custom (D6, 2026-10-31): cómo paga la empresa el plan que se le asigna. Se elige en
 * cada asignación y se guarda en `organizacion.plan_tipo_cobro`. SLT-86 (R1): cuatro períodos de
 * calendario; el `CHECK` de la columna admite los mismos cuatro.
 */
export const TIPOS_COBRO = ["quincenal", "mensual", "bimestral", "anual"] as const;
export type TipoCobro = (typeof TIPOS_COBRO)[number];
export const tipoCobroSchema = z.enum(TIPOS_COBRO);

/**
 * SLT-118 (design §1.2, §3.2; R35, P14): cada cuánto se facturan las órdenes de las empresas con el plan. La
 * columna `plan.periodicidad_ordenes` tiene el `CHECK` con estos dos y `DEFAULT 'quincenal'`.
 */
export const PERIODICIDADES_ORDENES = ["quincenal", "mensual"] as const;
export type PeriodicidadOrdenes = (typeof PERIODICIDADES_ORDENES)[number];
export const periodicidadOrdenesSchema = z.enum(PERIODICIDADES_ORDENES);

/**
 * SLT-118 (R37, P12): error del campo `tipoCobro` con un plan de órdenes mensuales. Vive aquí y no en
 * `lib/planes/mensajes.ts` porque ese módulo importa valores de este: el refine de `crearPlanSchema` lo usa y
 * el servicio lo reutiliza para el rechazo del repositorio.
 */
export const TIPO_QUINCENAL_CON_ORDENES_MENSUALES =
  "Un plan con facturación de órdenes mensual no admite el tipo de cobro quincenal: la cuota del 16 no tendría factura que la emita.";

/** SLT-86 (R10): el descuento de UN período, en porcentaje o en monto fijo; nunca los dos. */
export type DescuentoPeriodo = { tipo: "porcentaje"; porcentaje: string } | { tipo: "monto"; monto: string };

// Ajuste planes-custom (D1, 2026-10-31): sin la forma «negociable». SLT-86 (R10, R33): el anual fijo y
// el descuento anual pasan a `descuentos`, uno opcional por período; sin clave = sin descuento.
export type PrecioPlan =
  | { tipo: "sin_precio" }
  | { tipo: "monto"; mensual: string; descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>> };

// SLT-86 (R8): sin tope de órdenes por ciclo.
export type TopesPlan = {
  porRol: Partial<Record<RolConTope, number>>;
  apiKeys: number | null;
};

/** Un tope de `INTEGER`: ni negativo (los `CHECK` de §2.1) ni más de lo que cabe en la columna. */
const tope = z.int().min(0).max(2_147_483_647);

/**
 * Porcentaje de descuento de un período (SLT-86 R10; antes, sobre el anual): texto, hasta dos decimales, `> 0` y `≤ 100` (R3). Se
 * compara en centésimas enteras, así que no hay redondeo de coma flotante. SLT-83 (R2): el mismo rango
 * vale para el costo por orden porcentual, así que se exporta en vez de copiarlo.
 */
export const porcentajeSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((s) => {
    const [entero, decimales = ""] = s.split(".");
    const centesimas = Number.parseInt(entero, 10) * 100 + Number.parseInt(decimales.padEnd(2, "0"), 10);
    return centesimas > 0 && centesimas <= 10_000;
  });

// SLT-86 (R10): la clave de la otra forma se declara `never` en vez de dejarla a `.strict()`, para que el
// error de «las dos formas» caiga en `precio.descuentos.<periodo>.<campo>` y la pantalla lo ponga junto
// a su campo, no en el descuento entero.
const SOLO_UNA_FORMA = "Un descuento es porcentaje o monto fijo, no los dos.";
export const descuentoPeriodoSchema = z.discriminatedUnion("tipo", [
  z
    .object({
      tipo: z.literal("porcentaje"),
      porcentaje: porcentajeSchema,
      monto: z.never({ error: SOLO_UNA_FORMA }).optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("monto"),
      monto: montoCobroSchema,
      porcentaje: z.never({ error: SOLO_UNA_FORMA }).optional(),
    })
    .strict(),
]);

// Cada forma es `.strict()`: una clave de otra forma es una combinación prohibida (R3). SLT-86 (R11):
// por eso «sin precio» con `descuentos` da validation_error en `precio`. `descuentos` es obligatorio
// para que un formulario que no lo mande no borre los descuentos sin avisar.
export const precioPlanSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("sin_precio") }).strict(),
  z
    .object({
      tipo: z.literal("monto"),
      mensual: montoCobroSchema,
      descuentos: z.partialRecord(tipoCobroSchema, descuentoPeriodoSchema),
    })
    .strict(),
]);

/**
 * SLT-83 (design §4.1; R1, R2): el costo por orden porcentual. `minimo` es el piso del cargo; `null` =
 * sin piso. `.strict()`: un `monto` aquí sería mezclar los dos modos.
 */
export const costoPorOrdenPorcentualSchema = z
  .object({ porcentaje: porcentajeSchema, minimo: montoCobroSchema.nullable() })
  .strict();
export type CostoPorOrdenPorcentual = z.infer<typeof costoPorOrdenPorcentualSchema>;

/**
 * SLT-83 (R1): fijo y porcentual a la vez es validation_error, como lo rechaza el `CHECK`
 * `plan_costo_por_orden_un_modo`. El error va en el campo porcentual: es el que el formulario añade.
 */
const UN_SOLO_MODO = {
  path: ["costoPorOrdenPorcentual"],
  error: "El costo por orden es fijo o porcentual, no los dos.",
};
function unSoloModo(p: { costoPorOrden: string | null; costoPorOrdenPorcentual: CostoPorOrdenPorcentual | null }): boolean {
  return p.costoPorOrden === null || p.costoPorOrdenPorcentual === null;
}

// SLT-86 (R8): sin `ordenesPorCiclo`; por `.strict()`, traerlo es validation_error.
export const topesPlanSchema = z
  .object({
    // `partialRecord` con las claves cerradas: `apiKey` o `superadmin` como clave es validation_error (R25).
    porRol: z.partialRecord(z.enum(ROLES_CON_TOPE), tope),
    apiKeys: tope.nullable(),
  })
  .strict();

const modulosSchema = z
  .array(z.enum(ORDEN_MODULOS))
  .refine((m) => new Set(m).size === m.length, { error: "Un módulo no puede repetirse." });

const nombreSchema = z.string().trim().min(1).max(80);

/** `AAAA-MM-DD` de un día que existe. Rige a las 00:00 de la plataforma (§16.1, P8). */
const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const [a, m, d] = s.split("-").map((p) => Number.parseInt(p, 10));
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  });

/**
 * SLT-86 (R2, R16): `inicioCiclo` es de la primera asignación y `vigenteDesde` de un cambio a una empresa
 * con plan; las dos a la vez no tienen sentido. Cuál toca lo decide el servicio con la empresa en la mano.
 */
const NO_INICIO_Y_EFECTO = {
  path: ["vigenteDesde"],
  error: "La fecha de inicio es de la primera asignación y la fecha de efecto de un cambio: no las dos.",
};

export const crearPlanSchema = z
  .object({
    nombre: nombreSchema,
    visibilidad: z.enum(["publico", "custom"]),
    organizacionId: z.uuid().nullable(),
    topes: topesPlanSchema,
    modulos: modulosSchema,
    precio: precioPlanSchema,
    // SLT-66 (R7, R8): obligatorio y `null` para vacío, para que un formulario que no lo mande dé
    // validation_error en vez de borrarlo sin avisar.
    costoPorOrden: montoCobroSchema.nullable(),
    // SLT-83 (R1, R2): obligatorio y `null` para «no es porcentual», por la misma razón.
    costoPorOrdenPorcentual: costoPorOrdenPorcentualSchema.nullable(),
    // Ajuste planes-custom (D2, D4, D6): un custom se asigna a su empresa al crearlo. `tipoCobro` es
    // obligatorio en un custom y no va en un público; `inicioCiclo` solo en un custom, y solo si la
    // empresa no tiene plan (eso y el rango los mira el servicio, como en `asignarPlanSchema`).
    tipoCobro: tipoCobroSchema.optional(),
    inicioCiclo: fechaSchema.optional(),
    // SLT-86 (R16): la fecha de efecto de un custom para una empresa que ya tiene plan. Que la empresa
    // tenga plan, que falte y el rango los mira el servicio, que tiene el reloj y la empresa.
    vigenteDesde: fechaSchema.optional(),
    // SLT-118 (R35): ausente = `quincenal` (el DEFAULT de la columna). Opcional para no tocar las peticiones de
    // los tests de planes que no la conocen; el formulario la manda siempre.
    periodicidadOrdenes: periodicidadOrdenesSchema.optional(),
  })
  .strict()
  // R2: un custom nombra exactamente una empresa y un público ninguna. Que exista lo mira el servicio.
  .refine((p) => (p.visibilidad === "custom") === (p.organizacionId !== null), {
    path: ["organizacionId"],
    error: "Un plan custom nombra una empresa y uno público ninguna.",
  })
  .refine((p) => (p.organizacionId !== null) === (p.tipoCobro !== undefined), {
    path: ["tipoCobro"],
    error: "Elige el tipo de cobro de la empresa; un plan público no lo lleva.",
  })
  .refine((p) => p.organizacionId !== null || p.inicioCiclo === undefined, {
    path: ["inicioCiclo"],
    error: "Un plan público no se asigna al crearlo: no lleva inicio del período.",
  })
  .refine((p) => p.organizacionId !== null || p.vigenteDesde === undefined, {
    path: ["vigenteDesde"],
    error: "Un plan público no se asigna al crearlo: no lleva fecha de efecto.",
  })
  .refine((p) => p.inicioCiclo === undefined || p.vigenteDesde === undefined, NO_INICIO_Y_EFECTO)
  .refine(unSoloModo, UN_SOLO_MODO)
  // SLT-118 (R37, P12): el custom de una empresa con tipo quincenal no puede facturar sus órdenes por mes. El
  // repositorio lo repite bajo el cerrojo al asignar.
  .refine((p) => !(p.tipoCobro === "quincenal" && p.periodicidadOrdenes === "mensual"), {
    path: ["tipoCobro"],
    error: TIPO_QUINCENAL_CON_ORDENES_MENSUALES,
  });

// `.strict()`: traer `visibilidad` u `organizacionId` en una edición es validation_error (R2).
// SLT-83: el refine de «un solo modo» va en los esquemas finales y no aquí, porque zod no deja hacer
// `.omit()` sobre un objeto con refinamientos y `versionPlanSchema` sale de este.
const edicionDelPlan = z
  .object({
    planId: z.uuid(),
    nombre: nombreSchema,
    topes: topesPlanSchema,
    modulos: modulosSchema,
    precio: precioPlanSchema,
    costoPorOrden: montoCobroSchema.nullable(),
    costoPorOrdenPorcentual: costoPorOrdenPorcentualSchema.nullable(),
    // SLT-118 (R35): ausente = sin cambio. La hereda `versionPlanSchema`, así que una versión programada
    // guardada antes, sin ella, sigue validando.
    periodicidadOrdenes: periodicidadOrdenesSchema.optional(),
    // null = de inmediato (R15); una fecha = programado (R37, T11). SLT-86 (R22): si cambia el precio o
    // un descuento es obligatoria y `≥ hoy`, y hoy se aplica en el acto; lo mira el servicio, que sabe
    // qué cambió y qué día es.
    vigenteDesde: fechaSchema.nullable(),
  })
  .strict();

export const editarPlanSchema = edicionDelPlan.refine(unSoloModo, UN_SOLO_MODO);

/**
 * La versión de un cambio programado (§16.1): la edición sin `planId` ni `vigenteDesde`. Es lo que
 * se guarda en `plan_cambio_programado.version`, y al aplicarla se vuelve a validar con este mismo
 * esquema antes de escribir (T11).
 */
export const versionPlanSchema = edicionDelPlan
  .omit({ planId: true, vigenteDesde: true })
  .refine(unSoloModo, UN_SOLO_MODO);

export const planIdSchema = z.object({ planId: z.uuid() }).strict();
export const archivarPlanSchema = planIdSchema;
export const cancelarCambioPlanSchema = planIdSchema;
// SLT-58 (design §11.4; R29): `inicioCiclo` es la fecha de inicio del ciclo de órdenes que elige el
// superadmin en la primera asignación. Ausente = SL-24 tal cual (el ancla es el instante de asignar).
// El rango (R30) y «solo en la primera asignación» (R31) los mira el servicio, que tiene el reloj.
// Ajuste planes-custom (D6): `tipoCobro` obligatorio, en la primera asignación y en un cambio.
// SLT-86 (R16): `vigenteDesde`, la fecha de efecto de un cambio a una empresa con plan; obligatoria ahí,
// cosa que mira el servicio (y revalida el repositorio bajo el cerrojo, como SLT-58 R31).
export const asignarPlanSchema = z
  .object({
    organizacionId: z.uuid(),
    planId: z.uuid(),
    inicioCiclo: fechaSchema.optional(),
    vigenteDesde: fechaSchema.optional(),
    tipoCobro: tipoCobroSchema,
  })
  .strict()
  .refine((p) => p.inicioCiclo === undefined || p.vigenteDesde === undefined, NO_INICIO_Y_EFECTO);
/** SLT-58 (R37): la vista previa del modal de primera asignación; la fecha es obligatoria. */
export const previsualizarAsignacionSchema = z
  .object({ organizacionId: z.uuid(), planId: z.uuid(), inicioCiclo: fechaSchema })
  .strict();
export const asignablesSchema = z.object({ organizacionId: z.uuid() }).strict();
/**
 * Ajuste planes-custom (D10): cambiar SOLO el tipo de cobro del plan que la empresa ya tiene. SLT-86
 * (R16, R17): con fecha de efecto obligatoria; desde ella la entrada pasa a esa fecha. El rango lo mira
 * el servicio.
 */
export const cambiarTipoCobroSchema = z
  .object({ organizacionId: z.uuid(), tipoCobro: tipoCobroSchema, vigenteDesde: fechaSchema })
  .strict();
/** SLT-86 (R19, R26): «Cancelar cambio» del pendiente de una empresa. */
export const cancelarCambioEmpresaSchema = z.object({ organizacionId: z.uuid() }).strict();
/**
 * Ajuste planes-custom (D13): la vista previa de SLT-58 R37 en el form del custom, antes de que el plan
 * exista. Los topes son los que se están escribiendo en el form (la misma forma que `crearPlanSchema`).
 */
export const previsualizarCustomSchema = z
  .object({ organizacionId: z.uuid(), inicioCiclo: fechaSchema, topes: topesPlanSchema })
  .strict();
/**
 * SLT-86 (R15, R25; review m4): los planes de los que el detalle de empresa quiere los precios que regirán:
 * los asignables y el actual. El tope solo acota la lectura; ningún catálogo real se le acerca.
 */
export const preciosQueRigenSchema = z.object({ planIds: z.array(z.uuid()).max(500) }).strict();

export type CrearPlanInput = z.infer<typeof crearPlanSchema>;
export type EditarPlanInput = z.infer<typeof editarPlanSchema>;
export type ArchivarPlanInput = z.infer<typeof archivarPlanSchema>;
export type CancelarCambioPlanInput = z.infer<typeof cancelarCambioPlanSchema>;
export type AsignarPlanInput = z.infer<typeof asignarPlanSchema>;
export type PrevisualizarAsignacionInput = z.infer<typeof previsualizarAsignacionSchema>;
export type AsignablesInput = z.infer<typeof asignablesSchema>;
export type CambiarTipoCobroInput = z.infer<typeof cambiarTipoCobroSchema>;
export type CancelarCambioEmpresaInput = z.infer<typeof cancelarCambioEmpresaSchema>;
export type PrevisualizarCustomInput = z.infer<typeof previsualizarCustomSchema>;

/** Lo que define una versión del plan: lo editable (§16.1: `version` es esto mismo). */
export type VersionPlan = Pick<
  EditarPlanInput,
  "nombre" | "topes" | "modulos" | "precio" | "costoPorOrden" | "costoPorOrdenPorcentual" | "periodicidadOrdenes"
>;

export type PlanDTO = {
  id: string;
  nombre: string;
  visibilidad: "publico" | "custom";
  organizacionId: string | null;
  topes: TopesPlan;
  modulos: ModuloApagable[];
  precio: PrecioPlan;
  /** SLT-66 (R7): importe con dos decimales; `null` = el plan no lo fija (se cobra el global, R12). */
  costoPorOrden: string | null;
  /** SLT-83 (R1): porcentaje y mínimo con dos decimales; `null` = el plan no es porcentual. */
  costoPorOrdenPorcentual: CostoPorOrdenPorcentual | null;
  /**
   * SLT-118 (R35): la periodicidad de órdenes. Las lecturas del repositorio la llenan siempre; opcional en el
   * tipo para no tocar los dobles de `PlanDTO` de los tests. Ausente = `quincenal` (el DEFAULT de la columna).
   */
  periodicidadOrdenes?: PeriodicidadOrdenes;
  archivado: boolean;
};

/** Un tope que una empresa ya pasa (R12 al asignar, R16 al editar). */
export type TopeExcedido = {
  organizacionId: string;
  empresa: string;
  // SLT-86 (R8): ya no hay tope de órdenes.
  tope: "api_keys" | RolConTope;
  usados: number;
  maximo: number;
};

export type PlanResult =
  | {
      estado: "ok";
      planId: string;
      cambio: boolean;
      // R16: empresas que ya pasan algún tope de la versión guardada. SLT-58 (R36, R42): también los
      // topes que la empresa ya pasa en la primera asignación con fecha. [] en todo lo demás.
      avisos: TopeExcedido[];
      vigenteDesde: string | null;
    }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | { estado: "custom_de_otra_empresa" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[]; mensaje: string }
  | { estado: "sin_cambio_programado" }
  // SLT-66 R28: el plan (o su versión pendiente) no tiene costo base y costo por orden concretos.
  | { estado: "plan_sin_costo" };

/**
 * SL-24 (design §6.3, §6.5): el rechazo de un alta por el tope del plan, en el resultado de las
 * vías de usuarios y de API keys que no tienen un campo donde ponerlo (activar una cuenta, aprobar
 * una postulación, crear o activar una key). `mensaje` es el texto ya redactado de
 * `lib/planes/mensajes.ts`; la pantalla lo muestra tal cual en su aviso.
 */
export type ResultadoTopePlan = { status: "tope_plan"; mensaje: string };

export type ListarPlanesAsignablesResult =
  | { estado: "ok"; planes: PlanDTO[] }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" };

/**
 * SLT-86 (R15, R25; review m4): un precio del plan y el instante desde el que rige (ISO, las 00:00 de la
 * plataforma de su fecha de efecto); `null` = desde siempre (la fila `-infinity` del alta).
 */
export type PrecioDesde = { desde: string | null; precio: PrecioPlan };

/**
 * Por plan, los precios que pueden regir de hoy en adelante, de menor a mayor `desde`: el vigente a las
 * 00:00 de hoy, las filas posteriores del historial y el precio de su cambio programado, si lo tiene. Un
 * plan pedido que no existe no tiene clave.
 */
export type PreciosQueRigen = Record<string, PrecioDesde[]>;

export type PreciosQueRigenResult =
  | { estado: "ok"; precios: PreciosQueRigen }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> };

/* -------------------------------------------------------------------------- */
/* SLT-58 (design §5) — las lecturas del superadmin                            */
/* -------------------------------------------------------------------------- */
// Serializables: cruzan de Server Component a cliente. Las fechas de calendario (`AAAA-MM-DD`) van en
// la hora de la plataforma; los instantes (`creadoAt`), en ISO.

/**
 * R13: una fila del catálogo, también archivada. `vigenteDesdePendiente` es `AAAA-MM-DD UTC`: un plan
 * del catálogo no es de una sola empresa, así que la fecha va en UTC y lo dice (SLT-42).
 */
export type PlanDelCatalogo = PlanDTO & {
  /** El nombre de la empresa de un custom; `null` en un público. */
  empresaNombre: string | null;
  /** Cuántas empresas lo tienen asignado ahora. */
  empresas: number;
  vigenteDesdePendiente: string | null;
};

/** R16: una fila de `plan_rastro`. */
export type FilaRastro = {
  id: string;
  accion: PlanRastroAccion;
  cambios: CambiosDelPlan;
  actorNombre: string;
  creadoAt: string;
};

export type DetallePlan = {
  plan: PlanDTO;
  empresaNombre: string | null;
  pendiente: CambioPendienteVista | null;
  empresas: { id: string; nombre: string }[];
  /** Del más reciente al más antiguo. */
  rastro: FilaRastro[];
};

/**
 * Ajuste planes-custom (D14): qué fue cada fila del historial de asignaciones. `asignacion` = asignar o
 * cambiar el plan (SL-24, SLT-58, D2); `cambio_tipo_cobro` = solo el tipo de cobro del mismo plan (D10).
 * SLT-86 (design §5.3; decisión del 2026-11-05): `cambio_cancelado` = se canceló un cambio pendiente que no
 * llegó a regir; `tipoCobro` y `desde` son los de ese cambio.
 */
export type TipoDeAsignacion = "asignacion" | "cambio_tipo_cobro" | "cambio_cancelado";

/**
 * Ajuste planes-custom (D16): las acciones del historial general que forman el historial de asignaciones
 * del detalle (R21, D14). `plan_tipo_cobro_cambiado` es el cambio de solo el tipo de cobro (D10).
 * SLT-86 (R19, R26): `plan_cambio_empresa_cancelado`, la cancelación de un cambio pendiente.
 */
export const ACCIONES_DE_ASIGNACION = [
  "plan_asignado",
  "plan_tipo_cobro_cambiado",
  "plan_cambio_empresa_cancelado",
] as const satisfies readonly HistorialAccionTipo[];
export type AccionDeAsignacion = (typeof ACCIONES_DE_ASIGNACION)[number];

/** R21: una fila del historial de la empresa con una de `ACCIONES_DE_ASIGNACION`. */
export type AsignacionDePlan = {
  creadoAt: string;
  actorNombre: string;
  /** La `entidad_etiqueta` congelada al asignar (`Plan «<nombre>»`). */
  planNombre: string;
  /** D14: asignación del plan, cambio de solo el tipo de cobro (D10) o cambio cancelado (SLT-86). */
  tipo: TipoDeAsignacion;
  /** D14: el tipo de cobro que dejó la fila; `null` en las filas anteriores al ajuste (no lo guardaban). */
  tipoCobro: TipoCobro | null;
  /** D10: el tipo que había antes de un `cambio_tipo_cobro`; `null` en una `asignacion`. */
  tipoCobroAnterior: TipoCobro | null;
  /**
   * SLT-86 (R30): la fecha que la fila lleva delante del tipo (`AAAA-MM-DD`): la de efecto de un cambio
   * (también la del cambio cancelado) o la de inicio de SLT-58. `null` en las filas que no la guardaban.
   */
  desde: string | null;
};

/**
 * Ajuste planes-custom (D10): cambiar solo el tipo de cobro. `cambio: false` = ya tenía ese tipo; no se
 * escribió nada. `sin_plan`: la empresa no tiene plan (el tipo se elige al asignarle uno). SLT-118 (R32):
 * `vigenteDesde`, la fecha real (`AAAA-MM-DD`) del cambio que quedó pendiente; `null` si se aplicó o no cambió.
 */
export type CambiarTipoCobroResult =
  | { estado: "ok"; cambio: boolean; vigenteDesde: string | null }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" }
  | { estado: "sin_plan" };

/** SLT-86 (R19, R26): «Cancelar cambio». `sin_cambio_programado`: la empresa no tenía pendiente. */
export type CancelarCambioEmpresaResult =
  | { estado: "ok" }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" }
  | { estado: "sin_cambio_programado" };

/**
 * Ajuste planes-custom (D13): la vista previa de SLT-58 R37 para el form del custom, con los topes del
 * form. Mismos `avisos` que `VistaPreviaAsignacionResult`. `validation_error` en
 * `inicioCiclo` si la fecha está fuera de rango (R30) o la empresa ya tiene plan (R31).
 */
export type VistaPreviaCustomResult =
  | { estado: "ok"; avisos: TopeExcedido[] }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" };

export type PlanDeEmpresaVista = {
  organizacionId: string;
  /** `null` = sin plan: sin límites (R19). */
  plan: (PlanConConsumo & { planId: string; archivado: boolean }) | null;
  /**
   * SLT-86 (R26, decisión del 2026-11-05): sin plan, la primera asignación pendiente, con «Cancelar
   * cambio»; `null` si no hay. Con plan, el pendiente va en `plan.cobro.pendiente`.
   */
  pendienteSinPlan: PendienteDeEmpresa | null;
  /** Del más reciente al más antiguo. */
  asignaciones: AsignacionDePlan[];
};

export type CatalogoResult = { estado: "ok"; planes: PlanDelCatalogo[] } | { estado: "forbidden" };

export type DetallePlanResult =
  | { estado: "ok"; detalle: DetallePlan }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" };

export type PlanDeEmpresaResult =
  | { estado: "ok"; vista: PlanDeEmpresaVista }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" };

/**
 * SLT-58 (design §11.4; R37, R42) — qué topes del plan pasaría la empresa si se le asigna: usuarios de
 * cada rol con tope y API keys. La misma definición de uso que la asignación, así que estos avisos son
 * los que devolverá `asignar`. Sin tope pasado, `avisos: []`. SLT-86 (R8): sin órdenes, y por eso sin
 * `siguienteCiclo`, que era el `{fecha}` del aviso de órdenes (P10).
 */
export type VistaPreviaAsignacionResult =
  | { estado: "ok"; avisos: TopeExcedido[] }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | { estado: "custom_de_otra_empresa" }
  // SLT-66 R28: la pantalla no deja confirmar lo que `asignar` rechazaría.
  | { estado: "plan_sin_costo" };
