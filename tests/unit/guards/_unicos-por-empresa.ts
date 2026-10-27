import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { UnicoSinEmpresa } from "@/lib/db/excepciones-aislamiento";

/**
 * SL-18 (design §5) — detector de la guardia de únicos por empresa.
 *
 * Vive aparte del `.guardia.test.ts` por lo mismo que `_aislamiento-por-empresa.ts`: la lista
 * `UNICOS_SIN_EMPRESA` se sembró con ESTE detector, y la autoprueba de la guardia tiene que ejercer
 * el mismo código que barre las migraciones, no una copia.
 *
 * Lee las migraciones y no el DMMF porque `schema.prisma` no expresa `NULLS NOT DISTINCT` ni los
 * índices parciales, y la review de SL-17 vio que el esquema seguía declarando el compuesto aunque
 * la migración lo hubiera perdido (M4b). Lo que se aplica en la base son las migraciones.
 *
 * Recorre TODO el historial, no solo desde `20261023090000`: los únicos anclados y los globales se
 * crearon antes y esa migración no los toca; sin el historial entero no se sabría si una entrada de
 * la lista existe (R23). Todo es estático: lee archivos, no abre la base.
 */

export const RAIZ = path.resolve(__dirname, "../../..");
export const DIR_MIGRACIONES = path.join(RAIZ, "db", "migrations");

/** La migración que hizo por empresa los únicos de negocio (SL-17 T3.9); R22 cuenta desde ella. */
export const MIGRACION_UNICOS_POR_EMPRESA = "20261023090000_unicos_por_empresa";

export type Migracion = { readonly nombre: string; readonly sql: string };

export type UnicoFinal = {
  readonly indice: string;
  readonly tabla: string;
  /** Columnas sin comillas, en orden; una expresión queda como su texto. */
  readonly columnas: readonly string[];
  /** Migración que lo dejó como está (la última que lo creó, renombró o le cambió columnas). */
  readonly migracion: string;
};

export function migracionesEnOrden(dir: string = DIR_MIGRACIONES): Migracion[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((nombre) => ({ nombre, archivo: path.join(dir, nombre, "migration.sql") }))
    .filter((m) => existsSync(m.archivo))
    .map((m) => ({ nombre: m.nombre, sql: readFileSync(m.archivo, "utf8") }));
}

// ---------------------------------------------------------------------------------------------
// Lectura del SQL

/**
 * Quita comentarios y los `COMMENT ON … IS '…'`: un comentario que cita `UNIQUE(posicion)` no crea
 * nada. El texto de un `EXECUTE '…'` se conserva a propósito: `20260825130000` crea así
 * `tarifas_zona_id_tienda_id_key` dentro de un `DO`, y ese índice existe.
 */
function sqlEjecutable(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "")
    .replace(/\bCOMMENT\s+ON\s+[\s\S]*?\bIS\s+(?:'(?:[^']|'')*'|NULL)\s*;/gi, " ");
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const CALIFICADO = String.raw`(?:${IDENT}\s*\.\s*)?${IDENT}`;

function sinComillas(identificador: string): string {
  const limpio = identificador.trim();
  const ultimo = limpio.includes(".") && !/^"[^"]*"$/.test(limpio) ? limpio.slice(limpio.lastIndexOf(".") + 1) : limpio;
  return ultimo.trim().replace(/^"(.*)"$/, "$1");
}

/** Contenido entre el `(` en `desde` y su `)` (respeta comillas dobles y simples). */
function entreParentesis(texto: string, desde: number): { contenido: string; fin: number } {
  let profundidad = 0;
  let comilla: string | null = null;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (comilla !== null) {
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") comilla = c;
    else if (c === "(") profundidad++;
    else if (c === ")") {
      profundidad--;
      if (profundidad === 0) return { contenido: texto.slice(desde + 1, i), fin: i };
    }
  }
  throw new Error(`paréntesis sin cerrar: ${texto.slice(desde, desde + 120)}`);
}

