import type { ModuloApagable, PlanRastroAccion } from "@prisma/client";
import { z } from "zod";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import type { CambiosDelPlan } from "@/lib/planes/rastro";
import { montoCobroSchema } from "@/lib/types/cobro-plataforma";
import type { CambioPendienteVista, PlanConConsumo } from "@/lib/types/consumo-plan";

// SL-24 (design §5.1; R1–R3, R25, R37) — el borde de la gestión de planes por el superadmin. Todo
// llega sin tipar desde la action y se valida aquí antes de tocar la base. Los importes viajan como
// texto (`montoCobroSchema`, sin pasar por `Number`): la base los guarda en `DECIMAL(12,2)` y sus
// `CHECK` son la segunda red (design §16.1: «una versión inválida se rechaza igual en dos sitios»).

/**
 * Los roles que admiten tope (R25). `apiKey` y `superadmin` quedan fuera: las keys tienen el suyo. SLT-66
 * (R1): `maestro` tampoco; el `CHECK` de `plan_tope_rol` lo rechaza igual (20261031120000).
 */
export const ROLES_CON_TOPE = ["admin", "mensajero", "adminTienda", "adminSatelite"] as const;
export type RolConTope = (typeof ROLES_CON_TOPE)[number];

export type PrecioPlan =
  | { tipo: "sin_precio" }
  | { tipo: "negociable" }
  | {
      tipo: "monto";
      mensual: string;
      anual: null | { tipo: "fijo"; monto: string } | { tipo: "descuento"; porcentaje: string };
    };

export type TopesPlan = {
  ordenesPorCiclo: number | null;
  porRol: Partial<Record<RolConTope, number>>;
  apiKeys: number | null;
};

/** Un tope de `INTEGER`: ni negativo (los `CHECK` de §2.1) ni más de lo que cabe en la columna. */
const tope = z.int().min(0).max(2_147_483_647);

/**
 * Porcentaje de descuento sobre el anual: texto, hasta dos decimales, `> 0` y `≤ 100` (R3). Se
 * compara en centésimas enteras, así que no hay redondeo de coma flotante.
 */
const porcentajeSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((s) => {
    const [entero, decimales = ""] = s.split(".");
    const centesimas = Number.parseInt(entero, 10) * 100 + Number.parseInt(decimales.padEnd(2, "0"), 10);
    return centesimas > 0 && centesimas <= 10_000;
  });

// Cada forma es `.strict()`: una clave de otra forma es una combinación prohibida (R3): «negociable»
// con un monto, un anual fijo con porcentaje, o un anual sin mensual.
const anualSchema = z.union([
  z.null(),
  z.object({ tipo: z.literal("fijo"), monto: montoCobroSchema }).strict(),
  z.object({ tipo: z.literal("descuento"), porcentaje: porcentajeSchema }).strict(),
]);

export const precioPlanSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("sin_precio") }).strict(),
  z.object({ tipo: z.literal("negociable") }).strict(),
  z.object({ tipo: z.literal("monto"), mensual: montoCobroSchema, anual: anualSchema }).strict(),
]);

export const topesPlanSchema = z
  .object({
    ordenesPorCiclo: tope.nullable(),
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
  })
  .strict()
  // R2: un custom nombra exactamente una empresa y un público ninguna. Que exista lo mira el servicio.
  .refine((p) => (p.visibilidad === "custom") === (p.organizacionId !== null), {
    path: ["organizacionId"],
    error: "Un plan custom nombra una empresa y uno público ninguna.",
  });

// `.strict()`: traer `visibilidad` u `organizacionId` en una edición es validation_error (R2).
export const editarPlanSchema = z
  .object({
    planId: z.uuid(),
    nombre: nombreSchema,
    topes: topesPlanSchema,
    modulos: modulosSchema,
    precio: precioPlanSchema,
    costoPorOrden: montoCobroSchema.nullable(),
    // null = de inmediato (R15); una fecha = programado (R37, T11).
    vigenteDesde: fechaSchema.nullable(),
  })
  .strict();

/**
 * La versión de un cambio programado (§16.1): la edición sin `planId` ni `vigenteDesde`. Es lo que
 * se guarda en `plan_cambio_programado.version`, y al aplicarla se vuelve a validar con este mismo
 * esquema antes de escribir (T11).
 */
