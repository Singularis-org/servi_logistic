import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { fechaMasMeses } from "@/lib/planes/ciclo";
import type { CobroDelPlan } from "@/lib/types/consumo-plan";
import type { PrecioPlan, TipoCobro, TipoDeAsignacion } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

// Ajuste planes-custom (D7, D8, D9; 2026-10-31) — lo que la empresa paga por su plan en cada período y
// cuándo toca el siguiente cobro. Puro y sin `@prisma/client`: llega a componentes cliente por
// `consumo.ts`. Solo informa: nada de aquí escribe en `wallet_movimiento` ni en
// `cobro_plataforma_movimiento` (SL-24 D4, SLT-66 R21). El costo por orden y el total estimado del ciclo
// de SLT-66 (`costeo.ts`) no cambian.

/** 100 % en centésimas de punto: el porcentaje llega con dos decimales (`porcentajeSchema`). */
const CIEN_POR_CIENTO = BigInt(10_000);
const DOCE = BigInt(12);

/** Un porcentaje `"15"`, `"12.5"`, `"100.00"` en centésimas de punto exactas. */
function aCentesimasDePunto(porcentaje: string): bigint {
  return aCentimos(porcentaje);
}

/**
 * D7 — el monto de UN período de cobro, con dos decimales y en decimal exacto (céntimos `bigint`, patrón
 * SLT-66 R19). `null` si el plan no tiene costo base («sin precio»): no hay nada que cobrar que mostrar.
 *
 * · mensual: el mensual.
 * · anual: el anual fijo; si el anual es un descuento, mensual × 12 × (1 − %); si el plan no tiene
 *   anual, mensual × 12. «Anual» se puede elegir siempre.
 *
 * Redondeo del descuento: al céntimo, la mitad hacia arriba (lo que hace `round(numeric, 2)` de
 * Postgres con importes positivos). Es el único caso que puede dar fracciones de céntimo.
 */
export function montoDelPeriodo(precio: PrecioPlan, tipo: TipoCobro): string | null {
  if (precio.tipo !== "monto") return null;
  const mensual = aCentimos(precio.mensual);
  if (tipo === "mensual") return aTexto(mensual);
  if (precio.anual === null) return aTexto(mensual * DOCE);
  if (precio.anual.tipo === "fijo") return aTexto(aCentimos(precio.anual.monto));
  const queda = CIEN_POR_CIENTO - aCentesimasDePunto(precio.anual.porcentaje);
  const numerador = mensual * DOCE * queda;
  // División entera de no negativos (trunca) más medio divisor: la mitad hacia arriba.
  return aTexto((numerador + CIEN_POR_CIENTO / BigInt(2)) / CIEN_POR_CIENTO);
}

/**
 * D8 — la fecha (`AAAA-MM-DD`, hora de la plataforma) del siguiente cobro: el primer aniversario del
 * ancla que no cae antes de hoy. Mensual: ancla + n meses; anual: ancla + n años. Hoy mismo, si hoy es
 * el aniversario; el ancla, si todavía no llegó (primera asignación con fecha futura).
 *
 * Días 29–31: el mismo recorte que el ciclo de órdenes (`sumarMeses` de `ciclo.ts`, como
 * `timestamp + interval` de Postgres). Si el día no existe en ese mes, el último del mes, y siempre se
 * suma desde el ancla, nunca encadenando: ancla el 31 de enero → 28/29 de febrero, 31 de marzo, 30 de
 * abril. En anual, un ancla del 29 de febrero cobra el 28 de febrero de los años no bisiestos.
 *
 * Se cuenta en fechas de calendario de la plataforma, no en instantes: el ancla de una fecha elegida es
 * las 00:00 de ese día en la plataforma, y la de «hoy» el instante de la asignación; las dos dan su día.
 */
export function siguienteCobro(ancla: Date, tipo: TipoCobro, ahora: Date): string {
  const desde = fechaCalendarioCR(ancla);
  const hoy = fechaCalendarioCR(ahora);
  if (desde >= hoy) return desde;
  const paso = tipo === "mensual" ? 1 : 12;
  const meses = mesesEntre(desde, hoy);
  // El aniversario `k` cae en el mes de hoy o antes; si queda antes de hoy, el siguiente ya no.
  const k = Math.floor(meses / paso);
  const candidato = fechaMasMeses(desde, k * paso);
  return candidato >= hoy ? candidato : fechaMasMeses(desde, (k + 1) * paso);
}

/** Meses de calendario entre dos `AAAA-MM-DD`, sin mirar el día. */
function mesesEntre(desde: string, hasta: string): number {
  const [ad, md] = desde.split("-").map((p) => Number.parseInt(p, 10));
  const [ah, mh] = hasta.split("-").map((p) => Number.parseInt(p, 10));
  return (ah - ad) * 12 + (mh - md);
}

/** D9 — tipo, monto del período y siguiente cobro, como los pintan «Mi plan» y el detalle de empresa. */
export function cobroDelPlan(precio: PrecioPlan, tipo: TipoCobro, ancla: Date, ahora: Date): CobroDelPlan {
  return { tipo, montoPeriodo: montoDelPeriodo(precio, tipo), siguienteCobro: siguienteCobro(ancla, tipo, ahora) };
}

/**
 * D6 — el `valor_nuevo` de la fila `plan_asignado` del historial: el tipo de cobro, precedido de la
 * fecha de inicio del ciclo elegida si la hubo (SLT-58 R39). Vocabulario cerrado (fecha y `TipoCobro`),
 * cabe holgado en los 60 de la columna: `2026-11-01 · anual`.
 */
export function valorDelHistorialDeAsignacion(fecha: string | null, tipo: TipoCobro): string {
  return fecha === null ? tipo : `${fecha} · ${tipo}`;
}

function comoTipoCobro(texto: string | null | undefined): TipoCobro | null {
  return texto === "mensual" || texto === "anual" ? texto : null;
}

/** D14 — lo que dice una fila `plan_asignado` del historial sobre el tipo de cobro. */
export interface TipoCobroDelHistorial {
  tipo: TipoDeAsignacion;
  tipoCobro: TipoCobro | null;
  tipoCobroAnterior: TipoCobro | null;
}

/**
 * D10, D14 — lee el tipo de cobro de una fila `plan_asignado`. Una asignación (SL-24, SLT-58, D2) deja
 * `valor_anterior` en NULL y en `valor_nuevo` lo de `valorDelHistorialDeAsignacion`; un cambio de solo el
 * tipo (D10) deja el tipo de antes en `valor_anterior` y el nuevo en `valor_nuevo`: así se distingue. Las
 * filas anteriores al ajuste (`NULL` o solo la fecha de SLT-58) no tienen tipo: `tipoCobro: null`.
 */
export function tipoCobroDelHistorial(valorAnterior: string | null, valorNuevo: string | null): TipoCobroDelHistorial {
  const anterior = comoTipoCobro(valorAnterior);
  const ultimo = valorNuevo === null ? null : valorNuevo.split(" · ").at(-1);
  const tipoCobro = comoTipoCobro(ultimo);
  if (anterior !== null) return { tipo: "cambio_tipo_cobro", tipoCobro, tipoCobroAnterior: anterior };
  return { tipo: "asignacion", tipoCobro, tipoCobroAnterior: null };
}
