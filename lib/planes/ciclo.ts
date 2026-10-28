// SL-24 (design §3, R20) — gemela en TS de la función SQL `plan_inicio_ciclo`. La autoridad es la de
// la base (la usan los triggers); esta solo sirve para los textos, y un test compara las dos con la
// misma tabla de fechas para que no se separen.
//
// Las fechas son `TIMESTAMP` sin zona, que Prisma entrega como `Date` con los mismos números en UTC.
// Por eso todo se hace con los componentes UTC: así se replica la aritmética de Postgres sin que la
// zona del proceso mueva la frontera.

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
  let meses =
    (ahora.getUTCFullYear() - ancla.getUTCFullYear()) * 12 + (ahora.getUTCMonth() - ancla.getUTCMonth());
  if (meses > 0 && sumarMeses(ancla, meses).getTime() > ahora.getTime()) meses -= 1;
  return meses <= 0 ? new Date(ancla.getTime()) : sumarMeses(ancla, meses);
}

// P8 (cerrada el 2026-10-28): la fecha de un cambio programado rige desde las 00:00 de ese día en la
// hora de la plataforma, el desfase fijo de los crons (`vercel.json`), hasta que SL-21 traiga zona por
// empresa. Fijo y no por nombre de zona: sin depender de la base de husos del proceso.
const DESFASE_PLATAFORMA_HORAS = 6;

/** `AAAA-MM-DD` → el instante de las 00:00 de ese día a −06:00 (design §16.1). */
export function inicioDelDiaPlataforma(fecha: string): Date {
  const [anio, mes, dia] = fecha.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(anio, mes - 1, dia, DESFASE_PLATAFORMA_HORAS));
}
