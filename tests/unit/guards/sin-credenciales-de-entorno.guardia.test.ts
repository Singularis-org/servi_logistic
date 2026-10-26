import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { RAIZ_DEL_REPO, archivosDeCodigoCensados } from "../../fixtures/raices-de-codigo";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-36 / T6.7 (R41, design §9.3) — LAS CREDENCIALES DE LOS CUATRO SERVICIOS NO SALEN DEL ENTORNO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUE PROTEGE. Desde SL-36 las credenciales de WhatsApp, Google Maps, la optimizacion de rutas y el
// asistente son de CADA EMPRESA (boveda, `/configuracion/integraciones`). La plataforma no presta
// claves. Reintroducir una lectura del entorno como «respaldo» (`deLaEmpresa ?? process.env.X`)
// suena prudente y es justo lo que la decision prohibe: una empresa sin integracion acabaria
// llamando a Meta o a Google con la clave de la plataforma, y lo cobraria la plataforma.
//
// LA LISTA ES LITERAL, copiada de design §9.3. NO se importa de codigo de produccion: una lista
// importada de la propia fuente que se vigila siempre sale verde (si alguien quita un nombre de
// alli, desaparece tambien de aqui).
//
// QUE CUENTA COMO LECTURA. Cualquiera de estas formas, en `app/`, `lib/` y `scripts/`:
//   - `process.env.X` y `process.env?.X`;
//   - `process.env["X"]`, con comillas simples, dobles o backtick;
//   - destructuring: `const { X } = process.env` (tambien con alias o junto a otras);
//   - `env.X` / `env["X"]` sobre un objeto de entorno PASADO: el repo usa ese patron
//     (`leerAnilloDeClaves(env = process.env)`, `usarProbadorDoble(env)`). Se mira el acceso
//     `.X` / `["X"]` sobre CUALQUIER objeto: los nombres son tan especificos que no hay acceso
//     legitimo a una propiedad que se llame asi;
//   - el nombre como literal de texto (`"X"`): cubre la indireccion
//     `const VARIABLE = "X"; env[VARIABLE]`, que es como lo hace `lib/config/integraciones.ts`.
// Y en `.env.example`, una linea que la DECLARA (`X=`): es donde una variable «vuelve a existir»
// primero (design §9.3).
//
// LO QUE NO VIGILA, a proposito. Los tests (`tests/`) si nombran estas variables: fijan
// `vi.stubEnv("WHATSAPP_CLOUD_TOKEN", ...)` para PROBAR que ya no se leen. Y los comentarios que
// no tengan ninguna de las formas de arriba (prosa historica) no disparan.

const VARIABLES_RETIRADAS = [
  "WHATSAPP_CLOUD_TOKEN",
  "WHATSAPP_NUMERO_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_APP_ID",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_ROUTE_OPT_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_ROUTE_OPT_SA_EMAIL",
  "GOOGLE_ROUTE_OPT_SA_PRIVATE_KEY",
  "GOOGLE_ROUTE_OPT_USE_ADC",
  "GOOGLE_WIF_PROJECT_NUMBER",
  "GOOGLE_CLOUD_PROJECT_NUMBER",
  "GOOGLE_WIF_POOL_ID",
  "GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID",
  "GOOGLE_WIF_PROVIDER_ID",
  "GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "ANTHROPIC_API_KEY",
] as const;

/** Las raices de design §9.3. */
const RAICES = ["app/", "lib/", "scripts/"] as const;

type Forma = "process.env.X" | "process.env[X]" | "destructuring" | "acceso .X / [X]" | "literal";

/**
 * Las formas prohibidas para una variable. Los nombres son `[A-Z0-9_]`, asi que no hace falta
 * escaparlos. `\b` a los dos lados: `WHATSAPP_APP_ID` no dispara dentro de `WHATSAPP_APP_ID_X`, ni
 * `WHATSAPP_API_VERSION` (permitida) por compartir prefijo.
 */
