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
 * SLT-58 / T12 (design §11.2; R41, y la protección multi-empresa de la columna nueva) — la migración
 * `plan_ciclo_inicio_elegido`, de ida y vuelta.
 *
 * 1. En disco: carpeta nueva detrás de 20261029120000, con `down.sql`; el `down.sql` trae los cuerpos
 *    de origen LITERALES (leídos de las migraciones que los definieron), y el `up` no deja ninguna
 *    llamada a `plan_inicio_ciclo` con el ancla de una empresa fuera de la envoltura.
 * 2. Sobre una base con todo lo anterior y una empresa con plan previo (ancla pasada, órdenes en el
 *    ciclo pasado y en el actual, una borrada): `pg_get_functiondef` de las tres funciones ANTES, tras
 *    el `up` (distinto) y tras el `down` (igual al de antes). Mismo uso, mismo inicio de ciclo y mismo
 *    rechazo del trigger antes, con la migración y después de bajarla (R41: cuentan igual).
 * 3. La columna nueva hereda la protección de `organizacion`: `servi_app` no puede escribirla (42501).
 * 4. Reaplicada, las definiciones vuelven a ser las del primer `up`.
 *
 * BASE PROPIA (`slt58c_iv_<rand>`): el `down` quita una columna de `organizacion` y en la base
 * compartida tomaría su lock exclusivo bajo los demás archivos. La base de `DATABASE_URL` no se toca.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_PLAN_DE_LA_EMPRESA = "20261029120000_plan_de_la_empresa";
const M_TRIGGERS = "20261028130200_plan_topes_triggers";
const M_CICLO = "20261029150000_plan_ciclo_inicio_elegido";

/** Las tres que el `up` reemplaza, con la migración que define su cuerpo de origen. */
const REEMPLAZADAS = [
  { nombre: "plan_tope_ordenes", origen: M_TRIGGERS },
  { nombre: "plan_cupo_ordenes", origen: M_TRIGGERS },
  { nombre: "plan_de_la_empresa", origen: M_PLAN_DE_LA_EMPRESA },
] as const;

const BASE = `slt58c_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

// Lo que la foto del fixture de SL-32 no mira y esta migración sí mueve.
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  ejecucion: `SELECT routine_name || ' ' || privilege_type AS l FROM information_schema.role_routine_grants
    WHERE grantee = 'servi_app' AND specific_schema = 'public'`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
};

/** El bloque `CREATE FUNCTION <nombre>(… END $$;` tal cual está en el archivo. */
function bloqueDeFuncion(sql: string, nombre: string): string {
  const inicio = sql.indexOf(`CREATE FUNCTION ${nombre}(`);
  if (inicio < 0) throw new Error(`no está CREATE FUNCTION ${nombre}`);
  const fin = sql.indexOf("END $$;", inicio);
  return sql.slice(inicio, fin + "END $$;".length);
}

let db: Conexion;
let admin: Conexion;
let empresa: string;
let fks: { tiendaId: string; zonaId: string; estatusId: string; provinciaId: string; cantonId: string };

async function uno(sql: string, valores: unknown[] = []): Promise<string> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`la siembra esperaba una fila: ${sql.slice(0, 80)}`);
  return String(rows[0].id);
}

/** La tienda y la zona de la empresa: lo mínimo que piden las FK de `orden` (como SL-24). */
async function sembrarParaOrdenes(organizacionId: string): Promise<typeof fks> {
  const s = randomUUID().replace(/-/g, "").slice(0, 12);
  const tiendaId = await uno(
    `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
       "rol_id", "estado", "updated_at", "organizacion_id")
     SELECT $1, 'Tienda SLT58', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
       FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
    [randomUUID(), `slt58-iv-${s}@example.test`, `slt58-iv-${s}`, organizacionId],
  );
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
    [randomUUID(), `Zona SLT58 ${s}`, organizacionId],
  );
  const estatusId = await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`);
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  return { tiendaId, zonaId, estatusId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };
}

/** Una orden de la empresa con `created_at` = la expresión SQL dada (UTC), viva o borrada. */
async function crearOrden(createdAt: string, borrada = false): Promise<void> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id", "created_at", "deleted_at")
     VALUES ($1, $2, $3, 'SLT58', '88887777', $4, $5, $6, $7, 'Caja', now(), $8, ${createdAt},
             CASE WHEN $9 THEN now() AT TIME ZONE 'UTC' END)`,
    [id, `SLT58-IV-${id.slice(0, 8)}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, empresa, borrada],
  );
}

async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

/** `pg_get_functiondef` de las tres reemplazadas, por nombre. */
async function definiciones(): Promise<Record<string, string>> {
  const { rows } = await db.query(
    `SELECT p.proname AS nombre, pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [REEMPLAZADAS.map((f) => f.nombre)],
  );
  return Object.fromEntries(rows.map((r) => [String(r.nombre), String(r.def)]));
}

