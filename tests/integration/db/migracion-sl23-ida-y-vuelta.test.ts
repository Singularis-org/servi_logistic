import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  MIGRACIONES,
  carpetasDeMigracion,
  conectar,
  diferencias,
  ejecutar,
  foto,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";

/**
 * SL-23 / T1 (design §4, §9; R5, R27) — las tres migraciones de los módulos, de ida y vuelta.
 *
 * 1. Se aplican sobre una base con dos empresas previas.
 * 2. R5: cada empresa previa queda con los 9 módulos encendidos; una empresa creada después, con
 *    ninguno (nada en la base enciende módulos al dar de alta).
 * 3. R27: los nombres nuevos (tabla, columnas, tipo, valores, índices, política, trigger) son los del
 *    design, en español, leídos de `information_schema`, `pg_enum` y los catálogos.
 * 4. Un job se descarta (`estado = 'descartado'`, motivo en `last_error`) y el superadmin deja rastro
 *    en `historial_accion`.
 * 5. Los tres `down.sql`, en orden inverso, dejan el esquema como antes: el job pasa a `done` con su
 *    `last_error`, el rastro de módulos se borra y el de otras acciones no se toca.
 * 6. Reaplicadas, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (`sl23_iv_<rand>`), como SL-38, SL-40 y SL-45: los down recrean `job_estado` y los dos
 * enums del historial, y en la base compartida chocarían con los archivos que escriben en esas tablas.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SL-23 (T0). */
const PREVIA = "20261025160100_entorno_marca";
const M_TABLA = "20261026120000_organizacion_modulo";
const M_HISTORIAL = "20261026120100_historial_accion_modulos";
const M_JOB = "20261026120200_job_estado_descartado";
const DE_SL23 = [M_TABLA, M_HISTORIAL, M_JOB];

const BASE = `sl23_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** design §2, en el orden del enum. Escrito a mano: compararlo con `enum_range` no probaría nada. */
const CLAVES = [
  "analitica",
  "monitoreo",
  "recoleccion",
  "bodegas_satelite",
  "wallet",
  "ranking",
  "incidentes_novedades",
  "whatsapp",
  "api_integraciones",
];

// Lo que la foto del fixture de SL-32 no mira y estas migraciones sí mueven: RLS, políticas,
// triggers y privilegios de `servi_app`.
const CONSULTAS_EXTRA: Record<string, string> = {
  politicas: `SELECT concat_ws(' | ', tablename || '.' || policyname, permissive, roles::text, cmd, qual, with_check) AS l
    FROM pg_policies WHERE schemaname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'`,
  rls: `SELECT c.relname || ' rls=' || c.relrowsecurity AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
};

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let empresaA: string;
let empresaB: string;

/** La foto sin las filas: los datos que siembra el test las mueven a propósito. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function etiquetas(tipo: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = $1 AND n.nspname = 'public' ORDER BY e.enumsortorder`,
    [tipo],
  );
  return rows.map((r) => String(r.l));
}

