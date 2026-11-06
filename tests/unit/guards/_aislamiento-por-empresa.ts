import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ExcepcionDeAislamiento } from "@/lib/db/excepciones-aislamiento";

/**
 * SL-17 (design §8) — detectores compartidos por las guardias de aislamiento por empresa.
 *
 * Viven aparte de los `.guardia.test.ts` por dos motivos: la lista `EXCEPCIONES_SQL_A_MANO` se
 * calcula con ESTAS mismas funciones (si se calculara a mano, la guardia y la lista divergirían),
 * y la autocomprobación de cada guardia tiene que ejercer exactamente el detector que barre el
 * árbol, no una copia.
 *
 * Todo es estático: lee archivos, no abre la base.
 */

export const RAIZ = path.resolve(__dirname, "../../..");

const EXTENSIONES_DE_CODIGO = new Set([".ts", ".tsx", ".mts", ".cts"]);

/** Archivos de código de producción bajo `carpetas` (ruta desde la raíz, con `/`), ordenados. */
export function archivosDeCodigo(carpetas: readonly string[], raiz: string = RAIZ): string[] {
  const salida: string[] = [];
  for (const carpeta of carpetas) {
    const absoluta = path.join(raiz, carpeta);
    if (!existsSync(absoluta)) continue;
    for (const entrada of readdirSync(absoluta, { withFileTypes: true, recursive: true })) {
      if (!entrada.isFile()) continue;
      const nombre = entrada.name;
      if (!EXTENSIONES_DE_CODIGO.has(path.extname(nombre))) continue;
      // Los tests y las declaraciones no son producción: un test puede nombrar una tabla sin
      // filtrar a propósito, y un `.d.ts` no ejecuta SQL.
      if (/\.(test|spec)\.[cm]?tsx?$/.test(nombre) || nombre.endsWith(".d.ts")) continue;
      const rel = path.relative(raiz, path.join(entrada.parentPath, nombre)).split(path.sep).join("/");
      if (rel.split("/").includes("node_modules")) continue;
      salida.push(rel);
    }
  }
  return salida.sort();
}

export function leer(rel: string, raiz: string = RAIZ): string {
  return readFileSync(path.join(raiz, rel), "utf8");
}

/**
 * Quita comentarios `//` y `/* *\/`. Un comentario que dice «aquí no filtramos por
 * organizacion_id» no es un filtro, y uno que cita `comoPlataforma(` no es una llamada.
 * El `//` precedido de `:` (una URL) se respeta.
 */
export function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------------------------
// SQL a mano (R25)

const MARCAS_DE_SQL_A_MANO = /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b|\bPrisma\.sql\b/;

