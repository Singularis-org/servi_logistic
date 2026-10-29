import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { IMiPlanRepository, PlanDeLaEmpresaLeido } from "@/lib/interfaces/repositories/IMiPlanRepository";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { type PrecioPlan, type RolConTope, type TopesPlan, versionPlanSchema } from "@/lib/types/planes";

// SLT-58 (design §2, §3.1) — «Mi plan» lee por `plan_de_la_empresa`, la segunda y última función que
// `servi_app` puede ejecutar: las tablas `plan*` siguen cerradas a la app (R9).
//
// La empresa es la que la extensión fijó en `app.organizacion_id`, igual que `CupoPlanRepository`: en
// una lectura por sesión `contextoActual()` vendría vacío. La función exige que el argumento sea esa
// misma empresa (`42501` si no), así que no hay forma de pedir el plan de otra.
//
// El `jsonb` es un borde sin tipar: se valida con zod antes de salir de aquí. La `version` del cambio
// programado se valida con `versionPlanSchema`, el mismo que usa el aplicador (SL-24 T11).
type MiPlanPrismaClient = Pick<PrismaClient, "$queryRaw">;

/** `TIMESTAMP` sin zona, que `to_jsonb` serializa sin sufijo: sus números son UTC (decisión de SL-24). */
const instanteUtcSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)
  .transform((s) => new Date(`${s}Z`));

const conteo = z.int().min(0);
const importe = z.string().nullable();

/** La base usa la etiqueta de Postgres (`'Admin Tienda'`); la app, la clave de `RolValue`. */
const ROL_DE_LA_ETIQUETA: Readonly<Record<string, RolConTope>> = {
  maestro: "maestro",
  admin: "admin",
  mensajero: "mensajero",
  "Admin Tienda": "adminTienda",
  adminSatelite: "adminSatelite",
};

export const planDeLaEmpresaFilaSchema = z.object({
  nombre: z.string(),
  precio_negociable: z.boolean(),
  precio_mensual: importe,
  precio_anual: importe,
  descuento_anual_pct: importe,
  tope_ordenes_ciclo: conteo.nullable(),
  tope_api_keys: conteo.nullable(),
  topes_rol: z.array(z.object({ rol: z.string(), maximo: conteo })),
  modulos: z.array(z.enum(ORDEN_MODULOS)),
  ciclo_ancla: instanteUtcSchema,
  uso: z.object({
    ordenes: conteo,
    api_keys: conteo,
    maestro: conteo,
    admin: conteo,
    mensajero: conteo,
    admin_tienda: conteo,
    admin_satelite: conteo,
  }),
  cambio: z.object({ vigente_desde: instanteUtcSchema, version: versionPlanSchema }).nullable(),
});

type FilaPlanDeLaEmpresa = z.infer<typeof planDeLaEmpresaFilaSchema>;

/** Las mismas cinco formas que `precioDe` de `PlanesRepository` (CHECK `plan_precio_forma`). */
function precioDe(f: FilaPlanDeLaEmpresa): PrecioPlan {
  if (f.precio_negociable) return { tipo: "negociable" };
  if (f.precio_mensual === null) return { tipo: "sin_precio" };
  const anual =
    f.precio_anual !== null
      ? { tipo: "fijo" as const, monto: f.precio_anual }
      : f.descuento_anual_pct !== null
        ? { tipo: "descuento" as const, porcentaje: f.descuento_anual_pct }
        : null;
  return { tipo: "monto", mensual: f.precio_mensual, anual };
}

function topesDe(f: FilaPlanDeLaEmpresa): TopesPlan {
  const porRol: TopesPlan["porRol"] = {};
  for (const t of f.topes_rol) {
    const rol = ROL_DE_LA_ETIQUETA[t.rol];
    if (rol !== undefined) porRol[rol] = t.maximo;
  }
  return { ordenesPorCiclo: f.tope_ordenes_ciclo, porRol, apiKeys: f.tope_api_keys };
}

function aLeido(f: FilaPlanDeLaEmpresa): PlanDeLaEmpresaLeido {
  const porRol: Record<RolConTope, number> = {
    maestro: f.uso.maestro,
    admin: f.uso.admin,
    mensajero: f.uso.mensajero,
    adminTienda: f.uso.admin_tienda,
    adminSatelite: f.uso.admin_satelite,
  };
  return {
    vigente: { nombre: f.nombre, topes: topesDe(f), modulos: f.modulos, precio: precioDe(f) },
    ancla: f.ciclo_ancla,
    uso: { ordenes: f.uso.ordenes, apiKeys: f.uso.api_keys, porRol },
    cambio: f.cambio === null ? null : { vigenteDesde: f.cambio.vigente_desde, version: f.cambio.version },
  };
}

export class MiPlanRepository implements IMiPlanRepository {
  constructor(private readonly prisma: MiPlanPrismaClient) {}

  async planDeLaEmpresa(): Promise<PlanDeLaEmpresaLeido | null> {
    const filas = await this.prisma.$queryRaw<{ plan: unknown }[]>`
      SELECT plan_de_la_empresa(current_setting('app.organizacion_id', true)) AS "plan"`;
    const crudo = filas[0]?.plan ?? null;
    if (crudo === null) return null;
    // Según el driver, el `jsonb` llega ya parseado o como texto.
    const valor: unknown = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
    const fila = planDeLaEmpresaFilaSchema.safeParse(valor);
    if (!fila.success) {
      throw new Error(`MiPlanRepository.planDeLaEmpresa: plan_de_la_empresa devolvió una forma inesperada: ${fila.error.message}`);
    }
    return aLeido(fila.data);
  }
}
