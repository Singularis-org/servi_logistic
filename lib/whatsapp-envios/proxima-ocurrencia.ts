// Ficha 474 (design §4.1/§6.1, R20/R22) — la PROXIMA ocurrencia de un envio a hora fija.
//
// Modulo PURO: sin red, sin base, sin reloj propio (el `desde` lo da quien llama). SLT-42 (R22,
// R23): la hora es de PARED de la zona del pais de la empresa del envio, y la unica pieza que sabe
// de desfases es `lib/utils/calendario-zona.ts` (con horario de verano, el desfase del dia).
import { fechaCalendario, instanteDeParedEnUtc, sumarDiasCalendario } from "@/lib/utils/calendario-zona";
const HORA_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export interface Ocurrencia {
  /** Dia calendario CR de la ocurrencia, `YYYY-MM-DD`. Es la clave de idempotencia (R23). */
  readonly fechaCr: string;
  /** Instante UTC en que toca enviar. */
  readonly instante: Date;
}

/** ISO 8601: 1 = lunes … 7 = domingo, de una fecha `YYYY-MM-DD`. */
export function diaIsoDe(fechaCr: string): number {
  const dow = new Date(`${fechaCr}T12:00:00.000Z`).getUTCDay(); // 0 = domingo
  return dow === 0 ? 7 : dow;
}

/** Instante UTC de `hora` (HH:mm de pared de `zona`) en el dia `fechaCr`. */
export function instanteDe(fechaCr: string, hora: string, zona: string): Date {
  const m = HORA_RE.exec(hora);
  if (m === null) throw new Error(`hora invalida: ${hora}`);
  return instanteDeParedEnUtc(fechaCr, Number(m[1]), Number(m[2]), zona);
}

/**
 * El primer instante CR ESTRICTAMENTE posterior a `desde` cuyo dia ISO esta en `dias`.
 *
 * «Estrictamente» es la mitad de R20: guardar a las 05:00 un envio de las 05:00 no envia ahora; y
 * una hora ya pasada hoy cae en la proxima ocurrencia, sin «recuperar» lo pasado. `null` si `dias`
 * no tiene ningun dia valido (un envio asi no se puede guardar: lo impide el service).
 */
export function proximaOcurrencia(
  dias: readonly number[],
  hora: string,
  desde: Date,
  /** SLT-42 (R22): la zona del pais de la empresa del envio. */
  zona: string,
): Ocurrencia | null {
  const validos = new Set(dias.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7));
  if (validos.size === 0) return null;
  const hoy = fechaCalendario(desde, zona);
  // 8 vueltas: hoy (si la hora no paso) y los 7 dias siguientes cubren cualquier combinacion.
  for (let i = 0; i <= 7; i++) {
    const fechaCr = sumarDiasCalendario(hoy, i);
    if (!validos.has(diaIsoDe(fechaCr))) continue;
    const instante = instanteDe(fechaCr, hora, zona);
    if (instante.getTime() > desde.getTime()) return { fechaCr, instante };
  }
  return null;
}
