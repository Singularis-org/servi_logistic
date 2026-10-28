import { describe, it, expect } from "vitest";

import { inicioDelCiclo } from "@/lib/planes/ciclo";

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
