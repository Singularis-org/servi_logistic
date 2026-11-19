import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
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
 * SLT-143 (T1.5; R33, design §3.7) — la migración del pago por fuera y la anulación de la plataforma, de ida y
 * vuelta, contra Postgres. Molde: `migracion-slt60-ida-y-vuelta.test.ts`.
 *
 * - Aplicada con un pago ya confirmado, no crea datos: sigue confirmado, con `por_fuera = false`, y no queda
 *   anulado (R33).
 * - Su `down.sql` aborta si hay anulaciones de la plataforma, sin tocar nada. Sin ellas, deja el esquema como
 *   antes, y las tres funciones que cambió vuelven a ser las de 20261116120000 (`pg_get_functiondef`).
 * - Reaplicada, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `slt143_`): el down reescribe el saldo de las facturas, la confirmación y el bloqueo de la
 * anulación, y en la base compartida cambiaría lo que miden los archivos que corren a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SLT-143 (T0.1). */
const PREVIA = "20261119120100_cobro_plataforma_ocurrido_utc";
const M = "20261120130000_pago_plataforma_por_fuera";

const TABLAS = ["pago_plataforma_anulacion"];
const FUNCIONES_NUEVAS = [
  "_pago_plataforma_aplicar",
  "pago_plataforma_anular_confirmado",
  "pago_plataforma_registrar_por_fuera",
];
/** Las de 20261116120000 que la migración reescribe y el down repone. */
const FUNCIONES_CAMBIADAS = [
  "factura_plataforma_saldos",
  "pago_plataforma_confirmar",
  "pago_plataforma_no_anular_confirmado",
];

const BASE = `slt143_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-143 T1.5 — la migración en disco", () => {
  it("trae su down.sql y va detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(PREVIA);
    const propia = carpetas.indexOf(M);
    expect(previa, "falta la previa").toBeGreaterThanOrEqual(0);
    expect(propia, "falta la migracion").toBeGreaterThan(previa);
    expect(existsSync(path.join(MIGRACIONES, M, "down.sql")), "sin down.sql").toBe(true);
  });

  it("R33: no inserta datos", () => {
    // Los únicos INSERT del archivo están dentro de las funciones (cuerpos `$$ … $$`).
    const fueraDeCuerpos = sqlDe(M, "migration.sql").replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(fueraDeCuerpos).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(fueraDeCuerpos).not.toMatch(/\bUPDATE\s+"/i);
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let definicionesDeSlt60: Record<string, string>;
let organizacionId: string;
let pagoConfirmado: string;
let confirmacionId: string;

// Lo que esta migración mueve y la foto base no mira: funciones (con su definición), triggers, políticas, RLS y
// privilegios de `servi_app`.
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
  ejecutables: `SELECT p.proname || ' ' || coalesce(array_to_string(p.proacl, ','), '') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
};

