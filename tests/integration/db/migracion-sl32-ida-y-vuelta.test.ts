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
 * SL-32 (R21) — las tres migraciones del superadmin, de ida y vuelta, contra Postgres.
 *
 * Fija lo que midio el reviewer (`progress/review_SL-32.md > 5. Migraciones`):
 * - con el superadmin dentro, el down de la 3.ª (CHECK) va bien y el de la 2.ª aborta con P0001
 *   sin tocar nada;
 * - sin el superadmin, los downs de la 2.ª y la 1.ª dejan el esquema como antes de SL-32;
 * - reaplicadas, el indice y el CHECK vuelven igual que la primera vez.
 *
 * BASE PROPIA, no la compartida de los tests: el down de la 1.ª recrea `rol_value` y le cambia el
 * tipo a columnas que leen los demas archivos a la vez, y el superadmin que se inserta aqui chocaria
 * con el indice global de R27 de otra suite. Con base propia no hace falta el lock de
 * `_fixtures/superadmin-32.ts`. Se construye aplicando las migraciones anteriores, como en
 * `migracion-sl17-ida-y-vuelta.test.ts` (alli el porque de no clonar con TEMPLATE).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PREVIA = "20261023090000_unicos_por_empresa";
const M_ENUM = "20261023100000_rol_superadmin";
const M_SEED = "20261023100100_seed_rol_superadmin";
const M_CHECK = "20261023100200_usuario_empresa_o_superadmin";
const DE_SL32 = [M_ENUM, M_SEED, M_CHECK];

const ID_ROL_SUPERADMIN = "e070603f-a477-466f-8bc1-92fcfaceb6f4";
const INDICE = "usuario_un_solo_superadmin";
const CHECK = "usuario_empresa_o_superadmin";

/** El enum antes de SL-32, en su orden: `'Admin Tienda'` es el `@map` de `adminTienda`. */
const ENUM_ANTES = ["maestro", "admin", "mensajero", "Admin Tienda", "adminSatelite", "apiKey"];

/** Prefijo `sl32_`: si un fallo deja la base viva, se reconoce de quien es. */
const BASE = `sl32_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SL-32 R21 — las tres migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detras de 20261023090000_unicos_por_empresa", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SL32].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SL32) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
/** Antes de las tres y con las tres: las referencias de todo el ciclo. */
let antes: Foto;
let con: Foto;
let idSuperadmin: string;

async function existeIndice(): Promise<string | null> {
  const { rows } = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`, [
    INDICE,
  ]);
  return rows.length ? String(rows[0].indexdef) : null;
}

async function existeCheck(): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c WHERE c.conname = $1 AND c.conrelid = '"usuario"'::regclass`,
    [CHECK],
  );
  return rows.length ? String(rows[0].d) : null;
}

async function filasRolSuperadmin(): Promise<number> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM "rol" WHERE "id" = $1`, [ID_ROL_SUPERADMIN]);
  return Number(rows[0].n);
}

