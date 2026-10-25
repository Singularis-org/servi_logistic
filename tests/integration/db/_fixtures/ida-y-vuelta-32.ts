import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { urlDeBaseDeDatos } from "../_postgres-real";

// SL-32 (R21) — lo que necesita el test de ida y vuelta de las tres migraciones del superadmin.
// Mismo metodo que `migracion-sl17-ida-y-vuelta.test.ts` (base propia, SQL sentencia a sentencia,
// foto de catalogos). Se copia aqui en vez de importarlo de alli porque importar un archivo de test
// registra sus `describe`; extraerlo de SL-17 a este modulo es un cambio aparte que no toca SL-32.

export const MIGRACIONES = path.resolve(__dirname, "../../../..", "db", "migrations");

/** La crea `migrate deploy`; M1 de SL-17 le revoca permisos, asi que tiene que existir. */
export const CREAR_TABLA_DE_CONTROL = `CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export interface Conexion {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

/** Un pool de UNA conexion: tras un script fallido se manda `ROLLBACK` a esa misma conexion. */
export async function conectar(url: string): Promise<Conexion> {
  const adaptador = await new PrismaPg({ connectionString: url, max: 1 }).connect();
  return adaptador.underlyingDriver() as unknown as Conexion;
}

export function urlDe(base: string): string {
  const url = new URL(urlDeBaseDeDatos() as string);
  url.pathname = `/${base}`;
  return url.toString();
}

export function sqlDe(carpeta: string, archivo: "migration.sql" | "down.sql"): string {
  return readFileSync(path.join(MIGRACIONES, carpeta, archivo), "utf8");
}

export function carpetasDeMigracion(): string[] {
  return readdirSync(MIGRACIONES)
    .filter((n) => existsSync(path.join(MIGRACIONES, n, "migration.sql")))
    .sort();
}

// ── La foto del esquema ─────────────────────────────────────────────────────────────────────────
// Solo lo que estas tres migraciones pueden mover: tipos, constraints, indices y filas. Comparar
// catalogos y no el texto del SQL: un down comparado contra su up estaria verde aunque Postgres
// hiciera otra cosa.

const CONSULTAS_DE_LA_FOTO: Record<string, string> = {
  columnas: `SELECT concat_ws(' | ', table_name || '.' || column_name, data_type, udt_name, is_nullable,
      column_default) AS l
    FROM information_schema.columns WHERE table_schema = 'public'`,
  constraints: `SELECT concat_ws(' | ', c.conrelid::regclass::text, c.conname, c.contype,
      pg_get_constraintdef(c.oid)) AS l
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`,
  indices: `SELECT tablename || '.' || indexname || ' | ' || indexdef AS l FROM pg_indexes
    WHERE schemaname = 'public'`,
  tipos: `SELECT t.typname || ' ' || t.typtype::text || ' ' || coalesce((SELECT string_agg(e.enumlabel, ','
      ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid), '') AS l
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')`,
  filas: `SELECT c.relname || ' = ' || (xpath('/row/n/text()', query_to_xml(
      format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
};

export type Foto = Record<string, Set<string>>;

export async function foto(db: Conexion): Promise<Foto> {
  const resultado: Foto = {};
  for (const [seccion, consulta] of Object.entries(CONSULTAS_DE_LA_FOTO)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

/** Lo que tiene `real` y no `esperada` ("sobra") y al reves ("falta"), nombrando el objeto. */
export function diferencias(real: Foto, esperada: Foto): string[] {
  const salida: string[] = [];
  for (const seccion of Object.keys(esperada)) {
    const r = real[seccion] ?? new Set<string>();
    const e = esperada[seccion];
    for (const l of r) if (!e.has(l)) salida.push(`sobra en ${seccion}: ${l}`);
    for (const l of e) if (!r.has(l)) salida.push(`falta en ${seccion}: ${l}`);
  }
  return salida.sort();
}

// ── Ejecutar un archivo como `migrate deploy` ───────────────────────────────────────────────────

const MARCA_DOLAR = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Parte un script en sentencias por los `;` de nivel superior: respeta literales `'…'`,
 * identificadores `"…"`, cuerpos `$tag$…$tag$` y comentarios (que se descartan). Sentencia a
 * sentencia y no como un solo script: Postgres envolveria el script en una transaccion implicita
 * y las migraciones que usan un valor de enum anadido en el mismo archivo caerian con 55P04.
 */
export function sentenciasDe(script: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let i = 0;
  const cerrarEn = (fin: number, desde: number): number => (fin === -1 ? script.length : fin + desde);
  while (i < script.length) {
    const c = script[i];
    const siguiente = script[i + 1];
    if (c === "-" && siguiente === "-") {
      i = cerrarEn(script.indexOf("\n", i), 0);
      actual += " ";
    } else if (c === "/" && siguiente === "*") {
      i = cerrarEn(script.indexOf("*/", i + 2), 2);
      actual += " ";
    } else if (c === "'" || c === '"') {
      const fin = cerrarEn(script.indexOf(c, i + 1), 1);
      actual += script.slice(i, fin);
      i = fin;
    } else if (c === "$" && MARCA_DOLAR.test(script.slice(i, i + 64))) {
      const marca = (MARCA_DOLAR.exec(script.slice(i, i + 64)) as RegExpExecArray)[0];
      const fin = cerrarEn(script.indexOf(marca, i + marca.length), marca.length);
      actual += script.slice(i, fin);
      i = fin;
    } else if (c === ";") {
      if (actual.trim()) salida.push(actual.trim());
      actual = "";
      i += 1;
    } else {
      actual += c;
      i += 1;
    }
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}

/** Error de un archivo con el SQLSTATE de Postgres a mano: el test distingue P0001 de un 23503. */
export class ErrorDeScript extends Error {
  constructor(
    mensaje: string,
    readonly sqlstate: string | undefined,
    options: { cause: unknown },
  ) {
    super(mensaje, options);
  }
}

export async function ejecutar(db: Conexion, texto: string, etiqueta: string): Promise<void> {
  for (const sentencia of sentenciasDe(texto)) {
    try {
      await db.query(sentencia);
    } catch (error) {
      // Si fallo dentro del `BEGIN` del archivo, la conexion queda en una transaccion abortada.
      await db.query("ROLLBACK").catch(() => undefined);
      const inicio = sentencia.replace(/\s+/g, " ").slice(0, 120);
      throw new ErrorDeScript(
        `${etiqueta}: ${(error as Error).message} — en «${inicio}»`,
        (error as { code?: string }).code,
        { cause: error },
      );
    }
  }
}
