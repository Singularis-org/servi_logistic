import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import { encolarEnEmpresas } from "@/lib/repositories/_shared/encolar-en-empresas";
import { JobRepository } from "@/lib/repositories/JobRepository";
import type {
  CuotaDeLaFactura,
  DatosDescargaFactura,
  DetalleDeFactura,
  FacturaPlataformaDTO,
  LineaDeFactura,
  MovimientoDeFactura,
  PaginaDeLineas,
} from "@/lib/types/factura-plataforma";
import { ESTADOS_FACTURA, LINEAS_POR_PAGINA, PERIODICIDADES_FACTURA } from "@/lib/types/factura-plataforma";
import { tipoCobroSchema } from "@/lib/types/planes";

// SLT-118 (design §2.5, §3, §4) — las facturas de la plataforma. Ningún método escribe la tabla: el cierre
// lo hace `factura_plataforma_cerrar`, del dueño, con `REVOKE EXECUTE … FROM PUBLIC`. Por eso corre como
// plataforma (sin `servi_app`), igual que el cambio de plan que llama a `factura_plataforma_tomar_cambio`.
// `FichaJira` no admite `SLT` (deuda D29): lleva `SL-24`, la ficha de los planes. SLT-136 (§7.1): `cerrar`
// encola además, en su misma transacción, el aviso `factura_plataforma_aviso` de cada factura que cerró.
//
// `deLaEmpresa` (design §2.6; R21, R24) es lo contrario: corre en la empresa de la sesión, como `servi_app`,
// sin `comoPlataforma`. Las cerradas las filtra la RLS además del `WHERE`; las no cerradas solo salen por
// `factura_plataforma_en_curso`, que rechaza otra empresa con 42501.
//
// `deEmpresaParaPlataforma` (T8.1; R23, R24) es la misma lectura para el superadmin, que no tiene empresa: fija
// la de la factura con `conEmpresa`, el camino de los jobs por empresa (decisión del 2026-11-11). Así la
// extensión baja a `servi_app` con esa empresa y la base la acota igual que a la empresa misma.

// SLT-119 (design §2): las líneas del detalle salen de la traza de SLT-85 (`cobroPlataformaTraza`), con la página
// y su total en una transacción `repeatable read`. `$transaction` es opcional porque el tipo del cliente de una
// transacción (`Prisma.TransactionClient`) no lo declara; sin él, ya se está dentro de una.
type FacturaPlataformaPrismaClient = Pick<
  PrismaClient,
  "$queryRaw" | "$executeRaw" | "organizacion" | "cobroPlataformaTraza"
> & {
  $transaction?: PrismaClient["$transaction"];
};
type LectorDeTraza = Pick<PrismaClient, "cobroPlataformaTraza">;
type LectorDeDescarga = Pick<PrismaClient, "cobroPlataformaTraza" | "$queryRaw">;
type ClienteDelCierre = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

/** `dedupe_key` del aviso de una factura cerrada (SLT-136 §7.1): un trabajo por factura, aunque se encole dos veces. */
export function dedupeAvisoFactura(facturaId: string): string {
  return `factura_plataforma_aviso:${facturaId}`;
}

/**
 * SLT-136 (§7.1, R21): cierra y, en la MISMA transacción, encola el aviso de cada factura que cerró esta llamada.
 * La función del dueño fija `cerrada_at = p_ahora`, así que las de esta llamada son las cerradas con ese instante.
 * Si el cierre no se confirma, no queda ningún trabajo; si se repite, la `dedupe_key` no duplica nada.
 */
