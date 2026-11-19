import type { TipoCobro } from "@/lib/types/planes";

// SLT-86 (design §3; R4–R6) — la tabla de fechas del período de calendario. La pasan las gemelas TS
// (`tests/unit/planes/ciclo-periodo.test.ts`) y las funciones SQL (`tests/integration/db/plan-ciclo-periodo.test.ts`):
// si una de las dos se separa, se pone roja una de las dos suites.
//
// Los instantes son `TIMESTAMP` sin zona en ISO con `Z` (Prisma los entrega así). Las 00:00 de la
// plataforma son las 06:00 en UTC.

/** Un período de calendario: su primer día y el primer día del siguiente (`AAAA-MM-DD`), y sus días. */
interface PeriodoDeLaTabla {
  tipo: TipoCobro;
  desde: string;
  hasta: string;
  dias: number;
  nota: string;
}

const PERIODOS: readonly PeriodoDeLaTabla[] = [
  { tipo: "quincenal", desde: "2026-11-01", hasta: "2026-11-16", dias: 15, nota: "primera quincena" },
  { tipo: "quincenal", desde: "2026-04-16", hasta: "2026-05-01", dias: 15, nota: "segunda quincena de un mes de 30 días" },
  { tipo: "quincenal", desde: "2026-12-16", hasta: "2027-01-01", dias: 16, nota: "segunda quincena de diciembre: cruza al 1 de enero" },
  { tipo: "quincenal", desde: "2027-02-16", hasta: "2027-03-01", dias: 13, nota: "segunda quincena de febrero, año normal (16–28)" },
  { tipo: "quincenal", desde: "2028-02-16", hasta: "2028-03-01", dias: 14, nota: "segunda quincena de febrero, año bisiesto (16–29)" },
  { tipo: "mensual", desde: "2027-02-01", hasta: "2027-03-01", dias: 28, nota: "febrero, año normal" },
  { tipo: "mensual", desde: "2028-02-01", hasta: "2028-03-01", dias: 29, nota: "febrero, año bisiesto" },
  { tipo: "mensual", desde: "2026-11-01", hasta: "2026-12-01", dias: 30, nota: "mes de 30 días" },
  { tipo: "mensual", desde: "2026-12-01", hasta: "2027-01-01", dias: 31, nota: "diciembre: cruza al 1 de enero" },
  { tipo: "bimestral", desde: "2027-01-01", hasta: "2027-03-01", dias: 59, nota: "ene–feb, año normal" },
  { tipo: "bimestral", desde: "2028-01-01", hasta: "2028-03-01", dias: 60, nota: "ene–feb, año bisiesto" },
  { tipo: "bimestral", desde: "2026-03-01", hasta: "2026-05-01", dias: 61, nota: "mar–abr" },
  { tipo: "bimestral", desde: "2026-05-01", hasta: "2026-07-01", dias: 61, nota: "may–jun" },
  { tipo: "bimestral", desde: "2026-07-01", hasta: "2026-09-01", dias: 62, nota: "jul–ago" },
  { tipo: "bimestral", desde: "2026-09-01", hasta: "2026-11-01", dias: 61, nota: "sep–oct" },
  { tipo: "bimestral", desde: "2026-11-01", hasta: "2027-01-01", dias: 61, nota: "nov–dic: cruza al 1 de enero" },
  { tipo: "anual", desde: "2026-01-01", hasta: "2027-01-01", dias: 365, nota: "año normal" },
  { tipo: "anual", desde: "2028-01-01", hasta: "2029-01-01", dias: 366, nota: "año bisiesto" },
];

/** Las 00:00 de la plataforma de un día, en UTC. */
export const cero = (fecha: string) => `${fecha}T06:00:00.000Z`;
const masMs = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

export interface CasoPeriodo {
  caso: string;
  tipo: TipoCobro;
  ahora: string;
  /** `null` = el caso solo mira el fin (un instante del período anterior, cuyo inicio no está en la tabla). */
  inicio: string | null;
  fin: string;
  dias: number | null;
}

/**
 * R6: por cada período, el borde exacto, un instante en medio, el último milisegundo, uno de la noche
 * del último día (ya es el día siguiente en UTC) y el milisegundo anterior al inicio, que es del
 * período anterior y termina justo en este borde.
 */
