import { describe, expect, it } from "vitest";

import { fechaDiaInstanteCR } from "@/lib/utils/fecha-dia-iso";

// SLT-76 (R21) — el dia de Costa Rica de un instante `*At` en las descargas de cierres.
// Literales escritos a mano: CR es UTC-6 todo el año (sin horario de verano).

describe("fechaDiaInstanteCR (R21)", () => {
  it("un instante de despues de las 18:00 CR sale con el dia CR, no el UTC", () => {
    // 2026-11-01T05:03Z = 23:03 del 31 de octubre en Costa Rica.
    expect(fechaDiaInstanteCR("2026-11-01T05:03:00.000Z")).toBe("2026-10-31");
  });

  it("la medianoche UTC exacta es un instante, no una fecha @db.Date: dia CR anterior", () => {
    // 2026-11-01T00:00Z = 18:00 del 31 de octubre en Costa Rica.
    expect(fechaDiaInstanteCR("2026-11-01T00:00:00.000Z")).toBe("2026-10-31");
  });

  it("un instante de mediodia CR conserva su dia", () => {
    expect(fechaDiaInstanteCR("2026-11-01T18:00:00.000Z")).toBe("2026-11-01");
  });

  it("lo que no es un instante se devuelve TAL CUAL", () => {
    expect(fechaDiaInstanteCR("no-es-fecha")).toBe("no-es-fecha");
    expect(fechaDiaInstanteCR("")).toBe("");
  });
});