function formas(x: string): readonly [Forma, RegExp][] {
  return [
    ["process.env.X", new RegExp(String.raw`process\.env\s*\??\.\s*${x}\b`)],
    ["process.env[X]", new RegExp(String.raw`process\.env\s*(?:\?\.)?\s*\[\s*["'\x60]${x}["'\x60]\s*\]`)],
    // `[^{}]*` cruza saltos de linea: un destructuring partido en varias lineas tambien cuenta.
    ["destructuring", new RegExp(String.raw`\{[^{}]*\b${x}\b[^{}]*\}\s*=\s*process\.env\b`)],
    ["acceso .X / [X]", new RegExp(String.raw`(?:\??\.\s*${x}\b|\[\s*["'\x60]${x}["'\x60]\s*\])`)],
    ["literal", new RegExp(String.raw`["'\x60]${x}["'\x60]`)],
  ];
}

/** Lo que el detector encuentra en un texto de codigo. Puro: la autocomprobacion lo usa igual. */
function lecturasEnCodigo(texto: string): { variable: string; forma: Forma }[] {
  const hallazgos: { variable: string; forma: Forma }[] = [];
  for (const variable of VARIABLES_RETIRADAS) {
    // Una prueba barata antes de las cinco regex: la inmensa mayoria de archivos no la nombra.
    if (!texto.includes(variable)) continue;
    for (const [forma, re] of formas(variable)) {
      if (re.test(texto)) hallazgos.push({ variable, forma });
    }
  }
  return hallazgos;
}

/** Las variables que `.env.example` declara (`X=` al principio de linea). */
function declaradasEnEnvExample(texto: string): string[] {
  return VARIABLES_RETIRADAS.filter((x) => new RegExp(String.raw`^\s*${x}\s*=`, "m").test(texto));
}

function archivosVigilados(): string[] {
  return archivosDeCodigoCensados().filter((rel) => RAICES.some((r) => rel.startsWith(r)));
}

function infractores(archivos = archivosVigilados()): string[] {
  const fallos: string[] = [];
  for (const rel of archivos) {
    const texto = fs.readFileSync(path.join(RAIZ_DEL_REPO, rel), "utf8");
    for (const { variable, forma } of lecturasEnCodigo(texto)) fallos.push(`${rel}: ${variable} (${forma})`);
  }
  return fallos;
}

describe("SL-36/R41 — ninguna credencial de los cuatro servicios se lee del entorno", () => {
  it("app/, lib/ y scripts/ no leen ninguna variable retirada de design §9.3", () => {
    expect(infractores()).toEqual([]);
  });

  it("`.env.example` no declara ninguna variable retirada", () => {
    const texto = fs.readFileSync(path.join(RAIZ_DEL_REPO, ".env.example"), "utf8");
    expect(declaradasEnEnvExample(texto)).toEqual([]);
  });

  it("el censo mira algo (anti-vacuidad): cientos de archivos y las tres raices", () => {
    // Sin esto, un censo vacio dejaria el primer caso en verde sin haber leido nada.
    const archivos = archivosVigilados();
    expect(archivos.length).toBeGreaterThan(100);
    for (const raiz of RAICES) expect(archivos.some((a) => a.startsWith(raiz)), raiz).toBe(true);
    // Y entre ellos estan los consumidores que antes leian las variables.
    expect(archivos).toContain("lib/config/whatsapp.ts");
    expect(archivos).toContain("lib/config/integraciones.ts");
  });

  it("la lista es la de design §9.3: 19 nombres, sin repetidos", () => {
    expect(new Set(VARIABLES_RETIRADAS).size).toBe(19);
  });
});

