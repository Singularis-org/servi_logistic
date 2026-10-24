import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";

import { HAY_BASE_DE_DATOS, urlDeBaseDeDatos } from "./_postgres-real";

/**
 * SL-38 / T7 (R5, R7, R8) — M1 y M2 de ida y vuelta, contra Postgres.
 *
 * - R5: M1 (`distrito_zona_especial`) → su `down.sql` deja las columnas, `pg_policies` y
 *   `pg_trigger` como estaban, y reaplicarla las deja como con ella.
 * - R8: lo mismo para M2 (retirar `distrito.zona_especial`): el down devuelve la columna BOOLEAN,
 *   nulable y con DEFAULT false, medida en `information_schema`.
 * - R7: con un distrito en `zona_especial = true`, M2 aborta nombrando la causa y la columna sigue.
 *
 * "Igual" se mide en los catalogos, no leyendo el SQL: comparar el down contra el texto del up
 * estaria verde aunque Postgres hiciera otra cosa.
 *
 * POR QUE UNA BASE PROPIA (`sl38_iv_<rand>`), como la de SL-17: el down de M1 o de M2 en la base
 * compartida de los tests le quitaria la tabla o la columna a los demas archivos que corren a la
 * vez. Se construye aplicando las migraciones anteriores a M1, sentencia a sentencia (lo que hace
 * `migrate deploy`), y se borra en `afterAll`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACIONES = path.join(RAIZ, "db", "migrations");

const M1 = "20261023120000_distrito_zona_especial_por_empresa";
const M2 = "20261023120100_retirar_distrito_zona_especial";

/** Prefijo `sl38_`: si un fallo deja la base viva, se reconoce de quien es. */
const BASE = `sl38_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const CREAR_TABLA_DE_CONTROL = `CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

