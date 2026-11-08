import {
  fechaCalendario,
  inicioDelDiaEnUtc,
  inicioDelDiaSiguienteEnUtc,
  sumarDiasCalendario,
} from "@/lib/utils/calendario-zona";

// Feature 196 (design §3) — la fecha que congela el cron y sus cotas. Modulo PURO: sin
// Prisma, sin `next/*` y sin reloj propio; el instante SIEMPRE se inyecta.
//
// Es el UNICO sitio del que sale la fecha objetivo del snapshot: toda la aritmetica de dia
// se apoya en `lib/utils/calendario-zona.ts` y aqui no se reimplementa ni una hora de desplazamiento.
//
// NO importa nada de `lib/analytics/`: aquel modulo resuelve el mismo problema para el
// rollup, pero acoplar ranking a analitica para ahorrar cuatro lineas es peor negocio que
// apoyarse los dos en el mismo helper de fechas, que es lo que ya ocurre.
//
// ⛔ `startOfDayCR` NO se importa aqui y no debe importarse. Devuelve la MEDIANOCHE UTC de
// la fecha calendario CR (convencion `@db.Date` de la feature 46), seis horas ANTES del
// comienzo real del dia en Costa Rica. Usarla como cota contra columnas `timestamp`
// (`gestion_orden.created_at`, `orden.asignado_at`) produce la ventana 18:00-18:00 hora CR
// que cerro la ficha 166. Es la trampa documentada del repo.
//
// ⚠️ MATIZ QUE LA FEATURE 246 OBLIGA A ESCRIBIR (T8.1, 2026-08-20), para que nadie lea el ⛔ de
// arriba como «aqui no puede haber medianoches UTC» y acabe borrandolo por contradictorio:
//
//   La prohibicion es sobre USAR `startOfDayCR` COMO COTA DE UN `timestamp`. NO es sobre el valor.
//   De hecho `fechaComoDate` (mas abajo) devuelve EXACTAMENTE esa medianoche UTC, a proposito,
//   porque `ranking_snapshot_dia.fecha` es `@db.Date`.
//
//   Desde la 246 (D7) esa MISMA funcion tiene un segundo consumidor: el tercer parametro de
//   `contarAsignadasPorMensajero`, que se compara contra `orden.fecha_reparto` —tambien
//   `@db.Date`—. Es decir: en la misma llamada al repositorio conviven las DOS convenciones,
//   `desde`/`hasta` con las 06:00 dentro y `diaReparto` sin ellas. Cada una en su sitio.
//
//   `RankingService` (el ranking EN VIVO) importa `fechaComoDate` de aqui por ese motivo, y no por
//   acoplamiento: usar la misma funcion es lo que hace que el vivo y el congelado no puedan
//   contar dias distintos (246/R41).
//
// ⛔ Derivar el dia serializando el instante a ISO en UTC tampoco vale: emite la fecha en
// UTC, asi que despues de las 18:00 CR ya devuelve el dia siguiente. Por eso el unico camino
// a la fecha calendario es `fechaCalendario`.
//
// SLT-42 (R22, R23) — la zona ya no es la de Costa Rica fija: la recibe cada funcion, y es la del
// pais de la empresa (la lee el servicio con `IReglasPaisEmpresa`). Con horario de verano el dia
// dura 23 o 25 h, asi que «ayer» es la fecha calendario anterior, no `now - 24 h`.

/** Ventana del dia CR, semiabierta `[desde, hasta)`. `hasta` es cota superior ESTRICTA. */
export interface VentanaDiaCR {
  readonly desde: Date;
  readonly hasta: Date;
}

/**
 * R2 — la corrida congela LA FECHA QUE ACABA DE CERRAR, es decir D−1 respecto del instante
 * de la corrida, y ninguna otra. El dia en curso no tiene snapshot: lo sirve el ranking en
 * vivo. Con el cron a las 02:00 CR del dia D+1 (`08:00Z`) esto devuelve `D`.
 *
 * `now` es OBLIGATORIO, sin default: un reloj por defecto deja que un test crea que controla
 * el tiempo cuando no lo hace.
 */
export function fechaObjetivo(now: Date, zona: string): string {
  return sumarDiasCalendario(fechaCalendario(now, zona), -1);
}

/**
 * Ventana del dia congelado, semiabierta `[desde, hasta)`:
 *   desde = `${fecha}T06:00:00.000Z`  (00:00:00 hora de pared CR)
 *   hasta = desde + 24 h              (00:00:00 CR del dia siguiente)
 *
 * Es EXACTAMENTE la ventana que usa el ranking en vivo para «hoy» (feature 166), que es lo
 * que hace comparables las dos cifras. Cambiar `<` por `<=` en el consumidor mueve un dia
 * entero de gestiones.
 */
export function ventanaDelDia(fecha: string, zona: string): VentanaDiaCR {
  return {
    desde: inicioDelDiaEnUtc(fecha, zona),
    hasta: inicioDelDiaSiguienteEnUtc(fecha, zona),
  };
}

/**
 * `ranking_snapshot_dia.fecha` es `@db.Date`, y la convencion del repo (feature 46) para esa
 * columna es la MEDIANOCHE UTC de la fecha calendario. NO es `ventana.desde`, que lleva las
 * 06:00 dentro: confundir las dos convenciones es el off-by-one clasico de estas columnas.
 */
export function fechaComoDate(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}
