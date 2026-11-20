// SLT-121 (design §3.2; R1, R6) — la tabla de casos de la fecha límite de pago. La pasan la función SQL
// (`tests/integration/db/factura-plataforma-mora.test.ts`, contra `factura_plataforma_mora`) y la gemela TS
// (`tests/unit/planes/mora.test.ts`, contra `fechaLimiteDePago` y `venceEn`): si una de las dos se separa, se
// pone roja una de las dos suites. Mismo patrón que `periodo-calendario.ts` (SLT-86).
//
// `hasta` es el fin de la factura, un `TIMESTAMP` sin zona en ISO con `Z`, como lo entrega Prisma. El día de
// emisión es el día de la plataforma (UTC−6) en que empieza `hasta`. `venceEn` es las 00:00 de la plataforma
// del día siguiente a la fecha límite, en UTC: desde ese instante la factura con saldo está vencida (R6).
//
// No es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.

export interface CasoFechaLimite {
  caso: string;
  hasta: string;
  gracia: number;
  /** `AAAA-MM-DD`, calendario de la plataforma. */
  fechaLimite: string;
  /** ISO UTC. */
  venceEn: string;
}

/** Las 00:00 de la plataforma de un día, en UTC. */
const cero = (fecha: string) => `${fecha}T06:00:00.000Z`;

export const CASOS_FECHA_LIMITE: readonly CasoFechaLimite[] = [
  {
    caso: "el ejemplo de R1: hasta el 16 nov a las 00:00 de la plataforma, gracia 7 → paga hasta el 23",
    hasta: cero("2026-11-16"),
    gracia: 7,
    fechaLimite: "2026-11-23",
    venceEn: cero("2026-11-24"),
  },
  {
    caso: "hasta el último milisegundo del 15 nov de la plataforma (ya es 16 en UTC): emitida el 15",
    hasta: "2026-11-16T05:59:59.999Z",
    gracia: 7,
    fechaLimite: "2026-11-22",
    venceEn: cero("2026-11-23"),
  },
  {
    caso: "hasta a las 23:00 del 16 nov de la plataforma (05:00 UTC del 17): sigue siendo el 16",
    hasta: "2026-11-17T05:00:00.000Z",
    gracia: 7,
    fechaLimite: "2026-11-23",
    venceEn: cero("2026-11-24"),
  },
  {
    caso: "fin de mes: emitida el 30 nov con 7 días cruza a diciembre",
    hasta: cero("2026-11-30"),
    gracia: 7,
    fechaLimite: "2026-12-07",
    venceEn: cero("2026-12-08"),
  },
  {
    caso: "fin de año: emitida el 16 dic con 30 días cruza a enero",
    hasta: cero("2026-12-16"),
    gracia: 30,
    fechaLimite: "2027-01-15",
    venceEn: cero("2027-01-16"),
  },
  {
    caso: "fecha límite el 31 dic: vence el 1 de enero",
    hasta: cero("2026-12-24"),
    gracia: 7,
    fechaLimite: "2026-12-31",
    venceEn: cero("2027-01-01"),
  },
  {
    caso: "29 de febrero: año bisiesto, emitida el 22 feb de 2028 con 7 días",
    hasta: cero("2028-02-22"),
    gracia: 7,
    fechaLimite: "2028-02-29",
    venceEn: cero("2028-03-01"),
  },
  {
    caso: "29 de febrero: emitida ese día con 1 día, paga hasta el 1 de marzo",
    hasta: cero("2028-02-29"),
    gracia: 1,
    fechaLimite: "2028-03-01",
    venceEn: cero("2028-03-02"),
  },
  {
    caso: "año normal: emitida el 22 feb de 2027 con 7 días salta al 1 de marzo",
    hasta: cero("2027-02-22"),
    gracia: 7,
    fechaLimite: "2027-03-01",
    venceEn: cero("2027-03-02"),
  },
  {
    caso: "gracia mínima, 1 día",
    hasta: cero("2026-11-01"),
    gracia: 1,
    fechaLimite: "2026-11-02",
    venceEn: cero("2026-11-03"),
  },
  {
    caso: "gracia máxima, 60 días",
    hasta: cero("2026-11-01"),
    gracia: 60,
    fechaLimite: "2026-12-31",
    venceEn: cero("2027-01-01"),
  },
];

/** El milisegundo anterior a `iso`: el último instante en que la factura aún no está vencida. */
export const unMsAntes = (iso: string) => new Date(new Date(iso).getTime() - 1).toISOString();