interface Conexion {
  query(texto: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

/** Un pool de UNA conexion: tras un script fallido se manda `ROLLBACK` a esa misma conexion. */
async function conectar(url: string): Promise<Conexion> {
  const adaptador = await new PrismaPg({ connectionString: url, max: 1 }).connect();
  return adaptador.underlyingDriver() as unknown as Conexion;
}

function urlDe(base: string): string {
  const url = new URL(urlDeBaseDeDatos() as string);
  url.pathname = `/${base}`;
  return url.toString();
}

function sqlDe(carpeta: string, archivo: "migration.sql" | "down.sql"): string {
  return readFileSync(path.join(MIGRACIONES, carpeta, archivo), "utf8");
}

function carpetasDeMigracion(): string[] {
  return readdirSync(MIGRACIONES)
    .filter((n) => existsSync(path.join(MIGRACIONES, n, "migration.sql")))
    .sort();
}

// ── La foto del esquema: las tres fuentes que nombra R5, mas lo que las sostiene ─────────────────

const CONSULTAS_DE_LA_FOTO: Record<string, string> = {
  tablas: `SELECT table_name || ' ' || table_type AS l FROM information_schema.tables
    WHERE table_schema = 'public'`,
  columnas: `SELECT concat_ws(' | ', table_name || '.' || column_name, data_type, udt_name, is_nullable,
      column_default, character_maximum_length, numeric_precision, numeric_scale, datetime_precision,
      is_identity, is_generated, generation_expression) AS l
    FROM information_schema.columns WHERE table_schema = 'public'`,
  // Aparte: reaplicar una migracion que anade columnas les da un attnum nuevo (Postgres no reutiliza
  // el del borrado). Es el unico cambio legitimo al reaplicar.
  orden_de_columnas: `SELECT table_name || '.' || column_name || ' #' || ordinal_position AS l
    FROM information_schema.columns WHERE table_schema = 'public'`,
  constraints: `SELECT concat_ws(' | ', c.conrelid::regclass::text, c.conname, c.contype,
      pg_get_constraintdef(c.oid)) AS l
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`,
  indices: `SELECT tablename || '.' || indexname || ' | ' || indexdef AS l FROM pg_indexes
    WHERE schemaname = 'public'`,
  politicas: `SELECT concat_ws(' | ', tablename || '.' || policyname, permissive, roles::text, cmd,
      qual, with_check) AS l
    FROM pg_policies WHERE schemaname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || t.tgenabled::text || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'`,
  rls: `SELECT c.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
};

type Foto = Record<string, Set<string>>;

let db: Conexion;
let admin: Conexion;

async function foto(): Promise<Foto> {
  const resultado: Foto = {};
  for (const [seccion, consulta] of Object.entries(CONSULTAS_DE_LA_FOTO)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

function sinSeccion(f: Foto, seccion: string): Foto {
  return Object.fromEntries(Object.entries(f).filter(([s]) => s !== seccion));
}

/** Lo que tiene `real` y no `esperada` ("sobra") y al reves ("falta"), nombrando el objeto. */
function diferencias(real: Foto, esperada: Foto): string[] {
  const salida: string[] = [];
  for (const seccion of Object.keys(esperada)) {
    const r = real[seccion] ?? new Set<string>();
    const e = esperada[seccion];
    for (const l of r) if (!e.has(l)) salida.push(`sobra en ${seccion}: ${l}`);
    for (const l of e) if (!r.has(l)) salida.push(`falta en ${seccion}: ${l}`);
  }
  return salida.sort();
}

/**
 * Parte un script en sentencias por los `;` de nivel superior: respeta literales `'…'`,
 * identificadores `"…"`, cuerpos `$tag$…$tag$` y comentarios (que se descartan). El `DO $$` de M2
 * tiene `;` dentro y tiene que viajar entero.
 */
const MARCA_DOLAR = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

function sentenciasDe(script: string): string[] {
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

/**
 * El script en UNA transaccion, como lo aplica `migrate deploy` en Postgres: si una sentencia falla,
 * no queda nada del archivo. Es lo que hace que el aborto de M2 «no cambie nada» (R7).
 */
async function ejecutar(texto: string, etiqueta: string): Promise<void> {
  await db.query("BEGIN");
  for (const sentencia of sentenciasDe(texto)) {
    try {
      await db.query(sentencia);
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      const inicio = sentencia.replace(/\s+/g, " ").slice(0, 120);
      throw new Error(`${etiqueta}: ${(error as Error).message} — en «${inicio}»`, { cause: error });
    }
  }
  await db.query("COMMIT");
}

/** Lo previo a M1 se aplica en autocommit, sentencia a sentencia (algunas traen su BEGIN/COMMIT). */
async function ejecutarSuelto(texto: string, etiqueta: string): Promise<void> {
  for (const sentencia of sentenciasDe(texto)) {
    try {
      await db.query(sentencia);
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw new Error(`${etiqueta}: ${(error as Error).message}`, { cause: error });
    }
  }
}

interface Ciclo {
  antes: Foto;
  con: Foto;
  /** La foto tras `down.sql`, antes de reaplicar. */
  trasDown: Foto;
}

/**
 * `migration.sql` → `down.sql` → igual que antes; `migration.sql` otra vez → igual que con ella.
 *
 * Un down que DEVUELVE una columna la anade al final de la tabla: su `ordinal_position` cambia y
 * Postgres no deja elegirla. Para esa migracion (M2) la posicion se compara aparte, en su caso.
 */
async function idaYVuelta(carpeta: string, opciones: { downReanadeColumna?: boolean } = {}): Promise<Ciclo> {
  const antes = await foto();
  await ejecutar(sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql`);
  const con = await foto();
  // Sin esto el test seria verde con una migracion vacia o mal leida.
  expect(diferencias(con, antes).length, `${carpeta} no cambio nada`).toBeGreaterThan(0);

  await ejecutar(sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
  const trasDown = await foto();
  const comparable = (f: Foto) => (opciones.downReanadeColumna ? sinSeccion(f, "orden_de_columnas") : f);
  expect(diferencias(comparable(trasDown), comparable(antes)), `${carpeta}: tras down.sql`).toEqual([]);

  await ejecutar(sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
  expect(
    diferencias(sinSeccion(await foto(), "orden_de_columnas"), sinSeccion(con, "orden_de_columnas")),
    `${carpeta}: reaplicada`,
  ).toEqual([]);
  return { antes, con, trasDown };
}

/** La linea de `information_schema.columns` de `distrito.zona_especial`, o `undefined`. */
function columnaZonaEspecial(f: Foto): string | undefined {
  return [...f.columnas].find((l) => l.startsWith("distrito.zona_especial |"));
}

describeSiHayBase("SL-38 — M1 y M2 de ida y vuelta (R5, R7, R8)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M1) break;
      await ejecutarSuelto(sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17: el autovacuum de una base recien llenada choca con los locks de
    // las migraciones (40P01). La base solo la usa este test, y las reloptions no entran en la foto.
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) {
      await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);
    }
  }, 300_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("las dos estan en disco con su down.sql, y M2 justo despues de M1", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M1)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M2)).toBe(carpetas.indexOf(M1) + 1);
    for (const c of [M1, M2]) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });

  it("R5 — M1: la tabla de marcas con su politica y su trigger, de ida y vuelta", async () => {
    const { antes, con } = await idaYVuelta(M1);
    const anadido = diferencias(con, antes);
    expect(anadido).toContain("sobra en tablas: distrito_zona_especial BASE TABLE");
    expect(anadido.some((l) => l.startsWith("sobra en columnas: distrito_zona_especial.organizacion_id |"))).toBe(true);
    expect(anadido.some((l) => l.startsWith("sobra en politicas: distrito_zona_especial.distrito_zona_especial_por_empresa |"))).toBe(true);
    expect(anadido.some((l) => l.startsWith("sobra en triggers: distrito_zona_especial.distrito_zona_especial_sin_cambio_de_empresa |"))).toBe(true);
    expect(anadido).toContain("sobra en rls: distrito_zona_especial rls=true force=false");
  }, 120_000);

  it("R6, R8 — M2: sale distrito.zona_especial y el down la devuelve BOOLEAN, nulable y DEFAULT false", async () => {
    const { antes, con, trasDown } = await idaYVuelta(M2, { downReanadeColumna: true });
    // La forma previa, de `information_schema` (la de 20260824180000), y que M2 la quita.
    expect(columnaZonaEspecial(antes)).toBe("distrito.zona_especial | boolean | bool | YES | false | NO | NEVER");
    expect(columnaZonaEspecial(con)).toBeUndefined();
    expect(diferencias(con, antes).filter((l) => !l.startsWith("falta en orden_de_columnas"))).toEqual([
      "falta en columnas: distrito.zona_especial | boolean | bool | YES | false | NO | NEVER",
    ]);
    // Lo unico que el down no devuelve igual es la POSICION de la columna, y solo la suya.
    const posicion = diferencias(trasDown, antes);
    expect(posicion).toHaveLength(2);
    expect(posicion.every((l) => /^(sobra|falta) en orden_de_columnas: distrito\.zona_especial #\d+$/.test(l))).toBe(true);
  }, 120_000);

  it("R7 — con un distrito en zona_especial = true, M2 aborta nombrando la causa y la columna sigue", async () => {
    // M2 esta aplicada (la dejo asi el caso anterior): se vuelve a antes de M2 con su down.
    await ejecutar(sqlDe(M2, "down.sql"), `${M2}/down.sql`);
    const { rows } = await db.query(
      `UPDATE "distrito" SET "zona_especial" = true
        WHERE "id" = (SELECT "id" FROM "distrito" ORDER BY "id" LIMIT 1) RETURNING "id"`,
    );
    // Sin la fila en true, el aborto no se ejercitaria: el test fallaria aqui, no pasaria.
    expect(rows).toHaveLength(1);
    const marcado = String(rows[0].id);
    const antes = await foto();

    await expect(ejecutar(sqlDe(M2, "migration.sql"), `${M2}/migration.sql`)).rejects.toThrow(
      /SL-38: hay distritos con zona_especial = true/,
    );

    expect(diferencias(await foto(), antes)).toEqual([]);
    const { rows: fila } = await db.query(
      `SELECT "zona_especial" FROM "distrito" WHERE "id" = '${marcado.replace(/'/g, "''")}'`,
    );
    expect(fila).toEqual([{ zona_especial: true }]);

    // Con la base «rehecha» (la marca vieja fuera), M2 vuelve a aplicar.
    await db.query(`UPDATE "distrito" SET "zona_especial" = false WHERE "zona_especial" IS TRUE`);
    await ejecutar(sqlDe(M2, "migration.sql"), `${M2}/migration.sql (sin filas en true)`);
    expect(columnaZonaEspecial(await foto())).toBeUndefined();
  }, 120_000);
});
