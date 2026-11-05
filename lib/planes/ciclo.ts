// SL-24 (design §3, R20) — gemelas en TS de las funciones SQL del ciclo. La autoridad es la de la base;
// estas sirven para los textos y el costo, y un test compara las dos con la misma tabla de fechas para
// que no se separen. SLT-86: el ciclo pasa a ser el período de calendario (más abajo).
//
// Las fechas son `TIMESTAMP` sin zona, que Prisma entrega como `Date` con los mismos números en UTC.
// Por eso todo se hace con los componentes UTC: así se replica la aritmética de Postgres sin que la
// zona del proceso mueva la frontera.

import type { TipoCobro } from "@/lib/types/planes";
import { fechaCalendarioCR, inicioDelDiaCREnUtc, mananaCalendarioCR } from "@/lib/utils/fecha-cr";

/** `fecha + meses`, como `timestamp + interval 'n months'`: si el día no existe, el último del mes. */
function sumarMeses(fecha: Date, meses: number): Date {
  const total = fecha.getUTCFullYear() * 12 + fecha.getUTCMonth() + meses;
  const anio = Math.floor(total / 12);
  const mes = total - anio * 12;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(fecha.getUTCDate(), ultimoDia);
  return new Date(
    Date.UTC(
      anio,
      mes,
      dia,
      fecha.getUTCHours(),
      fecha.getUTCMinutes(),
      fecha.getUTCSeconds(),
      fecha.getUTCMilliseconds(),
    ),
  );
}

/** El mayor `n ≥ 0` con `ancla + n meses ≤ ahora` (0 si `ahora` es anterior al ancla). */
function ciclosCumplidos(ancla: Date, ahora: Date): number {
  let meses =
    (ahora.getUTCFullYear() - ancla.getUTCFullYear()) * 12 + (ahora.getUTCMonth() - ancla.getUTCMonth());
  if (meses > 0 && sumarMeses(ancla, meses).getTime() > ahora.getTime()) meses -= 1;
  return Math.max(meses, 0);
}

/**
 * SLT-58 (design §6.1, R5) — inicio del ciclo siguiente: `ancla + (n+1) meses`. Se suma desde el ancla
 * y no a partir de `inicioDelCiclo`: encadenar arrastraría el 28 de febrero a los meses siguientes.
 *
 * SLT-58 (design §11.3, R40): con `ahora` anterior al ancla la empresa está en su ciclo corto, que
 * termina en el ancla; por eso el siguiente es el ancla misma y no un mes después.
 *
 * SLT-86 (design §3.2): sustituida por `finDelPeriodoCalendario`. `consumo.ts` ya no la usa (T6); se
 * queda solo mientras la usa la vista previa de `PlanesRepository`, y se borra con ella (T9).
 * `inicioDelCiclo` e `inicioDelCicloEnCurso` ya se borraron en T3: no las usaba nadie.
 */
export function inicioDelSiguienteCiclo(ancla: Date, ahora: Date): Date {
  if (ahora.getTime() < ancla.getTime()) return new Date(ancla.getTime());
  return sumarMeses(ancla, ciclosCumplidos(ancla, ahora) + 1);
}

/* -------------------------------------------------------------------------- */
/* SLT-86 (design §3.2; R4–R6, R12, R25) — el período de calendario             */
/* -------------------------------------------------------------------------- */
// Gemelas de `plan_inicio_periodo_calendario`, `plan_fin_periodo_calendario` y `plan_inicio_ciclo_de`
// (migración 20261106120000). La autoridad es la base (cuenta las órdenes del período); un test pasa la
// misma tabla por las dos (R6). Se calcula sobre la fecha de calendario de la plataforma
// (`fechaCalendarioCR`) y se vuelve a instante con `inicioDelDiaPlataforma`, así el −06:00 sigue
// viviendo en una sola fuente.

/** Un día en milisegundos: la plataforma no tiene horario de verano, así que es exacto. */
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** El primer día (`AAAA-MM-DD`) del período de calendario que contiene `fecha`. */
function primerDiaDelPeriodo(tipo: TipoCobro, fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  switch (tipo) {
    case "quincenal":
      return `${anio}-${mes}-${Number.parseInt(dia, 10) >= 16 ? "16" : "01"}`;
    case "mensual":
      return `${anio}-${mes}-01`;
    case "bimestral": {
      const primerMes = Math.floor((Number.parseInt(mes, 10) - 1) / 2) * 2 + 1;
      return `${anio}-${String(primerMes).padStart(2, "0")}-01`;
    }
    case "anual":
      return `${anio}-01-01`;
  }
}

/** El primer día del período siguiente al que empieza en `primerDia`. */
function primerDiaDelSiguiente(tipo: TipoCobro, primerDia: string): string {
  switch (tipo) {
    case "quincenal":
      return primerDia.endsWith("-01") ? `${primerDia.slice(0, 8)}16` : fechaMasMeses(`${primerDia.slice(0, 8)}01`, 1);
    case "mensual":
      return fechaMasMeses(primerDia, 1);
    case "bimestral":
      return fechaMasMeses(primerDia, 2);
    case "anual":
      return fechaMasMeses(primerDia, 12);
  }
}

/** R4: las 00:00 de la plataforma del primer día del período de calendario que contiene `ahora`. */
export function inicioDelPeriodoCalendario(tipo: TipoCobro, ahora: Date): Date {
  return inicioDelDiaPlataforma(primerDiaDelPeriodo(tipo, fechaCalendarioCR(ahora)));
}

/** R4: el fin (exclusivo) del período de calendario que contiene `ahora`: el inicio del siguiente. */
export function finDelPeriodoCalendario(tipo: TipoCobro, ahora: Date): Date {
  const primerDia = primerDiaDelPeriodo(tipo, fechaCalendarioCR(ahora));
  return inicioDelDiaPlataforma(primerDiaDelSiguiente(tipo, primerDia));
}

