import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";

// SL-44 (R3; design.md > D1) — GUARDIA: `AUTH_OTP_DEBUG_LOG` escribe el codigo del OTP en claro en
// la consola. Solo la encienden las pruebas: fuera de `e2e/`, `playwright.config.ts`,
// `.github/workflows/gate.yml` y `tests/`, ningun archivo versionado le da un valor no vacio, y
// `.env.example` la deja vacia. La guarda de codigo (`otpDebugLogHabilitado` apagado con
// VERCEL_ENV=production, R1) es la segunda linea; esta es la primera.
//
// Que cuenta como asignacion: el nombre, opcionalmente cerrado por comilla o `]`, seguido de `=`,
// `:`, `??=` o `||=` (no `==`/`===`) y de un valor que no empieza por comilla de cierre ni esta
// vacio. Cubre `.env`, YAML, JSON, `process.env.X = "1"`, `process.env["X"] = "1"` y un
// `X=1 next start` dentro de un script de package.json.
//
// Que no cuenta:
//   - las lineas de comentario (`//`, `/*`, `*`, `#`, `<!--`): un comentario no enciende nada;
//   - los `.md`: la documentacion cita `AUTH_OTP_DEBUG_LOG=1` en prosa (README, specs, progress)
//     y un markdown no fija el entorno de ningun proceso.
//
// El reporte nombra `ruta:linea`, nunca el contenido de la linea.

const VARIABLE = "AUTH_OTP_DEBUG_LOG";

/** Prefijos y archivos donde la variable se puede encender: son las pruebas. */
export const PERMITIDOS: readonly string[] = ["e2e/", "playwright.config.ts", ".github/workflows/gate.yml", "tests/"];

const ASIGNACION_CON_VALOR = new RegExp(
  `(?<![A-Za-z0-9_])${VARIABLE}["'\`]?\\]?\\s*(?:\\?\\?=|\\|\\|=|=(?!=)|:)\\s*["'\`]?[^"'\`\\s,;)}\\]]`,
);

const LINEA_COMENTARIO = /^\s*(?:\/\/|\/\*|\*|#|<!--)/;

export function permitido(ruta: string): boolean {
  return PERMITIDOS.some((p) => (p.endsWith("/") ? ruta.startsWith(p) : ruta === p));
}

export function esMarkdown(ruta: string): boolean {
  return /\.mdx?$/i.test(ruta);
}

/** Lineas (desde 1) de `texto` que dan a la variable un valor no vacio. */
export function lineasQueLaEnciendenEn(texto: string): number[] {
  const malas: number[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (LINEA_COMENTARIO.test(linea)) return;
    if (ASIGNACION_CON_VALOR.test(linea)) malas.push(i + 1);
  });
  return malas;
}

export type Motivo = "asignacion-fuera-de-pruebas" | "env-example-con-valor" | "env-example-sin-la-variable";

export interface Hallazgo {
  ruta: string;
  linea: number | null;
  motivo: Motivo;
}

/**
 * Funcion pura de la guardia: recibe los archivos versionados (ruta relativa con `/` y contenido)
 * y devuelve los hallazgos. Vacia = verde.
 */
export function hallazgosOtpDebug(archivos: readonly { ruta: string; texto: string }[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const { ruta, texto } of archivos) {
    if (ruta === ".env.example") {
      const lineas = texto.split(/\r?\n/).map((l) => l.trim());
      if (!lineas.some((l) => l === `${VARIABLE}=`)) {
        const conValor = lineas.findIndex((l) => l.startsWith(`${VARIABLE}=`));
        hallazgos.push(
          conValor >= 0
            ? { ruta, linea: conValor + 1, motivo: "env-example-con-valor" }
            : { ruta, linea: null, motivo: "env-example-sin-la-variable" },
        );
      }
      continue;
    }
    if (permitido(ruta) || esMarkdown(ruta)) continue;
    for (const linea of lineasQueLaEnciendenEn(texto)) {
      hallazgos.push({ ruta, linea, motivo: "asignacion-fuera-de-pruebas" });
    }
  }
  if (!archivos.some((a) => a.ruta === ".env.example")) {
    hallazgos.push({ ruta: ".env.example", linea: null, motivo: "env-example-sin-la-variable" });
  }
  return hallazgos;
}

export const mensaje = (h: readonly Hallazgo[]) =>
  h.length === 0
    ? ""
    : `${VARIABLE} vuelca el OTP en claro y solo la encienden las pruebas (SL-44 R3). Hallazgos:\n` +
      h.map((x) => `  ${x.ruta}${x.linea === null ? "" : `:${x.linea}`} · ${x.motivo}`).join("\n");

