import { z } from "zod";

import type { TipoCobro } from "@/lib/types/planes";

// SLT-118 (design §1.1, §2.6, §3) — la factura de la plataforma a una empresa, cerrada o en curso.
//
// Una factura es el intervalo de órdenes `[desde, hasta)`, que se emite en `hasta`. Lleva tres grupos:
//   · el plan de las órdenes y su `periodicidad` (la de órdenes del plan al abrirla, o `quincenal` sin plan);
//   · la cuota de la emisión (R8): el período de cobro completo que empieza en `hasta`, con el plan de la
//     factura siguiente;
//   · la primera cuota de un plan (R16, R28, R29): el tramo que empieza en su marca. Puede llevar las dos (P18).
// En una cerrada, las cuotas son las emitidas (columnas de `factura_plataforma`); en una en curso o por cerrar,
// las previstas (`factura_plataforma_en_curso`), cada una `null` cuando no la llevará. Los importes van como
// texto con dos decimales, como el resto del dinero de la plataforma. La escriben solo las funciones del dueño
// en la base (R22); la app solo lee.

export const ESTADOS_FACTURA = ["en_curso", "por_cerrar", "cerrada"] as const;
/** CHECK `factura_plataforma_estado_check`. */
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

/**
 * CHECK `factura_plataforma_periodicidad_check`: los cortes de las órdenes (R2). Es la misma lista que
 * `plan.periodicidad_ordenes` (R35).
 */
export const PERIODICIDADES_FACTURA = ["quincenal", "mensual"] as const;
export type PeriodicidadFactura = (typeof PERIODICIDADES_FACTURA)[number];

/** El plan de las órdenes de la factura (R5). `null` en la factura sin plan. */
export interface PlanDeLaFactura {
  planId: string;
  planNombre: string;
  tipoCobro: TipoCobro;
}

/**
 * Una cuota, emitida o prevista: su plan, su tramo `[desde, hasta)`, el precio mensual del historial que
 * rige al empezar el tramo, el importe y sus días de calendario (iguales salvo en una primera cuota
 * prorrateada, R29). Es la forma de cada grupo de columnas (`cuota_*`, `primera_cuota_*`) y de
 * `cuota_prevista` / `primera_cuota_prevista` de `factura_plataforma_en_curso`.
 */
export interface CuotaDeLaFactura {
  planId: string;
  planNombre: string;
  tipoCobro: TipoCobro;
  desde: Date;
  hasta: Date;
  precioMensual: string;
  cuota: string;
  diasCobrados: number;
  diasPeriodo: number;
}

export interface FacturaPlataformaDTO {
  id: string;
  estado: EstadoFactura;
  /** R14: correlativo por empresa desde 1; solo la cerrada lo tiene. */
  numero: number | null;
  desde: Date;
  /** El fin, excluido, y la emisión: el fijado o, en la en curso, el previsto por su periodicidad. */
  hasta: Date;
  /** `true` solo en la en curso: `hasta` sale de la periodicidad y aún no está fijado. */
  hastaPrevisto: boolean;
  periodicidad: PeriodicidadFactura;
  plan: PlanDeLaFactura | null;
  cargos: string;
  /** En positivo. */
  reversos: string;
  movimientos: number;
  totalOrdenes: string;
  /** La cuota de la emisión (R8): emitida en la cerrada, prevista en las demás; `null` si no la lleva. */
  cuota: CuotaDeLaFactura | null;
  /** La primera cuota de un plan (R16, R28, R29): emitida o prevista; `null` si no la lleva. */
  primeraCuota: CuotaDeLaFactura | null;
  /** Total de órdenes + cuota + primera cuota; en la no cerrada, el parcial hasta ahora (R24). */
  total: string;
  cerradaAt: Date | null;
}

/* -------------------------------------------------------------------------- */
/* SLT-119 (design §3) — las pantallas de facturas: líneas, detalle y bordes   */
/* -------------------------------------------------------------------------- */

/** Una línea es un movimiento de la traza de SLT-85: un cargo o un reverso de una orden. */
export const TIPOS_LINEA_FACTURA = ["cargo", "reverso"] as const;
export type TipoLineaFactura = (typeof TIPOS_LINEA_FACTURA)[number];

/** R7, R9: una fila de `cobro_plataforma_traza` con `cobrado_at` en `[desde, hasta)` de la factura. */
export interface LineaDeFactura {
  id: string;
  /** `cobrado_at`: el instante del movimiento. */
  instante: Date;
  /** `null` si la traza no lo guardó (R9). */
  numGuia: number | null;
  tipo: TipoLineaFactura;
  /** Con signo y dos decimales: un reverso ya es ≤ 0 por el CHECK de la traza. */
  valor: string;
}

/** R10: una página de líneas y el total de la factura entera. */
export interface PaginaDeLineas {
  lineas: LineaDeFactura[];
  pagina: number;
  porPagina: number;
  total: number;
}

/** R6–R11: la cabecera (la misma lectura que la lista) y una página de sus líneas. */
export interface DetalleDeFactura {
  factura: FacturaPlataformaDTO;
  lineas: PaginaDeLineas;
}

/** P3: páginas de 100 líneas leídas en el servidor. */
export const LINEAS_POR_PAGINA = 100;

export type FacturasResult = { estado: "ok"; facturas: FacturaPlataformaDTO[] } | { estado: "forbidden" };

export type DetalleFacturaResult =
  | { estado: "ok"; detalle: DetalleDeFactura }
  | { estado: "forbidden" }
  | { estado: "not_found" }
  | { estado: "validation_error"; errores: Record<string, string> };

/** R15: el detalle que pide el maestro (la empresa es la de la sesión). */
export const detalleFacturaSchema = z.object({
  facturaId: z.uuid(),
  pagina: z.int().min(1).default(1),
});
export type DetalleFacturaInput = z.infer<typeof detalleFacturaSchema>;

/** R15: el detalle que pide el superadmin, de la empresa que nombra. */
export const detalleFacturaEmpresaSchema = detalleFacturaSchema.extend({ organizacionId: z.uuid() });
export type DetalleFacturaEmpresaInput = z.infer<typeof detalleFacturaEmpresaSchema>;

/** R12, R15: la lista que pide el superadmin, de la empresa que nombra. */
export const facturasDeEmpresaSchema = z.object({ organizacionId: z.uuid() });
