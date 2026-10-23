import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";

// =================================================================================================
// GUARDIA — SL-11 (D7; R1-R3, R6, R9, R16, R20) — FUERA ZONAS, SEEDS Y DATOS HEREDADOS
// =================================================================================================
//
// SL-11 retiro las zonas, los usuarios y el SINPE que venian sembrados del producto de origen: la base recien
// migrada nace sin usuarios ni zonas, y cada test crea lo que usa. Esta guardia falla si vuelve
// cualquiera de esas piezas:
//
//  - R1:  alguno de los 8 archivos retirados (geografia en xlsx, seeds, el SQL de zonas);
//  - R2:  un script `db:seed*` distinto de `db:seed`, o uno que cree usuarios y no este, con su
//         comando exacto, en `SCRIPTS_QUE_CREAN_USUARIOS` (SL-32 R19);
//  - R3:  un texto que pide correr un `db:seed...` que `package.json` no declara;
//  - R6:  una migracion que inserta usuarios o zonas, o que nombra el nombre heredado en las editadas;
//  - R9:  el paso de `build` vuelve a desatascar migraciones o a sembrar SINPE;
//  - R16: el fixture de orden minima usa un email que no es `@example.com` o nombra el nombre heredado;
//  - R20: `.env.example` vuelve a nombrar el script de SINPE retirado o un archivo autorizado.
//
// Cada barrido afirma que encontro archivos (no-vacuidad) y cada detector tiene su contraprueba
// sintetica en memoria. Los literales prohibidos se componen por partes para que este archivo,
// que tambien cae en el barrido de R3, no se delate a si mismo.

const RAIZ = path.resolve(__dirname, "../../..");

function leer(relativa: string): string {
  return readFileSync(path.join(RAIZ, relativa), "utf8");
}

const SEED = "db:" + "seed";

// ---------------------------------------------------------------------------------- R1 ----------

const RETIRADOS = [
  "public/geografia-cr-completa.xlsx",
  "public/mapa-geografico-costa-rica.xlsx",
  "public/geografia-cr-completa-NOTAS.md",
  "scripts/seed-zonas.ts",
  "scripts/seed-usuarios-qa.ts",
  "scripts/seed-sinpe-inicial.ts",
  "scripts/seed-maestro.ts",
  "04_insert_zonas_pago_distrito.sql",
];

// ---------------------------------------------------------------------------------- R2 ----------

const NOMBRES_QUE_CREAN_USUARIOS = ["seed-maestro", "seed-usuarios", "superadmin", "crear-usuario"];

/**
 * SL-32 R19 — los UNICOS scripts que pueden crear usuarios, con su nombre y su comando EXACTOS y la
 * ficha que los justifica. El mismo nombre con otro comando, u otro script que nombre lo prohibido,
 * sigue en rojo.
 */
export const SCRIPTS_QUE_CREAN_USUARIOS: readonly { nombre: string; comando: string; ficha: string }[] = [
  { nombre: "arranque:superadmin", comando: "tsx scripts/arranque-superadmin.ts", ficha: "SL-32" },
];

function esExcepcionDeclarada(nombre: string, comando: string): boolean {
  return SCRIPTS_QUE_CREAN_USUARIOS.some((e) => e.nombre === nombre && e.comando === comando);
}

/** Las faltas de R2 en un `package.json`: scripts de siembra de mas, o que crean usuarios. */
export function faltasDeScripts(scripts: Record<string, string>): string[] {
  const faltas: string[] = [];
  for (const [nombre, comando] of Object.entries(scripts)) {
    if (nombre.startsWith(SEED) && nombre !== SEED) faltas.push(`script de siembra de mas: ${nombre}`);
    if (esExcepcionDeclarada(nombre, comando)) continue;
    for (const prohibido of NOMBRES_QUE_CREAN_USUARIOS) {
      if (nombre.includes(prohibido) || comando.includes(prohibido)) {
        faltas.push(`${nombre} nombra ${prohibido}`);
      }
    }
  }
  if (!(SEED in scripts)) faltas.push(`falta el script ${SEED}`);
  return faltas;
}

// ---------------------------------------------------------------------------------- R3 ----------

const MENCION_DE_SEED = /db:seed[:a-z-]*/g;

/** Las menciones `db:seed...` de un texto que no figuran entre los scripts declarados. */
export function mencionesNoDeclaradas(texto: string, declarados: ReadonlySet<string>): string[] {
  return [...texto.matchAll(MENCION_DE_SEED)].map((m) => m[0]).filter((m) => !declarados.has(m));
}

