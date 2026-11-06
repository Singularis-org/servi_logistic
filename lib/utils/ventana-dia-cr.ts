// Feature 192 (B1.1, design.md §4) — la ventana del DIA EN CURSO en la zona de la empresa.
//
// SLT-42: el archivo conserva su nombre (`-cr`) por historia, pero ya no fija Costa Rica: la zona
// IANA llega por parametro (la del pais de la empresa) y el calculo sale de `calendario-zona.ts`.
//
// Modulo PURO: sin Prisma, sin `next/headers`, sin `new Date()` propio. El unico
// `new Date()` de la feature vive en la Server Action, que es el borde.

import {
  fechaCalendario,
  horaDePared,
  inicioDelDiaEnUtc,
  inicioDelDiaSiguienteEnUtc,
} from "@/lib/utils/calendario-zona";

/** R12 — intervalo SEMIABIERTO `[desde, hasta)` en UTC, mas la fecha calendario local. */
export interface VentanaDiaCR {
  /** `YYYY-MM-DD` calendario de la zona. */
  readonly fecha: string;
  /** Instante de las 00:00 de pared de `fecha` en la zona. */
  readonly desde: Date;
  /** Instante de las 00:00 del dia siguiente — cota superior EXCLUSIVA. */
  readonly hasta: Date;
}

/**
 * La ventana del dia de `zona` al que pertenece `now`.
 *
 * `now` es parametro OBLIGATORIO, sin default `new Date()` (R16): un default deja que un
 * test crea que controla el reloj cuando no lo hace (misma regla que `rollup-dia.ts`).
 *
 * Se apoya SOLO en `lib/utils/calendario-zona.ts`, sin reimplementar ni una hora de
 * desplazamiento. En particular:
 *
 * NO se usa `inicioDelDiaComoFecha` (R17). Devuelve la medianoche **UTC** de la fecha calendario
 * —el desfase de la zona antes (o despues) del comienzo real del dia— y contra columnas
 * `timestamp` produce la ventana 18:00-18:00 que arrastraba `RankingService` (ficha 166). Si la
 * ventana se equivoca, los contadores no cuadran con lo que ve el maestro y parece un bug
 * de la pantalla.
 */
export function ventanaDelDiaEnCursoCR(now: Date, zona: string): VentanaDiaCR {
  const fecha = fechaCalendario(now, zona);
  return {
    fecha,
    desde: inicioDelDiaEnUtc(fecha, zona),
    hasta: inicioDelDiaSiguienteEnUtc(fecha, zona),
  };
}

/**
 * Feature 258 (B1.1, design.md §6) — la HORA DE PARED de `zona` (0..23) de `instante`
 * dentro de `ventana`.
 *
 * SLT-42 (R23): ya no es `instante - ventana.desde` en horas. Eso solo es la hora de pared en una
 * zona sin horario de verano; el dia del cambio dura 23 o 25 h y la resta correria la hora uno.
 * Se lee la hora de pared de la zona (`horaDePared`) y no hay `new Date()` propio ni se usa
 * `inicioDelDiaComoFecha` (R53): esa devuelve la medianoche UTC y correria la hora el desfase.
 *
 * El recorte a `[0, 23]` no es defensivo por gusto: `instante` es el `now` de la lectura y
 * puede caer fuera de la ventana por desfase de relojes (o porque un test congele el reloj en
 * otro dia). Un indice negativo o un 24 produciria una serie con horas que no existen. Antes de la
 * ventana vale 0 y desde su fin vale 23, como cuando se restaba.
 */
export function horaDeParedCR(ventana: VentanaDiaCR, instante: Date, zona: string): number {
  if (instante.getTime() < ventana.desde.getTime()) return 0;
  if (instante.getTime() >= ventana.hasta.getTime()) return 23;
  const hora = Number(horaDePared(instante, zona).slice(0, 2));
  return Math.min(23, Math.max(0, hora));
}
