import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { diasDelPeriodo, diasDelTramo, finDelPeriodoCalendario, periodoEnCurso } from "@/lib/planes/ciclo";
import type { CobroDelPlan, PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import {
  TIPOS_COBRO,
  type AccionDeAsignacion,
  type PrecioPlan,
  type TipoCobro,
  type TipoDeAsignacion,
} from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

// Ajuste planes-custom (D7–D9) y SLT-86 (design §4; R9, R10, R12, R15, R27, R30) — lo que la empresa
// paga por su plan en el período en curso de calendario y cuándo toca el siguiente cobro. Puro y sin
// `@prisma/client`: llega a componentes cliente por `consumo.ts`. Solo informa: nada de aquí escribe en
// `wallet_movimiento` ni en `cobro_plataforma_movimiento` (SL-24 D4, SLT-66 R21), y ningún descuento ni
// tipo toca el costo por orden (R13).

/** 100 % en centésimas de punto: el porcentaje llega con dos decimales (`porcentajeSchema`). */
const CIEN_POR_CIENTO = BigInt(10_000);
const CERO = BigInt(0);
const DOS = BigInt(2);

/** R9: cuántos meses vale un período, como fracción `num / den` para no salir de los enteros. */
const FACTOR: Record<TipoCobro, { num: bigint; den: bigint }> = {
  quincenal: { num: BigInt(1), den: BigInt(2) },
  mensual: { num: BigInt(1), den: BigInt(1) },
  bimestral: { num: BigInt(2), den: BigInt(1) },
  anual: { num: BigInt(12), den: BigInt(1) },
};

/**
 * `num / den` al céntimo, la mitad hacia arriba (`round(numeric, 2)` de Postgres con importes no
 * negativos). La división entera de no negativos trunca; sumar medio divisor antes la vuelve redondeo.
 */
function redondear(num: bigint, den: bigint): bigint {
  return (num + den / DOS) / den;
}

/**
 * R9, R10 — el costo base de UN período completo, en decimal exacto con un solo redondeo final.
 * `null` si el plan no tiene costo base («sin precio»): por definir en todos los períodos.
 *
 * Con un monto fijo se redondea antes el costo del período y luego se resta: el monto es un importe
 * con céntimos, así que restar no añade otro redondeo. Nunca baja de 0.00 (R10).
 */
export function montoDelPeriodo(precio: PrecioPlan, tipo: TipoCobro): string | null {
  if (precio.tipo !== "monto") return null;
  const mensual = aCentimos(precio.mensual);
  const { num, den } = FACTOR[tipo];
  const descuento = precio.descuentos[tipo];
  if (descuento?.tipo === "porcentaje") {
    const queda = CIEN_POR_CIENTO - aCentimos(descuento.porcentaje);
    return aTexto(redondear(mensual * num * queda, den * CIEN_POR_CIENTO));
  }
  const bruto = redondear(mensual * num, den);
  if (descuento?.tipo === "monto") {
    const neto = bruto - aCentimos(descuento.monto);
    return aTexto(neto < CERO ? CERO : neto);
  }
  return aTexto(bruto);
}

/**
 * R12 — el costo de un tramo: el del período ya redondeado por los días del tramo entre los del
 * período de calendario. Son dos redondeos, cada uno explícito, porque así lo dice la decisión
 * («costo del período × días ÷ días»; design §4).
 */
export function costoDelTramo(costoPeriodo: string, diasTramo: number, diasPeriodo: number): string {
  return aTexto(redondear(aCentimos(costoPeriodo) * BigInt(diasTramo), BigInt(diasPeriodo)));
}

/**
 * R12, R15 — el costo base del período en curso de una empresa. `precio` es el vigente al EMPEZAR ese
 * período o tramo (`precio_del_periodo` de `plan_de_la_empresa`): lo elige quien lee, no esta función.
 *
 * SLT-99 (decisión del humano del 2026-11-10, modifica SLT-66 R28–R29): un plan sin costo base («sin precio»)
 * se asigna y cuesta como costo base 0: cuota `0.00` («Sin cuota»), ya no «por definir».
 */
export function costoDelPeriodoEnCurso(precio: PrecioPlan, tipo: TipoCobro, entrada: Date, ahora: Date): string {
  const costo = montoDelPeriodo(precio, tipo) ?? "0.00";
  const periodo = periodoEnCurso(entrada, tipo, ahora);
  if (!periodo.esTramo) return costo;
  return costoDelTramo(costo, diasDelTramo(periodo), diasDelPeriodo(tipo, ahora));
}

/**
 * R27 — la fecha (`AAAA-MM-DD`, hora de la plataforma) del siguiente cobro: la del cambio pendiente si
 * lo hay, porque ahí se corta el período; si no, el primer día del siguiente período de calendario. En
 * el anual es el 1 de enero siguiente.
 */
export function siguienteCobro(tipo: TipoCobro, ahora: Date, pendiente: PendienteDeEmpresa | null): string {
  return pendiente?.desde ?? fechaCalendarioCR(finDelPeriodoCalendario(tipo, ahora));
}

/** El último día (`AAAA-MM-DD`) antes de un fin exclusivo, que cae siempre a las 00:00 de la plataforma. */
function ultimoDiaAntesDe(finExclusivo: Date): string {
  return fechaCalendarioCR(new Date(finExclusivo.getTime() - 1));
}

/**
 * D9, R27 — tipo, período en curso, su costo y el siguiente cobro, como los pintan «Mi plan» y el
 * detalle de empresa. `entrada` es `organizacion.plan_ciclo_ancla_at`.
 */
export function cobroDelPlan(
  precioDelPeriodo: PrecioPlan,
  tipo: TipoCobro,
  entrada: Date,
  ahora: Date,
  pendiente: PendienteDeEmpresa | null,
): CobroDelPlan {
  const periodo = periodoEnCurso(entrada, tipo, ahora);
  return {
    tipo,
    periodo: {
      desde: fechaCalendarioCR(periodo.desde),
      hasta: ultimoDiaAntesDe(periodo.hasta),
      esTramo: periodo.esTramo,
    },
    costo: costoDelPeriodoEnCurso(precioDelPeriodo, tipo, entrada, ahora),
    siguienteCobro: siguienteCobro(tipo, ahora, pendiente),
    pendiente,
  };
}

/**
 * D6, R30 — el `valor_nuevo` de una fila del historial de asignaciones: el tipo de cobro, precedido de
 * la fecha si la hubo (la de inicio de SLT-58 R39 o la de efecto de SLT-86). Vocabulario cerrado (fecha
 * y `TipoCobro`), cabe holgado en los 60 de la columna: `2026-11-01 · quincenal`.
 */
export function valorDelHistorialDeAsignacion(fecha: string | null, tipo: TipoCobro): string {
  return fecha === null ? tipo : `${fecha} · ${tipo}`;
}

function comoTipoCobro(texto: string | null | undefined): TipoCobro | null {
  return (TIPOS_COBRO as readonly string[]).includes(texto ?? "") ? (texto as TipoCobro) : null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** D14, R30 — lo que dice una fila del historial de asignaciones sobre el tipo de cobro y su fecha. */
export interface TipoCobroDelHistorial {
  tipo: TipoDeAsignacion;
  tipoCobro: TipoCobro | null;
  tipoCobroAnterior: TipoCobro | null;
  /** R30: la fecha que lleva `valor_nuevo` delante del tipo (`AAAA-MM-DD`); `null` si no la lleva. */
  desde: string | null;
}

/** `«fecha · tipo»`, `«tipo»` o `«fecha»` (las filas de SLT-58): el tipo es el último segmento, la fecha el primero. */
function partesDelValor(valor: string | null): { tipoCobro: TipoCobro | null; desde: string | null } {
  if (valor === null) return { tipoCobro: null, desde: null };
  const partes = valor.split(" · ");
  return { tipoCobro: comoTipoCobro(partes.at(-1)), desde: FECHA.test(partes[0]) ? partes[0] : null };
}

/**
 * D10, D14, D16, R30 — lee el tipo de cobro de una fila del historial de asignaciones.
 * - `plan_tipo_cobro_cambiado` (D16) es el cambio de solo el tipo: el de antes en `valor_anterior`, y el
 *   nuevo en `valor_nuevo`, que desde SLT-86 lleva delante la fecha de efecto (`fecha · tipo`).
 * - `plan_asignado` es una asignación: `valor_anterior` en NULL y en `valor_nuevo` lo de
 *   `valorDelHistorialDeAsignacion`. Las filas anteriores al ajuste (`NULL` o solo la fecha de SLT-58)
 *   no tienen tipo: `tipoCobro: null`.
 * - `plan_asignado` CON un tipo en `valor_anterior` es un cambio de solo el tipo escrito antes de D16: así
 *   lo deja el `down.sql` de 20261104130100. Se sigue leyendo como cambio.
 *
 * - `plan_cambio_empresa_cancelado` (SLT-86 R19) es un cambio pendiente que se canceló: `valor_nuevo` lleva la
 *   fecha de efecto y el tipo de ese cambio, que no llegó a regir.
 *
 * Las filas viejas (`mensual`, `anual`, sin fecha) se leen igual (R30).
 */
export function tipoCobroDelHistorial(
  accion: AccionDeAsignacion,
  valorAnterior: string | null,
  valorNuevo: string | null,
): TipoCobroDelHistorial {
  const anterior = comoTipoCobro(valorAnterior);
  const { tipoCobro, desde } = partesDelValor(valorNuevo);
  if (accion === "plan_cambio_empresa_cancelado") {
    return { tipo: "cambio_cancelado", tipoCobro, tipoCobroAnterior: null, desde };
  }
  if (accion === "plan_tipo_cobro_cambiado" || anterior !== null) {
    return { tipo: "cambio_tipo_cobro", tipoCobro, tipoCobroAnterior: anterior, desde };
  }
  return { tipo: "asignacion", tipoCobro, tipoCobroAnterior: null, desde };
}