describe("SL-36/R41 — AUTOCOMPROBACION del detector", () => {
  it("caza cada forma prohibida, para CADA variable retirada", () => {
    for (const x of VARIABLES_RETIRADAS) {
      const casos: [Forma, string][] = [
        ["process.env.X", `const v = process.env.${x};`],
        ["process.env.X", `const v = process.env?.${x}?.trim();`],
        ["process.env[X]", `const v = process.env["${x}"];`],
        ["process.env[X]", `const v = process.env['${x}'];`],
        ["process.env[X]", `const v = process.env[\`${x}\`];`],
        ["destructuring", `const { ${x} } = process.env;`],
        ["destructuring", `const {\n  OTRA,\n  ${x}: alias,\n} = process.env;`],
        ["acceso .X / [X]", `function f(env: Entorno) { return env.${x}; }`],
        ["acceso .X / [X]", `function f(env: Entorno) { return env["${x}"]; }`],
        ["literal", `const VARIABLE = "${x}";\nconst v = env[VARIABLE];`],
      ];
      for (const [forma, texto] of casos) {
        const formasHalladas = lecturasEnCodigo(texto)
          .filter((h) => h.variable === x)
          .map((h) => h.forma);
        expect(formasHalladas, `${x}: ${texto}`).toContain(forma);
      }
    }
  });

  it("caza la declaracion en `.env.example`, y no un comentario que la nombre", () => {
    expect(declaradasEnEnvExample("# --- x ---\nGOOGLE_MAPS_API_KEY=\n")).toEqual(["GOOGLE_MAPS_API_KEY"]);
    expect(declaradasEnEnvExample("  ANTHROPIC_API_KEY =\n")).toEqual(["ANTHROPIC_API_KEY"]);
    expect(declaradasEnEnvExample("# antes iba GOOGLE_MAPS_API_KEY=\n")).toEqual([]);
  });

  it("las variables PERMITIDAS no disparan, en ninguna forma", () => {
    // Las de plataforma que SL-36 conserva o crea (design §9.1, §15, §18) y otras vecinas por
    // prefijo: un detector que las cazara obligaria a desactivarlo.
    const permitidas = [
      "WHATSAPP_API_VERSION",
      "WHATSAPP_TEMPLATE_CATEGORY",
      "WHATSAPP_TEMPLATE_LANG",
      "WHATSAPP_DEBUG_LOG",
      "INTEGRACIONES_CLAVES_CIFRADO",
      "INTEGRACIONES_CLAVE_ACTIVA",
      "INTEGRACIONES_PRUEBAS_POR_MINUTO",
      "INTEGRACIONES_PROBADOR_DOBLE",
      "ASISTENTE_MODELO",
      "ROUTE_OPT_TIMEOUT_MS",
      "ROUTES_ROUTING_PREFERENCE",
      "GEOCODE_TIMEOUT_MS",
      "VERCEL_ENV",
      // Vecinas por nombre: comparten prefijo con una retirada y no son ella.
      "WHATSAPP_APP_ID_ANTIGUO",
      "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    ];
    for (const x of permitidas) {
      const texto = [
        `const a = process.env.${x};`,
        `const b = process.env["${x}"];`,
        `const { ${x} } = process.env;`,
        `const c = env.${x};`,
        `const VARIABLE = "${x}";`,
      ].join("\n");
      expect(lecturasEnCodigo(texto), x).toEqual([]);
    }
  });

  it("la prosa en un comentario que no lee nada no dispara", () => {
    expect(lecturasEnCodigo("// SL-36: antes se leia la clave de Maps del entorno; ya no.")).toEqual([]);
  });

  it("CONTRAPRUEBA sobre el arbol real: el mismo escaneo, con una permitida que SI se lee, la encuentra", () => {
    // Demuestra que el primer caso esta verde porque no hay nada, no porque el escaneo no lea los
    // archivos: `lib/config/whatsapp.ts` lee `process.env.WHATSAPP_API_VERSION`.
    const texto = fs.readFileSync(path.join(RAIZ_DEL_REPO, "lib/config/whatsapp.ts"), "utf8");
    expect(texto).toMatch(/process\.env\.WHATSAPP_API_VERSION\b/);
    const conLaPermitida = texto.replace(/WHATSAPP_API_VERSION/g, "WHATSAPP_CLOUD_TOKEN");
    expect(lecturasEnCodigo(conLaPermitida).map((h) => h.forma)).toContain("process.env.X");
  });
});
