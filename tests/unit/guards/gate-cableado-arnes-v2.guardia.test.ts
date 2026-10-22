import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";

// SL-10 (R3, R4, R5, R21) — el gate rapido esta cableado al arnes v2.
//
// `init.sh` y `.github/workflows/gate.yml` llaman a `pnpm run test:rapido` y leen el informe de
// `pnpm run test:json` en `.vitest-rojos.json`. Si el script apunta a otro sitio, el comparador
// muere con «no existe el reporte» o el gate corre otra cosa. Los dos scripts se afirman como
// LITERALES: son el contrato con esos dos archivos, no un detalle de implementacion.
//
// El baseline se vigila por su FORMA, no por su lista: podarlo es obligatorio (`docs/gate.md`),
// y una guardia que congelara las rutas pelearia con la poda. El comparador de CI ya exige
// `motivo` y `desde`, pero el rapido no los valida; por eso se hace aqui, mas estricto: el motivo
// cita la ficha `SL-<n>` que retira la excepcion (R21).

const SCRIPT_TEST_RAPIDO = "node scripts/test-rapido.mjs";
const SCRIPT_TEST_JSON =
  "vitest run --reporter=default --reporter=json --outputFile.json=.vitest-rojos.json";

const MOTIVO_MINIMO = 40;
const FICHA = /SL-\d+/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type BaselineCrudo = { archivos?: Record<string, unknown> } & Record<string, unknown>;

/** Errores de forma del baseline, uno por problema. `existe` se inyecta para probarla sin disco. */
export function erroresDelBaseline(
  baseline: BaselineCrudo,
  existe: (ruta: string) => boolean,
): string[] {
  const errores: string[] = [];
  const archivos = baseline.archivos;
  if (!archivos || typeof archivos !== "object") return ["falta el objeto `archivos`"];
  for (const [ruta, meta] of Object.entries(archivos)) {
    const m = (meta ?? {}) as { motivo?: unknown; desde?: unknown };
    const motivo = typeof m.motivo === "string" ? m.motivo : "";
    if (motivo.length < MOTIVO_MINIMO) {
      errores.push(`${ruta}: \`motivo\` ausente o de menos de ${MOTIVO_MINIMO} caracteres`);
    } else if (!FICHA.test(motivo)) {
      errores.push(`${ruta}: el \`motivo\` no cita la ficha SL-<n> que retira la entrada`);
    }
    if (typeof m.desde !== "string" || !FECHA.test(m.desde)) {
      errores.push(`${ruta}: \`desde\` no tiene la forma AAAA-MM-DD`);
    }
    if (!existe(ruta)) errores.push(`${ruta}: el archivo no existe`);
  }
  return errores;
}

const leerJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(RAIZ_DEL_REPO, rel), "utf8"));

describe("SL-10 — el gate rapido esta cableado al arnes v2", () => {
  it("test:rapido ejecuta scripts/test-rapido.mjs (R3)", () => {
    expect(leerJson("package.json").scripts["test:rapido"]).toBe(SCRIPT_TEST_RAPIDO);
  });

  it("test:json escribe su informe en .vitest-rojos.json (R4)", () => {
    expect(leerJson("package.json").scripts["test:json"]).toBe(SCRIPT_TEST_JSON);
  });

  it("git ignora .vitest-rojos.json y .vitest-codigo (R4)", () => {
    const salida = execFileSync("git", ["check-ignore", ".vitest-rojos.json", ".vitest-codigo"], {
      cwd: RAIZ_DEL_REPO,
      encoding: "utf8",
    });
    expect(salida.split(/\r?\n/).filter(Boolean).sort()).toEqual([".vitest-codigo", ".vitest-rojos.json"]);
  });

  it("cada entrada del baseline tiene motivo con ficha, desde y ruta existente (R5, R21)", () => {
    const baseline = leerJson("tests/baseline-rojos.json") as BaselineCrudo;
    const errores = erroresDelBaseline(baseline, (r) => fs.existsSync(path.join(RAIZ_DEL_REPO, r)));
    expect(errores, `baseline mal formado:\n${errores.join("\n")}`).toEqual([]);
  });

  it("la validacion muerde: una entrada sin motivo, sin fecha y con ruta inexistente da error", () => {
    const fixture: BaselineCrudo = {
      archivos: {
        "tests/no-existe.test.ts": { desde: "21-10-2026" },
        "tests/existe.test.ts": {
          motivo: "Motivo largo de sobra pero que no nombra ninguna ficha del board.",
          desde: "2026-10-21",
        },
        "tests/bien.test.ts": {
          motivo: "Motivo largo de sobra que si nombra la ficha SL-99 que la retira.",
          desde: "2026-10-21",
        },
      },
    };
    const errores = erroresDelBaseline(fixture, (r) => r !== "tests/no-existe.test.ts");
    expect(errores).toEqual([
      "tests/no-existe.test.ts: `motivo` ausente o de menos de 40 caracteres",
      "tests/no-existe.test.ts: `desde` no tiene la forma AAAA-MM-DD",
      "tests/no-existe.test.ts: el archivo no existe",
      "tests/existe.test.ts: el `motivo` no cita la ficha SL-<n> que retira la entrada",
    ]);
  });
});