const DIRECTORIOS_R3 = ["tests", "scripts", "lib", "app"];
const EXTENSIONES_DE_TEXTO = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".sql", ".sh", ".txt",
  ".yml", ".yaml", ".css",
]);

function archivosDeTexto(dirRelativo: string): string[] {
  const salida: string[] = [];
  const pendientes = [dirRelativo];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const entrada of readdirSync(path.join(RAIZ, actual))) {
      const relativa = path.posix.join(actual, entrada);
      if (statSync(path.join(RAIZ, relativa)).isDirectory()) {
        if (entrada !== "node_modules") pendientes.push(relativa);
      } else if (EXTENSIONES_DE_TEXTO.has(path.extname(entrada))) {
        salida.push(relativa);
      }
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------- R6 ----------

const INSERT_PROHIBIDO = /INSERT\s+INTO\s+(?:"?public"?\.)?"?(usuario|zona)"?(?!\w)/gi;

/** Las tablas prohibidas (`usuario`, `zona`) en las que inserta un SQL. */
export function insertsProhibidos(sql: string): string[] {
  return [...sql.matchAll(INSERT_PROHIBIDO)].map((m) => (m[1] as string).toLowerCase());
}

const MIGRACIONES = "db/migrations";
const CARPETAS_RETIRADAS = ["20260713010000_", "20260720150000_"];
const MIGRACIONES_EDITADAS = [
  "20260709120000_seed_maestro_user",
  "20260918120100_zona_sinpe",
  "20260918120200_zona_sinpe_no_nulo",
];
const HEREDADO = new RegExp(NOMBRE_HEREDADO.minusculas, "i");
const INTEGRADOR = new RegExp("nu" + "form", "i");

// ---------------------------------------------------------------------------------- R9 ----------

const PASO_DE_BUILD = ["scripts/migrate-deploy.ts", "scripts/migrate-deploy-guardas.ts"];
const PROHIBIDOS_EN_BUILD = ["migrate " + "resolve", "sembrar" + "Sinpe", "AUTO_" + "RESOLUBLES"];

// --------------------------------------------------------------------------------- R16 ----------

const FIXTURE = "tests/integration/db/_fixtures/orden-minima.ts";

// Un email: algo de parte local pegado a `@` y un dominio con al menos un punto. `"@prisma/client"`
// no lo es (la `@` va tras una comilla y no le sigue un dominio con punto).
const EMAIL = /[\w.%+}-]@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/** Los dominios de email de un texto. */
export function dominiosDeEmail(texto: string): string[] {
  return [...texto.matchAll(EMAIL)].map((m) => (m[1] as string).toLowerCase());
}

/** Las faltas de R16 en un texto de fixture. */
export function faltasDeFixture(texto: string): string[] {
  const faltas = dominiosDeEmail(texto)
    .filter((d) => d !== "example.com")
    .map((d) => `email fuera de example.com: @${d}`);
  if (HEREDADO.test(texto)) faltas.push("nombra el nombre heredado");
  if (INTEGRADOR.test(texto)) faltas.push("nombra al integrador heredado");
  return faltas;
}

// --------------------------------------------------------------------------------- R20 ----------

