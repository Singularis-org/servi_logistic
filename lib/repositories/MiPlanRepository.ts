import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { IMiPlanRepository, LecturaDeMiPlan, PlanDeLaEmpresaLeido } from "@/lib/interfaces/repositories/IMiPlanRepository";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { costoVigenteDeLaTarifa } from "@/lib/planes/costeo";
import { pendienteDeEmpresa, precioDelHistorial } from "@/lib/repositories/_shared/precio-del-periodo";
import { type RolConTope, type TopesPlan, tipoCobroSchema, versionPlanSchema } from "@/lib/types/planes";

// SLT-58 (design §2, §3.1) — «Mi plan» lee por `plan_de_la_empresa`, la segunda y última función que
// `servi_app` puede ejecutar: las tablas `plan*` siguen cerradas a la app (R9).
//
// La empresa es la que la extensión fijó en `app.organizacion_id`: en una lectura por sesión `contextoActual()` vendría vacío. La función exige que el argumento sea esa
// misma empresa (`42501` si no), así que no hay forma de pedir el plan de otra.
//
// El `jsonb` es un borde sin tipar: se valida con zod antes de salir de aquí. La `version` del cambio
// programado se valida con `versionPlanSchema`, el mismo que usa el aplicador (SL-24 T11).
//
// SLT-86 (design §3.3; R15, R26, R32): la forma de 20261106120000 y 20261106130000. Con plan trae el precio
// del período (`precio_del_periodo`) y el pendiente de la empresa (`cambio_empresa`), los dos sin actor;
// sin plan y con una primera asignación pendiente, `{sin_plan, cambio_empresa}`.
type MiPlanPrismaClient = Pick<PrismaClient, "$queryRaw">;

/** `TIMESTAMP` sin zona, que `to_jsonb` serializa sin sufijo: sus números son UTC (decisión de SL-24). */
const instanteUtcSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)
  .transform((s) => new Date(`${s}Z`));

const conteo = z.int().min(0);
const importe = z.string().nullable();

/**
 * La base usa la etiqueta de Postgres (`'Admin Tienda'`); la app, la clave de `RolValue`. SLT-66 (R1):
 * `maestro` ya no tiene tope; una fila suya, si la hubiera, se ignora como cualquier rol desconocido.
 */
const ROL_DE_LA_ETIQUETA: Readonly<Record<string, RolConTope>> = {
  admin: "admin",
  mensajero: "mensajero",
  "Admin Tienda": "adminTienda",
  adminSatelite: "adminSatelite",
};

/** R26, R32: el pendiente de la empresa, sin `plan_cambio_actor_id`. */
const cambioEmpresaSchema = z.object({ plan_nombre: z.string(), tipo_cobro: z.string(), desde: instanteUtcSchema });

export const planDeLaEmpresaFilaSchema = z.object({
  nombre: z.string(),
  precio_mensual: importe,
  // SLT-86 (R10): los descuentos vigentes, con la forma de `PrecioPlan.descuentos`.
  descuentos: z.unknown(),
  // SLT-86 (R15): la fila del historial que rige al empezar el período en curso. La migración y `crear`
  // siembran una por plan, así que no puede faltar.
  precio_del_periodo: z.object({ precio_mensual: importe, descuentos: z.unknown() }),
  // SLT-66 (M3, R18): el del plan, `null` si no lo fija; y el vigente de `cobro_plataforma_tarifa_de`.
  costo_por_orden: importe,
  // SLT-83 (M3, R1): el modo porcentual del plan; los dos `null` = no es porcentual.
  costo_por_orden_pct: importe,
  costo_por_orden_minimo: importe,
  // SLT-83 (M3): `monto` es null en el modo porcentual, que trae `porcentaje` y `minimo`.
  costo_vigente: z.object({
    monto: importe,
    // SLT-126 (R11): sin "empresa". Si la base la devolviera (solo tras un `down.sql`), falla ruidosa.
    fuente: z.enum(["plan", "global", "sin_configurar"]),
    porcentaje: importe,
    minimo: importe,
  }),
  // SLT-83 (R24): `plan_cobro_del_ciclo`. `cobrado` lleva signo: un reverso del ciclo de un cargo anterior.
  cobro_ciclo: z.object({ cobrado: z.string(), pendientes: conteo }),
  // Ajuste planes-custom (D6) y SLT-86 (R1): `organizacion.plan_tipo_cobro`, uno de los cuatro tipos.
  tipo_cobro: tipoCobroSchema,
  tope_api_keys: conteo.nullable(),
  topes_rol: z.array(z.object({ rol: z.string(), maximo: conteo })),
  modulos: z.array(z.enum(ORDEN_MODULOS)),
  // SLT-86 (R5): la entrada de la empresa, siempre las 00:00 de un día.
  ciclo_ancla: instanteUtcSchema,
  uso: z.object({
    ordenes: conteo,
    api_keys: conteo,
    admin: conteo,
    mensajero: conteo,
    admin_tienda: conteo,
    admin_satelite: conteo,
  }),
  cambio: z.object({ vigente_desde: instanteUtcSchema, version: versionPlanSchema }).nullable(),
  cambio_empresa: cambioEmpresaSchema.nullable(),
});