async function fotoCompleta(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function definiciones(nombres: string[]): Promise<Record<string, string>> {
  const { rows } = await db.query(
    `SELECT p.proname AS n, pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [nombres],
  );
  return Object.fromEntries(rows.map((r) => [String(r.n), String(r.d)]));
}

async function nombresDe(consulta: string, nombres: string[]): Promise<string[]> {
  const { rows } = await db.query(consulta, [nombres]);
  return rows.map((r) => String(r.n)).sort();
}

const funcionesNuevas = () =>
  nombresDe(
    `SELECT p.proname AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    FUNCIONES_NUEVAS,
  );
const tablasNuevas = () =>
  nombresDe(
    `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
    TABLAS,
  );

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const { rows } = await db.query(sql, valores);
  return Number(rows[0].n);
}

/**
 * Un pago ya confirmado antes de SLT-143. Lo que se mide es la migración, no el tope ni las FK de la
 * confirmación (sin usuarios ni facturas en esta base): pago y confirmación se escriben como dueño con los
 * triggers apagados en esta sesión.
 */
async function sembrar(): Promise<void> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  organizacionId = randomUUID();
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    organizacionId,
    `SLT143 ida y vuelta ${sufijo}`,
    `slt143-iv-${sufijo}`,
  ]);
  pagoConfirmado = randomUUID();
  confirmacionId = randomUUID();
  await db.query(`SET session_replication_role = replica`);
  try {
    await db.query(
      `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id")
       VALUES ($1, 'egreso', 'egreso_pago_plataforma', 500.00, 'gasto', 'Pago SLT143', $2)`,
      [pagoConfirmado, organizacionId],
    );
    await db.query(
      `INSERT INTO "pago_plataforma_confirmacion" ("id", "organizacion_id", "pago_id", "confirmado_por", "confirmado_at")
       VALUES ($1, $2, $3, $4, now() AT TIME ZONE 'UTC')`,
      [confirmacionId, organizacionId, pagoConfirmado, randomUUID()],
    );
  } finally {
    await db.query(`SET session_replication_role = origin`);
  }
}

describeSiHayBase("SLT-143 R33 — pago_plataforma_por_fuera de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    // Apaga el autovacuum antes de cada migracion, no al acabar: el 40P01 de SL-17 (ver el helper).
    await aplicarMigracionesHasta(db, M);
    await sembrar();

    antes = await fotoCompleta();
    definicionesDeSlt60 = await definiciones(FUNCIONES_CAMBIADAS);
    // Sin esto el ciclo sería verde con una migración vacía o mal leída.
    expect(Object.keys(definicionesDeSlt60).sort()).toEqual([...FUNCIONES_CAMBIADAS].sort());
    expect(await tablasNuevas()).toEqual([]);
    expect(await funcionesNuevas()).toEqual([]);

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    con = await fotoCompleta();
    expect(await tablasNuevas()).toEqual(TABLAS);
    expect(await funcionesNuevas()).toEqual([...FUNCIONES_NUEVAS].sort());
    const reescritas = await definiciones(FUNCIONES_CAMBIADAS);
    for (const nombre of FUNCIONES_CAMBIADAS) {
      expect(reescritas[nombre], `${nombre} no se reescribió`).not.toBe(definicionesDeSlt60[nombre]);
    }
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R33: el pago confirmado sigue confirmado, sin la marca y sin anulación", async () => {
    const { rows } = await db.query(
      `SELECT "pago_id", "por_fuera" FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1`,
      [organizacionId],
    );
    expect(rows).toEqual([{ pago_id: pagoConfirmado, por_fuera: false }]);
    expect(await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_anulacion"`)).toBe(0);
    expect(
      await contar(`SELECT count(*)::int AS n FROM pago_plataforma_por_confirmar($1)`, [organizacionId]),
    ).toBe(0);
    expect(await contar(`SELECT count(*)::int AS n FROM "wallet_movimiento"`)).toBe(1);
  });

  it("R33: el down.sql aborta sin tocar nada si hay una anulación de la plataforma", async () => {
    await db.query(`SET session_replication_role = replica`);
    try {
      await db.query(
        `INSERT INTO "pago_plataforma_anulacion" ("organizacion_id", "confirmacion_id", "anulado_por", "anulado_at")
         VALUES ($1, $2, $3, now() AT TIME ZONE 'UTC')`,
        [organizacionId, confirmacionId, randomUUID()],
      );
    } finally {
      await db.query(`SET session_replication_role = origin`);
    }

    const error = await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect((error as ErrorDeScript).message).toMatch(/rollback SLT-143: 1 filas en pago_plataforma_anulacion/);
    expect(diferencias(await fotoCompleta(), con), "el down abortado cambió algo").toEqual([]);
    expect(await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_anulacion"`)).toBe(1);

    await db.query(`DELETE FROM "pago_plataforma_anulacion" WHERE "organizacion_id" = $1`, [organizacionId]);
  }, 120_000);

  it("R33: sin anulaciones, el down.sql deja el esquema como antes y repone las funciones de SLT-60", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(diferencias(await fotoCompleta(), antes), "tras el down").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await tablasNuevas()).toEqual([]);
    expect(await funcionesNuevas()).toEqual([]);
    expect(await definiciones(FUNCIONES_CAMBIADAS)).toEqual(definicionesDeSlt60);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'pago_plataforma_confirmacion' AND column_name = 'por_fuera'`,
      ),
    ).toBe(0);
    expect(
      await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_confirmacion" WHERE "pago_id" = $1`, [
        pagoConfirmado,
      ]),
    ).toBe(1);
  }, 120_000);

  it("reaplicada, todo vuelve igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), `${M}/migration.sql (otra vez)`);
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_anulacion"`)).toBe(0);
  }, 120_000);
});