export const CASOS_PERIODO: readonly CasoPeriodo[] = PERIODOS.flatMap(({ tipo, desde, hasta, dias, nota }) => {
  const inicio = cero(desde);
  const fin = cero(hasta);
  return [
    { caso: `${tipo}, ${nota}: a las 00:00 del primer día empieza`, tipo, ahora: inicio, inicio, fin, dias },
    { caso: `${tipo}, ${nota}: un instante en medio`, tipo, ahora: masMs(inicio, 3 * 86_400_000 + 37_000), inicio, fin, dias },
    { caso: `${tipo}, ${nota}: a las 23:00 del último día (05:00 UTC del siguiente) sigue`, tipo, ahora: masMs(fin, -3_600_000), inicio, fin, dias },
    { caso: `${tipo}, ${nota}: el último milisegundo sigue`, tipo, ahora: masMs(fin, -1), inicio, fin, dias },
    { caso: `${tipo}, ${nota}: el milisegundo anterior es del período que acaba en este borde`, tipo, ahora: masMs(inicio, -1), inicio: null, fin: inicio, dias: null },
  ];
});

export interface CasoEntrada {
  caso: string;
  tipo: TipoCobro;
  entrada: string;
  ahora: string;
  desde: string;
  hasta: string;
  esTramo: boolean;
  /** Días del período en curso (tramo o completo) y del período de calendario (R12). */
  diasTramo: number;
  diasPeriodo: number;
}

/** R5: el período en curso con una entrada. Los ejemplos son los de R5, R12 y R35. */
export const CASOS_ENTRADA: readonly CasoEntrada[] = [
  { caso: "quincenal con entrada el 10: tramo del 10 al 15 (6 de 15 días)", tipo: "quincenal", entrada: cero("2026-11-10"), ahora: "2026-11-12T15:00:00.000Z", desde: cero("2026-11-10"), hasta: cero("2026-11-16"), esTramo: true, diasTramo: 6, diasPeriodo: 15 },
  { caso: "quincenal con entrada el 10: el 16 ya es la quincena completa", tipo: "quincenal", entrada: cero("2026-11-10"), ahora: cero("2026-11-16"), desde: cero("2026-11-16"), hasta: cero("2026-12-01"), esTramo: false, diasTramo: 15, diasPeriodo: 15 },
  { caso: "quincenal con entrada el 10: el último milisegundo del 15 sigue en el tramo", tipo: "quincenal", entrada: cero("2026-11-10"), ahora: "2026-11-16T05:59:59.999Z", desde: cero("2026-11-10"), hasta: cero("2026-11-16"), esTramo: true, diasTramo: 6, diasPeriodo: 15 },
  { caso: "mensual con entrada el 10 de diciembre: tramo de 22 de 31 días", tipo: "mensual", entrada: cero("2026-12-10"), ahora: "2026-12-20T18:00:00.000Z", desde: cero("2026-12-10"), hasta: cero("2027-01-01"), esTramo: true, diasTramo: 22, diasPeriodo: 31 },
  { caso: "anual con entrada el 5 de noviembre de 2026: tramo de 57 de 365 días", tipo: "anual", entrada: cero("2026-11-05"), ahora: "2026-11-05T12:00:00.000Z", desde: cero("2026-11-05"), hasta: cero("2027-01-01"), esTramo: true, diasTramo: 57, diasPeriodo: 365 },
  { caso: "anual con entrada el 5 de noviembre de 2026: desde 2027, años de calendario", tipo: "anual", entrada: cero("2026-11-05"), ahora: "2027-03-01T12:00:00.000Z", desde: cero("2027-01-01"), hasta: cero("2028-01-01"), esTramo: false, diasTramo: 365, diasPeriodo: 365 },
  { caso: "bimestral con entrada el 20 de febrero de 2028 (bisiesto): tramo de 10 de 60 días", tipo: "bimestral", entrada: cero("2028-02-20"), ahora: "2028-02-29T23:00:00.000Z", desde: cero("2028-02-20"), hasta: cero("2028-03-01"), esTramo: true, diasTramo: 10, diasPeriodo: 60 },
  { caso: "una entrada justo en el inicio del período de calendario no es tramo", tipo: "mensual", entrada: cero("2026-11-01"), ahora: "2026-11-20T12:00:00.000Z", desde: cero("2026-11-01"), hasta: cero("2026-12-01"), esTramo: false, diasTramo: 30, diasPeriodo: 30 },
  { caso: "una entrada anterior al período (de otro año) da el período completo", tipo: "quincenal", entrada: cero("2025-03-07"), ahora: "2027-02-20T12:00:00.000Z", desde: cero("2027-02-16"), hasta: cero("2027-03-01"), esTramo: false, diasTramo: 13, diasPeriodo: 13 },
];