async function existe(consulta: string, valores: unknown[] = []): Promise<boolean> {
  const { rows } = await db.query(consulta, valores);
  return rows.length > 0;
}

interface Uso {
  cupo: { maximo: number; usados: number }[];
  cicloInicio: unknown;
  ordenes: unknown;
  /** SQLSTATE de una orden más en el ciclo, en una transacción que se revierte. */
  unaMas: string | null;
}

/** Lo que cuentan el cupo, «Mi plan» y el trigger, en el contexto de la empresa y como dueño. */
async function uso(): Promise<Uso> {
  await db.query(`SELECT set_config('app.organizacion_id', $1, false)`, [empresa]);
  const { rows: cupo } = await db.query(`SELECT maximo, usados FROM plan_cupo_ordenes($1)`, [empresa]);
  const { rows: plan } = await db.query(`SELECT plan_de_la_empresa($1) AS p`, [empresa]);
  const p = plan[0].p as { ciclo_inicio: unknown; uso: { ordenes: unknown } };
  let unaMas: string | null = null;
  await db.query("BEGIN");
  try {
    await crearOrden(`now() AT TIME ZONE 'UTC'`);
  } catch (e) {
    unaMas = (e as { code?: string }).code ?? "??";
  }
  await db.query("ROLLBACK");
  await db.query(`SELECT set_config('app.organizacion_id', '', false)`);
  return {
    cupo: cupo.map((r) => ({ maximo: Number(r.maximo), usados: Number(r.usados) })),
    cicloInicio: p.ciclo_inicio,
    ordenes: p.uso.ordenes,
    unaMas,
  };
}

/** SQLSTATE de `sql` como `servi_app` en el contexto de la empresa, en una transacción revertida. */
async function comoServiApp(sql: string, valores: unknown[] = []): Promise<string | null> {
  await db.query("BEGIN");
  let sqlstate: string | null = null;
  try {
    await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [empresa]);
    await db.query(`SET LOCAL ROLE servi_app`);
    await db.query(sql, valores);
  } catch (e) {
    sqlstate = (e as { code?: string }).code ?? "??";
  }
  await db.query("ROLLBACK");
  return sqlstate;
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

describe("SLT-58 T12 — la migración en disco (R41)", () => {
  const up = sqlDe(M_CICLO, "migration.sql");
  const down = existsSync(path.join(MIGRACIONES, M_CICLO, "down.sql")) ? sqlDe(M_CICLO, "down.sql") : "";

  it("R41 — carpeta nueva detrás de plan_de_la_empresa, con su down.sql", () => {
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(M_PLAN_DE_LA_EMPRESA);
    expect(previa, `${M_PLAN_DE_LA_EMPRESA} no está en disco`).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M_CICLO), `${M_CICLO} no va detrás`).toBeGreaterThan(previa);
    expect(down, `${M_CICLO} sin down.sql`).not.toBe("");
  });

  it("R41 — el down.sql trae el cuerpo de origen LITERAL de cada función, solo con CREATE OR REPLACE", () => {
    for (const { nombre, origen } of REEMPLAZADAS) {
      const literal = bloqueDeFuncion(sqlDe(origen, "migration.sql"), nombre).replace(
        /^CREATE FUNCTION/,
        "CREATE OR REPLACE FUNCTION",
      );
      expect(down.includes(literal), `${nombre}: el down.sql no trae el cuerpo de ${origen}`).toBe(true);
    }
    expect(down).toMatch(/DROP FUNCTION plan_inicio_ciclo_en_curso\(timestamp, timestamp, timestamp\);/);
    expect(down).toMatch(/DROP CONSTRAINT "organizacion_plan_ciclo_corto_check";/);
    expect(down).toMatch(/DROP COLUMN "plan_ciclo_corto_desde_at";/);
  });

  it("R41 — el up es aditivo y solo la envoltura llama a plan_inicio_ciclo (con sus propios parámetros)", () => {
    const sinComentarios = up.replace(/--[^\n]*/g, "");
    expect(sinComentarios).not.toMatch(/\bDROP\b/i);
    const llamadas = sinComentarios.match(/plan_inicio_ciclo\([^)]*\)/g) ?? [];
    expect(llamadas).toEqual(["plan_inicio_ciclo(p_ancla, p_ahora)"]);
    for (const { nombre } of REEMPLAZADAS) {
      expect(sinComentarios, nombre).toContain(`CREATE OR REPLACE FUNCTION ${nombre}(`);
    }
  });
});

