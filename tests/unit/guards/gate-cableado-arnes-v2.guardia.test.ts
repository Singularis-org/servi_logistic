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
// cita la ficha `SL-<n>` o `SLT-<n>` que retira la excepcion (R21, R742 de SLT-177).

const SCRIPT_TEST_RAPIDO = "node scripts/test-rapido.mjs";
const SCRIPT_TEST_JSON =
  "vitest run --reporter=default --reporter=json --outputFile.json=.vitest-rojos.json";

const MOTIVO_MINIMO = 40;
// SLT-177 (R742): las fichas del board actual son `SLT-<n>`; las antiguas, `SL-<n>`. Vale cualquiera.
const FICHA = /\bSLT?-\d+\b/;
// SLT-177 (R743): SL-31 se cerro sin retirar sus entradas; ningun motivo puede volver a colgar de ella.
const SL31 = /\bSL-31\b/;
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
      errores.push(`${ruta}: el \`motivo\` no cita la ficha SL-<n> o SLT-<n> que retira la entrada`);
    } else if (SL31.test(motivo)) {
      errores.push(`${ruta}: el \`motivo\` cita SL-31, que esta cerrada: cita la ficha que lo retira de verdad`);
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
      "tests/existe.test.ts: el `motivo` no cita la ficha SL-<n> o SLT-<n> que retira la entrada",
    ]);
  });

  it("SLT-177 R742: un motivo que cita SLT-<n> vale; uno que solo dice «SLTX» o «ASL-» sin numero, no", () => {
    const fixture: BaselineCrudo = {
      archivos: {
        "tests/slt.test.ts": {
          motivo: "Base vacia medida en CI el 2026-11-16 (run 1); la retira la ficha SLT-178.",
          desde: "2026-10-21",
        },
        "tests/sin-ficha.test.ts": {
          motivo: "Motivo largo que habla de SLT y de SL- pero no da el numero de ninguna ficha.",
          desde: "2026-10-21",
        },
      },
    };
    expect(erroresDelBaseline(fixture, () => true)).toEqual([
      "tests/sin-ficha.test.ts: el `motivo` no cita la ficha SL-<n> o SLT-<n> que retira la entrada",
    ]);
  });

  it("SLT-177 R743: un motivo que vuelve a decir «La retira SL-31» da rojo; SL-310 no es SL-31", () => {
    const fixture: BaselineCrudo = {
      archivos: {
        "tests/vuelve.test.ts": {
          motivo: "La app nace vacia y la suite asume ordenes sembradas. La retira SL-31 (datos propios).",
          desde: "2026-10-22",
        },
        "tests/otra.test.ts": {
          motivo: "Motivo largo de sobra que cita la ficha SL-310, que no es la cerrada.",
          desde: "2026-10-22",
        },
      },
    };
    expect(erroresDelBaseline(fixture, () => true)).toEqual([
      "tests/vuelve.test.ts: el `motivo` cita SL-31, que esta cerrada: cita la ficha que lo retira de verdad",
    ]);
  });
});
