import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
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
 * SL-20 (T1.7, T1.8; design §3) — las seis migraciones del país, de ida y vuelta, contra Postgres.
 *
 * - Van en el orden de la decisión F2.1 (opción A: `organizacion_pais` antes que `geografia_por_pais`)
 *   y cada una trae su `down.sql`.
 * - Con las seis, la geografía que ya había queda en CR con sus `id`, nombres, estado y código sin
 *   cambio (R2), la empresa que ya existía queda en CR (R5) y CR queda disponible (R44).
 * - Con una fila `pais_disponibilidad_*` en el historial, el down de `120500` aborta sin tocar nada
 *   (enmienda 2026-10-26, decisión 6).
 * - Con un segundo país cuyos nombres chocarían con el único global, el down de la geografía aborta
 *   sin tocar nada.
 * - Los seis `down.sql`, en orden inverso, dejan el esquema como antes de SL-20: columnas,
 *   constraints, índices, tipos, funciones, triggers, políticas, RLS y privilegios de `servi_app`.
 * - Reaplicadas, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `sl20_`), construida aplicando las migraciones anteriores, como en
 * `migracion-sl40-ida-y-vuelta.test.ts`: los downs quitan columnas de `organizacion` y de la
 * geografía, y en la base compartida romperían a los archivos que corren a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SL-20 (tras el merge F2.3 con SL-18 y SL-23). */
const PREVIA = "20261026120200_job_estado_descartado";
const M_PAIS = "20261026130000_pais";
const M_ORGANIZACION = "20261026130100_organizacion_pais";
const M_GEOGRAFIA = "20261026130200_geografia_por_pais";
const M_TRIGGER = "20261026130300_geografia_del_pais_de_la_empresa";
const M_HISTORIAL = "20261026130400_historial_plataforma";
const M_DISPONIBLE = "20261026130500_pais_disponible";
const DE_SL20 = [M_PAIS, M_ORGANIZACION, M_GEOGRAFIA, M_TRIGGER, M_HISTORIAL, M_DISPONIBLE];

const BASE = `sl20_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SL-20 — las seis migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última de dev, organizacion_pais antes que la geografía", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SL20].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SL20) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let geografiaAntes: Set<string>;
let organizacionId: string;

/** Lo que la foto del fixture no mira y estas migraciones sí crean (mismo juego que SL-40). */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  politicas: `SELECT tablename || '.' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
      coalesce(qual, '') || ' | ' || coalesce(with_check, '') AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
};

