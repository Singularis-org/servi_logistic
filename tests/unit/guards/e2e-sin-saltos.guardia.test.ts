import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";

// SL-44 (R9, R13, R19 y la cobertura de proyectos de D3; design.md > D7) — GUARDIA: el E2E sale
// verde de verdad. Cuatro cosas, cada una con su motivo de rojo:
//
// 1. **Sin saltos (R13).** Ningun archivo de `e2e/` contiene `test.skip`, `test.fixme`, `.only` ni
//    sus formas en `describe`, `serial`/`parallel` o `test.info()`/`testInfo`. Tampoco condicional:
//    `test.skip(cond, "…")` es la misma llamada.
// 2. **Sin datos heredados (R9).** Ni `correct-password`, ni un correo literal `@example.com`, ni
//    lecturas de `E2E_RASTREO_*`, `SL17_HUMO_*`, `SL39_UI` o `SL40_UI`. Los correos de la fabrica son
//    `@example.test` con sufijo aleatorio (R10). Se busca en todo el texto, comentarios incluidos:
//    R13 dice «contener», y un comentario con `test.skip` es la receta para volver a ponerlo.
// 3. **Cada spec en exactamente un proyecto (D3).** `playwright.config.ts` se lee como TEXTO: los
//    `specs("…")` y los patrones `**/x.spec.ts` de cada `testMatch`. Un proyecto sin `testMatch`
//    recoge todos los specs, como hace Playwright; uno con un `testMatch` que no se sabe leer es
//    rojo, para que la guardia no quede ciega. Un spec en ningun proyecto no corre en ningun grupo
//    de CI; en dos, corre dos veces sobre la misma base.
// 4. **Los flujos criticos tienen su spec (R19).** Cada nombre entre backticks de
//    `docs/checkpoints-proyecto.md > Flujos críticos` es un `e2e/<nombre>.spec.ts`; uno con `*`
//    casa con al menos uno.
//
// La logica son funciones puras sobre texto; los fixtures prueban cada motivo y el ultimo caso
// corre contra el arbol real, con su tamaño afirmado para que un lector roto no pase en verde.
// El reporte nombra `ruta:linea · motivo`.

export type Motivo =
  | "skip"
  | "fixme"
  | "only"
  | "credencial-sembrada"
  | "correo-example-com"
  | "variable-heredada"
  | "spec-sin-proyecto"
  | "spec-en-varios-proyectos"
  | "proyecto-ilegible"
  | "proyecto-cita-spec-inexistente"
  | "flujo-critico-sin-archivo"
  | "flujos-criticos-ilegible";

export interface Hallazgo {
  ruta: string;
  linea: number | null;
  motivo: Motivo;
  detalle?: string;
}

export interface Archivo {
  ruta: string;
  texto: string;
}

/* -------------------------------------------------------------------------- */
/* 1 y 2: el contenido de e2e/                                                 */
/* -------------------------------------------------------------------------- */

/** `test.skip`, `it.only`, `test.describe.fixme`, `test.describe.serial.only`, `describe.skip`… */
const LLAMADA_DE_SALTO =
  /\b(?:test|it|describe)(?:\s*\.\s*describe)?(?:\s*\.\s*(?:serial|parallel))?\s*\.\s*(skip|fixme|only)\b/g;
/** `test.info().skip(…)`, `testInfo.fixme(…)`. */
const SALTO_EN_TIEMPO_DE_EJECUCION = /(?:\.info\(\s*\)|\btestInfo)\s*\.\s*(skip|fixme)\b/g;

const PROHIBIDOS: readonly { patron: RegExp; motivo: Motivo }[] = [
  { patron: /correct-password/, motivo: "credencial-sembrada" },
  { patron: /@example\.com(?![A-Za-z0-9-])/i, motivo: "correo-example-com" },
  { patron: /\b(?:E2E_RASTREO_|SL17_HUMO_)|\bSL39_UI\b|\bSL40_UI\b/, motivo: "variable-heredada" },
];

export function hallazgosDeContenido(archivos: readonly Archivo[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const { ruta, texto } of archivos) {
    texto.split(/\r?\n/).forEach((linea, i) => {
      for (const re of [LLAMADA_DE_SALTO, SALTO_EN_TIEMPO_DE_EJECUCION]) {
        for (const m of linea.matchAll(re)) {
          hallazgos.push({ ruta, linea: i + 1, motivo: m[1] as Motivo });
        }
      }
      for (const { patron, motivo } of PROHIBIDOS) {
        if (patron.test(linea)) hallazgos.push({ ruta, linea: i + 1, motivo });
      }
    });
  }
  return hallazgos;
}

