import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * SLT-83 (design §2, §9.1; R27) — M1–M3 de ida y vuelta, en una base PROPIA (`slt83_iv_<rand>`): los
 * `down.sql` quitan columnas de `plan` y una tabla con FK a `orden`, y en la base compartida tomarían sus
 * locks exclusivos bajo los demás archivos. La base de `DATABASE_URL` no se toca.
 *
 * Se siembra ANTES de M1 una empresa con un plan fijo de 100 asignado, el global en 500 y un cambio
 * programado pendiente. Tras M1–M3:
 *   · el plan sigue fijo (columnas nuevas NULL) y la versión pendiente gana `costoPorOrdenPorcentual: null`;
 *   · con el plan al 2 % (mínimo 500), una orden de 100.000 congela sus condiciones sin cargo, y al entrar
 *     a `entregado` se carga 2.000,00 «plan»;
 *   · los `down.sql` de M2 y de M1 se niegan con un error claro mientras quedan datos porcentuales (la
 *     orden con condiciones, el plan porcentual, una versión pendiente porcentual), y no cambian nada;
 *   · limpios esos datos como dueño, los tres `down.sql` en orden inverso dejan esquema, funciones (md5
 *     de su definición), triggers y privilegios como antes de M1, la versión pendiente como estaba, y una
 *     orden nueva se carga con la regla de SLT-66 (100.00 «plan»).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261104130100_historial_accion_plan_tipo_cobro_cambiado";
const M1 = "20261104150000_plan_costo_por_orden_porcentual";
const M2 = "20261104150100_cobro_plataforma_porcentual_orden";
const M3 = "20261104150200_cobro_plataforma_porcentual_funciones";

const BASE = `slt83_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const VERSION_PENDIENTE = {
  nombre: "SLT83 pendiente",
  topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000.00", anual: null },
  costoPorOrden: "120.00",
};

/** Lo que la foto del fixture no mira y M3 sí cambia: los cuerpos de las funciones y los triggers. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  privilegios: `SELECT routine_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'`,
  politicas: `SELECT tablename || '.' || policyname AS l FROM pg_policies WHERE schemaname = 'public'`,
};

let db: Conexion;
let admin: Conexion | undefined;
let fks: { organizacionId: string; tiendaId: string; zonaId: string; provinciaId: string; cantonId: string };
let planId: string;
let antesDeM1: Foto;
let versionAntes: unknown;
let ordenPorcentual: string;

