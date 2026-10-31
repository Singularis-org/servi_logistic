import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  aplicarMigracionesHasta,
  carpetasDeMigracion,
  conectar,
  ejecutar,
  sqlDe,
  urlDe,
  type Conexion,
} from "./_fixtures/ida-y-vuelta-32";

/**
 * SLT-66 (design §2.1, §9.1; R4) — la migración M1 `plan_costeo_y_maestro_sin_tope`, de ida y vuelta.
 *
 * Se siembra ANTES de M1 un plan con topes de `maestro` y `admin`, módulos, precio, una empresa
 * asignada, una fila de rastro que nombra el tope de maestro y un cambio programado pendiente con
 * `porRol.maestro`. Tras M1: sin fila de maestro, `admin` intacto, la versión pendiente sin `maestro`
 * y con `costoPorOrden: null`, y el rastro, los módulos, el precio y la asignación iguales.
 *
 * Los casos R25 (con M2 y M3) son de la tanda B y se suman a este archivo cuando existan.
 *
 * BASE PROPIA (`slt66_iv_<rand>`): el `down` quita una columna de `plan` y en la base compartida
 * tomaría su lock exclusivo bajo los demás archivos. La base de `DATABASE_URL` no se toca.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261030120100_incentivo_mensajero_checks";
const M1 = "20261031120000_plan_costeo_y_maestro_sin_tope";

const BASE = `slt66_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const VERSION_PENDIENTE = {
  nombre: "SLT66 pendiente",
  topes: { ordenesPorCiclo: 50, porRol: { maestro: 2, admin: 4, mensajero: 9 }, apiKeys: 3 },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "100.00", anual: null },
};

const CAMBIOS_DEL_RASTRO = {
  topes: {
    antes: { ordenesPorCiclo: null, porRol: { maestro: 1 }, apiKeys: null },
    despues: { ordenesPorCiclo: 10, porRol: { maestro: 3, admin: 5 }, apiKeys: 2 },
  },
};

let db: Conexion;
let admin: Conexion;
let planId: string;
let empresa: string;

interface Estado {
  topes: { rol: string; maximo: number }[];
  plan: Record<string, unknown>;
  modulos: string[];
  version: unknown;
  rastro: unknown[];
  asignacion: Record<string, unknown>;
}

async function estado(): Promise<Estado> {
  const { rows: topes } = await db.query(
    `SELECT "rol"::text AS rol, "maximo" FROM "plan_tope_rol" WHERE "plan_id" = $1`,
    [planId],
  );
  const { rows: plan } = await db.query(
    `SELECT "nombre", "tope_ordenes_ciclo", "tope_api_keys", "precio_negociable", "precio_mensual"::text AS mensual,
            "precio_anual"::text AS anual, "descuento_anual_pct"::text AS descuento, "archivado_at"
       FROM "plan" WHERE "id" = $1`,
    [planId],
  );
  const { rows: modulos } = await db.query(
    `SELECT "modulo"::text AS m FROM "plan_modulo" WHERE "plan_id" = $1 ORDER BY 1`,
    [planId],
  );
  const { rows: version } = await db.query(`SELECT "version" FROM "plan_cambio_programado" WHERE "plan_id" = $1`, [
    planId,
  ]);
  const { rows: rastro } = await db.query(
    `SELECT "id", "accion"::text AS accion, "cambios", "actor_nombre", "created_at" FROM "plan_rastro"
      WHERE "plan_id" = $1 ORDER BY "id"`,
    [planId],
  );
  const { rows: asignacion } = await db.query(
    `SELECT "plan_id", "plan_ciclo_ancla_at", "plan_ciclo_corto_desde_at" FROM "organizacion" WHERE "id" = $1`,
    [empresa],
  );
  return {
    topes: topes
      .map((t) => ({ rol: String(t.rol), maximo: Number(t.maximo) }))
      .sort((a, b) => (a.rol < b.rol ? -1 : a.rol > b.rol ? 1 : 0)),
    plan: plan[0],
    modulos: modulos.map((m) => String(m.m)),
    version: version[0]?.version,
    rastro,
    asignacion: asignacion[0],
  };
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

async function columnaCostoPorOrden(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT data_type || ' ' || numeric_precision || ',' || numeric_scale || ' ' || is_nullable AS l
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'plan' AND column_name = 'costo_por_orden'`,
  );
  return rows.map((r) => String(r.l));
}

describe("SLT-66 M1 — la migración en disco (R4)", () => {
  it("R4 — carpeta nueva detrás de la última de dev, con su down.sql y la cabecera de borrado definitivo", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M1), `${M1} no va detrás de ${M_ANTERIOR}`).toBeGreaterThan(carpetas.indexOf(M_ANTERIOR));
    expect(sqlDe(M1, "migration.sql")).toMatch(/CABECERA: el DELETE de los topes de maestro es DEFINITIVO/);
    expect(sqlDe(M1, "down.sql")).toMatch(/DROP COLUMN "costo_por_orden"/);
  });
});

describeSiHayBase("SLT-66 M1 — plan_costeo_y_maestro_sin_tope de ida y vuelta (R4)", () => {
  let antes: Estado;
  let con: Estado;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M1);

    planId = randomUUID();
    empresa = randomUUID();
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "tope_ordenes_ciclo", "tope_api_keys", "precio_mensual",
         "descuento_anual_pct")
       VALUES ($1, $2, 'publico', 10, 2, 100, 15)`,
      [planId, `SLT66 iv ${planId.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO "plan_tope_rol" ("plan_id", "rol", "maximo") VALUES ($1, 'maestro', 3), ($1, 'admin', 5),
         ($1, 'Admin Tienda', 7)`,
      [planId],
    );
    await db.query(`INSERT INTO "plan_modulo" ("plan_id", "modulo") VALUES ($1, 'analitica'), ($1, 'ranking')`, [
      planId,
    ]);
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'SLT66 iv', $2)`, [
      empresa,
      `slt66-iv-${empresa.slice(0, 8)}`,
    ]);
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '3 days'
        WHERE "id" = $2`,
      [planId, empresa],
    );
    await db.query(
      `INSERT INTO "plan_rastro" ("id", "plan_id", "plan_nombre", "accion", "cambios", "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, 'SLT66 iv', 'editado', $3::jsonb, 'sistema', 'Superadmin SLT66')`,
      [randomUUID(), planId, JSON.stringify(CAMBIOS_DEL_RASTRO)],
    );
    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, (now() AT TIME ZONE 'UTC') + interval '10 days', $3::jsonb, '[]'::jsonb, 'sistema', 'Superadmin SLT66')`,
      [randomUUID(), planId, JSON.stringify(VERSION_PENDIENTE)],
    );

    antes = await estado();
    await ejecutar(db, sqlDe(M1, "migration.sql"), M1);
    con = await estado();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R4 — antes de migrar, la siembra tiene lo que la migración debe borrar (si no, el test sería vacío)", () => {
    expect(antes.topes).toEqual([
      { rol: "Admin Tienda", maximo: 7 },
      { rol: "admin", maximo: 5 },
      { rol: "maestro", maximo: 3 },
    ]);
    expect(antes.version).toEqual(VERSION_PENDIENTE);
    expect(antes.rastro).toHaveLength(1);
    expect(antes.asignacion.plan_id).toBe(planId);
  });

  it("R4 — borra el tope de maestro y deja intactos los demás topes", () => {
    expect(con.topes).toEqual([
      { rol: "Admin Tienda", maximo: 7 },
      { rol: "admin", maximo: 5 },
    ]);
  });

  it("R4, R11 — la versión pendiente pierde porRol.maestro y gana costoPorOrden: null, el resto igual", () => {
    expect(con.version).toEqual({
      ...VERSION_PENDIENTE,
      topes: { ...VERSION_PENDIENTE.topes, porRol: { admin: 4, mensajero: 9 } },
      costoPorOrden: null,
    });
  });

  it("R4 — no toca el costo base, los módulos, el rastro ni la asignación de la empresa", () => {
    expect(con.plan).toEqual(antes.plan);
    expect(con.modulos).toEqual(antes.modulos);
    expect(con.rastro).toEqual(antes.rastro);
    expect(con.asignacion).toEqual(antes.asignacion);
  });

  it("R1, R7, R8 — la columna nace NULL, su CHECK rechaza un negativo y el de roles rechaza maestro", async () => {
    expect(await columnaCostoPorOrden()).toEqual(["numeric 12,2 YES"]);
    const { rows } = await db.query(`SELECT "costo_por_orden" FROM "plan" WHERE "id" = $1`, [planId]);
    expect(rows[0].costo_por_orden).toBeNull();
    expect(await sqlstateDe(`UPDATE "plan" SET "costo_por_orden" = -0.01 WHERE "id" = $1`, [planId])).toBe("23514");
    expect(await sqlstateDe(`UPDATE "plan" SET "costo_por_orden" = 0 WHERE "id" = $1`, [planId])).toBeNull();
    expect(
      await sqlstateDe(`INSERT INTO "plan_tope_rol" ("plan_id", "rol", "maximo") VALUES ($1, 'maestro', 1)`, [planId]),
    ).toBe("23514");
    expect(
      await sqlstateDe(`INSERT INTO "plan_tope_rol" ("plan_id", "rol", "maximo") VALUES ($1, 'mensajero', 1)`, [planId]),
    ).toBeNull();
  });

  it("R4 — el down quita la columna y la clave nueva y repone el CHECK, pero NO las filas de maestro borradas", async () => {
    await ejecutar(db, sqlDe(M1, "down.sql"), `${M1}/down.sql`);
    const bajado = await estado();
    expect(await columnaCostoPorOrden()).toEqual([]);
    expect(bajado.version).toEqual({
      ...VERSION_PENDIENTE,
      topes: { ...VERSION_PENDIENTE.topes, porRol: { admin: 4, mensajero: 9 } },
    });
    expect(bajado.topes).toEqual(con.topes);
    expect(
      await sqlstateDe(`INSERT INTO "plan_tope_rol" ("plan_id", "rol", "maximo") VALUES ($1, 'maestro', 1)`, [planId]),
    ).toBeNull();

    // Y de vuelta: reaplicada deja lo mismo que la primera vez.
    await ejecutar(db, sqlDe(M1, "migration.sql"), M1);
    expect(await estado()).toEqual(con);
  });
});
