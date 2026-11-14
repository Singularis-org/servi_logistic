import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

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
 * SLT-60 (T1.5; R28, R29, design §3.7, §3.8) — la migración de la confirmación del pago a la plataforma, de ida y
 * vuelta, contra Postgres. Molde: `migracion-slt94-ida-y-vuelta.test.ts`.
 *
 * - Aplicada con un pago vigente y otro anulado ya en el libro, no crea confirmaciones ni aplicaciones: el
 *   vigente queda por confirmar y el anulado no aparece (R28).
 * - Su `down.sql` deja el esquema como antes: sin las dos tablas, sin las funciones ni los triggers nuevos, y
 *   con la función del tope IGUAL que la de SLT-118 (`pg_get_functiondef`) (R29).
 * - Reaplicada, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `slt60_`), construida aplicando las migraciones anteriores: el down reescribe el trigger
 * del tope de `wallet_movimiento`, y en la base compartida cambiaría el tope de los archivos que pagan a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SLT-60 (T0.2). */
const PREVIA = "20261115120100_pago_satelite_checks";
const M = "20261116120000_pago_plataforma_confirmacion";

const TABLAS = ["pago_plataforma_confirmacion", "pago_plataforma_aplicacion"];
const FUNCIONES = [
  "factura_plataforma_saldos",
  "pago_plataforma_por_confirmar",
  "pago_plataforma_disponible_de",
  "pago_plataforma_disponible",
  "pago_plataforma_confirmar",
  "pago_plataforma_inmutable",
  "pago_plataforma_no_anular_confirmado",
];

const BASE = `slt60_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-60 T1.5 — la migración en disco", () => {
  it("trae su down.sql y va detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(PREVIA);
    const propia = carpetas.indexOf(M);
    expect(previa, "falta la previa").toBeGreaterThanOrEqual(0);
    expect(propia, "falta la migracion").toBeGreaterThan(previa);
    expect(existsSync(path.join(MIGRACIONES, M, "down.sql")), "sin down.sql").toBe(true);
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let topeDeSlt118: string;
let organizacionId: string;
let pagoVigente: string;
let pagoAnulado: string;

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

async function definicionDelTope(): Promise<string> {
  const { rows } = await db.query(
    `SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'wallet_movimiento_tope_pago_plataforma'`,
  );
  expect(rows, "la función del tope no existe").toHaveLength(1);
  return String(rows[0].d);
}

async function funcionesNuevas(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT p.proname AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY 1`,
    [FUNCIONES],
  );
  return rows.map((r) => String(r.n));
}

async function tablasNuevas(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[]) ORDER BY 1`,
    [TABLAS],
  );
  return rows.map((r) => String(r.n));
}

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const { rows } = await db.query(sql, valores);
  return Number(rows[0].n);
}

async function pagos(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT "id" FROM "wallet_movimiento" WHERE "categoria"::text = 'egreso_pago_plataforma' ORDER BY "id"`,
  );
  return rows.map((r) => String(r.id));
}

/**
 * Un pago y otro anulado, ya en el libro antes de SLT-60. El tope de SLT-118 los rechazaría (la empresa no debe
 * nada) y no es lo que se mide aquí: se escriben como dueño con los triggers apagados en esta sesión. El
 * contra-asiento entra con los triggers puestos: no pasa por el tope.
 */
async function sembrar(): Promise<void> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  organizacionId = randomUUID();
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    organizacionId,
    `SLT60 ida y vuelta ${sufijo}`,
    `slt60-iv-${sufijo}`,
  ]);
  pagoVigente = randomUUID();
  pagoAnulado = randomUUID();
  await db.query(`SET session_replication_role = replica`);
  try {
    for (const id of [pagoVigente, pagoAnulado]) {
      await db.query(
        `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id")
         VALUES ($1, 'egreso', 'egreso_pago_plataforma', 500.00, 'gasto', 'Pago SLT60', $2)`,
        [id, organizacionId],
      );
    }
  } finally {
    await db.query(`SET session_replication_role = origin`);
  }
  await db.query(
    `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion", "organizacion_id")
     VALUES ($1, 'ingreso', 'ingreso_ajuste', 500.00, 'gasto', $2, 'Anulación SLT60', $3)`,
    [randomUUID(), pagoAnulado, organizacionId],
  );
}

describeSiHayBase("SLT-60 R28, R29 — pago_plataforma_confirmacion de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    // Apaga el autovacuum antes de cada migracion, no al acabar: el 40P01 de SL-17 (ver el helper).
    await aplicarMigracionesHasta(db, M);
    await sembrar();

    antes = await fotoCompleta();
    topeDeSlt118 = await definicionDelTope();
    // Sin esto el ciclo sería verde con una migración vacía o mal leída.
    expect(await tablasNuevas()).toEqual([]);
    expect(await funcionesNuevas()).toEqual([]);
    expect(await pagos()).toHaveLength(2);

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    con = await fotoCompleta();
    expect(await tablasNuevas()).toEqual([...TABLAS].sort());
    expect(await funcionesNuevas()).toEqual([...FUNCIONES].sort());
    expect(await definicionDelTope(), "el tope no se reescribió").not.toBe(topeDeSlt118);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R28: no crea confirmaciones ni aplicaciones; el pago vigente queda por confirmar y el anulado no", async () => {
    expect(await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_confirmacion"`)).toBe(0);
    expect(await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_aplicacion"`)).toBe(0);
    expect((await pagos()).sort()).toEqual([pagoVigente, pagoAnulado].sort());

    const { rows } = await db.query(`SELECT "id", "monto"::text AS "monto" FROM pago_plataforma_por_confirmar($1)`, [
      organizacionId,
    ]);
    expect(rows).toEqual([{ id: pagoVigente, monto: "500.00" }]);
    // Sin facturas cerradas, lo disponible es 0 − lo por confirmar (R3).
    const disponible = await db.query(`SELECT pago_plataforma_disponible_de($1)::text AS d`, [organizacionId]);
    expect(disponible.rows[0].d).toBe("-500.00");
  });

  it("R29: el down.sql quita tablas, funciones y triggers y repone el tope de SLT-118", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(diferencias(await fotoCompleta(), antes), "tras el down").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await tablasNuevas()).toEqual([]);
    expect(await funcionesNuevas()).toEqual([]);
    expect(await definicionDelTope()).toBe(topeDeSlt118);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'public.wallet_movimiento'::regclass
            AND tgname = 'pago_plataforma_no_anular_confirmado'`,
      ),
    ).toBe(0);
    expect((await pagos()).sort()).toEqual([pagoVigente, pagoAnulado].sort());
  }, 120_000);

  it("reaplicada, todo vuelve igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), `${M}/migration.sql (otra vez)`);
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(await contar(`SELECT count(*)::int AS n FROM "pago_plataforma_confirmacion"`)).toBe(0);
  }, 120_000);
});
