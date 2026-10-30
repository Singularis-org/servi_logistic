// SL-24 (design §3, R20) — gemela en TS de la función SQL `plan_inicio_ciclo`. La autoridad es la de
// la base (la usan los triggers); esta solo sirve para los textos, y un test compara las dos con la
// misma tabla de fechas para que no se separen.
//
// Las fechas son `TIMESTAMP` sin zona, que Prisma entrega como `Date` con los mismos números en UTC.
// Por eso todo se hace con los componentes UTC: así se replica la aritmética de Postgres sin que la
// zona del proceso mueva la frontera.

import { fechaCalendarioCR, inicioDelDiaCREnUtc } from "@/lib/utils/fecha-cr";

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

/**
 * Inicio del ciclo en curso: `ancla + n meses`, con el mayor `n ≥ 0` que no pase de `ahora`. Siempre
 * desde el ancla, nunca encadenando ciclos (alta el 31 de enero: 28/29 de febrero, 31 de marzo, 30 de
 * abril). Un `ahora` anterior al ancla da el ancla.
 */
export function inicioDelCiclo(ancla: Date, ahora: Date): Date {
  const meses = ciclosCumplidos(ancla, ahora);
  return meses === 0 ? new Date(ancla.getTime()) : sumarMeses(ancla, meses);
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
 * termina en el ancla; por eso el siguiente es el ancla misma y no un mes después. Es el instante en
 * que `plan_inicio_ciclo_en_curso` cambia de ciclo (R35).
 */
export function inicioDelSiguienteCiclo(ancla: Date, ahora: Date): Date {
  if (ahora.getTime() < ancla.getTime()) return new Date(ancla.getTime());
  return sumarMeses(ancla, ciclosCumplidos(ancla, ahora) + 1);
}

/**
 * SLT-58 (design §11.3, R33–R35) — gemela TS de `plan_inicio_ciclo_en_curso` (migración
 * 20261029150000). Antes del ancla, el inicio del ciclo corto; sin ciclo corto guardado, el ancla (lo
 * mismo que `inicioDelCiclo`, R41). Desde el ancla, la regla de SL-24 R20. Ojo: la función SQL recibe
 * `(corto_desde, ancla, ahora)`; esta, `(ancla, cortoDesde, ahora)`.
 */
export function inicioDelCicloEnCurso(ancla: Date, cortoDesde: Date | null, ahora: Date): Date {
  if (ahora.getTime() < ancla.getTime()) return new Date((cortoDesde ?? ancla).getTime());
  return inicioDelCiclo(ancla, ahora);
}

/** Fechas `AAAA-MM-DD` de la plataforma entre las que se puede elegir el inicio del ciclo (R30, P6). */
export interface RangoDelInicioDelCiclo {
  hoy: string;
  /** Hoy menos un mes (el último día del mes si ese día no existe). */
  min: string;
  /** Hoy más un mes (el último día del mes si ese día no existe). */
  max: string;
}

/** `AAAA-MM-DD` + `meses`, con el mismo recorte al último día del mes que `sumarMeses`. */
function fechaMasMeses(fecha: string, meses: number): string {
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
