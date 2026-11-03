import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
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
 * Ajuste planes-custom (D1, D6; 2026-10-31) — la migración `plan_sin_negociable_y_tipo_cobro`, de ida y
 * vuelta.
 *
 * Se siembra ANTES de la migración un plan «negociable», uno de monto con un cambio programado cuya
 * versión es «negociable», y una empresa con el de monto asignado. Tras subir: sin la columna
 * `precio_negociable`, el negociable queda «sin precio», la versión pendiente pasa a «sin precio» (el
 * resto igual), la empresa está en `mensual` y `plan_de_la_empresa` devuelve `tipo_cobro` sin
 * `precio_negociable`. Bajando: el esquema, los cuerpos de función (md5) y los privilegios vuelven a ser
 * los de antes; lo que se pierde (el «negociable») es lo que dice la cabecera.
 *
 * BASE PROPIA (`pcust_iv_<rand>`): el down añade y quita columnas de `plan` y `organizacion`, y en la
 * base compartida tomaría su lock exclusivo bajo los demás archivos.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261031140300_plan_desasignar_sin_costo_base";
const M = "20261031150000_plan_sin_negociable_y_tipo_cobro";

const BASE = `pcust_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const VERSION_PENDIENTE = {
  nombre: "Pendiente negociable",
  topes: { ordenesPorCiclo: 50, porRol: { admin: 4 }, apiKeys: 3 },
  modulos: ["analitica"],
  precio: { tipo: "negociable" },
  costoPorOrden: "100.00",
};

/** Lo que la foto del fixture no mira y la migración sí cambia: cuerpos de función y privilegios. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  privilegios: `SELECT routine_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'`,
};

let db: Conexion;
let admin: Conexion;
let negociable: string;
let conMonto: string;
let empresa: string;

/** Esquema, cuántas filas tiene cada tabla, cuerpos de función y privilegios. */
async function fotoCompleta(): Promise<Foto> {
  const resto = await foto(db);
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function columnas(tabla: string, columna: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT data_type || ' ' || is_nullable || ' ' || COALESCE(column_default, '-') AS l FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabla, columna],
  );
  return rows.map((r) => String(r.l));
}

async function precioDe(planId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query(
    `SELECT "precio_mensual"::text AS mensual, "precio_anual"::text AS anual, "descuento_anual_pct"::text AS pct
       FROM "plan" WHERE "id" = $1`,
    [planId],
  );
  return rows[0];
}

async function versionPendiente(): Promise<unknown> {
  const { rows } = await db.query(`SELECT "version" FROM "plan_cambio_programado" WHERE "plan_id" = $1`, [conMonto]);
  return rows[0]?.version;
}

async function sqlstateDe(sql: string, valores: unknown[] = []): Promise<string | null> {
  await db.query("BEGIN");
  let sqlstate: string | null = null;
  try {
    await db.query(sql, valores);
  } catch (e) {
    sqlstate = (e as { code?: string }).code ?? "??";
  }
  await db.query("ROLLBACK");
  return sqlstate;
}

async function planDeLaEmpresa(): Promise<Record<string, unknown>> {
  await db.query("BEGIN");
  try {
    await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [empresa]);
    const { rows } = await db.query(`SELECT plan_de_la_empresa($1) AS p`, [empresa]);
    return rows[0].p as Record<string, unknown>;
  } finally {
    await db.query("ROLLBACK");
  }
}

describe("Ajuste planes-custom — la migración en disco (D1, D6)", () => {
  it("carpeta nueva detrás de la última de dev, con su down.sql y la cabecera de la pérdida", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M), `${M} no va detrás de ${M_ANTERIOR}`).toBeGreaterThan(carpetas.indexOf(M_ANTERIOR));
    expect(sqlDe(M, "migration.sql")).toMatch(/CABECERA: el down\.sql repone la columna `precio_negociable` en `false`/);
    expect(sqlDe(M, "down.sql")).toMatch(/ADD COLUMN "precio_negociable" BOOLEAN NOT NULL DEFAULT false/);
    expect(sqlDe(M, "down.sql")).toMatch(/DROP COLUMN "plan_tipo_cobro"/);
  });
});