async function modulosDe(organizacionId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT "modulo"::text AS m FROM "organizacion_modulo" WHERE "organizacion_id" = $1 ORDER BY "modulo"`,
    [organizacionId],
  );
  return rows.map((r) => String(r.m));
}

async function crearEmpresa(etiqueta: string): Promise<string> {
  const id = randomUUID();
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    id,
    `SL23 ${etiqueta}`,
    `sl23-iv-${etiqueta}-${id.slice(0, 8)}`,
  ]);
  return id;
}

async function lista(sql: string, valores: unknown[] = []): Promise<string[]> {
  const { rows } = await db.query(sql, valores);
  return rows.map((r) => String(r.l)).sort();
}

describe("SL-23 — las tres migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden justo detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(PREVIA);
    expect(previa).toBeGreaterThanOrEqual(0);
    expect(DE_SL23.map((c) => carpetas.indexOf(c))).toEqual([previa + 1, previa + 2, previa + 3]);
    for (const c of DE_SL23) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

describeSiHayBase("SL-23 — organizacion_modulo, historial y job descartado de ida y vuelta (R5, R27)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M_TABLA) break;
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17, SL-32, SL-40 y SL-45: el autovacuum de la base recién llenada pide
    // locks que chocan con los ALTER de las migraciones (40P01 medido allí).
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);

    // Las dos empresas que «existen al desplegar».
    empresaA = await crearEmpresa("a");
    empresaB = await crearEmpresa("b");

    antes = await fotoSinFilas();
    expect(antes.tipos.has("modulo_apagable e " + CLAVES.join(","))).toBe(false);

    for (const carpeta of DE_SL23) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoSinFilas();
    // Sin esto el ciclo sería verde con migraciones vacías o mal leídas.
    expect(diferencias(con, antes).length).toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R5 — cada empresa previa queda con los 9 módulos encendidos, una fila por módulo", async () => {
    // `ORDER BY modulo` ordena por el enum, que es el orden de CLAVES.
    expect(await modulosDe(empresaA)).toEqual(CLAVES);
    expect(await modulosDe(empresaB)).toEqual(CLAVES);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, count(DISTINCT "id")::int AS ids FROM "organizacion_modulo"
        WHERE "organizacion_id" = ANY($1::text[])`,
      [[empresaA, empresaB]],
    );
    expect(rows[0]).toEqual({ n: 18, ids: 18 });
  });

  it("R5, R6 — una empresa creada después de la migración nace sin ningún módulo", async () => {
    const despues = await crearEmpresa("c");
    expect(await modulosDe(despues)).toEqual([]);
    await db.query(`DELETE FROM "organizacion" WHERE "id" = $1`, [despues]);
  });

  it("R27 — tabla, columnas, tipo y valores nuevos con los nombres del design, en español", async () => {
    expect(
      await lista(`SELECT table_name AS l FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE '%modulo%'`),
    ).toEqual(["organizacion_modulo"]);
    expect(
      await lista(`SELECT column_name || ' ' || udt_name || ' ' || is_nullable AS l FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizacion_modulo'`),
    ).toEqual([
      "created_at timestamp NO",
      "id text NO",
      "modulo modulo_apagable NO",
      "organizacion_id text NO",
    ]);
    expect(await etiquetas("modulo_apagable")).toEqual(CLAVES);
    expect((await etiquetas("historial_accion_tipo")).slice(-2)).toEqual(["modulo_activado", "modulo_desactivado"]);
    expect((await etiquetas("historial_accion_entidad")).slice(-1)).toEqual(["organizacion_modulo"]);
    expect((await etiquetas("job_estado")).slice(-1)).toEqual(["descartado"]);

    expect(
      await lista(`SELECT indexname AS l FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'organizacion_modulo'`),
    ).toEqual([
      "organizacion_modulo_organizacion_id_idx",
      "organizacion_modulo_organizacion_id_modulo_key",
      "organizacion_modulo_pkey",
    ]);
    expect(
      await lista(`SELECT policyname AS l FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizacion_modulo'`),
    ).toEqual(["organizacion_modulo_por_empresa"]);
    expect(
      await lista(`SELECT t.tgname AS l FROM pg_trigger t WHERE t.tgrelid = 'public.organizacion_modulo'::regclass
        AND NOT t.tgisinternal`),
    ).toEqual(["organizacion_modulo_sin_cambio_de_empresa"]);
  });

  it("R7 — en el catálogo: RLS activa, FK a organizacion en cascada y servi_app solo con SELECT", async () => {
    const anadido = diferencias(con, antes);
    expect(anadido).toContain("sobra en rls: organizacion_modulo rls=true");
    expect(
      await lista(`SELECT privilege_type AS l FROM information_schema.role_table_grants
        WHERE grantee = 'servi_app' AND table_schema = 'public' AND table_name = 'organizacion_modulo'`),
    ).toEqual(["SELECT"]);
    const { rows } = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c
        WHERE c.conrelid = 'public.organizacion_modulo'::regclass AND c.contype = 'f'`,
    );
    expect(rows.map((r) => String(r.d))).toEqual([
      "FOREIGN KEY (organizacion_id) REFERENCES organizacion(id) ON UPDATE CASCADE ON DELETE CASCADE",
    ]);
  });

  let jobDescartado: string;
  let rastroDeModulo: string;
  let rastroAjeno: string;

  it("R20 — un job se descarta con su motivo, y el historial acepta el rastro de un módulo", async () => {
    const [tipo] = await etiquetas("job_tipo");
    jobDescartado = randomUUID();
    await db.query(
      `INSERT INTO "jobs" ("id", "tipo", "estado", "max_intentos", "last_error", "organizacion_id")
       VALUES ($1, $2::job_tipo, 'descartado', 3, 'modulo_inactivo:ranking', $3)`,
      [jobDescartado, tipo, empresaA],
    );
    const { rows: job } = await db.query(`SELECT "estado"::text AS e, "last_error" AS m FROM "jobs" WHERE "id" = $1`, [
      jobDescartado,
    ]);
    expect(job).toEqual([{ e: "descartado", m: "modulo_inactivo:ranking" }]);

    const insertarRastro = async (accion: string, entidad: string): Promise<string> => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
                                         "valor_nuevo", "lote_id", "organizacion_id")
         VALUES ($1, $2::historial_accion_tipo, $3::historial_accion_entidad, $4, 'SL23', 'ranking', $5, $6)`,
        [id, accion, entidad, randomUUID(), randomUUID(), empresaA],
      );
      return id;
    };
    rastroDeModulo = await insertarRastro("modulo_activado", "organizacion_modulo");
    rastroAjeno = await insertarRastro("usuario_creado", "usuario");
  });

  it("los tres down.sql en orden inverso dejan el esquema como antes; el job queda done y el rastro ajeno sigue", async () => {
    expect(jobDescartado, "el caso necesita el job descartado del caso anterior").toBeDefined();

    for (const carpeta of [...DE_SL23].reverse()) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);

    expect(diferencias(await fotoSinFilas(), antes), "tras los tres downs").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await etiquetas("modulo_apagable")).toEqual([]);
    expect(await etiquetas("job_estado")).toEqual(["pending", "processing", "done", "failed"]);
    expect(await etiquetas("historial_accion_tipo")).not.toContain("modulo_activado");
    expect(await etiquetas("historial_accion_entidad")).not.toContain("organizacion_modulo");

    const { rows: job } = await db.query(`SELECT "estado"::text AS e, "last_error" AS m FROM "jobs" WHERE "id" = $1`, [
      jobDescartado,
    ]);
    expect(job).toEqual([{ e: "done", m: "modulo_inactivo:ranking" }]);
    const { rows: rastros } = await db.query(
      `SELECT "id" AS l FROM "historial_accion" WHERE "id" = ANY($1::text[])`,
      [[rastroDeModulo, rastroAjeno]],
    );
    expect(rastros.map((r) => String(r.l))).toEqual([rastroAjeno]);
    const { rows: empresas } = await db.query(
      `SELECT count(*)::int AS n FROM "organizacion" WHERE "id" = ANY($1::text[])`,
      [[empresaA, empresaB]],
    );
    expect(empresas[0].n).toBe(2);
  }, 120_000);

  it("reaplicadas las tres, el esquema vuelve igual que la primera vez y el backfill se repite", async () => {
    for (const carpeta of DE_SL23) {
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    }
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
    expect(await modulosDe(empresaA)).toHaveLength(9);
    expect(await modulosDe(empresaB)).toHaveLength(9);
  }, 120_000);
});
