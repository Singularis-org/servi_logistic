import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";

import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";
import { VEHICULOS_SEED } from "@/lib/types/vehiculos";

import { HAY_BASE_DE_DATOS, urlDeBaseDeDatos } from "./_postgres-real";

/**
 * SL-17 T3.6 (R6, R32) — las cuatro migraciones de la feature, de ida y vuelta, contra Postgres.
 *
 * Para M1, M2, M4 y M3 (orden de carpeta): `migration.sql` → `down.sql` deja el esquema IGUAL que
 * antes, y volver a aplicar `migration.sql` lo deja igual que con ella. "Igual" se mide en los
 * catalogos (ver `foto`), no leyendo el SQL: comparar el down contra el texto del up estaria verde
 * aunque Postgres hiciera otra cosa.
 *
 * POR QUE UNA BASE PROPIA Y NO UN ESQUEMA DESECHABLE (lo que sugeria design §9.2): las migraciones
 * no se pueden redirigir a otro esquema. M1 hace `GRANT … ON ALL TABLES IN SCHEMA public`,
 * `ALTER DEFAULT PRIVILEGES IN SCHEMA public` y crea un rol del CLUSTER; M2 y M3 nombran ~75
 * tablas que solo existen en `public`. Aplicarlas en la base compartida de los tests tampoco vale:
 * su `down.sql` quitaria la RLS y el rol a los demas archivos que corren a la vez.
 *
 * POR QUE SE CONSTRUYE APLICANDO LAS MIGRACIONES PREVIAS Y NO CON `CREATE DATABASE … TEMPLATE`:
 * `TEMPLATE` exige que nadie este conectado a la base origen, y en la suite los demas archivos lo
 * estan. Ademas, clonar la base de los tests traeria las migraciones POSTERIORES a M3 ya
 * aplicadas y habria que deshacerlas antes; aplicando solo las anteriores a M1 el test no depende
 * de cuantas vengan despues.
 *
 * El SQL se manda SENTENCIA A SENTENCIA, en autocommit salvo los `BEGIN`/`COMMIT` del propio
 * archivo, que es lo que hace `migrate deploy`. Medido: mandado como un solo script, Postgres lo
 * envuelve en una transaccion implicita y `20260803120000_caja_tesoreria` cae con 55P04 (usa un
 * valor de enum anadido en el mismo archivo). Va por el `pg.Pool` del propio driver adapter:
 * ninguna dependencia nueva.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACIONES = path.join(RAIZ, "db", "migrations");

const M1 = "20261022130000_organizacion_y_rol_app";
const M2 = "20261022130100_organizacion_id_en_negocio";
const M4 = "20261022130200_jobs_organizacion_id";
const M3 = "20261022130300_misma_empresa_en_fk";

/** Prefijo `sl17_`: si un fallo deja la base viva, se reconoce de quien es. */
const BASE = `sl17_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

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

// ── La foto del esquema ─────────────────────────────────────────────────────────────────────────
// Cada seccion es un conjunto de lineas de texto; la comparacion dice que linea sobra o falta.

/** ACL de la base sin el NULL inicial: «sin ACL» y «la ACL por defecto escrita» son lo mismo. */
const aclNormalizada = (columna: string, tipo: string, dueno: string): string =>
  `array_to_string(ARRAY(SELECT x::text FROM unnest(coalesce(${columna}, acldefault(${tipo}::"char", ${dueno}))) x ORDER BY 1), ',')`;

const CONSULTAS_DE_LA_FOTO: Record<string, string> = {
  tablas: `SELECT table_name || ' ' || table_type AS l FROM information_schema.tables
    WHERE table_schema = 'public'`,
  columnas: `SELECT concat_ws(' | ', table_name || '.' || column_name, data_type, udt_name, is_nullable,
      column_default, character_maximum_length, numeric_precision, numeric_scale, datetime_precision,
      is_identity, is_generated, generation_expression) AS l
    FROM information_schema.columns WHERE table_schema = 'public'`,
  // Aparte: reaplicar una migracion que anade columnas les da un attnum nuevo (Postgres no
  // reutiliza el del borrado). Es el unico cambio legitimo al reaplicar (bitacora T1.2).
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
  funciones: `SELECT concat_ws(' | ', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      p.prokind, CASE WHEN p.prokind IN ('f', 'p') THEN md5(pg_get_functiondef(p.oid)) END,
      ${aclNormalizada("p.proacl", "'f'", "p.proowner")}) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  rls: `SELECT c.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  acl: `SELECT c.relname || ' | ' || ${aclNormalizada(
    "c.relacl",
    "CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END",
    "c.relowner",
  )} AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
    UNION ALL
    SELECT 'esquema public | ' || ${aclNormalizada("n.nspacl", "'n'", "n.nspowner")}
    FROM pg_namespace n WHERE n.nspname = 'public'`,
  privilegios_por_defecto: `SELECT concat_ws(' | ', d.defaclrole::regrole::text,
      d.defaclnamespace::regnamespace::text, d.defaclobjtype,
      array_to_string(ARRAY(SELECT x::text FROM unnest(d.defaclacl) x ORDER BY 1), ',')) AS l
    FROM pg_default_acl d`,
  tipos: `SELECT t.typname || ' ' || t.typtype::text || ' ' || coalesce((SELECT string_agg(e.enumlabel, ','
      ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid), '') AS l
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')`,
  // M2 borra las filas sembradas de `premio_ranking` y su down las resiembra: tambien es estado.
  filas: `SELECT c.relname || ' = ' || (xpath('/row/n/text()', query_to_xml(
      format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
};

type Foto = Record<string, Set<string>>;

async function foto(db: Conexion): Promise<Foto> {
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

// ── El ciclo ────────────────────────────────────────────────────────────────────────────────────

let db: Conexion;
let admin: Conexion;
/** M1 aplicada y M2 no: la referencia del caso de la mutacion. La fija el ciclo de M2. */
let fotoSinM2: Foto | undefined;

/**
 * Parte un script en sentencias por los `;` de nivel superior: respeta literales `'…'`,
 * identificadores `"…"`, cuerpos `$tag$…$tag$` y comentarios (que se descartan).
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
      // `''` y `""` escapan la comilla: se salen y se vuelven a entrar, el texto queda igual.
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

async function ejecutar(texto: string, etiqueta: string): Promise<void> {
  for (const sentencia of sentenciasDe(texto)) {
    try {
      await db.query(sentencia);
    } catch (error) {
      // Si fallo dentro del `BEGIN` del archivo, la conexion queda en una transaccion abortada.
      await db.query("ROLLBACK").catch(() => undefined);
      const inicio = sentencia.replace(/\s+/g, " ").slice(0, 120);
      const detalle = (error as { detail?: string }).detail;
      throw new Error(
        `${etiqueta}: ${(error as Error).message}${detalle ? ` (${detalle})` : ""} — en «${inicio}»`,
        { cause: error },
      );
    }
  }
}

interface Ciclo {
  antes: Foto;
  con: Foto;
}

/**
 * `migration.sql` → `down.sql` → igual que antes; `migration.sql` otra vez → igual que con ella.
 */
async function idaYVuelta(carpeta: string): Promise<Ciclo> {
  const antes = await foto(db);
  await ejecutar(sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql`);
  const con = await foto(db);
  // Sin esto el test seria verde con una migracion vacia o mal leida.
  expect(diferencias(con, antes).length, `${carpeta} no cambio nada`).toBeGreaterThan(0);

  await ejecutar(sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
  expect(diferencias(await foto(db), antes), `${carpeta}: tras down.sql`).toEqual([]);

  await ejecutar(sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
  expect(
    diferencias(sinSeccion(await foto(db), "orden_de_columnas"), sinSeccion(con, "orden_de_columnas")),
    `${carpeta}: reaplicada`,
  ).toEqual([]);
  return { antes, con };
}

async function contarOrganizaciones(): Promise<number> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM "organizacion"`);
  return Number(rows[0].n);
}

describeSiHayBase("SL-17 — M1, M2, M4 y M3 de ida y vuelta (R6, R32)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    // La crea `migrate deploy`; M1 le revoca permisos, asi que tiene que existir.
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M1) break;
      await ejecutar(sqlDe(carpeta, "migration.sql"), carpeta);
    }
  }, 300_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("las cuatro estan en disco con su down.sql, y en este orden de carpeta", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [M1, M2, M4, M3].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion de SL-17").toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    for (const c of [M1, M2, M4, M3]) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });

  it("R6 — M1: organizacion, rol servi_app y politicas de plataforma, de ida y vuelta", async () => {
    const { antes, con } = await idaYVuelta(M1);
    const anadido = diferencias(con, antes);
    expect(anadido).toContain("sobra en tablas: organizacion BASE TABLE");
    expect(anadido.some((l) => l.includes("politicas: organizacion.organizacion_propia"))).toBe(true);
    expect(anadido).toContain("sobra en rls: Session rls=true force=false");
    // El down puede borrar el rol si ninguna otra base lo usa; la reaplicacion lo recrea. Lo usan
    // otras bases del cluster: al acabar tiene que existir.
    const { rows } = await db.query(`SELECT 1 FROM pg_roles WHERE rolname = 'servi_app'`);
    expect(rows).toHaveLength(1);
  }, 60_000);

  it("R6 — M2: organizacion_id, FK, indice y politica en las tablas de negocio, de ida y vuelta", async () => {
    const { antes, con } = await idaYVuelta(M2);
    fotoSinM2 = antes;
    const anadido = diferencias(con, antes);
    // Contra la clasificacion (fuente independiente del SQL): toda tabla de negocio que ya existia
    // gana la columna y su politica. Las que nazcan despues de M2 no cuentan aqui.
    const previas = MODELOS_DE_NEGOCIO.filter((m) => antes.tablas.has(`${m.tabla} BASE TABLE`));
    expect(previas.length).toBeGreaterThan(70);
    const sinColumna = previas.filter(
      (m) => !anadido.some((l) => l.startsWith(`sobra en columnas: ${m.tabla}.organizacion_id |`)),
    );
    const sinPolitica = previas.filter(
      (m) => !anadido.some((l) => l.startsWith(`sobra en politicas: ${m.tabla}.`)),
    );
    expect(sinColumna.map((m) => m.tabla)).toEqual([]);
    expect(sinPolitica.map((m) => m.tabla)).toEqual([]);
    expect(anadido).toContain("falta en filas: premio_ranking = 3");
  }, 120_000);

  it("la comparacion ve un down incompleto: sin el bloque de ranking_snapshot_fila, lo nombra", async () => {
    // M2 esta aplicada (la dejo asi el caso anterior). Mutacion en memoria, no en el archivo.
    if (!fotoSinM2) throw new Error("el caso de M2 no llego a fijar la foto previa");
    const sinM2 = fotoSinM2;
    const conM2 = await foto(db);
    const real = sqlDe(M2, "down.sql").split("\n");
    const delBloque = (l: string): boolean =>
      !l.trimStart().startsWith("--") &&
      (l.includes('"ranking_snapshot_fila"') || l.includes('"ranking_snapshot_fila_organizacion_id_idx"'));
    const quitadas = real.filter(delBloque);
    expect(quitadas, "la mutacion no quito el bloque esperado").toHaveLength(4);
    await ejecutar(real.filter((l) => !delBloque(l)).join("\n"), `${M2}/down.sql mutado`);

    const sobrante = diferencias(await foto(db), sinM2);
    expect(sobrante.filter((l) => l.startsWith("falta"))).toEqual([]);
    for (const objeto of [
      "politicas: ranking_snapshot_fila.ranking_snapshot_fila_por_empresa",
      "indices: ranking_snapshot_fila.ranking_snapshot_fila_organizacion_id_idx",
      "constraints: ranking_snapshot_fila | ranking_snapshot_fila_organizacion_id_fkey",
      "columnas: ranking_snapshot_fila.organizacion_id",
    ]) {
      expect(sobrante.some((l) => l.startsWith(`sobra en ${objeto}`)), objeto).toBe(true);
    }

    // Se completa a mano lo que la mutacion quito y se vuelve a M2 aplicada, como estaba.
    await ejecutar(quitadas.join("\n"), "bloque quitado");
    expect(diferencias(await foto(db), sinM2)).toEqual([]);
    await ejecutar(sqlDe(M2, "migration.sql"), `${M2}/migration.sql (tras la mutacion)`);
    expect(
      diferencias(sinSeccion(await foto(db), "orden_de_columnas"), sinSeccion(conM2, "orden_de_columnas")),
    ).toEqual([]);
  }, 120_000);

  it("R6 — M4: jobs.organizacion_id, de ida y vuelta", async () => {
    const { antes, con } = await idaYVuelta(M4);
    const anadido = diferencias(con, antes);
    expect(anadido.some((l) => l.startsWith("sobra en columnas: jobs.organizacion_id"))).toBe(true);
    expect(anadido.some((l) => l.includes("jobs_organizacion_id_fkey"))).toBe(true);
  }, 60_000);

  it("R6 — M3: triggers de misma empresa en las FK, de ida y vuelta", async () => {
    const { antes, con } = await idaYVuelta(M3);
    const triggers = diferencias(con, antes).filter((l) => l.startsWith("sobra en triggers:"));
    expect(triggers.length).toBeGreaterThan(0);
  }, 120_000);

  it("R32 — ni las migraciones (M1–M4 y las posteriores) ni db:seed crean filas de organizacion", async () => {
    expect(await contarOrganizaciones()).toBe(0);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta <= M3) continue;
      await ejecutar(sqlDe(carpeta, "migration.sql"), carpeta);
    }
    expect(await contarOrganizaciones()).toBe(0);

    // El seed real, por su entrypoint (lo que corre `pnpm run db:seed`), contra esta base. Se
    // vacia antes un catalogo que el seed rellena, para saber que escribio AQUI: si no, el 0 de
    // abajo no probaria nada. La base es de este test; nadie mas la lee.
    await db.query(`DELETE FROM "vehiculos"`);
    const entorno: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: urlDe(BASE) };
    delete entorno.DIRECT_URL;
    const tsx = createRequire(__filename).resolve("tsx/cli");
    await promisify(execFile)(process.execPath, [tsx, "scripts/seed-catalogos.ts"], {
      cwd: RAIZ,
      env: entorno,
      timeout: 120_000,
    });
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "vehiculos"`);
    expect(Number(rows[0].n), "el seed no escribio en esta base").toBe(VEHICULOS_SEED.length);
    expect(await contarOrganizaciones()).toBe(0);
  }, 180_000);
});