/** R26 sin plan (decisión del 2026-11-05): la primera asignación pendiente, sin el actor. */
const sinPlanFilaSchema = z.object({ sin_plan: z.literal(true), cambio_empresa: cambioEmpresaSchema });

type FilaPlanDeLaEmpresa = z.infer<typeof planDeLaEmpresaFilaSchema>;

function topesDe(f: FilaPlanDeLaEmpresa): TopesPlan {
  const porRol: TopesPlan["porRol"] = {};
  for (const t of f.topes_rol) {
    const rol = ROL_DE_LA_ETIQUETA[t.rol];
    if (rol !== undefined) porRol[rol] = t.maximo;
  }
  return { porRol, apiKeys: f.tope_api_keys };
}

function aLeido(f: FilaPlanDeLaEmpresa): PlanDeLaEmpresaLeido {
  const porRol: Record<RolConTope, number> = {
    admin: f.uso.admin,
    mensajero: f.uso.mensajero,
    adminTienda: f.uso.admin_tienda,
    adminSatelite: f.uso.admin_satelite,
  };
  const c = f.cambio_empresa;
  return {
    vigente: {
      nombre: f.nombre,
      topes: topesDe(f),
      modulos: f.modulos,
      precio: precioDelHistorial(f.precio_mensual, f.descuentos),
      costoPorOrden: f.costo_por_orden,
      costoPorOrdenPorcentual:
        f.costo_por_orden_pct === null ? null : { porcentaje: f.costo_por_orden_pct, minimo: f.costo_por_orden_minimo },
    },
    entrada: f.ciclo_ancla,
    precioDelPeriodo: precioDelHistorial(f.precio_del_periodo.precio_mensual, f.precio_del_periodo.descuentos),
    pendiente: c === null ? null : pendienteDeEmpresa(c.plan_nombre, c.tipo_cobro, c.desde),
    uso: { ordenes: f.uso.ordenes, apiKeys: f.uso.api_keys, porRol },
    cambio: f.cambio === null ? null : { vigenteDesde: f.cambio.vigente_desde, version: f.cambio.version },
    costoVigente: costoVigenteDeLaTarifa(f.costo_vigente),
    cobroCiclo: f.cobro_ciclo,
    tipoCobro: f.tipo_cobro,
  };
}

function formaInesperada(error: z.ZodError): Error {
  return new Error(`MiPlanRepository.planDeLaEmpresa: plan_de_la_empresa devolvió una forma inesperada: ${error.message}`);
}

export class MiPlanRepository implements IMiPlanRepository {
  constructor(private readonly prisma: MiPlanPrismaClient) {}

  async planDeLaEmpresa(): Promise<LecturaDeMiPlan> {
    const filas = await this.prisma.$queryRaw<{ plan: unknown }[]>`
      SELECT plan_de_la_empresa(current_setting('app.organizacion_id', true)) AS "plan"`;
    const crudo = filas[0]?.plan ?? null;
    if (crudo === null) return null;
    // Según el driver, el `jsonb` llega ya parseado o como texto.
    const valor: unknown = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
    if (typeof valor === "object" && valor !== null && "sin_plan" in valor) {
      const sinPlan = sinPlanFilaSchema.safeParse(valor);
      if (!sinPlan.success) throw formaInesperada(sinPlan.error);
      const c = sinPlan.data.cambio_empresa;
      return { sinPlan: true, pendiente: pendienteDeEmpresa(c.plan_nombre, c.tipo_cobro, c.desde) };
    }
    const fila = planDeLaEmpresaFilaSchema.safeParse(valor);
    if (!fila.success) throw formaInesperada(fila.error);
    return aLeido(fila.data);
  }
}