async function cerrarYEncolarAvisos(c: ClienteDelCierre, organizacionId: string, ahora: Date): Promise<number> {
  // La función toma la empresa en FOR UPDATE y el candado dura hasta el commit: dos cierres, o un cierre y un
  // cambio de plan, de la misma empresa se serializan (SLT-118 R11).
  const [fila] = await c.$queryRaw<{ cerradas: number }[]>`
    SELECT factura_plataforma_cerrar(${organizacionId}, ${comoTimestamp(ahora)}::timestamp) AS "cerradas"`;
  const cerradas = await c.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "factura_plataforma"
     WHERE "organizacion_id" = ${organizacionId} AND "estado" = 'cerrada'
       AND "cerrada_at" = ${comoTimestamp(ahora)}::timestamp
     ORDER BY "numero"`;
  const jobs = new JobRepository(c);
  await encolarEnEmpresas(
    c,
    cerradas.map(({ id }) => ({
      organizacionId,
      encolar: () => jobs.enqueue("factura_plataforma_aviso", { facturaId: id }, { dedupeKey: dedupeAvisoFactura(id) }, c),
    })),
  );
  return fila?.cerradas ?? 0;
}

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

/* -------------------------------------------------------------------------- */
/* SLT-119: las líneas de una factura                                          */
/* -------------------------------------------------------------------------- */

const SELECT_LINEA = { id: true, cobradoAt: true, numGuia: true, tipoMovimiento: true, valorCobrado: true } as const;

/**
 * R7, R10: una página de las líneas de `[desde, hasta)` por `(cobrado_at, id)` y el total de la factura entera.
 * La empresa la ponen la extensión del cliente (`MODELOS_DE_NEGOCIO`) y la RLS; usa el índice
 * `(organizacion_id, cobrado_at)`.
 */
async function paginaDeLineas(c: LectorDeTraza, desde: Date, hasta: Date, pagina: number): Promise<PaginaDeLineas> {
  const where = { cobradoAt: { gte: desde, lt: hasta } };
  const filas = await c.cobroPlataformaTraza.findMany({
    where,
    orderBy: [{ cobradoAt: "asc" }, { id: "asc" }],
    skip: (pagina - 1) * LINEAS_POR_PAGINA,
    take: LINEAS_POR_PAGINA,
    select: SELECT_LINEA,
  });
  const total = await c.cobroPlataformaTraza.count({ where });
  const lineas: LineaDeFactura[] = filas.map((f) => ({
    id: f.id,
    instante: f.cobradoAt,
    numGuia: f.numGuia,
    tipo: f.tipoMovimiento,
    valor: f.valorCobrado.toFixed(2),
  }));
  return { lineas, pagina, porPagina: LINEAS_POR_PAGINA, total };
}

/* -------------------------------------------------------------------------- */
/* SLT-136: los datos de la descarga                                           */
/* -------------------------------------------------------------------------- */

/**
 * R1, R6 (design §2.2): todos los movimientos de `[desde, hasta)` por `(cobrado_at, id)`, con la remisión de su
 * orden, y el nombre de la empresa del contexto. La remisión sale por la relación: el borrado de una orden es
 * lógico (`deleted_at`) y ni la extensión ni la RLS de `orden` lo filtran, así que la de una orden eliminada
 * también sale (lo prueba `factura-plataforma-descarga.test.ts`).
 */
async function leerDescarga(
  c: LectorDeDescarga,
  desde: Date,
  hasta: Date,
): Promise<{ empresaNombre: string | null; movimientos: MovimientoDeFactura[] }> {
  const filas = await c.cobroPlataformaTraza.findMany({
    where: { cobradoAt: { gte: desde, lt: hasta } },
    orderBy: [{ cobradoAt: "asc" }, { id: "asc" }],
    select: { ...SELECT_LINEA, orden: { select: { numRemision: true } } },
  });
  // El `WHERE` por la empresa del contexto además de la RLS de `organizacion` (la de `CERRADAS_JSON`).
  const [empresa] = await c.$queryRaw<{ nombre: string }[]>`
    SELECT "nombre" FROM "organizacion" WHERE "id" = current_setting('app.organizacion_id', true)`;
  const movimientos: MovimientoDeFactura[] = filas.map((f) => ({
    id: f.id,
    instante: f.cobradoAt,
    numGuia: f.numGuia,
    numRemision: f.orden.numRemision,
    tipo: f.tipoMovimiento,
    valor: f.valorCobrado.toFixed(2),
  }));
  return { empresaNombre: empresa?.nombre ?? null, movimientos };
}

export class FacturaPlataformaRepository implements IFacturaPlataformaRepository {
  constructor(private readonly prisma: FacturaPlataformaPrismaClient) {}

  empresasACerrar(): Promise<string[]> {
    return comoPlataforma("SL-24", "SLT-118: listar las empresas para cerrar sus facturas de la plataforma", async () => {
      const filas = await this.prisma.organizacion.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
      return filas.map((f) => f.id);
    });
  }

  cerrar(organizacionId: string, ahora: Date): Promise<number> {
    return comoPlataforma("SL-24", "SLT-118: cerrar las facturas de la plataforma de una empresa (R3, R11)", () =>
      // SLT-136 R21: cierre y avisos se confirman o se pierden juntos. Sin `$transaction`, ya se está en una.
      this.prisma.$transaction === undefined
        ? cerrarYEncolarAvisos(this.prisma, organizacionId, ahora)
        : this.prisma.$transaction((tx) => cerrarYEncolarAvisos(tx, organizacionId, ahora)),
    );
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

  deEmpresaParaPlataforma(organizacionId: string): Promise<FacturaPlataformaDTO[]> {
    // Dentro de `comoPlataforma` también: el `conEmpresa` de dentro manda mientras dura la lectura.
    return conEmpresa(organizacionId, () => this.deLaEmpresa());
  }

  async detalleDeLaEmpresa(facturaId: string, pagina: number): Promise<DetalleDeFactura | null> {
    // La cabecera, de la misma lectura que la lista (R5): cuotas, previstas, total parcial y `hasta` previsto.
    // Otra empresa en el contexto no la ve (RLS y `WHERE` de `CERRADAS_JSON`; 42501 en la en curso): `null` (R14).
    const factura = (await this.deLaEmpresa()).find((f) => f.id === facturaId);
    if (factura === undefined) return null;
    // Dos sentencias, no una (design §2): si la factura se cierra entre la cabecera y las líneas, su intervalo
    // `[desde, hasta)` no cambia, así que las líneas siguen siendo las suyas. En la no cerrada, `hasta` es el fin
    // previsto y no hay movimientos futuros: salen las líneas hasta ahora (R11).
    const leer = (c: LectorDeTraza) => paginaDeLineas(c, factura.desde, factura.hasta, pagina);
    // Página y total de la misma foto: `repeatable read` fija el snapshot en la primera sentencia.
    const lineas =
      this.prisma.$transaction === undefined
        ? await leer(this.prisma)
        : await this.prisma.$transaction((tx) => leer(tx), { isolationLevel: "RepeatableRead" });
    return { factura, lineas };
  }

  detalleParaPlataforma(organizacionId: string, facturaId: string, pagina: number): Promise<DetalleDeFactura | null> {
    // El camino de `deEmpresaParaPlataforma`: `servi_app` con esa empresa fijada, sin `comoPlataforma`.
    return conEmpresa(organizacionId, () => this.detalleDeLaEmpresa(facturaId, pagina));
  }

  async datosDescargaDeLaEmpresa(facturaId: string): Promise<DatosDescargaFactura | null> {
    // La cabecera, de la misma lectura que la lista (R1). Otra empresa no la ve (RLS y `WHERE` de
    // `CERRADAS_JSON`); en curso o por cerrar no se descarga (R4).
    const factura = (await this.deLaEmpresa()).find((f) => f.id === facturaId);
    if (factura === undefined || factura.estado !== "cerrada") return null;
    // Movimientos y empresa de la misma foto (`repeatable read`). Sin `$transaction`, ya se está en una.
    // La cabecera de arriba (`deLaEmpresa()`) se lee FUERA de esa foto. Es inocuo: la factura ya está cerrada,
    // así que ni ella ni su traza en `[desde, hasta)` cambian entre las dos lecturas, y si algo descuadrara, la
    // conciliación de R15 lo detectaría al armar el archivo.
    const leer = (c: LectorDeDescarga) => leerDescarga(c, factura.desde, factura.hasta);
    const leido =
      this.prisma.$transaction === undefined
        ? await leer(this.prisma)
        : await this.prisma.$transaction((tx) => leer(tx), { isolationLevel: "RepeatableRead" });
    // Sin empresa visible en el contexto tampoco se habría visto la factura; por si acaso, `null`.
    if (leido.empresaNombre === null) return null;
    return { factura, empresaNombre: leido.empresaNombre, movimientos: leido.movimientos };
  }

  datosDescargaParaPlataforma(organizacionId: string, facturaId: string): Promise<DatosDescargaFactura | null> {
    // El camino de `detalleParaPlataforma`: `servi_app` con esa empresa fijada, sin `comoPlataforma` (R2).
    return conEmpresa(organizacionId, () => this.datosDescargaDeLaEmpresa(facturaId));
  }
}
