import { z } from "zod";

import { descuentosDeLaLista } from "@/lib/planes/borrador";
import { montoCobroSchema } from "@/lib/types/cobro-plataforma";
import {
  CUSTOM_CON_EMPRESA,
  EFECTO_SOLO_EN_CUSTOM,
  EMPRESA_CON_TIPO_COBRO,
  INICIO_SOLO_EN_CUSTOM,
  NO_INICIO_Y_EFECTO,
  UN_SOLO_MODO,
  costoPorOrdenPorcentualSchema,
  customConEmpresa,
  editarPlanSchema,
  efectoSoloEnCustom,
  empresaConTipoCobro,
  fechaSchema,
  inicioSoloEnCustom,
  modulosSchema,
  noInicioYEfecto,
  nombreSchema,
  periodicidadOrdenesSchema,
  precioPlanSchema,
  tipoCobroSchema,
  topesPlanSchema,
  unSoloModo,
  type PlanResult,
} from "@/lib/types/planes";

// SLT-129 (design §3, §4; R3, R6, R7) — el borde del borrador de planes: qué valores admite cada paso al
// guardarlo y qué devuelven las operaciones. Cada paso se arma con las piezas de `lib/types/planes.ts`, no con
// copias, y sus errores salen con las mismas claves de campo que `PlanesService.crear` y `.editar`, para
// que `pasoDeLaClave` de SLT-130 lleve cada uno a su paso.
//
// Al guardar se miran solo las reglas del paso. Las que cruzan pasos o necesitan la base o el reloj (la empresa
// existe, el rango de las fechas, los topes ya pasados, tipo quincenal con órdenes mensuales) las mira confirmar
// con las reglas de hoy (R6).

/** Los pasos de SLT-130, en el orden del formulario. `vigencia` («Cuándo rige») solo en un cambio. */
export const PASOS_DE_CREAR = ["general", "precio", "orden", "topes", "modulos"] as const;
export const PASOS_DE_EDITAR = ["general", "precio", "orden", "topes", "modulos", "vigencia"] as const;
export type IdPasoDeCrear = (typeof PASOS_DE_CREAR)[number];
export type IdPasoDeEditar = (typeof PASOS_DE_EDITAR)[number];
export type IdPasoBorrador = IdPasoDeEditar;
export type ModoDelBorrador = "crear" | "editar";

// ── Precio con los descuentos en lista (R7) ──────────────────────────────────────────────────────────

export const lineaDeDescuentoSchema = z
  .object({ periodo: tipoCobroSchema, tipo: z.enum(["monto", "porcentaje"]), valor: z.string() })
  .strict();
export type LineaDeDescuento = z.infer<typeof lineaDeDescuentoSchema>;

export const PERIODO_REPETIDO = "Un período no puede repetirse.";

/**
 * Un período repetido va a `descuentos.<período>`, la clave del `fieldset` de la línea. Sin repetidos, la lista
 * se convierte en el registro de hoy y pasa por `precioPlanSchema`: los errores de valor salen en
 * `descuentos.<período>.<monto|porcentaje>` con los mensajes de hoy. Solo se copian los de `descuentos`: el
 * `mensual` ya lo validó el objeto con el mismo `montoCobroSchema`.
 */
function validarDescuentos(p: { mensual: string; descuentos: LineaDeDescuento[] }, ctx: z.RefinementCtx): void {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const { periodo } of p.descuentos) (vistos.has(periodo) ? repetidos : vistos).add(periodo);
  for (const periodo of repetidos) {
    ctx.addIssue({ code: "custom", path: ["descuentos", periodo], message: PERIODO_REPETIDO });
  }
  if (repetidos.size > 0) return;
  const comoHoy = precioPlanSchema.safeParse({
    tipo: "monto",
    mensual: p.mensual,
    descuentos: descuentosDeLaLista(p.descuentos),
  });
  if (comoHoy.success) return;
  for (const issue of comoHoy.error.issues) {
    if (issue.path[0] === "descuentos") ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
}

// `sin_precio` es `.strict()`: traer `descuentos` es validation_error en `precio`, como hoy.
export const precioDelBorradorSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("sin_precio") }).strict(),
  z
    .object({ tipo: z.literal("monto"), mensual: montoCobroSchema, descuentos: z.array(lineaDeDescuentoSchema) })
    .strict()
    .superRefine(validarDescuentos),
]);
export type PrecioDelBorrador = z.infer<typeof precioDelBorradorSchema>;