/** Separa por comas de primer nivel. */
function partesDeLista(lista: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let comilla: string | null = null;
  let actual = "";
  for (const c of lista) {
    if (comilla !== null) {
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") comilla = c;
    else if (c === "(") profundidad++;
    else if (c === ")") profundidad--;
    else if (c === "," && profundidad === 0) {
      partes.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim().length > 0) partes.push(actual.trim());
  return partes;
}

/** `"email" DESC` → `email`; una expresión (`lower("email")`) queda como su texto, sin espacios extra. */
function columnaDeIndice(parte: string): string {
  const simple = new RegExp(`^(${IDENT})(?:\\s+.*)?$`, "s").exec(parte);
  if (simple && !parte.trim().startsWith("(") && !/^\w+\s*\(/.test(parte.trim())) return sinComillas(simple[1]);
  return parte.replace(/\s+/g, " ").trim();
}

function columnasDe(lista: string): string[] {
  return partesDeLista(lista).map(columnaDeIndice);
}

// Sentencias que cambian el conjunto de únicos. Cada alternativa abre un grupo con nombre.
const SENTENCIAS = new RegExp(
  [
    // CREATE UNIQUE INDEX [CONCURRENTLY] [IF NOT EXISTS] nombre ON [ONLY] tabla [USING m] (
    String.raw`(?<crear>CREATE\s+UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?<crearSiNo>IF\s+NOT\s+EXISTS\s+)?(?<crearNombre>${IDENT})\s+ON\s+(?:ONLY\s+)?(?<crearTabla>${CALIFICADO})\s*(?:USING\s+\w+\s*)?\()`,
    // DROP INDEX [CONCURRENTLY] [IF EXISTS] a[, b] — la lista se lee aparte
    String.raw`(?<borrarIndice>DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?<borrarIndiceLista>${CALIFICADO}(?:\s*,\s*${CALIFICADO})*))`,
    // ALTER INDEX [IF EXISTS] a RENAME TO b
    String.raw`(?<renombrarIndice>ALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?<renIndDe>${CALIFICADO})\s+RENAME\s+TO\s+(?<renIndA>${IDENT}))`,
    // ALTER TABLE [IF EXISTS] [ONLY] t <acción>
    String.raw`(?<alterTabla>ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?<alterNombre>${CALIFICADO})\s+(?<accion>ADD\s+CONSTRAINT\s+(?<addNombre>${IDENT})\s+UNIQUE\s*(?:NULLS\s+(?:NOT\s+)?DISTINCT\s*)?\(|DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(?<dropCons>${IDENT})|RENAME\s+CONSTRAINT\s+(?<renConsDe>${IDENT})\s+TO\s+(?<renConsA>${IDENT})|RENAME\s+COLUMN\s+(?<renColDe>${IDENT})\s+TO\s+(?<renColA>${IDENT})|RENAME\s+TO\s+(?<renTabla>${IDENT})|DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(?<dropCol>${IDENT})))`,
    // DROP TABLE [IF EXISTS] a[, b]
    String.raw`(?<borrarTabla>DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?<borrarTablaLista>${CALIFICADO}(?:\s*,\s*${CALIFICADO})*))`,
  ].join("|"),
  "gi",
);

/**
 * Los únicos que quedan en pie tras aplicar, en orden, las migraciones dadas: tabla y columnas.
 * Sigue `CREATE UNIQUE INDEX`, `DROP INDEX`, `ALTER INDEX … RENAME`, `ADD CONSTRAINT … UNIQUE`,
 * `DROP CONSTRAINT`, `RENAME CONSTRAINT`, `RENAME COLUMN`, `RENAME TO` (de tabla), `DROP COLUMN`
 * (Postgres se lleva el índice que la usa) y `DROP TABLE`. Clave: nombre del índice, que en
 * Postgres es único por esquema.
 */
export function unicosFinales(migraciones: readonly Migracion[]): Map<string, UnicoFinal> {
  const vivos = new Map<string, UnicoFinal>();
  for (const { nombre: migracion, sql } of migraciones) {
    const texto = sqlEjecutable(sql);
    // Un `UNIQUE` que no entra por `CREATE UNIQUE INDEX` ni `ADD CONSTRAINT … UNIQUE` (de columna en
    // un CREATE TABLE, `ADD UNIQUE` sin nombre, varias acciones en un ALTER) dejaría el estado final
    // falso en silencio: se lanza nombrando la migración para que alguien enseñe la forma al detector.
    let reconocidos = 0;
    for (const m of texto.matchAll(SENTENCIAS)) {
      const g = m.groups!;
      const tras = (m.index ?? 0) + m[0].length - 1; // posición del `(` cuando la sentencia abre lista
      if (g.crear !== undefined) {
        reconocidos++;
        const indice = sinComillas(g.crearNombre!);
        if (g.crearSiNo !== undefined && vivos.has(indice)) continue;
        vivos.set(indice, {
          indice,
          tabla: sinComillas(g.crearTabla!),
          columnas: columnasDe(entreParentesis(texto, tras).contenido),
          migracion,
        });
      } else if (g.borrarIndice !== undefined) {
        for (const n of partesDeLista(g.borrarIndiceLista!)) vivos.delete(sinComillas(n));
      } else if (g.renombrarIndice !== undefined) {
        renombrar(vivos, sinComillas(g.renIndDe!), sinComillas(g.renIndA!), migracion);
      } else if (g.alterTabla !== undefined) {
        const tabla = sinComillas(g.alterNombre!);
        if (g.addNombre !== undefined) {
          reconocidos++;
          const indice = sinComillas(g.addNombre);
          vivos.set(indice, {
            indice,
            tabla,
            columnas: columnasDe(entreParentesis(texto, tras).contenido),
            migracion,
          });
        } else if (g.dropCons !== undefined) {
          const indice = sinComillas(g.dropCons);
          if (vivos.get(indice)?.tabla === tabla) vivos.delete(indice);
        } else if (g.renConsDe !== undefined) {
          renombrar(vivos, sinComillas(g.renConsDe), sinComillas(g.renConsA!), migracion);
        } else if (g.renColDe !== undefined) {
          const de = sinComillas(g.renColDe);
          const a = sinComillas(g.renColA!);
          for (const [k, u] of vivos) {
            if (u.tabla === tabla && u.columnas.includes(de)) {
              vivos.set(k, { ...u, columnas: u.columnas.map((c) => (c === de ? a : c)), migracion });
            }
          }
        } else if (g.renTabla !== undefined) {
          const nueva = sinComillas(g.renTabla);
          for (const [k, u] of vivos) if (u.tabla === tabla) vivos.set(k, { ...u, tabla: nueva, migracion });
        } else if (g.dropCol !== undefined) {
          const columna = sinComillas(g.dropCol);
          for (const [k, u] of vivos) if (u.tabla === tabla && u.columnas.includes(columna)) vivos.delete(k);
        }
      } else if (g.borrarTabla !== undefined) {
        const tablas = new Set(partesDeLista(g.borrarTablaLista!).map(sinComillas));
        for (const [k, u] of vivos) if (tablas.has(u.tabla)) vivos.delete(k);
      }
    }
    const escritos = texto.match(/\bUNIQUE\b/gi)?.length ?? 0;
    if (escritos !== reconocidos) {
      throw new Error(
        `${migracion}: ${escritos} UNIQUE escritos y ${reconocidos} reconocidos; el detector no sigue alguna forma`,
      );
    }
  }
  return vivos;
}

function renombrar(vivos: Map<string, UnicoFinal>, de: string, a: string, migracion: string): void {
  const u = vivos.get(de);
  if (!u) return;
  vivos.delete(de);
  vivos.set(a, { ...u, indice: a, migracion });
}

// ---------------------------------------------------------------------------------------------
// Lo que la guardia reprocha

export const COLUMNA_EMPRESA = "organizacion_id";

/** Los únicos finales sobre tablas de negocio, ordenados por tabla e índice. */
export function unicosDeNegocio(
  finales: ReadonlyMap<string, UnicoFinal>,
  tablasDeNegocio: readonly string[],
): UnicoFinal[] {
  const negocio = new Set(tablasDeNegocio);
  return [...finales.values()]
    .filter((u) => negocio.has(u.tabla))
    .sort((a, b) => (a.tabla === b.tabla ? a.indice.localeCompare(b.indice) : a.tabla.localeCompare(b.tabla)));
}

/** (a) R22: únicos de negocio sin `organizacion_id` primero que no están en la lista. */
export function unicosSinEmpresaFueraDeLista(
  finales: ReadonlyMap<string, UnicoFinal>,
  tablasDeNegocio: readonly string[],
  lista: readonly UnicoSinEmpresa[],
): string[] {
  const enLista = new Set(lista.map((e) => `${e.tabla}.${e.indice}`));
  return unicosDeNegocio(finales, tablasDeNegocio)
    .filter((u) => u.columnas[0] !== COLUMNA_EMPRESA && !enLista.has(`${u.tabla}.${u.indice}`))
    .map((u) => `${u.tabla}.${u.indice} (${u.columnas.join(", ")}) — ${u.migracion}`);
}

/**
 * (b) R23: entradas de la lista que no corresponden a un único final sin la columna. Una entrada
 * cuyo índice ya lleva `organizacion_id` primero también sobra: la lista solo baja.
 */
export function entradasSinUnico(
  finales: ReadonlyMap<string, UnicoFinal>,
  lista: readonly UnicoSinEmpresa[],
): string[] {
  const problemas: string[] = [];
  for (const e of lista) {
    const u = finales.get(e.indice);
    if (!u || u.tabla !== e.tabla) problemas.push(`${e.tabla}.${e.indice}: no existe en las migraciones`);
    else if (u.columnas[0] === COLUMNA_EMPRESA) {
      problemas.push(`${e.tabla}.${e.indice}: ya empieza por ${COLUMNA_EMPRESA}; quítala de la lista`);
    }
  }
  return problemas;
}

/** Forma de cada entrada: motivo no vacío, sin repetidas, y el motivo de un anclado nombra su tabla. */
export function problemasDeForma(lista: readonly UnicoSinEmpresa[]): string[] {
  const problemas: string[] = [];
  const vistos = new Set<string>();
  for (const e of lista) {
    const clave = `${e.tabla}.${e.indice}`;
    if (vistos.has(clave)) problemas.push(`${clave}: repetida`);
    vistos.add(clave);
    if (e.motivo.trim().length === 0) problemas.push(`${clave}: motivo vacío`);
    if (e.tipo === "anclado" && !/^FK NOT NULL a `[a-z_]+`$/.test(e.motivo)) {
      problemas.push(`${clave}: el motivo de un anclado es «FK NOT NULL a \`<tabla>\`»`);
    }
  }
  return problemas;
}

/**
 * (c) R23, R30: las entradas `global` que la sección «Multi-empresa» de `docs/architecture.md` no
 * nombra como `` `tabla.columna` `` o por el nombre del índice.
 */
export function globalesSinNombrarEnDocs(
  lista: readonly UnicoSinEmpresa[],
  finales: ReadonlyMap<string, UnicoFinal>,
  seccionMultiEmpresa: string,
): string[] {
  return lista
    .filter((e) => e.tipo === "global")
    .filter((e) => {
      const columnas = finales.get(e.indice)?.columnas ?? [];
      const nombres = [e.indice, ...columnas.map((c) => `${e.tabla}.${c}`)];
      return !nombres.some((n) => seccionMultiEmpresa.includes(`\`${n}\``));
    })
    .map((e) => `${e.tabla}.${e.indice}`);
}

/** Texto de `## Multi-empresa…` hasta el siguiente `## ` (los `### ` de dentro cuentan). */
export function seccionMultiEmpresa(architecture: string): string {
  const inicio = architecture.search(/^## Multi-empresa\b/m);
  if (inicio < 0) return "";
  const resto = architecture.slice(inicio + 3);
  const fin = resto.search(/^## /m);
  return fin < 0 ? architecture.slice(inicio) : architecture.slice(inicio, inicio + 3 + fin);
}
