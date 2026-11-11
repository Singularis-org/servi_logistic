import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import type { CuotaDeLaFactura, FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";
import { ESTADOS_FACTURA, PERIODICIDADES_FACTURA } from "@/lib/types/factura-plataforma";
import { tipoCobroSchema } from "@/lib/types/planes";

// SLT-118 (design §2.5, §3, §4) — las facturas de la plataforma. Ningún método escribe la tabla: el cierre
// lo hace `factura_plataforma_cerrar`, del dueño, con `REVOKE EXECUTE … FROM PUBLIC`. Por eso corre como
// plataforma (sin `servi_app`), igual que el cambio de plan que llama a `factura_plataforma_tomar_cambio`.
// `FichaJira` no admite `SLT` (deuda D29): lleva `SL-24`, la ficha de los planes.
//
// `deLaEmpresa` (design §2.6; R21, R24) es lo contrario: corre en la empresa de la sesión, como `servi_app`,
// sin `comoPlataforma`. Las cerradas las filtra la RLS además del `WHERE`; las no cerradas solo salen por
// `factura_plataforma_en_curso`, que rechaza otra empresa con 42501.

type FacturaPlataformaPrismaClient = Pick<PrismaClient, "$queryRaw" | "organizacion">;

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base (la forma de `PlanesRepository`). */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

/* -------------------------------------------------------------------------- */
/* El borde jsonb de la lectura                                                */
/* -------------------------------------------------------------------------- */

/** `TIMESTAMP` sin zona, que el `jsonb` serializa sin sufijo: sus números son UTC (decisión de SL-24). */
const instanteUtcSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)
  .transform((s) => new Date(`${s}Z`));

// Los importes llegan como texto de un `numeric`; algunos sin la escala (`plan_costo_del_periodo` sí la
// fija, una suma no siempre). Se normalizan a dos decimales en `Decimal`: un `number` perdería céntimos.
const importeSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform((s) => new Prisma.Decimal(s).toFixed(2));

const conteo = z.int().min(0);

const cuotaSchema = z
  .object({
    plan_id: z.string(),
    plan_nombre: z.string(),
    tipo_cobro: tipoCobroSchema,
    desde: instanteUtcSchema,
    hasta: instanteUtcSchema,
    precio_mensual: importeSchema,
    cuota: importeSchema,
    dias_cobrados: conteo,
    dias_periodo: conteo,
  })
  .nullable();

/** Lo que tienen las dos formas: la cerrada (columnas de la tabla) y la de `factura_plataforma_en_curso`. */
const comunSchema = z.object({
  id: z.string(),
  desde: instanteUtcSchema,
  hasta: instanteUtcSchema,
  periodicidad: z.enum(PERIODICIDADES_FACTURA),
  plan_id: z.string().nullable(),
  plan_nombre: z.string().nullable(),
  tipo_cobro: tipoCobroSchema.nullable(),
  cargos: importeSchema,
  reversos: importeSchema,
  movimientos: conteo,
  total_ordenes: importeSchema,
  total: importeSchema,
});

const cerradaSchema = comunSchema.extend({
  numero: z.int().min(1),
  cuota: cuotaSchema,
  primera_cuota: cuotaSchema,
  cerrada_at: instanteUtcSchema,
});

const noCerradaSchema = comunSchema.extend({
  estado: z.enum(ESTADOS_FACTURA).exclude(["cerrada"]),
  hasta_previsto: z.boolean(),
  cuota_prevista: cuotaSchema,
  primera_cuota_prevista: cuotaSchema,
});

const lecturaSchema = z.object({
  cerradas: z.array(cerradaSchema),
  enCurso: z.array(noCerradaSchema),
});

type CuotaLeida = z.infer<typeof cuotaSchema>;
type ComunLeido = z.infer<typeof comunSchema>;

function aCuota(c: CuotaLeida): CuotaDeLaFactura | null {
  if (c === null) return null;
  return {
    planId: c.plan_id,
    planNombre: c.plan_nombre,
    tipoCobro: c.tipo_cobro,
    desde: c.desde,
    hasta: c.hasta,
    precioMensual: c.precio_mensual,
    cuota: c.cuota,
    diasCobrados: c.dias_cobrados,
    diasPeriodo: c.dias_periodo,
  };
}

/** El plan de las órdenes va entero o no va (CHECK `factura_plataforma_plan`). */
function aPlan(f: ComunLeido): FacturaPlataformaDTO["plan"] {
  if (f.plan_id === null || f.plan_nombre === null || f.tipo_cobro === null) return null;
  return { planId: f.plan_id, planNombre: f.plan_nombre, tipoCobro: f.tipo_cobro };
}

function comun(f: ComunLeido) {
  return {
    id: f.id,
    desde: f.desde,
    hasta: f.hasta,
    periodicidad: f.periodicidad,
    plan: aPlan(f),
    cargos: f.cargos,
    reversos: f.reversos,
    movimientos: f.movimientos,
    totalOrdenes: f.total_ordenes,
    total: f.total,
  };
}