// ── Un esquema por paso (design §3) ──────────────────────────────────────────────────────────────────

/** Al crear: los campos de General y las reglas de `crearPlanSchema` que solo miran estos campos. */
const generalDeCrearSchema = z
  .object({
    nombre: nombreSchema,
    visibilidad: z.enum(["publico", "custom"]),
    organizacionId: z.uuid().nullable(),
    tipoCobro: tipoCobroSchema.optional(),
    inicioCiclo: fechaSchema.optional(),
    vigenteDesde: fechaSchema.optional(),
  })
  .strict()
  .refine(customConEmpresa, CUSTOM_CON_EMPRESA)
  .refine(empresaConTipoCobro, EMPRESA_CON_TIPO_COBRO)
  .refine(inicioSoloEnCustom, INICIO_SOLO_EN_CUSTOM)
  .refine(efectoSoloEnCustom, EFECTO_SOLO_EN_CUSTOM)
  .refine(noInicioYEfecto, NO_INICIO_Y_EFECTO);

/** Al editar, la visibilidad y la empresa no cambian: General es solo el nombre. */
const generalDeEditarSchema = z.object({ nombre: nombreSchema }).strict();

const precioSchema = z.object({ precio: precioDelBorradorSchema }).strict();

// `periodicidadOrdenes` obligatoria: el formulario la manda siempre.
const ordenSchema = z
  .object({
    costoPorOrden: montoCobroSchema.nullable(),
    costoPorOrdenPorcentual: costoPorOrdenPorcentualSchema.nullable(),
    periodicidadOrdenes: periodicidadOrdenesSchema,
  })
  .strict()
  .refine(unSoloModo, UN_SOLO_MODO);

const topesSchema = z.object({ topes: topesPlanSchema }).strict();

const modulosDelPasoSchema = z.object({ modulos: modulosSchema }).strict();

// Solo el formato que acepte la edición de hoy. «No antes de hoy» y «posterior a ahora si no cambia el precio»
// los mira confirmar (R6, R19).
const vigenciaSchema = z.object({ vigenteDesde: editarPlanSchema.shape.vigenteDesde }).strict();

export const ESQUEMAS_DE_CREAR = {
  general: generalDeCrearSchema,
  precio: precioSchema,
  orden: ordenSchema,
  topes: topesSchema,
  modulos: modulosDelPasoSchema,
} as const satisfies Record<IdPasoDeCrear, z.ZodType>;

export const ESQUEMAS_DE_EDITAR = {
  general: generalDeEditarSchema,
  precio: precioSchema,
  orden: ordenSchema,
  topes: topesSchema,
  modulos: modulosDelPasoSchema,
  vigencia: vigenciaSchema,
} as const satisfies Record<IdPasoDeEditar, z.ZodType>;

export type GeneralDeCrear = z.infer<typeof generalDeCrearSchema>;
export type GeneralDeEditar = z.infer<typeof generalDeEditarSchema>;
export type ValoresDePrecio = z.infer<typeof precioSchema>;
export type ValoresDeOrden = z.infer<typeof ordenSchema>;
export type ValoresDeTopes = z.infer<typeof topesSchema>;
export type ValoresDeModulos = z.infer<typeof modulosDelPasoSchema>;
export type ValoresDeVigencia = z.infer<typeof vigenciaSchema>;
export type ValoresDelPaso =
  | GeneralDeCrear
  | GeneralDeEditar
  | ValoresDePrecio
  | ValoresDeOrden
  | ValoresDeTopes
  | ValoresDeModulos
  | ValoresDeVigencia;

/** Los pasos de un borrador de creación, ya validados, por su id. */
export type PasosDeCrear = {
  general: GeneralDeCrear;
  precio: ValoresDePrecio;
  orden: ValoresDeOrden;
  topes: ValoresDeTopes;
  modulos: ValoresDeModulos;
};
/** Los pasos de un borrador de cambio, ya validados, por su id. */
export type PasosDeEditar = Omit<PasosDeCrear, "general"> & { general: GeneralDeEditar; vigencia: ValoresDeVigencia };

// ── Entradas de las operaciones (design §3, §4) ─────────────────────────────────────────────────────

export const UN_PLAN_NUEVO_EMPIEZA_POR_GENERAL = "Un plan nuevo empieza por el paso General.";

