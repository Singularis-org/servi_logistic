import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HISTORIAL_ACCION_TIPOS } from "@/lib/types/historial-accion";
import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  MIGRACIONES,
  aplicarMigracionesHasta,
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
 * SLT-56 / T1 y T2 (design §1.3) — las dos migraciones del ajuste del pago al mensajero, de ida y
 * vuelta, en una BASE PROPIA (`slt56_iv_<rand>`): el down de la segunda recrea `historial_accion_tipo`
 * y en la base compartida chocaria con los archivos que escriben en `historial_accion`. La base de
 * `DATABASE_URL` no se toca. Mismo metodo que SL-23/SL-24.
 *
 * 1. Con todo lo anterior aplicado y una empresa, se aplican las dos.
 * 2. El enum de la base coincide EXACTAMENTE con el catalogo de `lib/types/historial-accion.ts` (el
 *    `satisfies` compara con el cliente generado, no con la base).
 * 3. La tabla nace con RLS, su politica, sin UPDATE ni DELETE para `servi_app` y con los triggers de
 *    misma empresa.
 * 4. Los dos `down.sql`, en orden inverso, dejan el esquema como antes (foto de catalogos, funciones,
 *    triggers, politicas, RLS y grants). El de la enum borra SOLO las filas del tipo que quita.
 * 5. Reaplicadas, todo vuelve igual que la primera vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_TABLA = "20261029120000_gestion_pago_mensajero_ajuste";
const M_HISTORIAL = "20261029120100_historial_accion_pago_mensajero_ajustado";
const DE_SLT56 = [M_TABLA, M_HISTORIAL];
const TIPO_NUEVO = "cierre_dia_pago_mensajero_ajustado";
const TABLA = "gestion_pago_mensajero_ajuste";

const BASE = `slt56_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'`,
  politicas: `SELECT concat_ws(' | ', tablename || '.' || policyname, permissive, roles::text, cmd, qual, with_check) AS l
    FROM pg_policies WHERE schemaname = 'public'`,
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
let empresa: string;

async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function lista(sql: string, valores: unknown[] = []): Promise<string[]> {
  const { rows } = await db.query(sql, valores);
  return rows.map((r) => String(r.l)).sort();
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

async function historial(accion: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
                                     "valor_nuevo", "lote_id", "organizacion_id")
     VALUES ($1, $2::historial_accion_tipo, 'gestion_orden'::historial_accion_entidad, $3, 'SLT56', NULL, $4, $5)`,
    [id, accion, randomUUID(), randomUUID(), empresa],
  );
  return id;
}

describe("SLT-56 — las dos migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden, la de la tabla primero", () => {
    const carpetas = carpetasDeMigracion();
    const [tabla, hist] = DE_SLT56.map((c) => carpetas.indexOf(c));
    expect(tabla, `${M_TABLA} no esta en disco`).toBeGreaterThanOrEqual(0);
    expect(hist, `${M_HISTORIAL} va antes que ${M_TABLA}`).toBeGreaterThan(tabla);
    for (const c of DE_SLT56) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

describeSiHayBase("SLT-56 — tabla de ajustes y tipo de historial, de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_TABLA);

    empresa = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'SLT56 iv', $2)`, [
      empresa,
      `slt56-iv-${empresa.slice(0, 8)}`,
    ]);

    antes = await fotoSinFilas();
    for (const carpeta of DE_SLT56) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoSinFilas();
    expect(diferencias(con, antes).length, "las dos migraciones no cambiaron nada").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R18 — el enum de la base es exactamente el catalogo de la app, con el tipo nuevo al final", async () => {
    const enLaBase = await etiquetas("historial_accion_tipo");
    expect(enLaBase.slice(-1)).toEqual([TIPO_NUEVO]);
    expect([...enLaBase].sort()).toEqual([...HISTORIAL_ACCION_TIPOS].sort());
  });

  it("R17 — la tabla nace con sus columnas, RLS, su politica, triggers de misma empresa y sin UPDATE/DELETE para la app", async () => {
    expect(
      await lista(
        `SELECT column_name || ' ' || udt_name || ' ' || is_nullable AS l FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [TABLA],
      ),
    ).toEqual([
      "actor_rol rol_value NO",
      "actor_usuario_id text NO",
      "cierre_id text NO",
      "created_at timestamp NO",
      "gestion_id text NO",
      "id text NO",
      "motivo text NO",
      "organizacion_id text NO",
      "pago_anterior numeric NO",
      "pago_nuevo numeric NO",
    ]);
    expect(con.rls.has(`${TABLA} rls=true`)).toBe(true);
    expect([...con.politicas].some((p) => p.startsWith(`${TABLA}.${TABLA}_por_empresa |`))).toBe(true);
    const privilegios = [...con.privilegios].filter((p) => p.startsWith(`${TABLA} `));
    expect(privilegios).toContain(`${TABLA} SELECT`);
    expect(privilegios).toContain(`${TABLA} INSERT`);
    expect(privilegios).not.toContain(`${TABLA} UPDATE`);
    expect(privilegios).not.toContain(`${TABLA} DELETE`);
    const triggers = [...con.triggers].filter((t) => t.startsWith(`${TABLA}.`));
    expect(triggers.filter((t) => t.includes("verificar_misma_empresa"))).toHaveLength(3);
    expect(triggers.filter((t) => t.includes("impedir_cambio_de_empresa"))).toHaveLength(1);
    expect(
      [...con.constraints].filter((c) => c.includes(`| ${TABLA}_`) && c.includes("| c |")).map((c) => c.split(" | ")[1]).sort(),
    ).toEqual([
      `${TABLA}_motivo_no_vacio`,
      `${TABLA}_pago_distinto`,
      `${TABLA}_pago_nuevo_no_negativo`,
    ]);
  });

  it("los dos down.sql en orden inverso dejan el esquema como antes; el del enum borra SOLO las filas del tipo que quita", async () => {
    const delTipo = await historial(TIPO_NUEVO);
    const ajena = await historial("cierre_dia_pagos_editados");

    await ejecutar(db, sqlDe(M_HISTORIAL, "down.sql"), `${M_HISTORIAL}/down.sql`);
    expect(
      await lista(`SELECT "id" AS l FROM "historial_accion" WHERE "id" = ANY($1::text[])`, [[delTipo, ajena]]),
    ).toEqual([ajena]);
    expect(await etiquetas("historial_accion_tipo")).not.toContain(TIPO_NUEVO);
    // Los valores de planes (SL-24), que van DESPUES en otras migraciones, siguen ahi.
    expect(await etiquetas("historial_accion_tipo")).toContain("plan_asignado");

    await ejecutar(db, sqlDe(M_TABLA, "down.sql"), `${M_TABLA}/down.sql`);
    expect(diferencias(await fotoSinFilas(), antes), "tras los dos downs").toEqual([]);
  }, 180_000);

  it("reaplicadas, el esquema vuelve igual que la primera vez", async () => {
    for (const carpeta of DE_SLT56) {
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    }
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
  }, 180_000);
});
