import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, it, expect } from "vitest";

import { NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";
import { EXCEPCIONES_DOMINIO, lineasConDominio, type ExcepcionDominio } from "./_dominio-heredado";
import { aparicionesDeTerminos, formaDeTermino, SLUG_SL13, type Termino } from "./_terminos-por-hash";

/**
 * SL-34 (R1-R9, R13-R18, R23) — GUARDIA: ningun archivo del arbol nombra un recurso real de la app de
 * origen (proyectos Supabase y GCP, cuenta de GitHub, despliegues, dominio, emails, rutas locales
 * con el nombre de una persona), ni al integrador de origen, sus clientes o su direccion, ni lleva
 * una cadena con forma de secreto. El repo va a ser publico.
 *
 * Diseno: `specs/SL-34-specs-sin-recursos-origen/design.md > La guardia`.
 *
 * - Este archivo NO contiene ninguno de los valores que vigila (R14). Los de R1-R4 y R9 se comparan
 *   por el SHA-256 de cada token; los de R23, por el de cada n-grama de 1 a 3 palabras
 *   (`_terminos-por-hash.ts`); los de R5-R8, por la forma. Un hash de una palabra se puede
 *   confirmar con un diccionario: no es cifrado, solo evita publicar el literal.
 * - El reporte nombra `ruta:linea · clase` y nunca el valor ni el texto de la linea (R15).
 * - Importar la guardia de SL-14 registra tambien sus casos dentro de esta corrida: es el precio de
 *   importar su lista sin copiarla (R16).
 */

const RAIZ = path.resolve(__dirname, "../../..");

/** Esta guardia, relativa a la raiz y con `/`. */
const ESTE_ARCHIVO = "tests/unit/guards/recursos-origen-fuera.guardia.test.ts";

const REGLA =
  "Regla: specs/SL-34-specs-sin-recursos-origen/requirements.md (R1-R9, R23). Reescribe la linea con el marcador de su clase (design.md > Marcadores y > Ampliación R23).";

// ---------------------------------------------------------------------------
// Vigilados por hash (R1-R4, R9, R23)
// ---------------------------------------------------------------------------

export interface Vigilado {
  clase: "supabase-ref" | "supabase-nombre" | "gcp" | "github" | "persona" | "estacion" | "integrador" | "cliente" | "direccion";
  largo: number;
  /**
   * Hex del SHA-256 del token en minusculas; en las clases de `CLASES_TERMINO`, de la forma del
   * termino (`formaDeTermino`: sus palabras unidas por un espacio). Nunca el valor.
   */
  sha256: string;
  /** En las clases de `CLASES_TERMINO`: cuantas palabras tiene la forma. Sin el dato, 1. */
  palabras?: number;
}

/**
 * Clases que se buscan como termino de 1 a 3 palabras (R23), y tambien pegadas al principio o al
 * final de otra palabra; las demas, como token `[a-z0-9_-]+` entero.
 */
const CLASES_TERMINO: ReadonlySet<Vigilado["clase"]> = new Set(["integrador", "cliente", "direccion"]);

/**
 * Calculados en SL-34 T1 desde las lineas del arbol de entonces (`progress/impl_SL-34.md`). Los de
 * `integrador` y los tres primeros de `cliente`, en T5b desde los terminos de la guardia de SL-13; los
 * otros tres de `cliente` (fixtures) y los de `direccion` (la direccion y el centro del mapa), despues,
 * desde la misma lista: son sus mismos hashes.
 */
export const VIGILADOS: readonly Vigilado[] = [
  { clase: "supabase-ref", largo: 20, sha256: "5a90bb618312dada235c0abc72c00d6df493b266880f9531c1688ea1d39f2d87" },
  { clase: "supabase-ref", largo: 20, sha256: "ff8fbc8104b321044f1c597d4cb267c53a9ee99aa68f6835dd04aaec24a75d82" },
  { clase: "supabase-nombre", largo: 10, sha256: "c10a4ce318d936c397aa339b64e1c5c2fd642730344eefcaf32203a4ec652320" },
  { clase: "gcp", largo: 21, sha256: "9914bdb4789684b878b875c768c7c826fc61c10088c83371e8c4a92b2034ca6c" },
  { clase: "gcp", largo: 10, sha256: "0331c287532205424529f67ba5d706a0cd43d0eb2b9f90a894c56dac7d794e94" },
  { clase: "github", largo: 18, sha256: "e9f9d3ae2e0390aa911fe890b34505016cb0387e75efe363f99b877d8cdecc2b" },
  { clase: "persona", largo: 7, sha256: "65304dac3823069673aa9d3b90dcb9f44938e2d12f58509addc915d08922b64b" },
  { clase: "estacion", largo: 10, sha256: "536387ebd4d8bc1c627584511decef2f5ea59aaf70740ce811889b5587e3c597" },
  { clase: "integrador", largo: 6, sha256: "26ffdcf74e73f8e53160b62427987a586355d483f2d86a0f72119bacf7881b6a" },
  { clase: "cliente", largo: 6, sha256: "408715b18503d683a3eced8ee0d2a836271ac91fd1d1d7c3a2bdb3ee2a429c82" },
  { clase: "cliente", largo: 8, sha256: "ac80294d55e1228e09171dd04d4fb9c1836794e5b56c8c4a62f21dc5cc949c24" },
  { clase: "cliente", largo: 19, palabras: 2, sha256: "fcc48dd18dabd6124c73b83b8be01b49d0c317b7d8381b18e695a2f51f06247e" },
  { clase: "cliente", largo: 21, palabras: 2, sha256: "2f60c566890c9b002e62e768b982429d27cedd0853c1df7e209e7abf2a316775" },
  { clase: "cliente", largo: 23, palabras: 3, sha256: "39455adb5fe351a5fb907bc49bfda697d9d7c03ab90fd8b031e009d2816a4654" },
  { clase: "cliente", largo: 21, palabras: 2, sha256: "66eea3aac6422664be86a414f6d94f169c2437cea9e7634c6218872fade61e14" },
  { clase: "direccion", largo: 13, palabras: 2, sha256: "9ee806d9d0e2fb7ddf447ab253faa2e18431e8e4e8bc2505d4a7420dfb842b33" },
  { clase: "direccion", largo: 11, palabras: 2, sha256: "676f27e908c441bb160505620548f957fd57b0a60c66833eafe462151b173ca7" },
  { clase: "direccion", largo: 11, palabras: 2, sha256: "fbe2626111ce4fff603d260c88339ddab56b96549de7a2f272011046ecd61440" },
];

/**
 * R17: suelo de archivos de texto del universo. Medido en SL-34 T1 (2026-10-22). Si una ficha
 * retira archivos (SL-27 retira los `specs/` heredados), baja este numero en ese mismo cambio.
 */
const MINIMO_ARCHIVOS = 6150;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Tramos de [a-z0-9_-] en minusculas, cortados en `.`, `@`, `/`, `\`, espacios y signos. */
export function tokens(texto: string): { token: string; linea: number }[] {
  const salida: { token: string; linea: number }[] = [];
  texto
    .toLowerCase()
    .split(/\r?\n/)
    .forEach((l, i) => {
      for (const m of l.matchAll(/[a-z0-9_-]+/g)) salida.push({ token: m[0], linea: i + 1 });
    });
  return salida;
}

// ---------------------------------------------------------------------------
// Formas (R5-R8)
// ---------------------------------------------------------------------------

/** Dominios reservados por RFC 2606/6761 (R7). */
function dominioReservado(dominio: string): boolean {
  const d = dominio.toLowerCase();
  if (["example.com", "example.net", "example.org"].some((r) => d === r || d.endsWith(`.${r}`))) return true;
  return [".example", ".test", ".invalid", ".localhost"].some((tld) => d.endsWith(tld)) || d === "localhost";
}

const MARCADORES_DE_CLAVE = new Set(["password", "postgres"]);

/** Formas de regex sencillas: `[clase, patron]`. Todas globales. */
const FORMAS: readonly [string, RegExp][] = [
  ["vercel", /[a-z0-9-]+\.vercel\.app/gi],
  ["supabase-host", /\b[a-z]{20}\.supabase\.(?:co|com)\b/g],
  ["supabase-pooler", /\bpostgres\.[a-z]{20}\b/g],
  // R4 pide la URL al repositorio DE ORIGEN: una URL a otro repositorio (la plantilla del arnes en
  // `arnes.lock.json`, una libreria) no es un recurso de origen. La cuenta de origen ya la mira su hash.
  // El nombre del repositorio de origen, por partes (SL-15, R17): este archivo no lo lleva literal.
  [
    "github-url",
    new RegExp(
      `github\\.com\\/[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]*${NOMBRE_HEREDADO.minusculas}[A-Za-z0-9_.-]*\\/(?:pull|issues|commit|tree|blob)\\b`,
      "gi",
    ),
  ],
  ["service-account", /@(?!(?:proyecto|mi-proyecto)\.)[a-z][a-z0-9-]{4,}\.iam\.gserviceaccount\.com/g],
  ["secreto-jwt", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["secreto-supabase", /\bsbp_[a-f0-9]{40}/g],
  ["secreto-github", /\bgh[pousr]_[A-Za-z0-9]{36}/g],
  ["secreto-google", /\bAIza[0-9A-Za-z_-]{35}/g],
  ["secreto-openai-anthropic", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g],
  ["secreto-stripe", /\b[sr]k_live_[A-Za-z0-9]{20,}/g],
  ["secreto-webhook", /\bwhsec_[A-Za-z0-9]{24,}/g],
  ["secreto-resend", /\bre_[A-Za-z0-9]{20,}_[A-Za-z0-9]{10,}/g],
  ["secreto-slack", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
];

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![A-Za-z0-9-])/g;
const POSTGRES_CON_CLAVE = /postgres(?:ql)?:\/\/[^:\s/]+:([^@\s<>]{6,})@/g;
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END/g;

/** Linea (desde 1) de cada indice del texto, calculada solo si hace falta. */
function lineaDe(texto: string): (indice: number) => number {
  let inicios: number[] | null = null;
  return (indice) => {
    if (!inicios) {
      inicios = [0];
      for (let i = texto.indexOf("\n"); i !== -1; i = texto.indexOf("\n", i + 1)) inicios.push(i + 1);
    }
    let lo = 0;
    let hi = inicios.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (inicios[mid] <= indice) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const cubreDominio = (e: ExcepcionDominio, ruta: string) =>
  e.ruta.endsWith("/") ? ruta.startsWith(e.ruta) : ruta === e.ruta;

/**
 * Los emails que cuentan como hallazgo, con su indice y su valor en minusculas. Es el mismo codigo
 * que usa `detectar`, y lo usa tambien la permanente atada a su valor (SL-16, H2). El valor nunca
 * sale de la guardia: quien lo recibe lo reduce a `{ largo, sha256 }`.
 */
export function emailsVisibles(texto: string): { indice: number; valor: string }[] {
  const salida: { indice: number; valor: string }[] = [];
  for (const m of texto.matchAll(EMAIL)) {
    // `esquema://usuario:clave@host` no es un email: es una URL con credenciales, y la mira su forma.
    const antes = texto.slice(Math.max(0, m.index - 7), m.index);
    if (/[:/]$/.test(antes) && !/mailto:$/i.test(antes)) continue;
    // Una service account es R3 y ya la mira su forma; el email de un dominio reservado es valido.
    const dominio = m[1].toLowerCase();
    if (dominio.endsWith(".iam.gserviceaccount.com") || dominioReservado(dominio)) continue;
    salida.push({ indice: m.index, valor: m[0].toLowerCase() });
  }
  return salida;
}