function opcionDeCrear<P extends IdPasoDeCrear>(paso: P) {
  return z
    .object({
      modo: z.literal("crear"),
      borradorId: z.uuid().nullable(),
      paso: z.literal(paso),
      valores: ESQUEMAS_DE_CREAR[paso],
    })
    .strict();
}
function opcionDeEditar<P extends IdPasoDeEditar>(paso: P) {
  return z
    .object({ modo: z.literal("editar"), planId: z.uuid(), paso: z.literal(paso), valores: ESQUEMAS_DE_EDITAR[paso] })
    .strict();
}

/**
 * Guardar un paso, discriminado por `modo` y luego por `paso`: uniones DISCRIMINADAS para que un error de
 * `valores` salga con su ruta y no como un `invalid_union` sin clave. R3: sin borrador, un plan nuevo empieza
 * por General; el error va en `paso`. Los errores de `valores` llevan el prefijo `valores.`, que el servicio
 * quita para devolver la clave del campo.
 */
export const guardarPasoBorradorSchema = z
  .discriminatedUnion("modo", [
    z.discriminatedUnion("paso", [
      opcionDeCrear("general"),
      opcionDeCrear("precio"),
      opcionDeCrear("orden"),
      opcionDeCrear("topes"),
      opcionDeCrear("modulos"),
    ]),
    z.discriminatedUnion("paso", [
      opcionDeEditar("general"),
      opcionDeEditar("precio"),
      opcionDeEditar("orden"),
      opcionDeEditar("topes"),
      opcionDeEditar("modulos"),
      opcionDeEditar("vigencia"),
    ]),
  ])
  .refine((e) => !(e.modo === "crear" && e.borradorId === null && e.paso !== "general"), {
    path: ["paso"],
    error: UN_PLAN_NUEVO_EMPIEZA_POR_GENERAL,
  });
export type GuardarPasoBorradorInput = z.infer<typeof guardarPasoBorradorSchema>;

export const leerBorradorSchema = z.union([
  z.object({ borradorId: z.uuid() }).strict(),
  z.object({ planId: z.uuid() }).strict(),
]);
export const descartarBorradorSchema = z.object({ borradorId: z.uuid() }).strict();
export const confirmarBorradorSchema = descartarBorradorSchema;
export type LeerBorradorInput = z.infer<typeof leerBorradorSchema>;
export type DescartarBorradorInput = z.infer<typeof descartarBorradorSchema>;
export type ConfirmarBorradorInput = z.infer<typeof confirmarBorradorSchema>;

// ── Resultados (design §4) ──────────────────────────────────────────────────────────────────────────

type Forbidden = { estado: "forbidden" };
type ErrorDeValidacion = { estado: "validation_error"; fieldErrors: Record<string, string[]> };
type BorradorNoEncontrado = { estado: "borrador_no_encontrado" };

export type BorradorVista = {
  id: string;
  modo: ModoDelBorrador;
  planId: string | null;
  /** Tal como se guardaron, con los descuentos en lista y en su orden (R9). */
  pasos: Partial<Record<IdPasoBorrador, ValoresDelPaso>>;
  /** En el orden del formulario. */
  pasosGuardados: IdPasoBorrador[];
  /** El nombre de quien lo empezó, congelado al empezarlo. */
  iniciadoPor: string;
  /** ISO 8601. */
  iniciadoAt: string;
  actualizadoAt: string;
};

/** R10: `nombre` es el de General si está guardado; si no, el del plan en un cambio, o `null` en una creación. */
export type BorradorResumen = Omit<BorradorVista, "pasos" | "pasosGuardados"> & { nombre: string | null };

export type GuardarPasoResult =
  | { estado: "ok"; borradorId: string; pasosGuardados: IdPasoBorrador[]; actualizadoAt: string }
  | Forbidden
  | ErrorDeValidacion
  | { estado: "not_found" }
  | { estado: "archivado" }
  | BorradorNoEncontrado;

export type LeerBorradorResult = { estado: "ok"; borrador: BorradorVista | null } | Forbidden | ErrorDeValidacion;

export type DescartarBorradorResult = { estado: "ok" } | Forbidden | ErrorDeValidacion | BorradorNoEncontrado;

export type BorradoresResult = { estado: "ok"; borradores: BorradorResumen[] } | Forbidden;

/** El `PlanResult` de crear o editar (con `planId` = el plan creado o editado), o los rechazos propios. */
export type ConfirmarBorradorResult =
  | PlanResult
  | { estado: "pasos_pendientes"; pasos: IdPasoBorrador[] }
  | BorradorNoEncontrado;
