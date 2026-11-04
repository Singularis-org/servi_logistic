// SLT-58 (design §11.3, R35) — la tabla de fechas del ciclo con ciclo corto. La leen la gemela TS
// (`tests/unit/utils/ciclo-plan.test.ts`) y la función SQL `plan_inicio_ciclo_en_curso`
// (`tests/integration/db/plan-ciclo-corto.test.ts`): si una se separa de la otra, una suite se pone roja.
//
// Va en un fixture propio para no tocar `CASOS_CICLO` de SL-24 (`_fixtures/planes.ts`, R25/R41).
// Todos los instantes son `TIMESTAMP` sin zona en ISO con `Z` (Prisma los entrega así). Una fecha
// elegida distinta de hoy ancla a las 00:00 de la plataforma (−06:00), es decir a las 06:00 UTC (R32).

export interface CasoCicloCorto {
  caso: string;
  ancla: string;
  /** El instante de la asignación con ancla futura; `null` sin ciclo corto guardado. */
  cortoDesde: string | null;
  ahora: string;
  /** Inicio del ciclo en curso: `plan_inicio_ciclo_en_curso(cortoDesde, ancla, ahora)`. */
  enCurso: string;
  /** Inicio del ciclo siguiente: el instante en que la base cambia de ciclo. */
  siguiente: string;
}

// Asignada el 29 de octubre de 2026 a las 09:00 de la plataforma con fecha 5 de noviembre (R34, R40).
const ASIGNADA = "2026-10-29T15:00:00.000Z";
const ELEGIDA_EL_5 = "2026-11-05T06:00:00.000Z";
// Asignada el 20 de enero de 2027 con fecha 31 de enero: el ciclo mensual recorta a fin de mes.
const ASIGNADA_ENERO = "2027-01-20T15:00:00.000Z";
const ELEGIDA_EL_31 = "2027-01-31T06:00:00.000Z";

export const CASOS_CICLO_CORTO: readonly CasoCicloCorto[] = [
  // Ancla futura con ciclo corto (R34).
  { caso: "ancla futura: en el instante de la asignación empieza el ciclo corto", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: ASIGNADA, enCurso: ASIGNADA, siguiente: ELEGIDA_EL_5 },
  { caso: "ancla futura: a mitad del ciclo corto", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: "2026-11-01T00:00:00.000Z", enCurso: ASIGNADA, siguiente: ELEGIDA_EL_5 },
  { caso: "ancla futura: un minuto antes del ancla sigue el ciclo corto", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: "2026-11-05T05:59:00.000Z", enCurso: ASIGNADA, siguiente: ELEGIDA_EL_5 },
  { caso: "ancla futura: un milisegundo antes del ancla sigue el ciclo corto", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: "2026-11-05T05:59:59.999Z", enCurso: ASIGNADA, siguiente: ELEGIDA_EL_5 },
  { caso: "ancla futura: en el ancla empieza el primer ciclo mensual", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: ELEGIDA_EL_5, enCurso: ELEGIDA_EL_5, siguiente: "2026-12-05T06:00:00.000Z" },
  { caso: "ancla futura: un minuto después del ancla, el ciclo del 5", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: "2026-11-05T06:01:00.000Z", enCurso: ELEGIDA_EL_5, siguiente: "2026-12-05T06:00:00.000Z" },
  { caso: "ancla futura: elegida el 5, el 4 de diciembre sigue en el ciclo del 5 de noviembre", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: "2026-12-04T23:00:00.000Z", enCurso: ELEGIDA_EL_5, siguiente: "2026-12-05T06:00:00.000Z" },
  { caso: "ancla futura: el 10 de diciembre ya es el ciclo del 5 de diciembre", ancla: ELEGIDA_EL_5, cortoDesde: ASIGNADA, ahora: "2026-12-10T00:00:00.000Z", enCurso: "2026-12-05T06:00:00.000Z", siguiente: "2027-01-05T06:00:00.000Z" },
  // Ancla futura el 31.
  { caso: "ancla el 31, futura: en el ciclo corto el siguiente es el 31", ancla: ELEGIDA_EL_31, cortoDesde: ASIGNADA_ENERO, ahora: "2027-01-25T00:00:00.000Z", enCurso: ASIGNADA_ENERO, siguiente: ELEGIDA_EL_31 },
  { caso: "ancla el 31: tras el ancla, febrero empieza el 28", ancla: ELEGIDA_EL_31, cortoDesde: ASIGNADA_ENERO, ahora: "2027-02-10T00:00:00.000Z", enCurso: ELEGIDA_EL_31, siguiente: "2027-02-28T06:00:00.000Z" },
  { caso: "ancla el 31: en el ciclo de febrero, marzo vuelve al 31", ancla: ELEGIDA_EL_31, cortoDesde: ASIGNADA_ENERO, ahora: "2027-03-01T00:00:00.000Z", enCurso: "2027-02-28T06:00:00.000Z", siguiente: "2027-03-31T06:00:00.000Z" },
  // Ancla pasada (fecha elegida anterior a hoy): sin ciclo corto, la regla de SL-24 R20 (R33).
  { caso: "ancla pasada: elegida hace 15 días, el ciclo en curso empieza en el ancla", ancla: "2026-10-14T06:00:00.000Z", cortoDesde: null, ahora: ASIGNADA, enCurso: "2026-10-14T06:00:00.000Z", siguiente: "2026-11-14T06:00:00.000Z" },
  { caso: "ancla pasada: elegida el 29 de septiembre, hoy ya es el segundo ciclo", ancla: "2026-09-29T06:00:00.000Z", cortoDesde: null, ahora: ASIGNADA, enCurso: "2026-10-29T06:00:00.000Z", siguiente: "2026-11-29T06:00:00.000Z" },
  // Ancla de hoy: el instante de la asignación (P9), sin ciclo corto.
  { caso: "ancla de hoy: en el instante de la asignación", ancla: ASIGNADA, cortoDesde: null, ahora: ASIGNADA, enCurso: ASIGNADA, siguiente: "2026-11-29T15:00:00.000Z" },
  { caso: "ancla de hoy: un minuto después", ancla: ASIGNADA, cortoDesde: null, ahora: "2026-10-29T15:01:00.000Z", enCurso: ASIGNADA, siguiente: "2026-11-29T15:00:00.000Z" },
  // Sin ciclo corto guardado y un ahora anterior al ancla: el ancla, como `plan_inicio_ciclo` (R41).
  { caso: "sin ciclo corto guardado: un minuto antes del ancla da el ancla", ancla: ELEGIDA_EL_5, cortoDesde: null, ahora: "2026-11-05T05:59:00.000Z", enCurso: ELEGIDA_EL_5, siguiente: ELEGIDA_EL_5 },
];