export interface Hallazgo {
  linea: number;
  clase: string;
  /** Ficha de la `EXCEPCIONES_TERMINO` que la cubre, si la cubre alguna. */
  excepcion?: string;
}

/**
 * Detector puro. Devuelve `{linea, clase}` unicos y ordenados; nunca el valor. `ruta` solo decide
 * la excepcion de la clase dominio, que es la lista vigente de SL-14. Una aparicion de termino que
 * cubre una de `excepcionesTermino` sale tambien, con su `excepcion`: asi se sabe si la excepcion
 * sigue haciendo falta (R16).
 */
export function detectar(
  texto: string,
  ruta: string,
  vigilados: readonly Vigilado[] = VIGILADOS,
  excepcionesDominio: readonly ExcepcionDominio[] = EXCEPCIONES_DOMINIO,
  excepcionesTermino: readonly ExcepcionTermino[] = EXCEPCIONES_TERMINO,
): Hallazgo[] {
  const vistos = new Set<string>();
  const salida: Hallazgo[] = [];
  const anotar = (linea: number, clase: string, excepcion?: string) => {
    const k = `${linea}\0${clase}\0${excepcion ?? ""}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    salida.push(excepcion === undefined ? { linea, clase } : { linea, clase, excepcion });
  };
  const linea = lineaDe(texto);

  // Terminos (R23): n-gramas de palabras, con sus excepciones por token.
  const deTermino = vigilados.filter((v) => CLASES_TERMINO.has(v.clase));
  const tokensExceptuados = excepcionesTermino.flatMap((e) => e.tokens.map((t) => ({ t, e })));
  for (const a of aparicionesDeTerminos(texto, deTermino, tokensExceptuados.map((x) => x.t))) {
    const clase = deTermino[a.termino].clase;
    const e = a.exceptuada >= 0 ? tokensExceptuados[a.exceptuada].e : undefined;
    anotar(a.linea, clase, e && e.clase === clase ? e.ficha : undefined);
  }

  // Hashes: solo los tokens cuyo largo coincide con el de algun vigilado.
  const porLargo = new Map<number, Map<string, Vigilado["clase"]>>();
  for (const v of vigilados) {
    if (CLASES_TERMINO.has(v.clase)) continue;
    if (!porLargo.has(v.largo)) porLargo.set(v.largo, new Map());
    porLargo.get(v.largo)!.set(v.sha256, v.clase);
  }
  const minusculas = texto.toLowerCase();
  for (const m of minusculas.matchAll(/[a-z0-9_-]+/g)) {
    const delLargo = porLargo.get(m[0].length);
    if (!delLargo) continue;
    const clase = delLargo.get(hashDeToken(m[0]));
    if (clase) anotar(linea(m.index), clase);
  }

  for (const [clase, re] of FORMAS) {
    for (const m of texto.matchAll(re)) anotar(linea(m.index), clase);
  }
  for (const e of emailsVisibles(texto)) anotar(linea(e.indice), "email");
  for (const m of texto.matchAll(POSTGRES_CON_CLAVE)) {
    const clave = m[1];
    if (clave.startsWith("${") || MARCADORES_DE_CLAVE.has(clave.toLowerCase())) continue;
    anotar(linea(m.index), "secreto-postgres-url");
  }
  for (const m of texto.matchAll(PEM)) {
    const cuerpo = m[1].replace(/\\n|\s/g, "");
    if (cuerpo.length >= 40 && /^[A-Za-z0-9+/=]+$/.test(cuerpo)) anotar(linea(m.index), "secreto-pem");
  }

  if (!excepcionesDominio.some((e) => cubreDominio(e, ruta))) {
    for (const l of lineasConDominio(texto)) anotar(l, "dominio");
  }

  return salida.sort((a, b) => a.linea - b.linea || a.clase.localeCompare(b.clase));
}

/** Cache de hashes por token: el universo repite los mismos tokens miles de veces. */
const CACHE_HASH = new Map<string, string>();
function hashDeToken(token: string): string {
  let h = CACHE_HASH.get(token);
  if (h === undefined) {
    h = sha256(token);
    CACHE_HASH.set(token, h);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Excepciones propias (R16)
// ---------------------------------------------------------------------------

export interface ExcepcionRecurso {
  /** Ruta relativa con `/`. */
  ruta: string;
  clase: string;
  /**
   * Ficha que la retira (`SL-<n>`), o `"permanente"` solo cuando el valor no nace en este repo: lo
   * publica un tercero, llega en un archivo generado y no se edita a mano. Una permanente lleva
   * `origen` obligatorio (SL-16, R24).
   */
  ficha: string;
  /** Solo en las permanentes: de donde viene el valor, fuera del repo, y por que no se edita aqui. */
  origen?: string;
  /**
   * Solo en las permanentes (SL-16, H2): la huella del unico valor que cubre (`largo` y `sha256` del
   * valor en minusculas, nunca el valor) y cuantas veces aparece en `ruta`. Otro valor de la misma
   * clase, o el mismo mas veces, la ponen en rojo: la permanente no tapa la clase entera del archivo.
   */
  valor?: { largo: number; sha256: string; veces: number };
  motivo: string;
}

/** La unica ficha que no es `SL-<n>`: excepcion de origen externo, con `origen` obligatorio. */
const PERMANENTE = "permanente";

/**
 * La clase dominio usa la lista de SL-14, importada (`EXCEPCIONES_DOMINIO`).
 *
 * SL-16 (R24, R25) cerro las dos que SL-34 le dejo: `docs/jira.md` ya usa `<tu-email>@example.com` y
 * su excepcion salio; la de `pnpm-lock.yaml` paso a permanente, porque el email lo publica el autor
 * de `glob@7.2.3` en su campo `deprecated` del registro de npm y el lockfile es generado. Sigue
 * sujeta a «ninguna excepcion propia sobra»: el dia que glob@7 deje el lockfile, la guardia pide
 * borrarla. Y esta atada a su valor (`valor`, H2 de la review): un segundo email en el lockfile, o
 * uno distinto, no entra por ella.
 */
export const EXCEPCIONES: readonly ExcepcionRecurso[] = [
  {
    ruta: "pnpm-lock.yaml",
    clase: "email",
    ficha: PERMANENTE,
    origen:
      "campo `deprecated` de glob@7.2.3, publicado por el autor del paquete en el registro de npm; pnpm lo copia al lockfile",
    // Medido en la vuelta 2 de SL-16 desde el lockfile de hoy: un solo email, una sola vez (l. 3049).
    valor: { largo: 8, sha256: "b0373516d594ddd199b25c3655332b354837e065c5cc232f5043189897900ca7", veces: 1 },
    motivo:
      "email publico del autor en el aviso deprecated de una dependencia transitiva; el lockfile es generado y no se edita a mano. Cae sola al retirar o actualizar glob@7",
  },
];

/**
 * Por que una excepcion propia no es valida, o `null` si lo es (R16, R24): motivo no vacio, y o bien
 * temporal (`SL-<n>`, sin `origen`) o bien `permanente` con `origen` no vacio.
 */
export function problemaDeExcepcion(e: ExcepcionRecurso): string | null {
  if (e.motivo.trim() === "") return `\`${e.ruta}\`: sin motivo`;
  if (FICHA_VALIDA.test(e.ficha)) {
    if (e.valor !== undefined) return `\`${e.ruta}\`: una temporal (${e.ficha}) no lleva valor`;
    return e.origen === undefined ? null : `\`${e.ruta}\`: una temporal (${e.ficha}) no lleva origen`;
  }
  if (e.ficha === PERMANENTE) {
    if ((e.origen ?? "").trim() === "") return `\`${e.ruta}\`: una permanente necesita su origen externo`;
    const v = e.valor;
    const valorBien = v !== undefined && /^[0-9a-f]{64}$/.test(v.sha256) && v.largo > 0 && Number.isInteger(v.veces) && v.veces > 0;
    return valorBien ? null : `\`${e.ruta}\`: una permanente necesita la huella de su valor y sus veces`;
  }
  return `\`${e.ruta}\`: ficha \`${e.ficha}\` no es SL-<n> ni ${PERMANENTE}`;
}

/**
 * SL-16 (H2): lo que una permanente de clase email no cubre en `texto`, el contenido de su `ruta`:
 * cada email con otra huella, nombrado por su linea, y la cuenta si el registrado no aparece
 * exactamente `veces` veces. Nunca el valor. Vacio si la permanente cubre justo lo que hay.
 */
export function permanenteFueraDeValor(e: ExcepcionRecurso, texto: string): string[] {
  if (e.ficha !== PERMANENTE || e.clase !== "email" || e.valor === undefined) return [];
  const { largo, sha256: huella, veces } = e.valor;
  const linea = lineaDe(texto);
  const salida: string[] = [];
  let propios = 0;
  for (const m of emailsVisibles(texto)) {
    if (m.valor.length === largo && sha256(m.valor) === huella) propios++;
    else salida.push(`${e.ruta}:${linea(m.indice)} · email distinto del que cubre la permanente`);
  }
  if (propios !== veces) salida.push(`${e.ruta}: el email de la permanente aparece ${propios} vez/veces; se registro ${veces}`);
  return salida;
}

export interface ExcepcionTermino {
  clase: Vigilado["clase"];
  /** Tokens `[a-z0-9_-]+` enteros, en minusculas, que la excepcion deja pasar: `{ largo, sha256 }`. */
  tokens: readonly Termino[];
  ficha: string;
  motivo: string;
}

/**
 * R23: el slug de la ficha SL-13 en rutas y ramas (`specs/SL-13-<slug>/`, `feature/SL-13-<slug>`) y
 * como nombre suelto de la ficha. Cubre solo esos dos tokens enteros: el termino suelto o en otra
 * palabra sigue marcado. Temporal: cae con la ficha SL-27, que renombra la ficha SL-13.
 */
export const EXCEPCIONES_TERMINO: readonly ExcepcionTermino[] = [
  {
    clase: "integrador",
    tokens: SLUG_SL13,
    ficha: "SL-27",
    motivo:
      "slug de la ficha SL-13 en el board, en la ruta de su spec, en su rama y en progress/; renombrarlo cambia la ficha del board y las citas. Se retira al renombrar la ficha SL-13",
  },
];

/** Excepciones de termino que ya no cubren ninguna aparicion (R16). */
export function excepcionesDeTerminoSobrantes(
  hallazgos: readonly { excepcion?: string }[],
  excepciones: readonly ExcepcionTermino[],
): string[] {
  return excepciones
    .filter((e) => !hallazgos.some((h) => h.excepcion === e.ficha))
    .map((e) => `la excepcion de termino · ${e.clase} (ficha \`${e.ficha}\`) ya no cubre nada: bórrala`);
}

/** Ficha de una excepcion: la `SL-<n>` que la retira. */
const FICHA_VALIDA = /^SL-\d+$/;

/** Excepciones que ya no cubren ningun hallazgo `ruta:linea · clase` (R16). */
export function excepcionesSobrantes(
  hallazgos: readonly { ruta: string; clase: string }[],
  excepciones: readonly ExcepcionRecurso[],
): string[] {
  return excepciones
    .filter((e) => !hallazgos.some((h) => h.ruta === e.ruta && h.clase === e.clase))
    .map((e) => `la excepcion \`${e.ruta}\` · ${e.clase} (ficha \`${e.ficha}\`) ya no cubre nada: bórrala`);
}

// ---------------------------------------------------------------------------
// Universo (R13)
// ---------------------------------------------------------------------------

/** Lo versionado mas lo no versionado que no esta ignorado; `git ls-files` nunca devuelve `.git`. */
function universo(): string[] {
  const salida = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(salida.split("\0").filter((r) => r.length > 0))]
    // `--cached` lista tambien lo borrado del arbol y aun no commiteado.
    .filter((r) => existsSync(path.join(RAIZ, r)) && statSync(path.join(RAIZ, r)).isFile());
}

