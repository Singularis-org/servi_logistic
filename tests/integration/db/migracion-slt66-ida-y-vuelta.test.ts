import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
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
 * SLT-66 (design §2.1, §9.1; R4) — la migración M1 `plan_costeo_y_maestro_sin_tope`, de ida y vuelta.
 *
 * Se siembra ANTES de M1 un plan con topes de `maestro` y `admin`, módulos, precio, una empresa
 * asignada, una fila de rastro que nombra el tope de maestro y un cambio programado pendiente con
 * `porRol.maestro`. Tras M1: sin fila de maestro, `admin` intacto, la versión pendiente sin `maestro`
 * y con `costoPorOrden: null`, y el rastro, los módulos, el precio y la asignación iguales.
 *
 * R25 (design §9.1, con M2 y M3), en su propia base: con M1–M3 una orden de una empresa con plan de
 * 100 se carga `plan`; el `down.sql` de M2 se niega con ese cargo y no cambia nada; borrado el cargo
 * de prueba como dueño, los tres `down.sql` en orden inverso dejan el esquema, las funciones y los
 * triggers como antes de M1, y una orden nueva se carga con el global y fuente `global` (SL-40).
 *
 * BASE PROPIA (`slt66_iv_<rand>`): el `down` quita una columna de `plan` y en la base compartida
 * tomaría su lock exclusivo bajo los demás archivos. La base de `DATABASE_URL` no se toca.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261031130000_cierre_sin_gestion_confirmacion_fisica";
const M1 = "20261031140000_plan_costeo_y_maestro_sin_tope";
const M2 = "20261031140100_cobro_plataforma_fuente_plan";
const M3 = "20261031140200_plan_costeo_funciones";

const BASE = `slt66_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const BASE_R25 = `slt66_iv25_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

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

// ── R25: M1–M3 de ida y vuelta, con un cargo de fuente `plan` de por medio ──────────────────────────

describe("SLT-66 M2 y M3 — las migraciones en disco (R25)", () => {
  it("R25 — van detrás de M1, cada una con su down.sql; el de M2 se niega a bajar con cargos de fuente plan", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M2)).toBeGreaterThan(carpetas.indexOf(M1));
    expect(carpetas.indexOf(M3)).toBeGreaterThan(carpetas.indexOf(M2));
    expect(sqlDe(M2, "down.sql")).toMatch(/hay cargos o reversos de fuente plan/);
    expect(sqlDe(M3, "down.sql")).toMatch(/DROP FUNCTION cobro_plataforma_tarifa_de\(text\)/);
  });
});

/** Lo que la foto del fixture no mira y M3 sí cambia: los cuerpos de las funciones y los triggers. */
const CONSULTAS_EXTRA_R25: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  privilegios: `SELECT routine_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'`,
};