/* -------------------------------------------------------------------------- */
/* 3: cada spec en exactamente un proyecto                                     */
/* -------------------------------------------------------------------------- */

/** `e2e/sub/x.spec.ts` → `x`. Los patrones del config son `**\/x.spec.ts`: casan por nombre. */
export function nombreDeSpec(ruta: string): string {
  return ruta.slice(ruta.lastIndexOf("/") + 1).replace(/\.spec\.ts$/, "");
}

export interface Proyecto {
  nombre: string;
  /** `null`: sin `testMatch`, recoge todos los specs. */
  specs: string[] | null;
  legible: boolean;
}

/** Los proyectos del config, leidos como texto: desde `projects: [` hasta `webServer` o el final. */
export function proyectosDelConfig(config: string): Proyecto[] {
  const inicio = config.search(/\bprojects\s*:\s*\[/);
  if (inicio < 0) return [];
  const fin = config.slice(inicio).search(/\bwebServer\s*:/);
  const bloque = fin < 0 ? config.slice(inicio) : config.slice(inicio, inicio + fin);
  const trozos = bloque.split(/\bname\s*:\s*/).slice(1);
  return trozos.map((trozo) => {
    const nombre = /^["'`]([^"'`]+)["'`]/.exec(trozo)?.[1] ?? "?";
    const desde = trozo.search(/\btestMatch\s*:/);
    if (desde < 0) return { nombre, specs: null, legible: true };
    const valor = trozo.slice(desde);
    const nombres = new Set<string>();
    for (const llamada of valor.matchAll(/\bspecs\s*\(([^)]*)\)/g)) {
      for (const lit of llamada[1].matchAll(/["'`]([^"'`]+)["'`]/g)) nombres.add(lit[1]);
    }
    for (const patron of valor.matchAll(/["'`]\*\*\/([\w.-]+)\.spec\.ts["'`]/g)) nombres.add(patron[1]);
    return { nombre, specs: [...nombres], legible: nombres.size > 0 };
  });
}

export function hallazgosDeProyectos(rutasDeSpecs: readonly string[], config: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const proyectos = proyectosDelConfig(config);
  if (proyectos.length === 0) {
    return [{ ruta: "playwright.config.ts", linea: null, motivo: "proyecto-ilegible", detalle: "sin `projects`" }];
  }
  const existentes = new Set(rutasDeSpecs.map(nombreDeSpec));
  for (const p of proyectos) {
    if (!p.legible) {
      hallazgos.push({ ruta: "playwright.config.ts", linea: null, motivo: "proyecto-ilegible", detalle: p.nombre });
    }
    for (const s of p.specs ?? []) {
      if (!existentes.has(s)) {
        hallazgos.push({
          ruta: "playwright.config.ts",
          linea: null,
          motivo: "proyecto-cita-spec-inexistente",
          detalle: `${p.nombre} → ${s}`,
        });
      }
    }
  }
  for (const ruta of rutasDeSpecs) {
    const n = nombreDeSpec(ruta);
    const en = proyectos.filter((p) => p.specs === null || p.specs.includes(n)).map((p) => p.nombre);
    if (en.length === 0) hallazgos.push({ ruta, linea: null, motivo: "spec-sin-proyecto" });
    if (en.length > 1) hallazgos.push({ ruta, linea: null, motivo: "spec-en-varios-proyectos", detalle: en.join(", ") });
  }
  return hallazgos;
}

/* -------------------------------------------------------------------------- */
/* 4: los flujos criticos                                                      */
/* -------------------------------------------------------------------------- */

const RUTA_CHECKPOINTS = "docs/checkpoints-proyecto.md";

/**
 * Un nombre de spec: `auth`, `cierres-admin*` o `e2e/auth.spec.ts`. La seccion tambien cita rutas
 * que no son specs (`e2e/`, `lib/db/`); esas no cuentan.
 */
const CITA_DE_SPEC = /^(?:e2e\/(?:[\w-]+\/)*)?[\w*-]+(?:\.spec\.ts)?$/;

/** Los nombres de spec entre backticks de la seccion «Flujos críticos», sin `e2e/` ni `.spec.ts`. */
export function citasDeFlujosCriticos(doc: string): string[] {
  const lineas = doc.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => /^##\s+Flujos cr[ií]ticos/i.test(l));
  if (inicio < 0) return [];
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((l) => /^##\s/.test(l));
  const seccion = (fin < 0 ? resto : resto.slice(0, fin)).join("\n");
  return [...seccion.matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1])
    .filter((c) => CITA_DE_SPEC.test(c))
    .map(nombreDeSpec);
}

function casa(cita: string, nombre: string): boolean {
  if (!cita.includes("*")) return cita === nombre;
  const re = new RegExp(`^${cita.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
  return re.test(nombre);
}

export function hallazgosDeFlujosCriticos(rutasDeSpecs: readonly string[], doc: string): Hallazgo[] {
  const citas = citasDeFlujosCriticos(doc);
  if (citas.length === 0) return [{ ruta: RUTA_CHECKPOINTS, linea: null, motivo: "flujos-criticos-ilegible" }];
  const nombres = rutasDeSpecs.map(nombreDeSpec);
  return citas
    .filter((c) => !nombres.some((n) => casa(c, n)))
    .map((c) => ({ ruta: RUTA_CHECKPOINTS, linea: null, motivo: "flujo-critico-sin-archivo" as const, detalle: c }));
}

/* -------------------------------------------------------------------------- */
/* La guardia                                                                  */
/* -------------------------------------------------------------------------- */

export function hallazgosE2e(e2e: readonly Archivo[], config: string, checkpoints: string): Hallazgo[] {
  const specs = e2e.map((a) => a.ruta).filter((r) => r.endsWith(".spec.ts"));
  return [
    ...hallazgosDeContenido(e2e),
    ...hallazgosDeProyectos(specs, config),
    ...hallazgosDeFlujosCriticos(specs, checkpoints),
  ];
}

export const mensaje = (h: readonly Hallazgo[]) =>
  h.length === 0
    ? ""
    : "El E2E tiene que salir verde de verdad (SL-44 R9, R13, R19, D3). Hallazgos:\n" +
      h
        .map((x) => `  ${x.ruta}${x.linea === null ? "" : `:${x.linea}`} · ${x.motivo}${x.detalle ? ` (${x.detalle})` : ""}`)
        .join("\n");

const EXTENSIONES_DE_CODIGO = /\.(?:[cm]?[jt]sx?)$/;

function archivosDeE2e(dir = path.join(RAIZ_DEL_REPO, "e2e"), acc: Archivo[] = []): Archivo[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) archivosDeE2e(completo, acc);
    else if (EXTENSIONES_DE_CODIGO.test(entrada.name)) {
      acc.push({ ruta: path.relative(RAIZ_DEL_REPO, completo).split(path.sep).join("/"), texto: readFileSync(completo, "utf8") });
    }
  }
  return acc;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const CONFIG_OK = `
export default defineConfig({
  projects: [
    { name: "plataforma-vacia", use: {}, testMatch: specs("superadmin-empresas") },
    { name: "aislamiento", dependencies: ["plataforma-vacia"], testMatch: specs("auth", "wallet-iva") },
    { name: "dinero", testMatch: ["**/wallet.spec.ts"] },
  ],
  webServer: [{ name: "no es un proyecto" }],
});`;

const CHECKPOINTS_OK = [
  "## Calidad",
  "- `no-es-un-spec`",
  "## Flujos críticos (exigen E2E)",
  "Una feature que toque uno de estos flujos deja un E2E en `e2e/`; si toca `lib/db/`, el humo.",
  "- [ ] Login (`e2e/auth.spec.ts`).",
  "- [ ] Dinero (`wallet*`, `superadmin-empresas`).",
  "## Datos y seguridad",
  "- `tampoco-es-un-spec`",
].join("\n");

const SPEC_LIMPIO = [
  'import { test, expect } from "@playwright/test";',
  'test.describe.configure({ mode: "serial" });',
  "const correo = `e2e-maestro-${sufijo}@example.test`;",
  'test("entra", async ({ page }) => { await expect(page).toHaveURL(/dashboard/); });',
].join("\n");

const E2E_OK: Archivo[] = [
  { ruta: "e2e/auth.spec.ts", texto: SPEC_LIMPIO },
  { ruta: "e2e/wallet.spec.ts", texto: SPEC_LIMPIO },
  { ruta: "e2e/wallet-iva.spec.ts", texto: SPEC_LIMPIO },
  { ruta: "e2e/superadmin-empresas.spec.ts", texto: SPEC_LIMPIO },
  { ruta: "e2e/_escenarios/reparto.ts", texto: "export const skipear = (lista: string[]) => lista.slice(1);" },
];

function conArchivo(ruta: string, texto: string): Archivo[] {
  return E2E_OK.map((a) => (a.ruta === ruta ? { ruta, texto } : a));
}

describe("SL-44 R9, R13, R19, D3 — el E2E sale verde de verdad", () => {
  describe("deteccion (fixtures)", () => {
    it("verde: specs limpios, cada uno en un proyecto y los flujos criticos resueltos", () => {
      expect(hallazgosE2e(E2E_OK, CONFIG_OK, CHECKPOINTS_OK)).toEqual([]);
    });

    it.each([
      ["fixme", 'test.fixme("pendiente", async () => {});', "fixme"],
      ["skip condicional", 'test.skip(process.platform === "win32", "no corre aqui");', "skip"],
      ["skip de describe", 'test.describe.skip("bloque", () => {});', "skip"],
      ["skip en ejecucion", "test.info().skip();", "skip"],
      ["only", 'test.only("solo este", async () => {});', "only"],
      ["only de describe serial", 'test.describe.serial.only("b", () => {});', "only"],
      ["correct-password", 'const PASSWORD = "correct-password";', "credencial-sembrada"],
      ["@example.com literal", 'const CORREO = "maestro@example.com";', "correo-example-com"],
      ["SL39_UI", 'if (process.env.SL39_UI !== "1") return;', "variable-heredada"],
      ["SL40_UI", "const ui = process.env.SL40_UI;", "variable-heredada"],
      ["SL17_HUMO_", "const log = process.env.SL17_HUMO_LOG_SERVIDOR;", "variable-heredada"],
      ["E2E_RASTREO_", "const guia = process.env.E2E_RASTREO_GUIA;", "variable-heredada"],
    ])("rojo, %s", (_caso, linea, motivo) => {
      const ruta = "e2e/auth.spec.ts";
      expect(hallazgosE2e(conArchivo(ruta, `${SPEC_LIMPIO}\n${linea}`), CONFIG_OK, CHECKPOINTS_OK)).toEqual([
        { ruta, linea: 5, motivo },
      ]);
    });

    it("rojo, un archivo de apoyo (no spec) tambien cuenta", () => {
      const ruta = "e2e/_escenarios/reparto.ts";
      expect(hallazgosE2e(conArchivo(ruta, 'const p = "correct-password";'), CONFIG_OK, CHECKPOINTS_OK)).toEqual([
        { ruta, linea: 1, motivo: "credencial-sembrada" },
      ]);
    });

    it("rojo, un spec fuera de proyecto", () => {
      const e2e = [...E2E_OK, { ruta: "e2e/huerfano.spec.ts", texto: SPEC_LIMPIO }];
      expect(hallazgosE2e(e2e, CONFIG_OK, CHECKPOINTS_OK)).toEqual([
        { ruta: "e2e/huerfano.spec.ts", linea: null, motivo: "spec-sin-proyecto" },
      ]);
    });

    it("rojo, un spec en dos proyectos", () => {
      const config = CONFIG_OK.replace('specs("auth", "wallet-iva")', 'specs("auth", "wallet-iva", "wallet")');
      expect(hallazgosE2e(E2E_OK, config, CHECKPOINTS_OK)).toEqual([
        { ruta: "e2e/wallet.spec.ts", linea: null, motivo: "spec-en-varios-proyectos", detalle: "aislamiento, dinero" },
      ]);
    });

    it("rojo, un proyecto sin `testMatch` recoge todos los specs (como Playwright)", () => {
      const config = CONFIG_OK.replace('{ name: "dinero", testMatch: ["**/wallet.spec.ts"] }', '{ name: "todo" }');
      const h = hallazgosE2e(E2E_OK, config, CHECKPOINTS_OK);
      expect(h.map((x) => `${x.ruta}:${x.motivo}`)).toEqual([
        "e2e/auth.spec.ts:spec-en-varios-proyectos",
        "e2e/wallet-iva.spec.ts:spec-en-varios-proyectos",
        "e2e/superadmin-empresas.spec.ts:spec-en-varios-proyectos",
      ]);
      expect(h.some((x) => x.ruta === "e2e/wallet.spec.ts")).toBe(false);
    });

    it("rojo, un `testMatch` que no se sabe leer, y un config sin proyectos", () => {
      const config = CONFIG_OK.replace('testMatch: ["**/wallet.spec.ts"]', "testMatch: /wallet/");
      expect(hallazgosE2e(E2E_OK, config, CHECKPOINTS_OK)).toEqual([
        { ruta: "playwright.config.ts", linea: null, motivo: "proyecto-ilegible", detalle: "dinero" },
        { ruta: "e2e/wallet.spec.ts", linea: null, motivo: "spec-sin-proyecto" },
      ]);
      expect(hallazgosE2e(E2E_OK, "export default {}", CHECKPOINTS_OK)[0]).toEqual({
        ruta: "playwright.config.ts",
        linea: null,
        motivo: "proyecto-ilegible",
        detalle: "sin `projects`",
      });
    });

    it("rojo, un proyecto que nombra un spec que no existe", () => {
      const config = CONFIG_OK.replace('specs("superadmin-empresas")', 'specs("superadmin-empresas", "home")');
      expect(hallazgosE2e(E2E_OK, config, CHECKPOINTS_OK)).toEqual([
        { ruta: "playwright.config.ts", linea: null, motivo: "proyecto-cita-spec-inexistente", detalle: "plataforma-vacia → home" },
      ]);
    });

    it("rojo, un flujo critico sin archivo, con y sin `*`", () => {
      const doc = CHECKPOINTS_OK.replace("`superadmin-empresas`", "`superadmin-empresas`, `cierres-admin*`, `e2e/home.spec.ts`");
      expect(hallazgosE2e(E2E_OK, CONFIG_OK, doc)).toEqual([
        { ruta: RUTA_CHECKPOINTS, linea: null, motivo: "flujo-critico-sin-archivo", detalle: "cierres-admin*" },
        { ruta: RUTA_CHECKPOINTS, linea: null, motivo: "flujo-critico-sin-archivo", detalle: "home" },
      ]);
    });

    it("el `*` casa con un nombre entero, no con un trozo", () => {
      const doc = CHECKPOINTS_OK.replace("`wallet*`", "`iva*`");
      expect(hallazgosE2e(E2E_OK, CONFIG_OK, doc)).toEqual([
        { ruta: RUTA_CHECKPOINTS, linea: null, motivo: "flujo-critico-sin-archivo", detalle: "iva*" },
      ]);
    });

    it("rojo, sin seccion «Flujos críticos» o sin citas en ella", () => {
      for (const doc of ["## Calidad\n- `auth`", "## Flujos críticos\nSin nombres.\n## Otra\n- `auth`"]) {
        expect(hallazgosE2e(E2E_OK, CONFIG_OK, doc)).toEqual([
          { ruta: RUTA_CHECKPOINTS, linea: null, motivo: "flujos-criticos-ilegible" },
        ]);
      }
    });

    it("el mensaje nombra ruta:linea, motivo y detalle", () => {
      const m = mensaje(hallazgosE2e(conArchivo("e2e/auth.spec.ts", "test.fixme();"), CONFIG_OK, CHECKPOINTS_OK));
      expect(m).toContain("e2e/auth.spec.ts:1 · fixme");
    });
  });

  it("el arbol real: sin saltos ni datos heredados, cada spec en un proyecto y los flujos criticos con spec", () => {
    const e2e = archivosDeE2e();
    const config = readFileSync(path.join(RAIZ_DEL_REPO, "playwright.config.ts"), "utf8");
    const checkpoints = readFileSync(path.join(RAIZ_DEL_REPO, RUTA_CHECKPOINTS), "utf8");

    // Tamaño de lo leido: un lector roto que no encuentra nada no puede salir verde.
    expect(e2e.filter((a) => a.ruta.endsWith(".spec.ts")).length).toBeGreaterThanOrEqual(20);
    expect(proyectosDelConfig(config).map((p) => p.nombre)).toEqual(["plataforma-vacia", "aislamiento", "reparto", "dinero"]);
    expect(citasDeFlujosCriticos(checkpoints).length).toBeGreaterThanOrEqual(10);

    const h = hallazgosE2e(e2e, config, checkpoints);
    expect(h, mensaje(h)).toEqual([]);
  });
});