/** La foto sin las filas (las órdenes del caso las mueven) y con funciones, triggers y privilegios. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function uno(sql: string, valores: unknown[] = []): Promise<string> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`se esperaba una fila: ${sql.slice(0, 80)}`);
  return String(rows[0].id);
}

async function crearOrden(montoCobrar: string | null = null): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "monto_cobrar", "updated_at", "organizacion_id")
     SELECT $1, $2, s."id", 'SLT83', '88887777', $3, $4, $5, $6, 'Caja', $7::numeric, now(), $8
       FROM "order_status" s WHERE s."value" = 'en_preparacion'`,
    [id, `SLT83-IV-${id.slice(0, 8)}`, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, montoCobrar, fks.organizacionId],
  );
  return id;
}

async function movimientos(ordenId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT "tipo"::text || ' ' || "monto"::text || ' ' || "fuente"::text AS l FROM "cobro_plataforma_movimiento"
      WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    [ordenId],
  );
  return rows.map((r) => String(r.l));
}

async function version(): Promise<unknown> {
  const { rows } = await db.query(`SELECT "version" FROM "plan_cambio_programado" WHERE "plan_id" = $1`, [planId]);
  return rows[0]?.version;
}

/** Corre un `down.sql` que debe negarse: devuelve el error (o `null` si no se negó). */
async function bajarYCapturar(m: string): Promise<ErrorDeScript | null> {
  try {
    await ejecutar(db, sqlDe(m, "down.sql"), `${m}/down.sql`);
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
}

describe("SLT-83 — las migraciones en disco (R27)", () => {
  it("R27: van detrás de la última de dev, en orden, cada una con su down.sql", () => {
    const carpetas = carpetasDeMigracion();
    const i = carpetas.indexOf(M_ANTERIOR);
    expect(i).toBeGreaterThanOrEqual(0);
    expect([carpetas.indexOf(M1), carpetas.indexOf(M2), carpetas.indexOf(M3)]).toEqual([i + 1, i + 2, i + 3]);
    for (const m of [M1, M2, M3]) expect(sqlDe(m, "down.sql").length).toBeGreaterThan(0);
    expect(sqlDe(M1, "down.sql")).toMatch(/SLT-83 down: hay planes porcentuales/);
    expect(sqlDe(M2, "down.sql")).toMatch(/SLT-83 down: hay órdenes con condiciones porcentuales/);
  });
});

describeSiHayBase("SLT-83 R27 — M1–M3 de ida y vuelta: la orden porcentual, las bajadas que se niegan y la vuelta a SLT-66", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M1);

    // La siembra, antes de M1: empresa con tienda y zona, plan fijo de 100 asignado, global en 500 y un
    // cambio programado pendiente.
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
    const organizacionId = await uno(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id"`, [
      randomUUID(),
      `SLT83 IV ${sufijo}`,
      `slt83-iv-${sufijo}`,
    ]);
    const tiendaId = await uno(
      `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
         "rol_id", "estado", "updated_at", "organizacion_id")
       SELECT $1, 'Tienda SLT83', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
         FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
      [randomUUID(), `slt83-iv-${sufijo}@example.com`, `slt83-iv-${sufijo}`, organizacionId],
    );
    const zonaId = await uno(
      `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
       VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
      [randomUUID(), `Zona SLT83 ${sufijo}`, organizacionId],
    );
    const { rows } = await db.query(
      `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
        WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
    );
    if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
    fks = { organizacionId, tiendaId, zonaId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };

    planId = randomUUID();
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden") VALUES ($1, $2, 'publico', 50000, 100)`,
      [planId, `SLT83 IV ${sufijo}`],
    );
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
      [planId, organizacionId],
    );
    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar", "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, (now() AT TIME ZONE 'UTC') + interval '30 days', $3::jsonb, '[]'::jsonb, $4, 'Superadmin SLT83')`,
      [randomUUID(), planId, JSON.stringify(VERSION_PENDIENTE), randomUUID()],
    );
    await db.query(`INSERT INTO "cobro_plataforma_tarifa" ("id", "monto", "updated_at") VALUES (true, 500, now())`);

    antesDeM1 = await fotoSinFilas();
    versionAntes = await version();
    for (const m of [M1, M2, M3]) await ejecutar(db, sqlDe(m, "migration.sql"), m);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R27: al subir, el plan sigue fijo y la versión pendiente gana el modo porcentual vacío", async () => {
    // Control: sin las tres, la foto sería la misma y el resto del caso no probaría nada.
    expect(diferencias(await fotoSinFilas(), antesDeM1).length).toBeGreaterThan(0);
    const { rows } = await db.query(
      `SELECT "costo_por_orden"::text AS fijo, "costo_por_orden_pct" AS pct, "costo_por_orden_minimo" AS minimo FROM "plan" WHERE "id" = $1`,
      [planId],
    );
    expect(rows[0]).toEqual({ fijo: "100.00", pct: null, minimo: null });
    expect(await version()).toEqual({ ...VERSION_PENDIENTE, costoPorOrdenPorcentual: null });
    // Con el plan fijo, la orden se carga como en SLT-66.
    expect(await movimientos(await crearOrden())).toEqual(["cargo 100.00 plan"]);
  });

  it("R27: con el plan al 2 % (mínimo 500), una orden de 100.000 congela sin cargo y se cobra al entregarse", async () => {
    await db.query(
      `UPDATE "plan" SET "costo_por_orden" = NULL, "costo_por_orden_pct" = 2, "costo_por_orden_minimo" = 500 WHERE "id" = $1`,
      [planId],
    );
    ordenPorcentual = await crearOrden("100000");
    const { rows } = await db.query(
      `SELECT "porcentaje"::text AS p, "minimo"::text AS m FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = $1`,
      [ordenPorcentual],
    );
    expect(rows).toEqual([{ p: "2.00", m: "500.00" }]);
    expect(await movimientos(ordenPorcentual)).toEqual([]);
    await db.query(
      `UPDATE "orden" SET "estatus_id" = (SELECT "id" FROM "order_status" WHERE "value" = 'entregado') WHERE "id" = $1`,
      [ordenPorcentual],
    );
    expect(await movimientos(ordenPorcentual)).toEqual(["cargo 2000.00 plan"]);
  });

  it("R27: con datos porcentuales, los down.sql de M2 y de M1 se niegan con un error claro y nada cambia", async () => {
    const con = await fotoSinFilas();

    const m2 = await bajarYCapturar(M2);
    expect(m2?.sqlstate).toBe("P0001");
    expect(m2?.message).toMatch(/SLT-83 down: hay órdenes con condiciones porcentuales congeladas/);

    const m1 = await bajarYCapturar(M1);
    expect(m1?.sqlstate).toBe("P0001");
    expect(m1?.message).toMatch(/SLT-83 down: hay planes porcentuales/);

    // Con el plan otra vez fijo, una versión pendiente porcentual también basta para negarse.
    await db.query(
      `UPDATE "plan" SET "costo_por_orden" = 100, "costo_por_orden_pct" = NULL, "costo_por_orden_minimo" = NULL WHERE "id" = $1`,
      [planId],
    );
    await db.query(
      `UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{costoPorOrdenPorcentual}', '{"porcentaje": "3.00", "minimo": null}'::jsonb)
        WHERE "plan_id" = $1`,
      [planId],
    );
    const m1Version = await bajarYCapturar(M1);
    expect(m1Version?.sqlstate).toBe("P0001");
    expect(m1Version?.message).toMatch(/SLT-83 down: hay planes porcentuales/);

    expect(diferencias(await fotoSinFilas(), con)).toEqual([]);
    expect(await movimientos(ordenPorcentual)).toEqual(["cargo 2000.00 plan"]);
  });

  it("R27: limpios los datos porcentuales, bajar M3, M2 y M1 deja todo como antes y la orden nueva sigue la regla de SLT-66", async () => {
    // Como dueño: es la limpieza del caso, no una vía de la app.
    await db.query(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, [ordenPorcentual]);
    await db.query(`DELETE FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = $1`, [ordenPorcentual]);
    await db.query(
      `UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{costoPorOrdenPorcentual}', 'null'::jsonb) WHERE "plan_id" = $1`,
      [planId],
    );
    for (const m of [M3, M2, M1]) await ejecutar(db, sqlDe(m, "down.sql"), `${m}/down.sql`);

    // Esquema, cuerpos de función (md5 de su definición), triggers, privilegios y políticas: los de antes.
    expect(diferencias(await fotoSinFilas(), antesDeM1)).toEqual([]);
    expect(await version()).toEqual(versionAntes);
    expect(await movimientos(await crearOrden("100000"))).toEqual(["cargo 100.00 plan"]);
  });
});