describeSiHayBase("SLT-66 R25 — M1–M3 de ida y vuelta: el cargo de fuente plan y la vuelta a la regla de SL-40", () => {
  let r25: Conexion;
  let adminR25: Conexion | undefined;
  let fks: { organizacionId: string; tiendaId: string; zonaId: string; estatusId: string; provinciaId: string; cantonId: string };
  let planR25: string;
  let antesDeM1: Foto;
  let ordenConPlan: string;

  /** La foto sin las filas (las órdenes del caso las mueven) y con funciones, triggers y privilegios. */
  async function fotoR25(): Promise<Foto> {
    const { filas: _filas, ...resto } = await foto(r25);
    void _filas;
    for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA_R25)) {
      const { rows } = await r25.query(consulta);
      resto[seccion] = new Set(rows.map((r) => String(r.l)));
    }
    return resto;
  }

  async function crearOrden(): Promise<string> {
    const id = randomUUID();
    await r25.query(
      `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
         "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id")
       VALUES ($1, $2, $3, 'SLT66', '88887777', $4, $5, $6, $7, 'Caja', now(), $8)`,
      [id, `SLT66-IV-${id.slice(0, 8)}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, fks.organizacionId],
    );
    return id;
  }

  async function movimientos(ordenId: string): Promise<string[]> {
    const { rows } = await r25.query(
      `SELECT "tipo"::text || ' ' || "monto"::text || ' ' || "fuente"::text AS l FROM "cobro_plataforma_movimiento"
        WHERE "orden_id" = $1 ORDER BY "secuencia"`,
      [ordenId],
    );
    return rows.map((r) => String(r.l));
  }

  async function valoresDe(tipo: string): Promise<string[]> {
    const { rows } = await r25.query(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 AND t.typnamespace = 'public'::regnamespace ORDER BY e.enumsortorder`,
      [tipo],
    );
    return rows.map((r) => String(r.v));
  }

  beforeAll(async () => {
    adminR25 = await conectar(urlDe("postgres"));
    await adminR25.query(`CREATE DATABASE "${BASE_R25}"`);
    r25 = await conectar(urlDe(BASE_R25));
    await r25.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(r25, M1);

    // La siembra, antes de M1: una empresa con su tienda y su zona, un plan asignado y el global en 500.
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
    const uno = async (sql: string, valores: unknown[] = []) => {
      const { rows } = await r25.query(sql, valores);
      if (rows.length !== 1) throw new Error(`la siembra esperaba una fila: ${sql.slice(0, 80)}`);
      return String(rows[0].id);
    };
    const organizacionId = await uno(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id"`, [
      randomUUID(),
      `SLT66 R25 ${sufijo}`,
      `slt66-r25-${sufijo}`,
    ]);
    const tiendaId = await uno(
      `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
         "rol_id", "estado", "updated_at", "organizacion_id")
       SELECT $1, 'Tienda SLT66', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
         FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
      [randomUUID(), `slt66-iv-${sufijo}@example.com`, `slt66-iv-${sufijo}`, organizacionId],
    );
    const zonaId = await uno(
      `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
       VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
      [randomUUID(), `Zona SLT66 ${sufijo}`, organizacionId],
    );
    const estatusId = await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`);
    const { rows } = await r25.query(
      `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
        WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
    );
    if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
    fks = { organizacionId, tiendaId, zonaId, estatusId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };

    planR25 = randomUUID();
    await r25.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual") VALUES ($1, $2, 'publico', 50000)`, [
      planR25,
      `SLT66 R25 ${sufijo}`,
    ]);
    await r25.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
      [planR25, organizacionId],
    );
    await r25.query(`INSERT INTO "cobro_plataforma_tarifa" ("id", "monto", "updated_at") VALUES (true, 500, now())`);

    antesDeM1 = await fotoR25();
    for (const m of [M1, M2, M3]) await ejecutar(r25, sqlDe(m, "migration.sql"), m);
    await r25.query(`UPDATE "plan" SET "costo_por_orden" = 100 WHERE "id" = $1`, [planR25]);
  }, 600_000);

  afterAll(async () => {
    await r25?.end();
    if (adminR25) {
      await adminR25.query(`DROP DATABASE IF EXISTS "${BASE_R25}" WITH (FORCE)`);
      await adminR25.end();
    }
  }, 60_000);

  it("R25 — con M1–M3, una orden de una empresa con plan de 100 se carga 100.00 «plan»", async () => {
    // Control: sin las tres, la foto sería la misma y el resto del caso no probaría nada.
    expect(diferencias(await fotoR25(), antesDeM1).length).toBeGreaterThan(0);
    ordenConPlan = await crearOrden();
    expect(await movimientos(ordenConPlan)).toEqual(["cargo 100.00 plan"]);
  });

  it("R25 — el down.sql de M2 con ese cargo se niega con un error claro, y nada cambia", async () => {
    const con = await fotoR25();
    let error: unknown = null;
    try {
      await ejecutar(r25, sqlDe(M2, "down.sql"), `${M2}/down.sql`);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect((error as ErrorDeScript).sqlstate).toBe("P0001");
    expect((error as Error).message).toMatch(/SLT-66 down: hay cargos o reversos de fuente plan/);
    expect(diferencias(await fotoR25(), con)).toEqual([]);
    expect(await valoresDe("cobro_plataforma_fuente")).toContain("plan");
    expect(await movimientos(ordenConPlan)).toEqual(["cargo 100.00 plan"]);
  });

  it("R25 — sin el cargo de prueba, bajar M3, M2 y M1 deja todo como antes de M1 y la orden nueva carga el global", async () => {
    // Como dueño: es la limpieza del caso, no una vía de la app.
    await r25.query(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, [ordenConPlan]);
    for (const m of [M3, M2, M1]) await ejecutar(r25, sqlDe(m, "down.sql"), `${m}/down.sql`);

    // Esquema, enums, cuerpos de función (md5 de su definición), triggers y privilegios: los de antes.
    expect(diferencias(await fotoR25(), antesDeM1)).toEqual([]);
    expect(await valoresDe("cobro_plataforma_fuente")).toEqual(["empresa", "global", "sin_configurar"]);
    expect(await valoresDe("plan_rastro_accion")).not.toContain("desasignado");

    // La empresa conserva su plan, pero la regla vuelve a ser la de SL-40.
    const { rows } = await r25.query(`SELECT "plan_id" FROM "organizacion" WHERE "id" = $1`, [fks.organizacionId]);
    expect(rows[0].plan_id).toBe(planR25);
    expect(await movimientos(await crearOrden())).toEqual(["cargo 500.00 global"]);
  });
});
