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
