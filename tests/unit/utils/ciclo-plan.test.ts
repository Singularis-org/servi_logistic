import { describe, it, expect } from "vitest";

import { inicioDelCiclo, inicioDelSiguienteCiclo } from "@/lib/planes/ciclo";

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
    { caso: "R5: un ahora anterior al ancla da el ancla más un mes", ancla: "2026-10-15T12:00:00.000Z", ahora: "2026-09-01T00:00:00.000Z", siguiente: "2026-11-15T12:00:00.000Z" },
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
