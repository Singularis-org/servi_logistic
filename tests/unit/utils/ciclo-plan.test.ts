import { describe, it, expect } from "vitest";

import {
  anclaDeLaFechaElegida,
  inicioDelCiclo,
  inicioDelCicloEnCurso,
  inicioDelSiguienteCiclo,
  rangoDelInicioDelCiclo,
} from "@/lib/planes/ciclo";

import { CASOS_CICLO_CORTO } from "../../integration/db/_fixtures/ciclo-corto";
import { CASOS_CICLO } from "../../integration/db/_fixtures/planes";

// SL-24 (design §3, R20) — la gemela TS del inicio de ciclo. La MISMA tabla la pasa
// `tests/integration/db/plan-ciclo.test.ts` contra `plan_inicio_ciclo` en Postgres: si una de las dos
// se separa, una de las dos suites se pone roja.

describe("SL-24 — inicioDelCiclo (R20)", () => {
  it.each(CASOS_CICLO)("$caso", ({ ancla, ahora, inicio }) => {
    expect(inicioDelCiclo(new Date(ancla), new Date(ahora)).toISOString()).toBe(inicio);
  });

  it("calcula siempre desde el ancla: el 31 no se queda en 28 tras pasar por febrero", () => {
    const ancla = new Date("2027-01-31T08:00:00.000Z");
    const inicios = ["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"].map(
      (d) => inicioDelCiclo(ancla, new Date(`${d}T09:00:00.000Z`)).toISOString().slice(0, 10),
    );
    expect(inicios).toEqual(["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
  });

  it("no muta el ancla que recibe", () => {
    const ancla = new Date("2026-01-15T10:00:00.000Z");
    inicioDelCiclo(ancla, new Date("2026-03-20T00:00:00.000Z"));
    expect(ancla.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });
});

// SLT-58 (design §6.1, R5) — el inicio del ciclo siguiente, del que sale «Se reinicia en N días».
// Misma regla que `inicioDelCiclo`: siempre desde el ancla, último día del mes si el día no existe.
describe("SLT-58 — inicioDelSiguienteCiclo (R5)", () => {
  const casos = [
    { caso: "R5: ancla el 15 de enero, a mitad de ciclo", ancla: "2026-01-15T10:00:00.000Z", ahora: "2026-03-20T00:00:00.000Z", siguiente: "2026-04-15T10:00:00.000Z" },
    { caso: "R5: ancla el 15 de enero, a un minuto del cambio", ancla: "2026-01-15T10:00:00.000Z", ahora: "2026-03-15T09:59:00.000Z", siguiente: "2026-03-15T10:00:00.000Z" },
    { caso: "R5: ancla el 15 de enero, en la frontera exacta ya cuenta el ciclo que empieza", ancla: "2026-01-15T10:00:00.000Z", ahora: "2026-03-15T10:00:00.000Z", siguiente: "2026-04-15T10:00:00.000Z" },
    { caso: "R5: ancla el 31 de enero, a mitad del primer ciclo: febrero empieza el 28", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-02-10T00:00:00.000Z", siguiente: "2027-02-28T08:00:00.000Z" },
    { caso: "R5: ancla el 31 de enero, a un minuto del cambio de febrero", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-02-28T07:59:00.000Z", siguiente: "2027-02-28T08:00:00.000Z" },
    { caso: "R5: ancla el 31 de enero, a mitad del ciclo de febrero: marzo vuelve al 31", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-03-10T00:00:00.000Z", siguiente: "2027-03-31T08:00:00.000Z" },
    { caso: "R5: ancla el 31 de enero, a un minuto del cambio de marzo", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-03-31T07:59:00.000Z", siguiente: "2027-03-31T08:00:00.000Z" },
    { caso: "R5: ancla el 31 de enero, a mitad del ciclo de marzo: abril empieza el 30", ancla: "2027-01-31T08:00:00.000Z", ahora: "2027-04-10T00:00:00.000Z", siguiente: "2027-04-30T08:00:00.000Z" },
    { caso: "R5: ancla el 31 de enero, año bisiesto: febrero empieza el 29", ancla: "2028-01-31T08:00:00.000Z", ahora: "2028-02-15T00:00:00.000Z", siguiente: "2028-02-29T08:00:00.000Z" },
    // Corregido por la enmienda (design §11.3, R40): antes del ancla la empresa está en su ciclo corto,
    // que termina en el ancla. Hasta T13 este caso fijaba «el ancla más un mes».
    { caso: "R40: un ahora anterior al ancla da el ancla (fin del ciclo corto)", ancla: "2026-10-15T12:00:00.000Z", ahora: "2026-09-01T00:00:00.000Z", siguiente: "2026-10-15T12:00:00.000Z" },
  ];

  it.each(casos)("$caso", ({ ancla, ahora, siguiente }) => {
    expect(inicioDelSiguienteCiclo(new Date(ancla), new Date(ahora)).toISOString()).toBe(siguiente);
  });

  it("R5: el siguiente de cada ciclo es el inicio del ciclo que le sigue (las dos funciones no se separan)", () => {
    for (const { ancla, ahora } of CASOS_CICLO) {
      const siguiente = inicioDelSiguienteCiclo(new Date(ancla), new Date(ahora));
      expect(siguiente.getTime()).toBeGreaterThan(new Date(ahora).getTime());
      expect(inicioDelCiclo(new Date(ancla), siguiente).toISOString()).toBe(siguiente.toISOString());
    }
  });

  it("R5: no muta el ancla que recibe", () => {
    const ancla = new Date("2027-01-31T08:00:00.000Z");
    inicioDelSiguienteCiclo(ancla, new Date("2027-03-10T00:00:00.000Z"));
    expect(ancla.toISOString()).toBe("2027-01-31T08:00:00.000Z");
  });
});

// SLT-58 (design §11.3, R35) — la gemela TS de `plan_inicio_ciclo_en_curso`, con la MISMA tabla que
// `tests/integration/db/plan-ciclo-corto.test.ts` pasa contra Postgres.
describe("SLT-58 — inicioDelCicloEnCurso e inicioDelSiguienteCiclo con ciclo corto (R35)", () => {
  const fecha = (iso: string | null) => (iso === null ? null : new Date(iso));

  it.each(CASOS_CICLO_CORTO)("$caso", ({ ancla, cortoDesde, ahora, enCurso, siguiente }) => {
    expect(inicioDelCicloEnCurso(new Date(ancla), fecha(cortoDesde), new Date(ahora)).toISOString()).toBe(enCurso);
    expect(inicioDelSiguienteCiclo(new Date(ancla), new Date(ahora)).toISOString()).toBe(siguiente);
  });

  it("R35: en el «siguiente» empieza un ciclo nuevo y un milisegundo antes sigue el de ahora", () => {
    for (const { ancla, cortoDesde, enCurso, siguiente } of CASOS_CICLO_CORTO) {
      const s = new Date(siguiente);
      expect(inicioDelCicloEnCurso(new Date(ancla), fecha(cortoDesde), s).toISOString()).toBe(siguiente);
      const antes = new Date(s.getTime() - 1);
      expect(inicioDelCicloEnCurso(new Date(ancla), fecha(cortoDesde), antes).toISOString()).toBe(enCurso);
    }
  });

  it("R41: sin ciclo corto guardado da lo mismo que inicioDelCiclo de SL-24 en toda su tabla", () => {
    for (const { ancla, ahora, inicio } of CASOS_CICLO) {
      expect(inicioDelCicloEnCurso(new Date(ancla), null, new Date(ahora)).toISOString()).toBe(inicio);
    }
  });

  it("no muta las fechas que recibe", () => {
    const ancla = new Date("2026-11-05T06:00:00.000Z");
    const corto = new Date("2026-10-29T15:00:00.000Z");
    const r = inicioDelCicloEnCurso(ancla, corto, new Date("2026-11-01T00:00:00.000Z"));
    r.setUTCFullYear(2000);
    expect(corto.toISOString()).toBe("2026-10-29T15:00:00.000Z");
    expect(ancla.toISOString()).toBe("2026-11-05T06:00:00.000Z");
  });
});

// SLT-58 (design §11.3, R30, P6) — el rango de la fecha de inicio: hoy ∓ 1 mes, con «hoy» en la hora de
// la plataforma (−06:00) y el recorte al último día del mes.
describe("SLT-58 — rangoDelInicioDelCiclo (R30)", () => {
  const casos = [
    { caso: "R30: un día cualquiera", ahora: "2026-10-29T15:00:00.000Z", hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" },
    { caso: "R30: hoy 31 de marzo, año normal: el límite pasado es el 28 de febrero y el futuro el 30 de abril", ahora: "2027-03-31T15:00:00.000Z", hoy: "2027-03-31", min: "2027-02-28", max: "2027-04-30" },
    { caso: "R30: hoy 31 de marzo, año bisiesto: el límite pasado es el 29 de febrero", ahora: "2028-03-31T15:00:00.000Z", hoy: "2028-03-31", min: "2028-02-29", max: "2028-04-30" },
    { caso: "R30: hoy 31 de enero: el límite futuro es el 28 de febrero", ahora: "2027-01-31T15:00:00.000Z", hoy: "2027-01-31", min: "2026-12-31", max: "2027-02-28" },
    { caso: "R30: hoy es el de la plataforma: las 21:00 del 31 de octubre son el 1 de noviembre en UTC", ahora: "2026-11-01T03:00:00.000Z", hoy: "2026-10-31", min: "2026-09-30", max: "2026-11-30" },
    { caso: "R30: a las 00:00 de la plataforma ya es el día nuevo", ahora: "2026-10-30T06:00:00.000Z", hoy: "2026-10-30", min: "2026-09-30", max: "2026-11-30" },
    { caso: "R30: cruza de año hacia adelante", ahora: "2026-12-15T15:00:00.000Z", hoy: "2026-12-15", min: "2026-11-15", max: "2027-01-15" },
    { caso: "R30: cruza de año hacia atrás", ahora: "2027-01-15T15:00:00.000Z", hoy: "2027-01-15", min: "2026-12-15", max: "2027-02-15" },
  ];

  it.each(casos)("$caso", ({ ahora, hoy, min, max }) => {
    expect(rangoDelInicioDelCiclo(new Date(ahora))).toEqual({ hoy, min, max });
  });
});

// SLT-58 (design §11.3, R32, P9) — el ancla de la fecha elegida.
describe("SLT-58 — anclaDeLaFechaElegida (R32)", () => {
  it("R32: hoy ancla en el instante de la asignación", () => {
    expect(anclaDeLaFechaElegida("2026-10-29", new Date("2026-10-29T15:00:00.000Z"))).toBe("ahora");
  });

  it("R32: «hoy» es el de la plataforma: a las 21:00 del 29 (03:00 UTC del 30) el 29 sigue siendo hoy", () => {
    expect(anclaDeLaFechaElegida("2026-10-29", new Date("2026-10-30T03:00:00.000Z"))).toBe("ahora");
    expect(anclaDeLaFechaElegida("2026-10-30", new Date("2026-10-30T03:00:00.000Z"))).toEqual(
      new Date("2026-10-30T06:00:00.000Z"),
    );
  });

  it("R32: una fecha futura o pasada ancla a las 00:00 de la plataforma (06:00 UTC)", () => {
    const ahora = new Date("2026-10-29T15:00:00.000Z");
    expect(anclaDeLaFechaElegida("2026-11-05", ahora)).toEqual(new Date("2026-11-05T06:00:00.000Z"));
    expect(anclaDeLaFechaElegida("2026-10-14", ahora)).toEqual(new Date("2026-10-14T06:00:00.000Z"));
  });
});