describeSiHayBase("SLT-58 T12 — plan_ciclo_inicio_elegido de ida y vuelta (R41)", () => {
  let antes: Foto;
  let con: Foto;
  let defsAntes: Record<string, string>;
  let defsCon: Record<string, string>;
  let usoAntes: Uso;
  let usoCon: Uso;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    // Apaga el autovacuum antes de cada migración, no al acabar: el 40P01 de SL-17 (ver el helper).
    await aplicarMigracionesHasta(db, M_CICLO);

    // La empresa que «ya tiene plan al desplegar»: ancla hace 40 días (el ciclo en curso empezó en
    // ancla + 1 mes), 2 órdenes del ciclo pasado, 3 vivas y 1 borrada del actual. Tope 3: lleno.
    empresa = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
      empresa,
      "SLT58 ciclo",
      `slt58-iv-${empresa.slice(0, 8)}`,
    ]);
    fks = await sembrarParaOrdenes(empresa);
    for (let i = 0; i < 2; i++) await crearOrden(`(now() AT TIME ZONE 'UTC') - interval '39 days'`);
    for (let i = 0; i < 3; i++) await crearOrden(`(now() AT TIME ZONE 'UTC') - interval '1 hour'`);
    await crearOrden(`(now() AT TIME ZONE 'UTC') - interval '1 hour'`, true);
    const planId = randomUUID();
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "tope_ordenes_ciclo") VALUES ($1, $2, 'publico', 3)`,
      [planId, `SLT58 iv ${planId.slice(0, 8)}`],
    );
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '40 days'
        WHERE "id" = $2`,
      [planId, empresa],
    );

    antes = await fotoSinFilas();
    defsAntes = await definiciones();
    usoAntes = await uso();

    await ejecutar(db, sqlDe(M_CICLO, "migration.sql"), M_CICLO);
    con = await fotoSinFilas();
    defsCon = await definiciones();
    usoCon = await uso();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R41 — antes de migrar, el escenario cuenta lo sembrado (si no, la comparación sería vacía)", () => {
    expect(Object.keys(defsAntes).sort()).toEqual(REEMPLAZADAS.map((f) => f.nombre).sort());
    expect(usoAntes.cupo).toEqual([{ maximo: 3, usados: 3 }]);
    expect(usoAntes.ordenes).toBe(3);
    expect(usoAntes.unaMas).toBe("SL024");
  });

  it("R41 — el up reemplaza las tres definiciones y añade la envoltura, la columna y su CHECK", async () => {
    for (const { nombre } of REEMPLAZADAS) {
      expect(defsCon[nombre], nombre).not.toBe(defsAntes[nombre]);
      expect(defsCon[nombre], nombre).toContain("plan_inicio_ciclo_en_curso(");
      expect(defsCon[nombre], nombre).not.toMatch(/plan_inicio_ciclo\(/);
    }
    expect(defsCon.plan_de_la_empresa).toContain(`'ciclo_corto_desde', o."plan_ciclo_corto_desde_at"`);

    const { rows: envoltura } = await db.query(
      `SELECT p.provolatile::text AS v, pg_get_function_identity_arguments(p.oid) AS args,
              has_function_privilege('servi_app', p.oid, 'EXECUTE') AS app,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
              p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'plan_inicio_ciclo_en_curso'`,
    );
    expect(envoltura).toEqual([
      {
        v: "i",
        args: "p_corto_desde timestamp without time zone, p_ancla timestamp without time zone, p_ahora timestamp without time zone",
        app: false,
        publico: false,
        config: ["search_path=public, pg_temp"],
      },
    ]);

    const { rows: columna } = await db.query(
      `SELECT data_type || ' ' || datetime_precision || ' ' || is_nullable AS l FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizacion' AND column_name = 'plan_ciclo_corto_desde_at'`,
    );
    expect(columna).toEqual([{ l: "timestamp without time zone 3 YES" }]);
    // Las empresas que ya tenían plan quedan sin ciclo corto (R41).
    const { rows: conCorto } = await db.query(
      `SELECT count(*)::int AS n FROM "organizacion" WHERE "plan_ciclo_corto_desde_at" IS NOT NULL`,
    );
    expect(conCorto[0].n).toBe(0);

    // Los GRANT de servi_app sobreviven al CREATE OR REPLACE: lo único nuevo es de la propia migración.
    expect(con.ejecucion).toEqual(antes.ejecucion);
    expect(con.privilegios).toEqual(antes.privilegios);
  });

  it("R41 — la empresa con plan previo cuenta igual con la migración: mismo cupo, mismo inicio, mismo rechazo", () => {
    expect(usoCon).toEqual(usoAntes);
  });

  it("R34, R41 — el CHECK: un ciclo corto exige ancla y debe empezar antes de ella", async () => {
    expect(
      await sqlstateDe(
        `UPDATE "organizacion" SET "plan_ciclo_corto_desde_at" = "plan_ciclo_ancla_at" WHERE "id" = $1`,
        [empresa],
      ),
    ).toBe("23514");
    expect(
      await sqlstateDe(
        `UPDATE "organizacion" SET "plan_ciclo_corto_desde_at" = now() AT TIME ZONE 'UTC', "plan_ciclo_ancla_at" = NULL,
                "plan_id" = NULL WHERE "id" = $1`,
        [empresa],
      ),
    ).toBe("23514");
    expect(
      await sqlstateDe(
        `UPDATE "organizacion" SET "plan_ciclo_corto_desde_at" = "plan_ciclo_ancla_at" - interval '1 day' WHERE "id" = $1`,
        [empresa],
      ),
    ).toBeNull();
  });

  it("multi-empresa — servi_app no puede escribir la columna nueva ni en su propia fila (42501)", async () => {
    expect(
      await comoServiApp(
        `UPDATE "organizacion" SET "plan_ciclo_corto_desde_at" = now() AT TIME ZONE 'UTC' WHERE "id" = $1`,
        [empresa],
      ),
    ).toBe("42501");
  });

  it("R41 — el down deja las tres funciones exactamente como estaban, sin envoltura ni columna, y el uso igual", async () => {
    await ejecutar(db, sqlDe(M_CICLO, "down.sql"), `${M_CICLO}/down.sql`);

    expect(await definiciones()).toEqual(defsAntes);
    expect(diferencias(await fotoSinFilas(), antes)).toEqual([]);
    expect(
      await existe(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'plan_inicio_ciclo_en_curso'`,
      ),
    ).toBe(false);
    expect(
      await existe(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'organizacion' AND column_name = 'plan_ciclo_corto_desde_at'`,
      ),
    ).toBe(false);
    expect(await uso()).toEqual(usoAntes);

    // Y de vuelta: el up reaplicado deja las mismas definiciones que la primera vez.
    await ejecutar(db, sqlDe(M_CICLO, "migration.sql"), M_CICLO);
    expect(await definiciones()).toEqual(defsCon);
    expect(diferencias(await fotoSinFilas(), con)).toEqual([]);
    expect(await uso()).toEqual(usoAntes);
  });
});