export function tieneSqlAMano(texto: string): boolean {
  return MARCAS_DE_SQL_A_MANO.test(sinComentarios(texto));
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tablas de `tablas` que el texto nombra EN CONTEXTO SQL. Sin contexto, `zona`, `carga` o
 * `tarifas` saltarían con cualquier texto de pantalla; por eso se exige:
 *   · una palabra clave que introduce una tabla (`FROM`, `JOIN`, `UPDATE`, `INTO`, `TABLE`,
 *     `REFERENCES`, `TRUNCATE`), con la tabla entre comillas dobles o sin ellas, opcionalmente
 *     con esquema `public.`; cubre `FROM orden o`, `JOIN "orden"`, `INSERT INTO orden`…;
 *   · o el identificador entre comillas calificando una columna (`"orden"."id"`).
 */
export function tablasNombradasEnSql(texto: string, tablas: readonly string[]): string[] {
  const limpio = sinComentarios(texto);
  const nombradas: string[] = [];
  for (const tabla of tablas) {
    const t = escaparRegex(tabla);
    const trasPalabraClave = new RegExp(
      `\\b(?:FROM|JOIN|UPDATE|INTO|TABLE|REFERENCES|TRUNCATE)\\s+(?:ONLY\\s+)?(?:"?public"?\\.)?(?:"${t}"|${t}(?![\\w"$]))`,
      "i",
    );
    const columnaCalificada = new RegExp(`"${t}"\\s*\\.\\s*"`);
    if (trasPalabraClave.test(limpio) || columnaCalificada.test(limpio)) nombradas.push(tabla);
  }
  return nombradas;
}

export function filtraPorEmpresa(texto: string): boolean {
  return /\borganizacion_id\b/.test(sinComentarios(texto));
}

/** Por qué un archivo de producción entra en la guardia R25 (o `null` si no entra). */
export function sqlSinFiltro(texto: string, tablasDeNegocio: readonly string[]): string[] | null {
  if (!tieneSqlAMano(texto)) return null;
  const nombradas = tablasNombradasEnSql(texto, tablasDeNegocio);
  if (nombradas.length === 0) return null;
  if (filtraPorEmpresa(texto)) return null;
  return nombradas;
}

export const CARPETAS_SQL_A_MANO = ["lib", "app"] as const;

/** Los archivos de `lib/` y `app/` con SQL a mano sobre negocio que no filtran, ordenados. */
export function archivosConSqlSinFiltro(
  tablasDeNegocio: readonly string[],
  raiz: string = RAIZ,
): string[] {
  return archivosDeCodigo(CARPETAS_SQL_A_MANO, raiz).filter(
    (rel) => sqlSinFiltro(leer(rel, raiz), tablasDeNegocio) !== null,
  );
}

// ---------------------------------------------------------------------------------------------
// Contexto de plataforma (R27)

// `tests/fabricas/` también (review SL-43, m6): sus fábricas las importa el build (`scripts/demo-qa/`),
// así que una llamada ahí corre en QA igual que una de `scripts/`. Los `*.test.ts` siguen fuera.
export const CARPETAS_PLATAFORMA = ["lib", "app", "scripts", "tests/fabricas"] as const;

/** Donde se define: no es un uso. */
export const DEFINICION_DE_COMO_PLATAFORMA = "lib/db/contexto-empresa.ts";

export function llamaAComoPlataforma(texto: string): boolean {
  return /\bcomoPlataforma\s*(?:<[^>]*>)?\s*\(/.test(sinComentarios(texto));
}

export function archivosQueLlamanAComoPlataforma(raiz: string = RAIZ): string[] {
  return archivosDeCodigo(CARPETAS_PLATAFORMA, raiz).filter(
    (rel) => rel !== DEFINICION_DE_COMO_PLATAFORMA && llamaAComoPlataforma(leer(rel, raiz)),
  );
}

// ---------------------------------------------------------------------------------------------
// Excepciones (R26)

/** Problemas de forma de una excepción: ficha `SL-<n>`, motivo y archivo existente. */
export function problemasDeExcepcion(
  e: ExcepcionDeAislamiento,
  raiz: string = RAIZ,
): string[] {
  const problemas: string[] = [];
  // Misma forma que `FichaJira` (`lib/db/contexto-empresa.ts`): `SL-<n>` o, desde SLT-43, `SLT-<n>`.
  if (!/^SLT?-\d+$/.test(e.ficha)) problemas.push(`${e.archivo}: ficha «${e.ficha}» no es SL-<n> ni SLT-<n>`);
  if (e.motivo.trim().length === 0) problemas.push(`${e.archivo}: motivo vacío`);
  if (e.archivo.trim().length === 0 || !existsSync(path.join(raiz, e.archivo))) {
    problemas.push(`${e.archivo}: el archivo no existe`);
  }
  return problemas;
}

export function archivosRepetidos(lista: readonly ExcepcionDeAislamiento[]): string[] {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const e of lista) {
    if (vistos.has(e.archivo)) repetidos.add(e.archivo);
    vistos.add(e.archivo);
  }
  return [...repetidos];
}
