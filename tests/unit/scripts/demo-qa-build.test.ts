import { describe, expect, it } from "vitest";

import { decidirDemo, type DecisionDemo } from "@/scripts/demo-qa/decision-build";

// SL-43 (design §10.1; R29, R30) — cuándo corre el paso de demo del build. Una fila de la tabla de
// D10.1 por caso. La orquestación `--build` (omitida sin conectar, fallo → salir(1), tope) y el orden
// de `build` en `package.json` los añade T9 a este mismo archivo.

function motivo(d: DecisionDemo): string {
  if (d.correr) throw new Error("se esperaba la demo omitida y corre");
  return d.motivo;
}

describe("decidirDemo — tabla de D10.1", () => {
  it("production, aunque los dos flags estén puestos → omitida, y avisa de DEMO_ON_PREVIEW", () => {
    const d = decidirDemo({ VERCEL_ENV: "production", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" });
    expect(motivo(d)).toMatch(/producción nunca recrea la demo/);
    expect(motivo(d)).toMatch(/DEMO_ON_PREVIEW está puesta en producción/);
  });

  it("production sin DEMO_ON_PREVIEW → omitida, sin aviso", () => {
    const d = decidirDemo({ VERCEL_ENV: "production" });
    expect(motivo(d)).toMatch(/producción nunca recrea la demo/);
    expect(motivo(d)).not.toMatch(/DEMO_ON_PREVIEW/);
  });

  it("preview con MIGRATE_ON_PREVIEW=true y DEMO_ON_PREVIEW=true → corre (R29)", () => {
    expect(decidirDemo({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" })).toEqual({
      correr: true,
    });
  });

  it.each([undefined, "", "TRUE", "1", "si", " true "])(
    "preview con migraciones y DEMO_ON_PREVIEW=%j → omitida: «preview sin DEMO_ON_PREVIEW=true»",
    (valor) => {
      const d = decidirDemo({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: valor });
      expect(motivo(d)).toBe("preview sin DEMO_ON_PREVIEW=true");
    },
  );

  it.each([undefined, "", "TRUE", "false"])(
    "preview sin migraciones (MIGRATE_ON_PREVIEW=%j), aunque DEMO_ON_PREVIEW=true → omitida (R30)",
    (valor) => {
      const d = decidirDemo({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: valor, DEMO_ON_PREVIEW: "true" });
      expect(motivo(d)).toMatch(/sin migraciones en este preview/);
    },
  );

  it.each([undefined, ""])("VERCEL_ENV=%j (build local) → omitida: usa pnpm demo:qa", (valor) => {
    const d = decidirDemo({ VERCEL_ENV: valor, MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" });
    expect(motivo(d)).toMatch(/build local.*pnpm demo:qa/);
  });

  it("otro entorno (development) → omitida, nombrándolo", () => {
    const d = decidirDemo({ VERCEL_ENV: "development", MIGRATE_ON_PREVIEW: "true", DEMO_ON_PREVIEW: "true" });
    expect(motivo(d)).toMatch(/entorno 'development'/);
  });
});
