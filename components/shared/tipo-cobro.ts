import { diasDelPeriodo, inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { cobroDelPlan } from "@/lib/planes/cobro";
import type { PendienteDeEmpresa, PeriodoDelCobro } from "@/lib/types/consumo-plan";
import type { PrecioPlan, PrimerPeriodo, TipoCobro } from "@/lib/types/planes";

/** SLT-86 (R1): las cuatro etiquetas, aparte para que `pendiente` las lea dentro del mismo objeto. */
const ETIQUETAS = {
  quincenal: "Quincenal",
  mensual: "Mensual",
  bimestral: "Bimestral",
  anual: "Anual",
} as const satisfies Record<TipoCobro, string>;

/**
 * Ajuste planes-custom (D6, D9) y SLT-86 (design §7.1) — los textos del tipo de cobro y del período, en
 * un solo sitio para cuando llegue la i18n. Sin directiva de cliente: los usan tanto el selector
 * (`TipoCobroCampo`), el formulario y el modal de asignación como piezas de servidor (`ConsumoDelPlan`).
 */
export const TEXTOS_TIPO_COBRO = {
  campo: "Tipo de cobro",
  tipo: ETIQUETAS,
  /** SLT-86 (R16, R22, R25): el campo de la fecha de efecto. */
  rigeDesde: "Rige desde",
  ayudaCambioDeEmpresa: "Hasta esa fecha la empresa sigue con su plan y su período actuales.",
  ayudaCambioDePrecio:
    "Cada empresa paga el precio nuevo desde su primer período que empiece en esa fecha o después.",
  /** SLT-86 (R27): el período en curso; el tramo se marca aparte. */
  periodo: (desde: string, hasta: string) => `Período: ${desde} – ${hasta}`,
  tramo: (dias: number, total: number) => `(tramo de ${dias} de ${total} días)`,
  /** SLT-86 (R12, R25, R28): «por definir» sin costo base (SLT-66 R20). */
  costoBase: (tipo: TipoCobro, costo: string | null) => `Costo base ${tipo}: ${costo ?? "por definir"}`,
  /** SLT-86 (R26): el cambio pendiente de una empresa con plan. */
  pendiente: (p: PendienteDeEmpresa) => `Desde el ${p.desde}: ${p.planNombre} · ${ETIQUETAS[p.tipo]}`,
  cancelarCambio: "Cancelar cambio",
  /** SLT-86 (R26; decisión del 2026-11-05): una empresa sin plan con una primera asignación pendiente. */
  sinLimites: "Sin límites",
  empiezaARegir: (p: PendienteDeEmpresa) => `${p.planNombre} empieza a regir el ${p.desde}`,
} as const;

/** Días entre dos fechas `AAAA-MM-DD`, contando las dos. */
function diasEntre(desde: string, hasta: string): number {
  const dia = (f: string) => Date.parse(`${f}T00:00:00.000Z`);
  return Math.round((dia(hasta) - dia(desde)) / 86_400_000) + 1;
}

/**
 * SLT-86 (R5, R27; design §7.1): «Período: {desde} – {hasta}» y, si es tramo, «(tramo de {d} de {D} días)».
 * El período llega calculado del servidor (`cobroDelPlan`); aquí solo se cuentan sus días para el texto.
 */
export function textoDelPeriodo(tipo: TipoCobro, periodo: PeriodoDelCobro): string {
  const base = TEXTOS_TIPO_COBRO.periodo(periodo.desde, periodo.hasta);
  if (!periodo.esTramo) return base;
  const total = diasDelPeriodo(tipo, inicioDelDiaPlataforma(periodo.hasta));
  return `${base} ${TEXTOS_TIPO_COBRO.tramo(diasEntre(periodo.desde, periodo.hasta), total)}`;
}

/**
 * SLT-86 (R25): el período o tramo que abre un cambio que rige desde `fecha` (`AAAA-MM-DD`) con `tipo`, y
 * su costo base con el descuento del período y la proporción del tramo (R10, R12). Es el mismo cálculo
 * que «Mi plan» hará el día del cambio: la entrada es las 00:00 de la fecha y «ahora» es ese instante.
 */
export function primerPeriodoDelCambio(precio: PrecioPlan, tipo: TipoCobro, fecha: string): PrimerPeriodo {
  const entrada = inicioDelDiaPlataforma(fecha);
  const cobro = cobroDelPlan(precio, tipo, entrada, entrada, null);
  return { periodo: cobro.periodo, costo: cobro.costo };
}