// Las cerradas con la forma de `factura_plataforma_en_curso` (mismos nombres y los importes en texto), para
// validarlas con el mismo esquema. Las cuotas emitidas: un grupo entero o `null` (CHECK de la tabla).
const CERRADAS_JSON = Prisma.sql`
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', f."id", 'numero', f."numero", 'desde', f."desde_at", 'hasta', f."hasta_at",
      'periodicidad', f."periodicidad", 'plan_id', f."plan_id", 'plan_nombre', f."plan_nombre",
      'tipo_cobro', f."tipo_cobro", 'cargos', f."cargos"::text, 'reversos', f."reversos"::text,
      'movimientos', f."movimientos", 'total_ordenes', f."total_ordenes"::text,
      'cuota', CASE WHEN f."cuota" IS NOT NULL THEN jsonb_build_object(
        'plan_id', f."cuota_plan_id", 'plan_nombre', f."cuota_plan_nombre", 'tipo_cobro', f."cuota_tipo_cobro",
        'desde', f."cuota_desde_at", 'hasta', f."cuota_hasta_at", 'precio_mensual', f."precio_mensual"::text,
        'cuota', f."cuota"::text, 'dias_cobrados', f."dias_cobrados", 'dias_periodo', f."dias_periodo") END,
      'primera_cuota', CASE WHEN f."primera_cuota" IS NOT NULL THEN jsonb_build_object(
        'plan_id', f."primera_cuota_plan_id", 'plan_nombre', f."primera_cuota_plan_nombre",
        'tipo_cobro', f."primera_cuota_tipo_cobro", 'desde', f."primera_cuota_desde_at",
        'hasta', f."primera_cuota_hasta_at", 'precio_mensual', f."primera_cuota_precio_mensual"::text,
        'cuota', f."primera_cuota"::text, 'dias_cobrados', f."primera_cuota_dias_cobrados",
        'dias_periodo', f."primera_cuota_dias_periodo") END,
      'total', f."total"::text, 'cerrada_at', f."cerrada_at") ORDER BY f."desde_at")
      FROM "factura_plataforma" f
     WHERE f."organizacion_id" = current_setting('app.organizacion_id', true) AND f."estado" = 'cerrada'
  ), '[]'::jsonb)`;

/** Según el driver, el `jsonb` llega ya parseado o como texto. */
const comoJson = (v: unknown): unknown => (typeof v === "string" ? (JSON.parse(v) as unknown) : v);

export class FacturaPlataformaRepository implements IFacturaPlataformaRepository {
  constructor(private readonly prisma: FacturaPlataformaPrismaClient) {}

  empresasACerrar(): Promise<string[]> {
    return comoPlataforma("SL-24", "SLT-118: listar las empresas para cerrar sus facturas de la plataforma", async () => {
      const filas = await this.prisma.organizacion.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
      return filas.map((f) => f.id);
    });
  }

  cerrar(organizacionId: string, ahora: Date): Promise<number> {
    return comoPlataforma("SL-24", "SLT-118: cerrar las facturas de la plataforma de una empresa (R3, R11)", async () => {
      // Una sola sentencia: su propia transacción. La función toma la empresa en FOR UPDATE, así que dos
      // cierres, o un cierre y un cambio de plan, de la misma empresa se serializan (R11).
      const [fila] = await this.prisma.$queryRaw<{ cerradas: number }[]>`
        SELECT factura_plataforma_cerrar(${organizacionId}, ${comoTimestamp(ahora)}::timestamp) AS "cerradas"`;
      return fila?.cerradas ?? 0;
    });
  }

  async deLaEmpresa(): Promise<FacturaPlataformaDTO[]> {
    // Una sola sentencia: una sola foto. En dos, un cierre entre ambas haría que una factura saliera dos veces
    // (por cerrar y cerrada) o ninguna.
    const filas = await this.prisma.$queryRaw<{ enCurso: unknown; cerradas: unknown }[]>`
      SELECT factura_plataforma_en_curso(current_setting('app.organizacion_id', true)) AS "enCurso",
             ${CERRADAS_JSON} AS "cerradas"`;
    const leida = lecturaSchema.safeParse({ enCurso: comoJson(filas[0]?.enCurso), cerradas: comoJson(filas[0]?.cerradas) });
    if (!leida.success) {
      throw new Error(`FacturaPlataformaRepository.deLaEmpresa: la base devolvió una forma inesperada: ${leida.error.message}`);
    }
    const cerradas: FacturaPlataformaDTO[] = leida.data.cerradas.map((f) => ({
      ...comun(f),
      estado: "cerrada",
      numero: f.numero,
      hastaPrevisto: false,
      cuota: aCuota(f.cuota),
      primeraCuota: aCuota(f.primera_cuota),
      cerradaAt: f.cerrada_at,
    }));
    const noCerradas: FacturaPlataformaDTO[] = leida.data.enCurso.map((f) => ({
      ...comun(f),
      estado: f.estado,
      numero: null,
      hastaPrevisto: f.hasta_previsto,
      cuota: aCuota(f.cuota_prevista),
      primeraCuota: aCuota(f.primera_cuota_prevista),
      cerradaAt: null,
    }));
    // Las cerradas siempre van antes (R1: sin huecos ni solapes); las dos listas ya vienen por `desde`.
    return [...cerradas, ...noCerradas];
  }
}