const ENV_EXAMPLE = ".env.example";
const SCRIPT_SINPE_RETIRADO = "seed-" + "sinpe-" + "inicial";
// Una frase que presenta un archivo como autorizado a nombrar las variables. `[\s\S]` cruza los
// saltos de linea y los `#` de un comentario partido en varias lineas.
const ARCHIVO_AUTORIZADO = /[uú]nico\s+archivo[\s\S]{0,160}?nombrar/i;
const PERMITE_NOMBRAR = /permit\w*[\s#]+nombrar/i;

/** Las faltas de R20 en el texto de un `.env.example`. */
export function faltasDeEnvExample(texto: string): string[] {
  const faltas: string[] = [];
  if (texto.includes(SCRIPT_SINPE_RETIRADO)) faltas.push(`nombra ${SCRIPT_SINPE_RETIRADO}`);
  if (ARCHIVO_AUTORIZADO.test(texto) || PERMITE_NOMBRAR.test(texto)) {
    faltas.push("presenta un archivo como autorizado a nombrar las variables");
  }
  return faltas;
}

// =================================================================================================

describe("SL-11 R1 — los archivos retirados no vuelven", () => {
  it("no-vacuidad: la raiz es la del repo", () => {
    expect(existsSync(path.join(RAIZ, "package.json"))).toBe(true);
    expect(RETIRADOS).toHaveLength(8);
  });

  it.each(RETIRADOS)("%s no existe", (ruta) => {
    expect(existsSync(path.join(RAIZ, ruta))).toBe(false);
  });
});

describe("SL-11 R2 — el unico script de siembra es db:seed, y ninguno crea usuarios", () => {
  const scripts = (JSON.parse(leer("package.json")) as { scripts: Record<string, string> }).scripts;

  it("package.json no tiene faltas", () => {
    expect(faltasDeScripts(scripts)).toEqual([]);
  });

  it("db:seed apunta a un archivo de scripts/ que existe", () => {
    const destino = /scripts\/[\w./-]+\.(?:ts|mts|js|mjs|cjs)/.exec(scripts[SEED] ?? "");
    expect(destino, `${SEED} no apunta a un archivo de scripts/`).not.toBeNull();
    expect(existsSync(path.join(RAIZ, (destino as RegExpExecArray)[0]))).toBe(true);
  });

  it("contraprueba: un package.json con un db:seed de zonas da rojo", () => {
    const sintetico = { ...scripts, [SEED + ":zonas"]: "tsx scripts/x.ts" };
    expect(faltasDeScripts(sintetico)).toEqual([`script de siembra de mas: ${SEED}:zonas`]);
    expect(faltasDeScripts({ [SEED]: "tsx scripts/seed-maestro.ts" })).not.toEqual([]);
  });

  it("SL-32 R19: cada excepcion esta en package.json con su comando exacto y apunta a un archivo que existe", () => {
    expect(SCRIPTS_QUE_CREAN_USUARIOS.length).toBeGreaterThan(0);
    for (const e of SCRIPTS_QUE_CREAN_USUARIOS) {
      expect(e.ficha).toMatch(/^SL-\d+$/);
      expect(scripts[e.nombre], e.nombre).toBe(e.comando);
      const destino = /scripts\/[\w./-]+\.(?:ts|mts|js|mjs|cjs)/.exec(e.comando);
      expect(destino, `${e.nombre} no apunta a un archivo de scripts/`).not.toBeNull();
      expect(existsSync(path.join(RAIZ, (destino as RegExpExecArray)[0]))).toBe(true);
    }
  });

  it("contraprueba SL-32 R19: otro script con superadmin, o el declarado con otro comando, da rojo", () => {
    const base = { [SEED]: "tsx scripts/seed-catalogos.ts" };
    const declarado = { ...base, "arranque:superadmin": "tsx scripts/arranque-superadmin.ts" };
    expect(faltasDeScripts(declarado)).toEqual([]);
    expect(faltasDeScripts({ ...base, "arranque:superadmin": "tsx scripts/otro.ts" })).toEqual([
      "arranque:superadmin nombra superadmin",
    ]);
    expect(faltasDeScripts({ ...declarado, "otro:superadmin": "tsx scripts/arranque-superadmin.ts" })).toEqual([
      "otro:superadmin nombra superadmin",
    ]);
    expect(faltasDeScripts({ ...base, "otro:arranque": "tsx scripts/superadmin-2.ts" })).toEqual([
      "otro:arranque nombra superadmin",
    ]);
  });
});

describe("SL-11 R3 — ningun texto pide un db:seed que package.json no declare", () => {
  const declarados = new Set(
    Object.keys((JSON.parse(leer("package.json")) as { scripts: Record<string, string> }).scripts),
  );
  const archivos = [...DIRECTORIOS_R3.flatMap(archivosDeTexto), "README.md"];

  it("no-vacuidad: hay archivos en el barrido y alguno menciona db:seed", () => {
    expect(archivos.length).toBeGreaterThan(0);
    for (const dir of DIRECTORIOS_R3) {
      expect(archivos.some((a) => a.startsWith(`${dir}/`)), dir).toBe(true);
    }
    expect(archivos.filter((a) => leer(a).includes(SEED)).length).toBeGreaterThan(0);
  });

  it("todas las menciones estan declaradas", () => {
    const rojos = archivos
      .map((a) => ({ archivo: a, menciones: mencionesNoDeclaradas(leer(a), declarados) }))
      .filter((h) => h.menciones.length > 0);
    expect(rojos).toEqual([]);
  });

  it("contraprueba: un texto con un db:seed fantasma da rojo", () => {
    const texto = `throw new Error("corre pnpm ${SEED}:fantasma antes");`;
    expect(mencionesNoDeclaradas(texto, declarados)).toEqual([`${SEED}:fantasma`]);
  });
});

describe("SL-11 R6 — ninguna migracion inserta usuarios ni zonas, ni nombra el nombre heredado", () => {
  const carpetas = readdirSync(path.join(RAIZ, MIGRACIONES)).filter((c) =>
    existsSync(path.join(RAIZ, MIGRACIONES, c, "migration.sql")),
  );

  it("no-vacuidad: hay migraciones y estan las tres editadas", () => {
    expect(carpetas.length).toBeGreaterThan(0);
    expect(carpetas).toEqual(expect.arrayContaining(MIGRACIONES_EDITADAS));
  });

  it("ninguna migration.sql inserta en usuario ni en zona", () => {
    const rojos = carpetas
      .map((c) => ({ carpeta: c, tablas: insertsProhibidos(leer(`${MIGRACIONES}/${c}/migration.sql`)) }))
      .filter((h) => h.tablas.length > 0);
    expect(rojos).toEqual([]);
  });

  it.each(CARPETAS_RETIRADAS)("no existe ninguna carpeta %s*", (prefijo) => {
    expect(readdirSync(path.join(RAIZ, MIGRACIONES)).filter((c) => c.startsWith(prefijo))).toEqual([]);
  });

  it.each(MIGRACIONES_EDITADAS)("%s no nombra el nombre heredado", (carpeta) => {
    expect(HEREDADO.test(leer(`${MIGRACIONES}/${carpeta}/migration.sql`))).toBe(false);
  });

  it("contraprueba: un SQL con INSERT INTO \"usuario\" da rojo, y zona_distrito no", () => {
    expect(insertsProhibidos('INSERT INTO "usuario" ("id") VALUES (1);')).toEqual(["usuario"]);
    expect(insertsProhibidos('insert into zona (id) values (1);')).toEqual(["zona"]);
    expect(insertsProhibidos('INSERT INTO "zona_distrito" ("zona_id") VALUES (1);')).toEqual([]);
  });
});

describe("SL-11 R9 — el paso de build no desatasca migraciones ni siembra SINPE", () => {
  it.each(PASO_DE_BUILD)("%s existe y no contiene lo retirado", (ruta) => {
    expect(existsSync(path.join(RAIZ, ruta))).toBe(true);
    const fuente = leer(ruta);
    expect(PROHIBIDOS_EN_BUILD.filter((p) => fuente.includes(p))).toEqual([]);
  });
});

describe("SL-11 R16 — el fixture de orden minima solo usa @example.com y no nombra el nombre heredado", () => {
  it("no-vacuidad: el fixture existe y crea al menos un email", () => {
    expect(existsSync(path.join(RAIZ, FIXTURE))).toBe(true);
    expect(dominiosDeEmail(leer(FIXTURE)).length).toBeGreaterThan(0);
  });

  it("el fixture no tiene faltas", () => {
    expect(faltasDeFixture(leer(FIXTURE))).toEqual([]);
  });

  it("contraprueba: un texto con el dominio heredado `.test` da rojo, y un import de @prisma/client no", () => {
    const dominio = NOMBRE_HEREDADO.minusculas + ".test";
    expect(faltasDeFixture(`email: \`qa-\${sufijo}@${dominio}\``)).toEqual([
      `email fuera de example.com: @${dominio}`,
      "nombra el nombre heredado",
    ]);
    expect(faltasDeFixture('import type { RolValue } from "@prisma/client";')).toEqual([]);
  });
});

describe("SL-11 R20 — .env.example no nombra el script de SINPE retirado ni una lista de permitidos", () => {
  it("no-vacuidad: .env.example existe, no esta vacio y sigue hablando del SINPE", () => {
    expect(existsSync(path.join(RAIZ, ENV_EXAMPLE))).toBe(true);
    const texto = leer(ENV_EXAMPLE);
    expect(texto.trim().length).toBeGreaterThan(0);
    expect(texto).toContain("SINPE");
  });

  it(".env.example no tiene faltas", () => {
    expect(faltasDeEnvExample(leer(ENV_EXAMPLE))).toEqual([]);
  });

  it("contraprueba: las dos lineas que SL-10 dejo a cargo de SL-11 dan rojo", () => {
    const cabecera = `#  - el comentario que cita \`scripts/${SCRIPT_SINPE_RETIRADO}.ts\` -> SL-11;`;
    expect(faltasDeEnvExample(cabecera)).toEqual([`nombra ${SCRIPT_SINPE_RETIRADO}`]);
    const parrafo =
      "# SEMILLA que traslada a la base una vez. Ese script es el unico\n" +
      "# archivo del arbol al que se le permite nombrarlas.";
    expect(faltasDeEnvExample(parrafo)).toEqual([
      "presenta un archivo como autorizado a nombrar las variables",
    ]);
    expect(faltasDeEnvExample("# El SINPE de cada bodega se carga desde la aplicacion.")).toEqual([]);
  });
});