/** La foto sin las filas (el caso del segundo país las mueve) y con lo de `CONSULTAS_EXTRA`. */
async function fotoCompleta(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

/** Cada nodo con su id, padre, nombre, estado y código: lo que R2 dice que no cambia. */
async function geografia(): Promise<Set<string>> {
  const { rows } = await db.query(`
    SELECT 'provincia ' || id || ' | ' || nombre || ' | ' || activo || ' | ' || coalesce(codigo_dta, '-') AS l FROM provincia
    UNION ALL SELECT 'canton ' || id || ' < ' || provincia_id || ' | ' || nombre || ' | ' || activo || ' | ' || coalesce(codigo_dta, '-') FROM canton
    UNION ALL SELECT 'distrito ' || id || ' < ' || canton_id || ' | ' || nombre || ' | ' || activo || ' | ' || coalesce(codigo_dta, '-') FROM distrito`);
  return new Set(rows.map((r) => String(r.l)));
}

async function uno(consulta: string, valores: unknown[] = []): Promise<unknown> {
  const { rows } = await db.query(consulta, valores);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

describeSiHayBase("SL-20 — pais, organizacion_pais, geografia_por_pais, trigger e historial de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M_PAIS) break;
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17, SL-32, SL-40 y SL-45: el autovacuum de la base recién llenada pide
    // locks que chocan con los ALTER de las migraciones (40P01 medido allí).
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);
    // R5: una empresa que existe ANTES de SL-20.
    organizacionId = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'SL20 ida y vuelta', $2)`, [
      organizacionId,
      `sl20-iv-${organizacionId.slice(0, 8)}`,
    ]);

    antes = await fotoCompleta();
    geografiaAntes = await geografia();
    expect(geografiaAntes.size, "la base migrada no trae la geografía de CR").toBe(585);

    for (const carpeta of DE_SL20) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoCompleta();
    // Sin esto el ciclo sería verde con migraciones vacías o mal leídas.
    expect(diferencias(con, antes).length, "las seis migraciones no cambiaron nada").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R2/R5/R44: con las seis, la geografía queda en CR sin cambiar id, nombre, estado ni código, la empresa en CR y CR disponible", async () => {
    expect(diferencias({ g: await geografia() }, { g: geografiaAntes }), "la geografía cambió").toEqual([]);
    const fueraDeCR = await uno(
      `SELECT (SELECT count(*) FROM provincia WHERE pais_id <> 'CR') + (SELECT count(*) FROM canton WHERE pais_id <> 'CR')
        + (SELECT count(*) FROM distrito WHERE pais_id <> 'CR')`,
    );
    expect(Number(fueraDeCR)).toBe(0);
    expect(await uno(`SELECT pais_id FROM organizacion WHERE id = $1`, [organizacionId])).toBe("CR");
    expect(await uno(`SELECT string_agg(id || '=' || disponible, ',' ORDER BY id) FROM pais`)).toBe("CR=true");
  });

  it("con una fila pais_disponibilidad_* en el historial, el down de pais_disponible aborta sin tocar nada", async () => {
    const filaId = randomUUID();
    await db.query(`INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
      VALUES ($1, 'pais_disponibilidad_desactivada', 'pais', 'CR', 'Costa Rica', 'CR')`, [filaId]);
    const previo = await fotoCompleta();

    const fallo = await ejecutar(db, sqlDe(M_DISPONIBLE, "down.sql"), `${M_DISPONIBLE}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(fallo, "el down de pais_disponible no abortó").toBeInstanceOf(ErrorDeScript);
    expect((fallo as ErrorDeScript).sqlstate).toBe("P0001");
    expect((fallo as ErrorDeScript).message).toContain("historial_plataforma");
    expect(diferencias(await fotoCompleta(), previo), "tras el down abortado").toEqual([]);
    expect(await uno(`SELECT accion::text FROM historial_plataforma WHERE id = $1`, [filaId])).toBe("pais_disponibilidad_desactivada");

    await db.query(`DELETE FROM historial_plataforma WHERE id = $1`, [filaId]);
    expect(diferencias(await fotoCompleta(), con), "tras borrar la fila").toEqual([]);
  }, 120_000);

  it("con un segundo país que repite el nombre de una provincia, el down de la geografía aborta sin tocar nada", async () => {
    for (const carpeta of [M_DISPONIBLE, M_HISTORIAL, M_TRIGGER]) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
    await db.query(`INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular, nivel_2_plural,
      nivel_3_singular, nivel_3_plural) VALUES ('XA', 'País XA', 'a', 'b', 'c', 'd', 'e', 'f')`);
    await db.query(`INSERT INTO provincia (id, nombre, pais_id) VALUES ($1, 'Cartago', 'XA')`, [randomUUID()]);
    const previo = await fotoCompleta();

    const fallo = await ejecutar(db, sqlDe(M_GEOGRAFIA, "down.sql"), `${M_GEOGRAFIA}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(fallo, "el down de la geografía no abortó").toBeInstanceOf(ErrorDeScript);
    expect((fallo as ErrorDeScript).sqlstate).toBe("P0001");
    expect((fallo as ErrorDeScript).message).toContain("provincia.nombre 'Cartago'");
    expect(diferencias(await fotoCompleta(), previo), "tras el down abortado").toEqual([]);

    await db.query(`DELETE FROM provincia WHERE pais_id = 'XA'`);
    await db.query(`DELETE FROM pais WHERE id = 'XA'`);
    for (const carpeta of [M_TRIGGER, M_HISTORIAL, M_DISPONIBLE]) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    expect(diferencias(await fotoCompleta(), con), "tras reponer las tres").toEqual([]);
  }, 120_000);

  it("los seis down.sql, en orden inverso, dejan el esquema como antes de SL-20", async () => {
    for (const carpeta of [...DE_SL20].reverse()) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);

    expect(diferencias(await fotoCompleta(), antes), "tras los seis downs").toEqual([]);
    expect(diferencias({ g: await geografia() }, { g: geografiaAntes }), "la geografía cambió").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(
      await uno(`SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname IN ('pais', 'historial_plataforma') AND n.nspname = 'public'`),
    ).toBe(0);
    expect(
      await uno(`SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'pais_id'`),
    ).toBe(0);
    expect(
      await uno(`SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('provincia', 'canton', 'distrito')`),
    ).toBe("canton_lectura,distrito_lectura,provincia_lectura");
  }, 120_000);

  it("reaplicadas las seis, todo vuelve igual que la primera vez", async () => {
    for (const carpeta of DE_SL20) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(diferencias({ g: await geografia() }, { g: geografiaAntes }), "la geografía cambió").toEqual([]);
    expect(await uno(`SELECT pais_id FROM organizacion WHERE id = $1`, [organizacionId])).toBe("CR");
  }, 120_000);
});