async function existeUsuario(id: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM "usuario" WHERE "id" = $1`, [id]);
  return rows.length === 1;
}

describeSiHayBase("SL-32 R21 — rol_superadmin, seed y CHECK de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M_ENUM) break;
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17: el autovacuum de la base recien llenada pide locks que chocan con
    // los ALTER de las migraciones (40P01 medido). Las reloptions no entran en la foto.
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);

    antes = await foto(db);
    for (const carpeta of DE_SL32) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await foto(db);
    // Sin esto el ciclo seria verde con migraciones vacias o mal leidas.
    expect(await existeIndice(), "la 2.ª no creo el indice").not.toBeNull();
    expect(await existeCheck(), "la 3.ª no creo el CHECK").not.toBeNull();
    expect(await filasRolSuperadmin()).toBe(1);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("con el superadmin dentro, el down de la 3.ª va bien: quita el CHECK y deja al usuario", async () => {
    idSuperadmin = randomUUID();
    const sufijo = idSuperadmin.replace(/-/g, "").slice(0, 12);
    await db.query(
      `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula",
         "tipo_identificacion_id", "rol_id", "estado", "updated_at", "organizacion_id")
       SELECT $1, 'Superadmin SL-32 R21', $2, '88880000', 'x', $3, t."id", $4, 'activo', now(), NULL
       FROM "tipo_identificacion" t WHERE t."value" = 'cedula'`,
      [idSuperadmin, `sl32-iv-${sufijo}@example.com`, `sl32-iv-${sufijo}`, ID_ROL_SUPERADMIN],
    );
    expect(await existeUsuario(idSuperadmin), "no se inserto el superadmin").toBe(true);

    await ejecutar(db, sqlDe(M_CHECK, "down.sql"), `${M_CHECK}/down.sql`);
    expect(await existeCheck()).toBeNull();
    expect(await existeUsuario(idSuperadmin)).toBe(true);
    expect(await existeIndice()).not.toBeNull();
  }, 60_000);

  it("con el superadmin dentro, el down de la 2.ª aborta con P0001 y no borra nada", async () => {
    expect(await existeUsuario(idSuperadmin), "el caso anterior no dejo al superadmin").toBe(true);
    const previa = await foto(db);

    const fallo = await ejecutar(db, sqlDe(M_SEED, "down.sql"), `${M_SEED}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(fallo, "el down de la 2.ª no aborto").toBeInstanceOf(ErrorDeScript);
    expect((fallo as ErrorDeScript).sqlstate).toBe("P0001");
    expect((fallo as ErrorDeScript).message).toContain("hay un usuario superadmin");

    expect(await existeUsuario(idSuperadmin)).toBe(true);
    expect(await existeIndice()).not.toBeNull();
    expect(await filasRolSuperadmin()).toBe(1);
    expect(diferencias(await foto(db), previa), "el down abortado cambio algo").toEqual([]);
  }, 60_000);

  it("sin el superadmin, los downs de la 2.ª y la 1.ª dejan el esquema como antes de SL-32", async () => {
    await db.query(`DELETE FROM "usuario" WHERE "id" = $1`, [idSuperadmin]);

    await ejecutar(db, sqlDe(M_SEED, "down.sql"), `${M_SEED}/down.sql`);
    await ejecutar(db, sqlDe(M_ENUM, "down.sql"), `${M_ENUM}/down.sql`);

    const { rows: valores } = await db.query(
      `SELECT e.enumlabel AS v FROM pg_enum e WHERE e.enumtypid = '"rol_value"'::regtype ORDER BY e.enumsortorder`,
    );
    expect(valores.map((r) => r.v)).toEqual(ENUM_ANTES);
    const { rows: viejo } = await db.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'rol_value_old' AND n.nspname = 'public'`,
    );
    expect(viejo).toEqual([]);
    expect(await existeIndice()).toBeNull();
    expect(await existeCheck()).toBeNull();
    expect(await filasRolSuperadmin()).toBe(0);
    expect(diferencias(await foto(db), antes), "tras los tres downs").toEqual([]);
  }, 120_000);

  it("reaplicadas las tres, el indice y el CHECK vuelven con su definicion y no hay drift", async () => {
    for (const carpeta of DE_SL32) {
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    }
    const indice = await existeIndice();
    const check = await existeCheck();
    expect(indice).toContain("UNIQUE");
    expect(indice).toContain("(true)");
    expect(indice).toContain(ID_ROL_SUPERADMIN);
    expect(check).toContain("organizacion_id IS NULL");
    expect(check).toContain(ID_ROL_SUPERADMIN);
    expect(con.indices.has(`usuario.${INDICE} | ${indice}`), "el indice no es el de la primera vez").toBe(true);
    expect(diferencias(await foto(db), con), "reaplicadas").toEqual([]);
  }, 120_000);
});