/** El período en curso de una empresa. `hasta` es exclusivo: las 00:00 del día siguiente al último. */
export interface PeriodoEnCurso {
  desde: Date;
  hasta: Date;
  /** R5: la entrada cae después del inicio del período de calendario. */
  esTramo: boolean;
}

/**
 * R5: el período de calendario que contiene `ahora`, recortado por delante a la entrada si es
 * posterior a su inicio. Gemela de `plan_inicio_ciclo_de` (el inicio) y `plan_fin_periodo_calendario`
 * (el fin): el tramo solo recorta el inicio.
 */
export function periodoEnCurso(entrada: Date, tipo: TipoCobro, ahora: Date): PeriodoEnCurso {
  const inicio = inicioDelPeriodoCalendario(tipo, ahora);
  const esTramo = entrada.getTime() > inicio.getTime();
  return {
    desde: new Date((esTramo ? entrada : inicio).getTime()),
    hasta: finDelPeriodoCalendario(tipo, ahora),
    esTramo,
  };
}

/** Días de calendario de la plataforma entre dos instantes: del día de `desde` al de `hasta`, sin este. */
function diasDeCalendario(desde: Date, hasta: Date): number {
  const dia = (d: Date) => new Date(`${fechaCalendarioCR(d)}T00:00:00.000Z`).getTime();
  return Math.round((dia(hasta) - dia(desde)) / UN_DIA_MS);
}

/** R12: los días del período de calendario que contiene `ahora` (13 a 16 en un quincenal, 365 o 366 en un año). */
export function diasDelPeriodo(tipo: TipoCobro, ahora: Date): number {
  return diasDeCalendario(inicioDelPeriodoCalendario(tipo, ahora), finDelPeriodoCalendario(tipo, ahora));
}

/** R12: los días de un tramo (o de un período completo), contando el primero y el último. */
export function diasDelTramo(periodo: Pick<PeriodoEnCurso, "desde" | "hasta">): number {
  return diasDeCalendario(periodo.desde, periodo.hasta);
}

/**
 * R25: la fecha de efecto que propone la pantalla para un cambio de empresa: el primer día del siguiente
 * período de calendario con el tipo vigente (`AAAA-MM-DD`). El más lejano es el 1 de enero siguiente, así
 * que siempre cae dentro del rango de R16 (de hoy a hoy + 12 meses).
 */
export function fechaDeEfectoPorDefecto(tipo: TipoCobro, ahora: Date): string {
  return fechaCalendarioCR(finDelPeriodoCalendario(tipo, ahora));
}

/** Fechas `AAAA-MM-DD` de la plataforma entre las que se puede elegir el inicio del ciclo (R30, P6). */
export interface RangoDelInicioDelCiclo {
  hoy: string;
  /** Hoy menos un mes (el último día del mes si ese día no existe). */
  min: string;
  /** Hoy más un mes (el último día del mes si ese día no existe). */
  max: string;
}

/**
 * `AAAA-MM-DD` + `meses`, con el mismo recorte al último día del mes que `sumarMeses`. La usa también el
 * siguiente cobro (`lib/planes/cobro.ts`, ajuste planes-custom D8).
 */
export function fechaMasMeses(fecha: string, meses: number): string {
  return sumarMeses(new Date(`${fecha}T00:00:00.000Z`), meses).toISOString().slice(0, 10);
}

/**
 * SLT-58 (design §11.3, R30) — el rango permitido para la fecha de inicio del ciclo, con «hoy» en la
 * hora de la plataforma. Una sola fuente para la validación del servicio y el `min`/`max` del campo.
 */
export function rangoDelInicioDelCiclo(ahora: Date): RangoDelInicioDelCiclo {
  const hoy = fechaCalendarioCR(ahora);
  return { hoy, min: fechaMasMeses(hoy, -1), max: fechaMasMeses(hoy, 1) };
}

/**
 * Ajuste planes-custom (D5, 2026-10-31) — la fecha de inicio del ciclo que proponen el formulario del
 * custom y el modal de primera asignación: MAÑANA en la hora de la plataforma (`AAAA-MM-DD`). Siempre
 * cae dentro de `rangoDelInicioDelCiclo`.
 */
export function inicioDelCicloPorDefecto(ahora: Date): string {
  return mananaCalendarioCR(ahora);
}

/**
 * SLT-58 (design §11.3, R32) — el ancla que sale de la fecha elegida: «hoy» ancla en el instante de la
 * asignación (`"ahora"`, P9; el instante lo pone `now()` de la base); otra fecha, en las 00:00 de ese
 * día en la hora de la plataforma.
 */
export function anclaDeLaFechaElegida(fecha: string, ahora: Date): Date | "ahora" {
  return fecha === fechaCalendarioCR(ahora) ? "ahora" : inicioDelDiaPlataforma(fecha);
}

// P8 (cerrada el 2026-10-28): la fecha de un cambio programado rige desde las 00:00 de ese día en la
// hora de la plataforma, el desfase fijo de los crons (`vercel.json`), hasta que SL-21 traiga zona por
// empresa. Fijo y no por nombre de zona: sin depender de la base de husos del proceso. El desfase vive
// en `inicioDelDiaCREnUtc` (review m2: una sola fuente del −06:00).

/** `AAAA-MM-DD` (ya validada por `fechaSchema`) → el instante de las 00:00 de ese día a −06:00 (design §16.1). */
export function inicioDelDiaPlataforma(fecha: string): Date {
  return inicioDelDiaCREnUtc(fecha);
}