describeSiHayBase("Ajuste planes-custom — plan_sin_negociable_y_tipo_cobro de ida y vuelta (D1, D6)", () => {
  let antes: Foto;
  let subida: Foto;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    negociable = randomUUID();
    conMonto = randomUUID();
    empresa = randomUUID();
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_negociable") VALUES ($1, 'Negociable iv', 'publico', true)`, [
      negociable,
    ]);
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "descuento_anual_pct", "costo_por_orden")
       VALUES ($1, 'Monto iv', 'publico', 1000, 10, 100)`,
      [conMonto],
    );
    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, (now() AT TIME ZONE 'UTC') + interval '10 days', $3::jsonb, '[]'::jsonb, 'sistema', 'Superadmin iv')`,
      [randomUUID(), conMonto, JSON.stringify(VERSION_PENDIENTE)],
    );
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'Planes custom iv', $2)`, [
      empresa,
      `pcust-iv-${empresa.slice(0, 8)}`,
    ]);
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '3 days' WHERE "id" = $2`,
      [conMonto, empresa],
    );

    antes = await fotoCompleta();
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    subida = await fotoCompleta();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("control: la migración cambia el esquema (si no, la vuelta no probaría nada)", () => {
    expect(diferencias(subida, antes).length).toBeGreaterThan(0);
  });

  it("D1: sin la columna; el negociable queda «sin precio» y el de monto no cambia", async () => {
    expect(await columnas("plan", "precio_negociable")).toEqual([]);
    expect(await precioDe(negociable)).toEqual({ mensual: null, anual: null, pct: null });
    expect(await precioDe(conMonto)).toEqual({ mensual: "1000.00", anual: null, pct: "10.00" });
  });

  it("D1: la versión pendiente «negociable» pasa a «sin precio» y el resto queda igual", async () => {
    expect(await versionPendiente()).toEqual({ ...VERSION_PENDIENTE, precio: { tipo: "sin_precio" } });
  });

  it("D1: el CHECK plan_precio_forma sigue rechazando anual fijo con porcentaje y un anual sin mensual", async () => {
    expect(await sqlstateDe(`UPDATE "plan" SET "precio_anual" = 100 WHERE "id" = $1`, [conMonto])).toBe("23514");
    expect(await sqlstateDe(`UPDATE "plan" SET "precio_anual" = 100 WHERE "id" = $1`, [negociable])).toBe("23514");
    expect(await sqlstateDe(`UPDATE "plan" SET "precio_mensual" = 5 WHERE "id" = $1`, [negociable])).toBeNull();
  });

  it("D6: plan_tipo_cobro nace NOT NULL en mensual para la empresa que ya existía, y su CHECK rechaza otro valor", async () => {
    expect(await columnas("organizacion", "plan_tipo_cobro")).toEqual(["text NO 'mensual'::text"]);
    const { rows } = await db.query(`SELECT "plan_tipo_cobro" FROM "organizacion" WHERE "id" = $1`, [empresa]);
    expect(rows[0].plan_tipo_cobro).toBe("mensual");
    expect(await sqlstateDe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'trimestral' WHERE "id" = $1`, [empresa])).toBe("23514");
    expect(await sqlstateDe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'anual' WHERE "id" = $1`, [empresa])).toBeNull();
  });

  it("D6: plan_de_la_empresa expone tipo_cobro y ya no precio_negociable", async () => {
    const plan = await planDeLaEmpresa();
    expect(plan.tipo_cobro).toBe("mensual");
    expect(plan).not.toHaveProperty("precio_negociable");
    expect(plan.precio_mensual).toBe("1000.00");
  });

  it("el down deja esquema, cuerpos de función y privilegios como antes; reaplicada, igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(diferencias(await fotoCompleta(), antes)).toEqual([]);
    expect(await columnas("plan", "precio_negociable")).toEqual(["boolean NO false"]);
    expect(await columnas("organizacion", "plan_tipo_cobro")).toEqual([]);
    // La pérdida que nombra la cabecera: el negociable no vuelve, la versión pendiente tampoco.
    const { rows } = await db.query(`SELECT "precio_negociable" FROM "plan" WHERE "id" = $1`, [negociable]);
    expect(rows[0].precio_negociable).toBe(false);
    expect(await versionPendiente()).toEqual({ ...VERSION_PENDIENTE, precio: { tipo: "sin_precio" } });

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    expect(diferencias(await fotoCompleta(), subida)).toEqual([]);
  });
});
