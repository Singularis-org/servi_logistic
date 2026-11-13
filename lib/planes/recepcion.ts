// SLT-128 (design §5; R1, R21) — las fechas de la recepción de un cambio programado por empresa y de sus
// recordatorios. Puras y sin reloj propio: el repositorio les pasa `ahora` y la fecha del cambio.

import {
  fechaCalendarioPlataforma,
  fechaDeEfectoPorDefecto,
  inicioDelDiaPlataforma,
  inicioDelPeriodoCalendario,
} from "@/lib/planes/ciclo";
import type { TipoCobro } from "@/lib/types/planes";

/** Un día en milisegundos: la plataforma no tiene horario de verano, así que es exacto. */
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Los días antes de la recepción en que sale un recordatorio (R21). */
export type DiasDeRecordatorio = 7 | 3 | 1;

export interface RecordatorioProgramado {
  dias: DiasDeRecordatorio;
  runAfter: Date;
}

/**
 * R1: el instante en que una empresa con tipo de cobro `tipo` recibe un cambio que rige desde `desde`
 * (las 00:00 de la plataforma de F). Es `desde` si ya es el inicio de un período de su tipo; si no, el
 * inicio del período siguiente (como `fechaDeEfectoPorDefecto`, SLT-118 R30).
 */
export function fechaDeRecepcion(tipo: TipoCobro, desde: Date): Date {
  if (inicioDelPeriodoCalendario(tipo, desde).getTime() === desde.getTime()) return new Date(desde.getTime());
  return inicioDelDiaPlataforma(fechaDeEfectoPorDefecto(tipo, desde));
}

/** Días de calendario de la plataforma entre el día de `desde` y el de `hasta`. */
function diasDeCalendario(desde: Date, hasta: Date): number {
  const dia = (d: Date) => new Date(`${fechaCalendarioPlataforma(d)}T00:00:00.000Z`).getTime();
  return Math.round((dia(hasta) - dia(desde)) / UN_DIA_MS);
}

/** Qué recordatorios tocan según los días de calendario que faltan hasta la recepción (R21). */
function diasQueTocan(d: number): DiasDeRecordatorio[] {
  if (d > 7) return [7, 1];
  if (d >= 4) return [3, 1];
  return [1];
}

/**
 * R21: los recordatorios de una empresa, a las 00:00 de n días antes de su recepción. Se quitan los que
 * no caen después de `ahora`: un recordatorio en el pasado ya no avisa de nada.
 */
export function recordatoriosDe(ahora: Date, recibeAt: Date): RecordatorioProgramado[] {
  return diasQueTocan(diasDeCalendario(ahora, recibeAt))
    .map((dias) => ({ dias, runAfter: new Date(recibeAt.getTime() - dias * UN_DIA_MS) }))
    .filter((r) => r.runAfter.getTime() > ahora.getTime());
}