/** Contenido de texto, o `null` si es binario (un `\0` en los primeros 8 KB). */
function textoDe(ruta: string): string | null {
  const buf = readFileSync(path.join(RAIZ, ruta));
  if (buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString("utf8");
}

let cache: { archivos: number; hallazgos: (Hallazgo & { ruta: string })[] } | null = null;

/** Plazo del `beforeAll` que hace el barrido; holgado para la carga del gate y de CI. */
const BARRIDO_TIMEOUT_MS = 120_000;

function barrido() {
  if (cache) return cache;
  let archivos = 0;
  const hallazgos: (Hallazgo & { ruta: string })[] = [];
  for (const ruta of universo()) {
    const texto = textoDe(ruta);
    if (texto === null) continue;
    archivos++;
    for (const h of detectar(texto, ruta)) hallazgos.push({ ruta, ...h });
  }
  cache = { archivos, hallazgos };
  return cache;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe("SL-34 — recursos reales de la app de origen fuera del arbol (R1-R9, R13-R18, R23)", () => {
  // El barrido recorre todo el arbol (~10 s sola, mas bajo la carga del gate): se hace aqui,
  // con su propio plazo, y ningun caso carga con el dentro del testTimeout por defecto.
  beforeAll(() => {
    barrido();
  }, BARRIDO_TIMEOUT_MS);

  describe("autoprueba sin valores (R14, R17)", () => {
    it("R17: cada vigilado tiene un sha256 de 64 hex y un largo mayor que 0", () => {
      expect(VIGILADOS).toHaveLength(18);
      const tokens = EXCEPCIONES_TERMINO.flatMap((e) => e.tokens);
      for (const v of [...VIGILADOS, ...tokens]) {
        expect(v.sha256, String(v.largo)).toMatch(/^[0-9a-f]{64}$/);
        expect(v.largo).toBeGreaterThan(0);
      }
      expect(new Set(VIGILADOS.map((v) => v.sha256)).size).toBe(VIGILADOS.length);
    });

    it("R23: los diez terminos de SL-13 estan vigilados: el integrador, sus clientes y la direccion", () => {
      expect(VIGILADOS.filter((v) => v.clase === "integrador")).toHaveLength(1);
      expect(VIGILADOS.filter((v) => v.clase === "cliente")).toHaveLength(6);
      expect(VIGILADOS.filter((v) => v.clase === "direccion")).toHaveLength(3);
    });

    it("R14: el propio archivo de la guardia pasa por el detector y da cero", () => {
      const propio = readFileSync(path.join(RAIZ, ESTE_ARCHIVO), "utf8");
      const h = detectar(propio, ESTE_ARCHIVO).map((x) => `${ESTE_ARCHIVO}:${x.linea} · ${x.clase}`);
      expect(h, h.join("\n")).toEqual([]);
    });

    it("R13/R17: el universo no baja del suelo firmado", () => {
      expect(MINIMO_ARCHIVOS).toBeGreaterThan(0);
      expect(barrido().archivos).toBeGreaterThanOrEqual(MINIMO_ARCHIVOS);
    });
  });

  describe("contrapruebas sinteticas del detector (R14, R17)", () => {
    // Vigilado falso: un token inventado y su hash, calculado aqui.
    const falso = "zqvaltokenfalso";
    const vigiladoFalso: Vigilado[] = [{ clase: "github", largo: falso.length, sha256: sha256(falso) }];
    const det = (texto: string, ruta = "lib/x.ts") => detectar(texto, ruta, vigiladoFalso, []);
    const clases = (texto: string, ruta?: string) => det(texto, ruta).map((h) => h.clase);

    it("el token vigilado suelto, en una URL, tras @ y dentro de una ruta: 1 cada uno", () => {
      for (const t of [
        `ver ${falso} aqui`,
        `https://${falso}.ejemplo/x`,
        `cuenta @${falso}`,
        `R:/a/${falso}/b/`,
        `MAYUSCULAS ${falso.toUpperCase()}`,
      ]) {
        expect(det(t), t).toEqual([{ linea: 1, clase: "github" }]);
      }
    });

    it("el token con una letra cambiada, o pegado a otro tramo: 0", () => {
      expect(det(falso.replace(/^z/, "y"))).toEqual([]);
      expect(det(`${falso}-x`)).toEqual([]);
    });

    it("la linea sale del texto", () => {
      expect(det(`a\nb\r\nc ${falso}`)).toEqual([{ linea: 3, clase: "github" }]);
    });

    describe("R23: terminos de 1 a 3 palabras, con terminos inventados", () => {
      const termino = (clase: Vigilado["clase"], valor: string): Vigilado => {
        const forma = formaDeTermino(valor);
        return { clase, largo: forma.length, sha256: sha256(forma), palabras: forma.split(" ").length };
      };
      const terminos: Vigilado[] = [
        termino("integrador", "zqintegra"),
        termino("cliente", "Zqalfa Zqbeta"),
        termino("cliente", "zquno zqdos zqtres"),
      ];
      const slug: ExcepcionTermino = {
        clase: "integrador",
        tokens: ["fuera-zqintegra", "sl-13-fuera-zqintegra"].map((t) => ({ largo: t.length, sha256: sha256(t) })),
        ficha: "SL-99",
        motivo: "slug sintetico",
      };
      const detT = (texto: string) => detectar(texto, "lib/x.ts", terminos, [], [slug]);

      it("el termino de una palabra suelto, en mayusculas, con guiones o pegado al principio o al final: 1", () => {
        for (const t of ["ver zqintegra", "ZQINTEGRA", "u-Zqintegra", "ZQINTEGRAtest", "xzqintegra", "picking-zqintegra-2026", "t_zqintegra"]) {
          expect(detT(t), t).toEqual([{ linea: 1, clase: "integrador" }]);
        }
      });

      it("el termino de una palabra en medio de otra o con una letra cambiada: 0", () => {
        for (const t of ["xzqintegray", "zqintegre", "zq integra"]) expect(detT(t), t).toEqual([]);
      });

      it("el n-grama con espacios, puntos, guiones o signos entre sus palabras: 1", () => {
        for (const t of ["Zqalfa Zqbeta", "zqalfa  zqbeta", "(Zqalfa ~ Zqbeta)", "zqalfa. zqbeta", "zqalfa-zqbeta", "ZQUNO zqdos ZQTRES"]) {
          expect(detT(t), t).toEqual([{ linea: 1, clase: "cliente" }]);
        }
      });

      it("una palabra suelta del n-grama, el n-grama partido en dos lineas o con otra palabra en medio: 0", () => {
        for (const t of ["zqalfa", "zqbeta mayorista", "zqalfa\nzqbeta", "zqalfa x zqbeta", "zquno zqdos", "zqdos zqtres"]) {
          expect(detT(t), t).toEqual([]);
        }
      });

      it("la linea del n-grama es la de su primera palabra", () => {
        expect(detT("a\nb zqalfa zqbeta")).toEqual([{ linea: 2, clase: "cliente" }]);
      });

      it("el slug exceptuado en una ruta, en una rama o suelto sale con su excepcion; otro token no", () => {
        const exceptuada = [{ linea: 1, clase: "integrador", excepcion: "SL-99" }];
        expect(detT("specs/SL-13-fuera-zqintegra/design.md")).toEqual(exceptuada);
        expect(detT("feature/SL-13-fuera-zqintegra")).toEqual(exceptuada);
        expect(detT("`fuera-zqintegra`")).toEqual(exceptuada);
        expect(detT("fuera-zqintegra-x")).toEqual([{ linea: 1, clase: "integrador" }]);
        expect(detT("fuera-zqintegra y zqintegra")).toEqual([{ linea: 1, clase: "integrador" }, ...exceptuada]);
      });

      it("una excepcion de termino de otra clase no cubre la aparicion", () => {
        expect(detectar("fuera-zqintegra", "lib/x.ts", terminos, [], [{ ...slug, clase: "cliente" }])).toEqual([
          { linea: 1, clase: "integrador" },
        ]);
      });

      it("R16: una excepcion de termino que no cubre nada sale nombrada; una que cubre, no", () => {
        expect(excepcionesDeTerminoSobrantes([{ excepcion: "SL-99" }], [slug])).toEqual([]);
        expect(excepcionesDeTerminoSobrantes([{}], [slug])).toEqual([
          "la excepcion de termino · integrador (ficha `SL-99`) ya no cubre nada: bórrala",
        ]);
      });
    });

    it("un subdominio inventado de vercel.app: 1; <host>.vercel.app: 0", () => {
      expect(clases("https://" + "mi-app-inventada" + ".vercel" + ".app/x")).toEqual(["vercel"]);
      expect(clases("<host>" + ".vercel" + ".app")).toEqual([]);
    });

    it("20 minusculas inventadas + .supabase.co: 1; proyecto.supabase.co: 0", () => {
      expect(clases("https://" + "abcdefghijklmnopqrst" + ".supabase" + ".co")).toEqual(["supabase-host"]);
      expect(clases("https://proyecto" + ".supabase" + ".co")).toEqual([]);
      expect(clases("user=postgres." + "abcdefghijklmnopqrst" + " host")).toEqual(["supabase-pooler"]);
    });

    it("una URL de PR inventada al repositorio de origen: 1; a otro repositorio: 0", () => {
      expect(clases("https://github" + ".com/" + "dueno-x/" + NOMBRE_HEREDADO.capital + "/pull/7")).toEqual(["github-url"]);
      expect(clases("https://github" + ".com/" + "dueno-x/" + NOMBRE_HEREDADO.minusculas + "-app" + "/blob/main/a.md")).toEqual(["github-url"]);
      expect(clases("https://github" + ".com/" + "dueno-x/plantilla" + "/pull/7")).toEqual([]);
    });

    it("una URL con credenciales no cuenta como email; mailto: si", () => {
      expect(clases("redis://u:p@" + "host-inventado" + ".net:6379")).toEqual([]);
      expect(clases("mailto:" + "alguien" + "@" + "dominio-inventado" + ".net")).toEqual(["email"]);
    });

    it("una service account de un proyecto real: 1; los marcadores de test: 0", () => {
      expect(clases("sa" + "@" + "proyecto-inventado" + ".iam.gserviceaccount.com")).toEqual(["service-account"]);
      expect(clases("sa" + "@" + "proyecto" + ".iam.gserviceaccount.com")).toEqual([]);
      expect(clases("sa" + "@" + "mi-proyecto" + ".iam.gserviceaccount.com")).toEqual([]);
    });

    it("a@b.example.com: 0; un email inventado en un dominio no reservado: 1", () => {
      expect(clases("a@b.example.com")).toEqual([]);
      for (const r of ["qa@x.test", "u@ejemplo.invalid", "u@example.org", "u@host.localhost"]) {
        expect(clases(r), r).toEqual([]);
      }
      expect(clases("alguien" + "@" + "dominio-inventado" + ".net")).toEqual(["email"]);
    });

    it("un JWT inventado: 1", () => {
      const parte = "ey" + "J" + "abcdefghijklmno";
      expect(clases(`${parte}.${parte}.firmafalsa123`)).toEqual(["secreto-jwt"]);
    });

    it("cada forma de secreto de la tabla: 1", () => {
      const casos: [string, string][] = [
        ["sb" + "p_" + "a".repeat(40), "secreto-supabase"],
        ["gh" + "p_" + "A".repeat(36), "secreto-github"],
        ["AI" + "za" + "B".repeat(35), "secreto-google"],
        ["sk" + "-ant-" + "C".repeat(20), "secreto-openai-anthropic"],
        ["sk" + "_live_" + "D".repeat(20), "secreto-stripe"],
        ["wh" + "sec_" + "E".repeat(24), "secreto-webhook"],
        ["re" + "_" + "F".repeat(20) + "_" + "G".repeat(10), "secreto-resend"],
        ["xo" + "xb-" + "1".repeat(10), "secreto-slack"],
        ["postgres" + "://usuario:" + "claveInventada" + "@db.example.com/x", "secreto-postgres-url"],
      ];
      for (const [t, clase] of casos) expect(clases(t), clase).toEqual([clase]);
      for (const t of ["postgres://u:<CLAVE>@h", "postgres://u:${DB_PASS}@h", "postgresql://u:password@h", "postgres://u:postgres@h"]) {
        expect(clases(t), t).toEqual([]);
      }
    });

    it("una clave PEM con cuerpo: 1; -----BEGIN PRIVATE KEY-----\\n... : 0", () => {
      const cabecera = "-----BEGIN " + "PRIVATE KEY-----";
      expect(clases(`${cabecera}\\n...\\n-----END PRIVATE KEY-----`)).toEqual([]);
      expect(clases(`${cabecera}\n${"H".repeat(64)}\n-----END PRIVATE KEY-----`)).toEqual(["secreto-pem"]);
    });

    it("el dominio en una ruta con excepcion de SL-14: 0; en otra ruta: 1", () => {
      const dominio = "https://app." + NOMBRE_HEREDADO.minusculas + ".co/x";
      // SL-16 (R22) dejo vacia la lista real: la excepcion de la contraprueba es sintetica.
      const conExcepcion: ExcepcionDominio[] = [{ ruta: "docs/api/", ficha: "SL-99", motivo: "m" }];
      expect(detectar(dominio, "docs/api/x.yaml", vigiladoFalso, conExcepcion)).toEqual([]);
      expect(detectar(dominio, "lib/x.ts", vigiladoFalso, conExcepcion)).toEqual([{ linea: 1, clase: "dominio" }]);
      expect(detectar(dominio, "docs/api/x.yaml", vigiladoFalso)).toEqual([{ linea: 1, clase: "dominio" }]);
    });

    it("cada marcador de design.md > Marcadores: 0", () => {
      for (const m of [
        "la base de producción de la app de origen",
        "el proyecto Supabase de producción de la app de origen",
        "`<GCP_PROJECT_ID>` y `<SA_EMAIL>`",
        "PR #402 del repositorio de origen",
        "la cuenta de GitHub de la app de origen",
        "el despliegue de producción de la app de origen",
        "https://app.example.com/ordenes y https://example.com",
        "`<usuario>@example.com`",
        "`<worktree-local>/<carpeta-de-la-feature>/`",
      ]) {
        expect(detectar(m, "specs/x.md"), m).toEqual([]);
      }
    });

    it("R16: una excepcion propia que no cubre nada sale nombrada; una que cubre, no", () => {
      const lista: ExcepcionRecurso[] = [
        { ruta: "a.md", clase: "email", ficha: "SL-99", motivo: "m" },
        { ruta: "b.md", clase: "email", ficha: "SL-98", motivo: "m" },
      ];
      expect(excepcionesSobrantes([{ ruta: "a.md", clase: "email" }], lista)).toEqual([
        "la excepcion `b.md` · email (ficha `SL-98`) ya no cubre nada: bórrala",
      ]);
    });
  });

  describe("excepciones (R16)", () => {
    it("toda excepcion propia es temporal (ficha SL-n) o permanente con origen externo, y lleva motivo", () => {
      expect("SL-27").toMatch(FICHA_VALIDA);
      for (const f of ["", "permanente", "pendiente", "SL-", "SL-27 ", "xSL-27", "sl-27"]) expect(f).not.toMatch(FICHA_VALIDA);
      for (const e of EXCEPCIONES) expect(problemaDeExcepcion(e), e.ruta).toBeNull();
      // Las de termino no tienen forma permanente.
      for (const e of EXCEPCIONES_TERMINO) {
        expect(e.ficha, e.clase).toMatch(FICHA_VALIDA);
        expect(e.motivo.trim(), e.clase).not.toBe("");
      }
    });

    it("SL-16 R24: una permanente sin origen, una temporal con origen o una ficha libre no valen", () => {
      const base = { ruta: "x.lock", clase: "email", motivo: "m" };
      const valor = { largo: 8, sha256: "0".repeat(64), veces: 1 };
      expect(problemaDeExcepcion({ ...base, ficha: "SL-99" })).toBeNull();
      expect(problemaDeExcepcion({ ...base, ficha: "permanente", origen: "registro de npm", valor })).toBeNull();
      // H2: sin la huella de su valor, o con una huella o unas veces que no lo son, tampoco vale.
      const sinHuella = "`x.lock`: una permanente necesita la huella de su valor y sus veces";
      expect(problemaDeExcepcion({ ...base, ficha: "permanente", origen: "registro de npm" })).toBe(sinHuella);
      expect(problemaDeExcepcion({ ...base, ficha: "permanente", origen: "o", valor: { ...valor, sha256: "x" } })).toBe(sinHuella);
      expect(problemaDeExcepcion({ ...base, ficha: "permanente", origen: "o", valor: { ...valor, veces: 0 } })).toBe(sinHuella);
      expect(problemaDeExcepcion({ ...base, ficha: "SL-99", valor })).toBe("`x.lock`: una temporal (SL-99) no lleva valor");
      expect(problemaDeExcepcion({ ...base, ficha: "permanente" })).toBe(
        "`x.lock`: una permanente necesita su origen externo",
      );
      expect(problemaDeExcepcion({ ...base, ficha: "permanente", origen: "  " })).toBe(
        "`x.lock`: una permanente necesita su origen externo",
      );
      expect(problemaDeExcepcion({ ...base, ficha: "SL-99", origen: "o" })).toBe("`x.lock`: una temporal (SL-99) no lleva origen");
      expect(problemaDeExcepcion({ ...base, ficha: "pendiente" })).toBe("`x.lock`: ficha `pendiente` no es SL-<n> ni permanente");
      expect(problemaDeExcepcion({ ...base, ficha: "SL-99", motivo: " " })).toBe("`x.lock`: sin motivo");
    });

    it("SL-16 R24: las permanentes son solo las de origen externo registradas a mano", () => {
      // Abrir otra permanente es una decision: se anade aqui, a mano, con su motivo.
      expect(EXCEPCIONES.filter((e) => e.ficha === "permanente").map((e) => e.ruta)).toEqual(["pnpm-lock.yaml"]);
    });

    it("SL-16 H2: contraprueba sintetica: la permanente cubre su valor, no un segundo email ni uno distinto", () => {
      // Emails inventados en un dominio no reservado, partidos para que este archivo no lleve ninguno.
      const propio = "autor" + "@" + "dominio-inventado" + ".net";
      const otro = "otra" + "@" + "dominio-inventado" + ".net";
      const lock = (...emails: string[]) =>
        ["lockfileVersion: '9.0'", ...emails.map((m) => `    deprecated: Old versions are not supported. Write to ${m}`)].join("\n");
      const perm: ExcepcionRecurso = {
        ruta: "x.lock",
        clase: "email",
        ficha: "permanente",
        origen: "registro de npm",
        valor: { largo: propio.length, sha256: sha256(propio), veces: 1 },
        motivo: "m",
      };
      expect(permanenteFueraDeValor(perm, lock(propio))).toEqual([]);
      // Mayusculas: el detector compara en minusculas, como la huella.
      expect(permanenteFueraDeValor(perm, lock(propio.toUpperCase()))).toEqual([]);
      expect(permanenteFueraDeValor(perm, lock(propio, otro))).toEqual(["x.lock:3 · email distinto del que cubre la permanente"]);
      expect(permanenteFueraDeValor(perm, lock(otro))).toEqual([
        "x.lock:2 · email distinto del que cubre la permanente",
        "x.lock: el email de la permanente aparece 0 vez/veces; se registro 1",
      ]);
      expect(permanenteFueraDeValor(perm, lock(propio, propio))).toEqual([
        "x.lock: el email de la permanente aparece 2 vez/veces; se registro 1",
      ]);
      // El reporte no lleva el valor.
      expect(permanenteFueraDeValor(perm, lock(propio, otro)).join("\n")).not.toContain("@");
    });

    it("SL-16 H2: cada permanente de clase email cubre exactamente su valor, las veces registradas", () => {
      const permanentes = EXCEPCIONES.filter((e) => e.ficha === PERMANENTE && e.clase === "email");
      expect(permanentes.length).toBeGreaterThan(0);
      const fuera = permanentes.flatMap((e) => permanenteFueraDeValor(e, textoDe(e.ruta) ?? ""));
      expect(fuera, fuera.join("\n")).toEqual([]);
    });

    it("SL-16 R25: docs/jira.md no tiene excepcion: su ejemplo usa un email reservado", () => {
      expect(EXCEPCIONES.some((e) => e.ruta === "docs/jira.md")).toBe(false);
    });

    it("ninguna excepcion propia sobra", () => {
      const { hallazgos } = barrido();
      const sobran = [
        ...excepcionesSobrantes(hallazgos, EXCEPCIONES),
        ...excepcionesDeTerminoSobrantes(hallazgos, EXCEPCIONES_TERMINO),
      ];
      expect(sobran, sobran.join("\n")).toEqual([]);
    });
  });

  it("R1-R9, R23: ningun archivo del arbol nombra un recurso de la app de origen, al integrador ni a sus clientes, ni lleva forma de secreto", () => {
    const { hallazgos } = barrido();
    const vivos = hallazgos.filter(
      (h) => h.excepcion === undefined && !EXCEPCIONES.some((e) => e.ruta === h.ruta && e.clase === h.clase),
    );
    const lineas = vivos.map((h) => `${h.ruta}:${h.linea} · ${h.clase}`);
    const archivos = new Set(vivos.map((h) => h.ruta));
    expect(lineas, `${archivos.size} archivo(s), ${lineas.length} aparicion(es):\n${lineas.join("\n")}\n${REGLA}`).toEqual(
      [],
    );
  });

  const ref = process.env.RECURSOS_ORIGEN_REF;
  if (ref) {
    it("R18: los valores de RECURSOS_ORIGEN_REF producen exactamente los hashes registrados", () => {
      const pares = readFileSync(ref, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => {
          const i = l.indexOf("=");
          const valor = l.slice(i + 1).trim().toLowerCase();
          return { clase: l.slice(0, i).trim(), largo: valor.length, sha256: sha256(valor) };
        });
      const clave = (v: { clase: string; largo: number; sha256: string }) => `${v.clase}:${v.largo}:${v.sha256}`;
      // Se comparan las claves derivadas, nunca los valores: un fallo no los imprime.
      expect(pares.map(clave).sort()).toEqual(VIGILADOS.map(clave).sort());
    });
  } else {
    it.skip("R18 omitido: sin RECURSOS_ORIGEN_REF", () => {});
  }
});