export const versionPlanSchema = editarPlanSchema.omit({ planId: true, vigenteDesde: true });

export const planIdSchema = z.object({ planId: z.uuid() }).strict();
export const archivarPlanSchema = planIdSchema;
export const cancelarCambioPlanSchema = planIdSchema;
// SLT-58 (design §11.4; R29): `inicioCiclo` es la fecha de inicio del ciclo de órdenes que elige el
// superadmin en la primera asignación. Ausente = SL-24 tal cual (el ancla es el instante de asignar).
// El rango (R30) y «solo en la primera asignación» (R31) los mira el servicio, que tiene el reloj.
export const asignarPlanSchema = z
  .object({ organizacionId: z.uuid(), planId: z.uuid(), inicioCiclo: fechaSchema.optional() })
  .strict();
/** SLT-58 (R37): la vista previa del modal de primera asignación; la fecha es obligatoria. */
export const previsualizarAsignacionSchema = z
  .object({ organizacionId: z.uuid(), planId: z.uuid(), inicioCiclo: fechaSchema })
  .strict();
export const asignablesSchema = z.object({ organizacionId: z.uuid() }).strict();

export type CrearPlanInput = z.infer<typeof crearPlanSchema>;
export type EditarPlanInput = z.infer<typeof editarPlanSchema>;
export type ArchivarPlanInput = z.infer<typeof archivarPlanSchema>;
export type CancelarCambioPlanInput = z.infer<typeof cancelarCambioPlanSchema>;
export type AsignarPlanInput = z.infer<typeof asignarPlanSchema>;
export type PrevisualizarAsignacionInput = z.infer<typeof previsualizarAsignacionSchema>;
export type AsignablesInput = z.infer<typeof asignablesSchema>;

/** Lo que define una versión del plan: lo editable (§16.1: `version` es esto mismo). */
export type VersionPlan = Pick<EditarPlanInput, "nombre" | "topes" | "modulos" | "precio" | "costoPorOrden">;

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
  archivado: boolean;
};

/** Un tope que una empresa ya pasa (R12 al asignar, R16 al editar). */
export type TopeExcedido = {
  organizacionId: string;
  empresa: string;
  tope: "ordenes" | "api_keys" | RolConTope;
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

/* -------------------------------------------------------------------------- */
/* SLT-58 (design §5) — las lecturas del superadmin                            */
/* -------------------------------------------------------------------------- */
// Serializables: cruzan de Server Component a cliente. Las fechas de calendario (`AAAA-MM-DD`) van en
// la hora de la plataforma; los instantes (`creadoAt`), en ISO.

/** R13: una fila del catálogo, también archivada. `vigenteDesdePendiente` es `AAAA-MM-DD`. */
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

/** R21: una fila `plan_asignado` del historial de la empresa. */
export type AsignacionDePlan = {
  creadoAt: string;
  actorNombre: string;
  /** La `entidad_etiqueta` congelada al asignar (`Plan «<nombre>»`). */
  planNombre: string;
};

export type PlanDeEmpresaVista = {
  organizacionId: string;
  /** `null` = sin plan: sin límites (R19). */
  plan: (PlanConConsumo & { planId: string; archivado: boolean }) | null;
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
 * SLT-58 (design §11.4; R37, R42) — qué topes del plan pasaría la empresa si se le asigna con esa
 * fecha: órdenes del ciclo que resulta de la fecha, usuarios de cada rol con tope y API keys. La misma
 * definición de uso que la asignación, así que estos avisos son los que devolverá `asignar`. Sin tope
 * pasado, `avisos: []`. `siguienteCiclo` (`AAAA-MM-DD`, hora de la plataforma) es el día en que
 * empieza el siguiente ciclo: el `{fecha}` del aviso de órdenes (P10).
 */
export type VistaPreviaAsignacionResult =
  | { estado: "ok"; avisos: TopeExcedido[]; siguienteCiclo: string }
  | { estado: "forbidden" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" }
  | { estado: "archivado" }
  | { estado: "custom_de_otra_empresa" }
  // SLT-66 R28: la pantalla no deja confirmar lo que `asignar` rechazaría.
  | { estado: "plan_sin_costo" };