/** Archivos versionados (incluye los `git add -N`), sin binarios ni los borrados del arbol. */
function archivosVersionados(): { ruta: string; texto: string }[] {
  const salida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ_DEL_REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const archivos: { ruta: string; texto: string }[] = [];
  for (const ruta of salida.split("\0").filter(Boolean)) {
    const abs = path.join(RAIZ_DEL_REPO, ruta);
    if (!existsSync(abs) || !statSync(abs).isFile() || statSync(abs).size > 2 * 1024 * 1024) continue;
    const texto = readFileSync(abs, "utf8");
    if (texto.includes("\0")) continue;
    archivos.push({ ruta, texto });
  }
  return archivos;
}

const ENV_OK = { ruta: ".env.example", texto: "# debug\nAUTH_OTP_DEBUG_LOG=\n" };

describe("SL-44 R3 — AUTH_OTP_DEBUG_LOG solo se enciende en las pruebas", () => {
  describe("deteccion (fixtures)", () => {
    it("verde: .env.example vacia, pruebas que la encienden, lecturas, comparaciones, comentarios y markdown", () => {
      const archivos = [
        ENV_OK,
        { ruta: "e2e/_fixture.ts", texto: 'process.env.AUTH_OTP_DEBUG_LOG = "1";' },
        { ruta: "playwright.config.ts", texto: 'env: { AUTH_OTP_DEBUG_LOG: "1" },' },
        { ruta: ".github/workflows/gate.yml", texto: "          AUTH_OTP_DEBUG_LOG: 1" },
        { ruta: "tests/unit/x.test.ts", texto: 'process.env.AUTH_OTP_DEBUG_LOG = "true";' },
        {
          ruta: "lib/config/email.ts",
          texto: [
            'return leerBooleano("AUTH_OTP_DEBUG_LOG", false);',
            'if (process.env.AUTH_OTP_DEBUG_LOG === "1") {}',
            " * se imprime con AUTH_OTP_DEBUG_LOG=1, en local",
            "// AUTH_OTP_DEBUG_LOG=1",
            'const vacia = { AUTH_OTP_DEBUG_LOG: "" };',
          ].join("\n"),
        },
        { ruta: "README.md", texto: "El código solo se imprime con `AUTH_OTP_DEBUG_LOG=1`." },
        { ruta: "scripts/x.sh", texto: "# AUTH_OTP_DEBUG_LOG=1 pnpm dev" },
      ];
      expect(hallazgosOtpDebug(archivos)).toEqual([]);
    });

    it.each([
      ["lib/x.env", "AUTH_OTP_DEBUG_LOG=1"],
      ["lib/x.ts", 'process.env.AUTH_OTP_DEBUG_LOG = "1";'],
      ["lib/x.ts", 'process.env["AUTH_OTP_DEBUG_LOG"] ??= "true";'],
      ["vercel.json", '{ "env": { "AUTH_OTP_DEBUG_LOG": "1" } }'],
      ["package.json", '"start:e2e": "AUTH_OTP_DEBUG_LOG=1 next start"'],
      [".github/workflows/otro.yml", "      AUTH_OTP_DEBUG_LOG: ${{ vars.X }}"],
    ])("rojo, asignacion fuera de pruebas: %s", (ruta, texto) => {
      expect(hallazgosOtpDebug([ENV_OK, { ruta, texto }])).toEqual([
        { ruta, linea: 1, motivo: "asignacion-fuera-de-pruebas" },
      ]);
    });

    it("rojo, .env.example le da valor", () => {
      expect(hallazgosOtpDebug([{ ruta: ".env.example", texto: "A=\nAUTH_OTP_DEBUG_LOG=1\n" }])).toEqual([
        { ruta: ".env.example", linea: 2, motivo: "env-example-con-valor" },
      ]);
    });

    it("rojo, .env.example no la declara (o no existe)", () => {
      expect(hallazgosOtpDebug([{ ruta: ".env.example", texto: "A=\n" }])).toEqual([
        { ruta: ".env.example", linea: null, motivo: "env-example-sin-la-variable" },
      ]);
      expect(hallazgosOtpDebug([])).toEqual([
        { ruta: ".env.example", linea: null, motivo: "env-example-sin-la-variable" },
      ]);
    });

    it("el mensaje nombra ruta:linea y motivo, no el contenido", () => {
      const m = mensaje(hallazgosOtpDebug([ENV_OK, { ruta: "lib/x.env", texto: "AUTH_OTP_DEBUG_LOG=valor-secreto" }]));
      expect(m).toContain("lib/x.env:1 · asignacion-fuera-de-pruebas");
      expect(m).not.toContain("valor-secreto");
    });
  });

  it("el arbol versionado no la enciende fuera de las pruebas y .env.example la deja vacia", () => {
    const archivos = archivosVersionados();
    expect(archivos.some((a) => a.ruta === ".env.example")).toBe(true);
    expect(archivos.length).toBeGreaterThan(100);
    const h = hallazgosOtpDebug(archivos);
    expect(h, mensaje(h)).toEqual([]);
  });
});
