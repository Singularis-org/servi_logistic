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
 * SL-23 (ajuste sin SDD, decisiones del humano del 2026-10-27) — «Recolección», «Bodegas satélite»,
 * «API e integraciones» y «WhatsApp» pasan al núcleo: 20261027120000 recrea `modulo_apagable` sin
 * esas cuatro claves.
 *
 * 1. Se aplica sobre una base con todo lo anterior y dos empresas con los 8 módulos encendidos, más
 *    un rastro de historial y un job descartado que nombran claves que se van (texto).
 * 2. La ida: el tipo queda con 4 claves, cada empresa con sus 4 filas, y la tabla conserva RLS,
 *    política, grants, trigger, índices y FK. El historial y el job no se tocan.
 * 3. El down: el tipo vuelve a sus 8 claves en el orden original y las cuatro claves vuelven encendidas
 *    para todas las empresas; el esquema queda igual que antes de la ida.
 * 4. Reaplicada, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (`sl23n_iv_<rand>`), como la de las tres migraciones de SL-23: el down recrea el tipo y
 * en la base compartida chocaría con los tests que escriben `organizacion_modulo`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PREVIA = "20261026120200_job_estado_descartado";
const M_NUCLEO = "20261027120000_modulos_nucleo";

const BASE = `sl23n_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** Escritas a mano, en el orden del enum: compararlas con `enum_range` no probaría nada. */
const CLAVES_ANTES = [
  "analitica",
  "monitoreo",
  "recoleccion",
  "bodegas_satelite",
  "wallet",
  "ranking",
  "whatsapp",
  "api_integraciones",
];
const CLAVES_DESPUES = ["analitica", "monitoreo", "wallet", "ranking"];

// Lo que la foto del fixture de SL-32 no mira y esta migración podría mover.
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
  indices: `SELECT tablename || '.' || indexname || ' | ' || indexdef AS l FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'organizacion_modulo'`,
  restricciones: `SELECT conname || ' | ' || pg_get_constraintdef(oid) AS l FROM pg_constraint
    WHERE conrelid = 'public.organizacion_modulo'::regclass`,
};

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let empresaA: string;
let empresaB: string;
let rastro: string;
let job: string;

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
    `SL23N ${etiqueta}`,
    `sl23n-iv-${etiqueta}-${id.slice(0, 8)}`,
  ]);
  return id;
}

/** Lo que la migración no debe tocar: el texto histórico que nombra una clave que se va. */
async function historia(): Promise<unknown[]> {
  const { rows: h } = await db.query(`SELECT "valor_nuevo" AS v FROM "historial_accion" WHERE "id" = $1`, [rastro]);
  const { rows: j } = await db.query(`SELECT "estado"::text AS e, "last_error" AS m FROM "jobs" WHERE "id" = $1`, [job]);
  return [...h, ...j];
}

describe("SL-23 — la migración de Recolección, Bodegas satélite, API y WhatsApp al núcleo, en disco", () => {
  it("trae su down.sql y va detrás de las tres de SL-23", () => {
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(PREVIA);
    expect(previa).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M_NUCLEO)).toBeGreaterThan(previa);
    expect(existsSync(path.join(MIGRACIONES, M_NUCLEO, "down.sql"))).toBe(true);
  });
});

describeSiHayBase("SL-23 — modulo_apagable sin recoleccion, bodegas_satelite, api_integraciones ni whatsapp, de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M_NUCLEO) break;
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17, SL-32, SL-40 y SL-45: el autovacuum pide locks que chocan con los ALTER.
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);

    empresaA = await crearEmpresa("a");
    empresaB = await crearEmpresa("b");
    for (const id of [empresaA, empresaB]) {
      await db.query(
        `INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo")
         SELECT gen_random_uuid()::text, $1, m FROM unnest(enum_range(NULL::"modulo_apagable")) AS m`,
        [id],
      );
    }
    rastro = randomUUID();
    await db.query(
      `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
                                       "valor_nuevo", "lote_id", "organizacion_id")
       VALUES ($1, 'modulo_desactivado', 'organizacion_modulo', $2, 'SL23N', 'recoleccion', $3, $4)`,
      [rastro, randomUUID(), randomUUID(), empresaA],
    );
    job = randomUUID();
    const { rows: tipos } = await db.query(`SELECT (enum_range(NULL::job_tipo))[1]::text AS t`);
    await db.query(
      `INSERT INTO "jobs" ("id", "tipo", "estado", "max_intentos", "last_error", "organizacion_id")
       VALUES ($1, $2::job_tipo, 'descartado', 3, 'modulo_inactivo:bodegas_satelite', $3)`,
      [job, String(tipos[0].t), empresaA],
    );

    expect(await etiquetas("modulo_apagable")).toEqual(CLAVES_ANTES);
    expect(await modulosDe(empresaA)).toEqual(CLAVES_ANTES);
    antes = await fotoSinFilas();

    await ejecutar(db, sqlDe(M_NUCLEO, "migration.sql"), M_NUCLEO);
    con = await fotoSinFilas();
    // Sin esto el ciclo sería verde con una migración vacía o mal leída.
    expect(diferencias(con, antes).length).toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("el tipo queda con las 4 claves apagables, en su orden, y cada empresa con sus 4 filas", async () => {
    expect(await etiquetas("modulo_apagable")).toEqual(CLAVES_DESPUES);
    expect(await etiquetas("modulo_apagable_viejo")).toEqual([]);
    expect(await modulosDe(empresaA)).toEqual(CLAVES_DESPUES);
    expect(await modulosDe(empresaB)).toEqual(CLAVES_DESPUES);
  });

  it("solo cambian el tipo y sus valores: RLS, política, grants, trigger, índices y FK siguen igual", () => {
    const cambios = diferencias(con, antes).filter((d) => !d.includes("modulo_apagable"));
    expect(cambios).toEqual([]);
    for (const seccion of Object.keys(CONSULTAS_EXTRA)) {
      expect([...con[seccion]].sort(), seccion).toEqual([...antes[seccion]].sort());
    }
  });

  it("la clave que se fue ya no entra; el historial y el job que la nombran no se tocan", async () => {
    await expect(
      db.query(`INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo") VALUES ($1, $2, 'recoleccion')`, [
        randomUUID(),
        empresaA,
      ]),
    ).rejects.toMatchObject({ code: "22P02" });
    for (const clave of ["api_integraciones", "whatsapp"]) {
      await expect(
        db.query(`INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo") VALUES ($1, $2, $3)`, [
          randomUUID(),
          empresaA,
          clave,
        ]),
      ).rejects.toMatchObject({ code: "22P02" });
    }
    expect(await historia()).toEqual([{ v: "recoleccion" }, { e: "descartado", m: "modulo_inactivo:bodegas_satelite" }]);
  });

  it("el down devuelve las 8 claves en su orden, las cuatro encendidas para todas, y el esquema como antes", async () => {
    await ejecutar(db, sqlDe(M_NUCLEO, "down.sql"), `${M_NUCLEO}/down.sql`);
    expect(diferencias(await fotoSinFilas(), antes), "tras el down").toEqual([]);
    expect(await etiquetas("modulo_apagable")).toEqual(CLAVES_ANTES);
    expect(await etiquetas("modulo_apagable_nuevo")).toEqual([]);
    expect(await modulosDe(empresaA)).toEqual(CLAVES_ANTES);
    expect(await modulosDe(empresaB)).toEqual(CLAVES_ANTES);
    expect(await historia()).toHaveLength(2);
  }, 120_000);

  it("reaplicada, el esquema vuelve igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M_NUCLEO, "migration.sql"), `${M_NUCLEO}/migration.sql (otra vez)`);
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
    expect(await modulosDe(empresaA)).toEqual(CLAVES_DESPUES);
  }, 120_000);
});
