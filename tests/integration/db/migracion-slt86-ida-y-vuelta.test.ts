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
 * SLT-86 (design §8; R33–R36) — la migración `plan_periodo_facturacion` de ida y vuelta, en una base PROPIA
 * (`slt86_iv_<rand>`): el `down.sql` quita y repone columnas de `plan` y `organizacion` y un trigger de
 * `orden`, y en la base compartida tomaría sus locks exclusivos bajo los demás archivos.
 *
 * Se siembra ANTES de la migración:
 *   · plan A: mensual 1000, descuento anual 10 % y tope de 50 órdenes;
 *   · plan B: mensual 1000 y anual fijo 10000, con una versión pendiente (mensual 2000, anual fijo 20000 y
 *     tope de 30 órdenes);
 *   · plan C: mensual 500 sin anual, con una versión pendiente con descuento anual del 15 %; plan D sin precio;
 *   · empresa E1 con A en anual y ancla de hace 40 días, y una orden de hoy a las 00:00 de la plataforma y otra
 *     de un minuto antes; E2 con B en mensual en ciclo corto (ancla futura); E3 sin plan.
 *
 * Comprueba: P3 se niega sin cambiar nada (plan y versión); la conversión del anual a descuento anual con el
 * mismo costo anual (R33); el rastro de los topes y su borrado (R34); la entrada de toda empresa con plan a las
 * 00:00 de hoy, con la orden de hoy contada (R35); las bajadas que se niegan sin tocar nada y la bajada buena,
 * que deja esquema, cuerpos de función (md5) y privilegios como antes, con las pérdidas de la cabecera (R36);
 * y que se vuelve a subir igual.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261104150200_cobro_plataforma_porcentual_funciones";
const M = "20261106120000_plan_periodo_facturacion";
const ORIGEN_TOPE = "20261029150000_plan_ciclo_inicio_elegido";

const BASE = `slt86_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const VERSION_B = {
  nombre: "SLT86 B pendiente",
  topes: { ordenesPorCiclo: 30, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "2000.00", anual: { tipo: "fijo", monto: "20000.00" } },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
};

const VERSION_C = {
  nombre: "SLT86 C pendiente",
  topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: 2 },
  modulos: [],
  precio: { tipo: "monto", mensual: "500.00", anual: { tipo: "descuento", porcentaje: "15" } },
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
};

/** Lo que la foto del fixture no mira y la migración sí cambia: funciones, triggers, privilegios y RLS. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
                     || ' ' || COALESCE(p.proacl::text, '-') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'servi_app'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity::text AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
};

let db: Conexion;
let admin: Conexion | undefined;
let planA: string;
let planB: string;
let planC: string;
let planD: string;
let e1: string;
let e2: string;
let e3: string;
let antes: Foto;
let subida: Foto;
let rastroAntes: number;

/** La foto sin el conteo de filas (el rastro gana filas que la bajada no quita, a propósito). */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function uno<T = string>(sql: string, valores: unknown[] = [], columna = "v"): Promise<T> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`se esperaba una fila: ${sql.slice(0, 80)}`);
  return rows[0][columna] as T;
}

/** Corre un script que debe negarse: devuelve el error (o `null` si no se negó). */
async function correrYCapturar(script: string, etiqueta: string): Promise<ErrorDeScript | null> {
  try {
    await ejecutar(db, script, etiqueta);
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
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

async function version(planId: string): Promise<unknown> {
  const { rows } = await db.query(`SELECT "version" FROM "plan_cambio_programado" WHERE "plan_id" = $1`, [planId]);
  return rows[0]?.version;
}

async function planDeLaEmpresa(organizacionId: string): Promise<Record<string, unknown>> {
  await db.query("BEGIN");
  try {
    await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [organizacionId]);
    const { rows } = await db.query(`SELECT plan_de_la_empresa($1) AS p`, [organizacionId]);
    return rows[0].p as Record<string, unknown>;
  } finally {
    await db.query("ROLLBACK");
  }
}

/** Las 00:00 de hoy en la plataforma (−06:00), en UTC sin zona, como texto de Postgres. */
async function inicioDeHoy(): Promise<string> {
  return uno(`SELECT (date_trunc('day', (now() AT TIME ZONE 'UTC') - interval '6 hours') + interval '6 hours')::text AS v`);
}

async function crearEmpresa(sufijo: string): Promise<string> {
  return uno(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id" AS v`, [
    randomUUID(),
    `SLT86 IV ${sufijo}`,
    `slt86-iv-${sufijo}`,
  ]);
}

/** Una orden de la empresa con `created_at` fijado: lo que mira el conteo del período. */
async function crearOrden(organizacionId: string, creadaEn: string): Promise<void> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const tiendaId = await uno(
    `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
       "rol_id", "estado", "updated_at", "organizacion_id")
     SELECT $1, 'Tienda SLT86', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
       FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id" AS v`,
    [randomUUID(), `slt86-iv-${sufijo}@example.com`, `slt86-iv-${sufijo}`, organizacionId],
  );
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id" AS v`,
    [randomUUID(), `Zona SLT86 ${sufijo}`, organizacionId],
  );
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id", "created_at")
     SELECT $1, $2, s."id", 'SLT86', '88887777', $3, $4, $5, $6, 'Caja', now(), $7, $8::timestamp
       FROM "order_status" s WHERE s."value" = 'en_preparacion'`,
    [randomUUID(), `SLT86-IV-${sufijo}`, tiendaId, zonaId, rows[0].provincia, rows[0].canton, organizacionId, creadaEn],
  );
}

/** El bloque `CREATE OR REPLACE FUNCTION <nombre>(…) … END $$;` tal como está en su migración de origen. */
function cuerpoDe(carpeta: string, nombre: string): string {
  const texto = sqlDe(carpeta, "migration.sql");
  const inicio = texto.indexOf(`CREATE OR REPLACE FUNCTION ${nombre}(`);
  if (inicio < 0) throw new Error(`${nombre} no está en ${carpeta}`);
  const fin = texto.indexOf("END $$;", inicio);
  return texto.slice(inicio, fin + "END $$;".length);
}

describe("SLT-86 — la migración en disco (R33, R36)", () => {
  it("R33: va justo detrás de la última de dev, con su down.sql", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M)).toBe(carpetas.indexOf(M_ANTERIOR) + 1);
    expect(sqlDe(M, "down.sql").length).toBeGreaterThan(0);
  });

  it("R36: el down.sql repone LITERALMENTE los cuerpos de plan_tope_ordenes, plan_cupo_ordenes y plan_de_la_empresa", () => {
    const down = sqlDe(M, "down.sql");
    expect(down).toContain(cuerpoDe(ORIGEN_TOPE, "plan_tope_ordenes"));
    expect(down).toContain(cuerpoDe(ORIGEN_TOPE, "plan_cupo_ordenes"));
    expect(down).toContain(cuerpoDe(M_ANTERIOR, "plan_de_la_empresa"));
  });

  it("R36: el down.sql se niega antes de tocar nada y su cabecera declara las pérdidas", () => {
    const down = sqlDe(M, "down.sql");
    const sinComentarios = down.replace(/--[^\n]*/g, "");
    expect(sinComentarios.indexOf("RAISE EXCEPTION")).toBeGreaterThan(0);
    expect(sinComentarios.indexOf("RAISE EXCEPTION")).toBeLessThan(sinComentarios.search(/\b(DROP|CREATE|ALTER|UPDATE)\b/));
    expect(down).toMatch(/los topes de órdenes borrados no vuelven/);
    expect(down).toMatch(/las entradas de las empresas no vuelven a su ancla de antes/);
    expect(down).toMatch(/las filas con fecha de `plan_precio_historial`/);
  });
});

describeSiHayBase("SLT-86 R33–R36 — plan_periodo_facturacion de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    [planA, planB, planC, planD] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "descuento_anual_pct", "tope_ordenes_ciclo")
       VALUES ($1, 'SLT86 A', 'publico', 1000, 10, 50)`,
      [planA],
    );
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "precio_anual") VALUES ($1, 'SLT86 B', 'publico', 1000, 10000)`,
      [planB],
    );
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual") VALUES ($1, 'SLT86 C', 'publico', 500)`, [planC]);
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad") VALUES ($1, 'SLT86 D', 'publico')`, [planD]);
    for (const [planId, v] of [
      [planB, VERSION_B],
      [planC, VERSION_C],
    ] as const) {
      await db.query(
        `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar", "actor_usuario_id", "actor_nombre")
         VALUES ($1, $2, (now() AT TIME ZONE 'UTC') + interval '30 days', $3::jsonb, '[]'::jsonb, 'superadmin', 'Superadmin SLT86')`,
        [randomUUID(), planId, JSON.stringify(v)],
      );
    }
    await db.query(`INSERT INTO "cobro_plataforma_tarifa" ("id", "monto", "updated_at") VALUES (true, 500, now())`);

    const sufijo = randomUUID().replace(/-/g, "").slice(0, 8);
    e1 = await crearEmpresa(`${sufijo}-1`);
    e2 = await crearEmpresa(`${sufijo}-2`);
    e3 = await crearEmpresa(`${sufijo}-3`);
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_tipo_cobro" = 'anual',
              "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '40 days' WHERE "id" = $2`,
      [planA, e1],
    );
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') + interval '5 days',
              "plan_ciclo_corto_desde_at" = (now() AT TIME ZONE 'UTC') - interval '2 days' WHERE "id" = $2`,
      [planB, e2],
    );
    const hoy = await inicioDeHoy();
    await crearOrden(e1, hoy);
    await crearOrden(e1, await uno(`SELECT ($1::timestamp - interval '1 minute')::text AS v`, [hoy]));

    antes = await fotoSinFilas();
    rastroAntes = Number(await uno(`SELECT count(*)::int AS v FROM "plan_rastro"`));
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R33 (P3): con un plan de anual fijo mayor que mensual × 12, la migración se niega, lo nombra y no cambia nada", async () => {
    const x = randomUUID();
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "precio_anual") VALUES ($1, 'SLT86 caro', 'publico', 100, 1200.01)`,
      [x],
    );
    const error = await correrYCapturar(sqlDe(M, "migration.sql"), M);
    expect(error?.sqlstate).toBe("P0001");
    expect(error?.message).toMatch(/precio anual fijo mayor que el mensual × 12/);
    expect(error?.message).toContain(`${x} (SLT86 caro)`);
    await db.query(`DELETE FROM "plan" WHERE "id" = $1`, [x]);
    expect(diferencias(await fotoSinFilas(), antes)).toEqual([]);
  });

  it("R33 (P3): con una versión pendiente de anual fijo mayor que mensual × 12, también se niega y nada cambia", async () => {
    await db.query(
      `UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{precio,anual,monto}', '"24000.01"') WHERE "plan_id" = $1`,
      [planB],
    );
    const error = await correrYCapturar(sqlDe(M, "migration.sql"), M);
    expect(error?.sqlstate).toBe("P0001");
    expect(error?.message).toContain(`${planB} (SLT86 B)`);
    await db.query(`UPDATE "plan_cambio_programado" SET "version" = $2::jsonb WHERE "plan_id" = $1`, [planB, JSON.stringify(VERSION_B)]);
    expect(diferencias(await fotoSinFilas(), antes)).toEqual([]);
    expect(await version(planB)).toEqual(VERSION_B);

    // La subida de verdad, para el resto del caso.
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    subida = await fotoSinFilas();
    expect(diferencias(subida, antes).length).toBeGreaterThan(0);
  });

  it("R33: el anual pasa a descuento del período anual con el mismo costo anual; sin anual, sin descuentos", async () => {
    const { rows } = await db.query(
      `SELECT p."nombre", d."periodo", d."porcentaje"::text AS porcentaje, d."monto"::text AS monto
         FROM "plan_descuento_periodo" d JOIN "plan" p ON p."id" = d."plan_id"
        WHERE d."plan_id" = ANY($1) ORDER BY p."nombre"`,
      [[planA, planB, planC, planD]],
    );
    expect(rows).toEqual([
      { nombre: "SLT86 A", periodo: "anual", porcentaje: "10.00", monto: null },
      { nombre: "SLT86 B", periodo: "anual", porcentaje: null, monto: "2000.00" },
    ]);
    // D7 antes = R9/R10 después: A, 12 000 − 10 % = 10 800; B, 12 000 − 2 000 = el anual fijo de 10 000.
    expect(12000 * (1 - 10 / 100)).toBe(10800);
    expect(12000 - 2000).toBe(10000);
    const columnas = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plan'
          AND column_name IN ('precio_anual', 'descuento_anual_pct', 'tope_ordenes_ciclo')`,
    );
    expect(columnas.rows).toEqual([]);
  });

  it("R33, R34: las versiones pendientes se convierten igual y pierden el tope de órdenes", async () => {
    const { ordenesPorCiclo: _b, ...topesB } = VERSION_B.topes;
    void _b;
    expect(await version(planB)).toEqual({
      ...VERSION_B,
      topes: topesB,
      precio: { tipo: "monto", mensual: "2000.00", descuentos: { anual: { tipo: "monto", monto: "4000.00" } } },
    });
    const { ordenesPorCiclo: _c, ...topesC } = VERSION_C.topes;
    void _c;
    expect(await version(planC)).toEqual({
      ...VERSION_C,
      topes: topesC,
      precio: { tipo: "monto", mensual: "500.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "15" } } },
    });
  });

  it("R15: cada plan siembra su fila de historial «desde siempre» con el precio ya convertido", async () => {
    const { rows } = await db.query(
      `SELECT p."nombre", h."desde_at"::text AS desde, h."precio_mensual"::text AS mensual, h."descuentos"
         FROM "plan_precio_historial" h JOIN "plan" p ON p."id" = h."plan_id"
        WHERE h."plan_id" = ANY($1) ORDER BY p."nombre"`,
      [[planA, planB, planC, planD]],
    );
    expect(rows).toEqual([
      { nombre: "SLT86 A", desde: "-infinity", mensual: "1000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
      { nombre: "SLT86 B", desde: "-infinity", mensual: "1000.00", descuentos: { anual: { tipo: "monto", monto: "2000.00" } } },
      { nombre: "SLT86 C", desde: "-infinity", mensual: "500.00", descuentos: {} },
      { nombre: "SLT86 D", desde: "-infinity", mensual: null, descuentos: {} },
    ]);
  });

  it("R34: el plan con tope deja una fila `editado` firmada por el sistema, y el trigger y el cupo desaparecen", async () => {
    const { rows } = await db.query(
      `SELECT "plan_nombre", "accion"::text AS accion, "cambios", "actor_usuario_id", "actor_nombre" FROM "plan_rastro"
        WHERE "plan_id" = ANY($1)`,
      [[planA, planB, planC, planD]],
    );
    expect(rows).toEqual([
      {
        plan_nombre: "SLT86 A",
        accion: "editado",
        cambios: { tope_ordenes_ciclo: { antes: "50", despues: null } },
        actor_usuario_id: "sistema",
        actor_nombre: "Sistema (migración SLT-86)",
      },
    ]);
    const restos = await db.query(
      `SELECT tgname AS n FROM pg_trigger WHERE tgname = 'plan_tope_ordenes'
       UNION ALL SELECT proname FROM pg_proc WHERE proname IN ('plan_tope_ordenes', 'plan_cupo_ordenes')`,
    );
    expect(restos.rows).toEqual([]);
  });

  it("R35: toda empresa con plan conserva plan y tipo y entra a las 00:00 de hoy, sin ciclo corto; la sin plan no cambia", async () => {
    const hoy = await inicioDeHoy();
    const { rows } = await db.query(
      `SELECT "id", "plan_id", "plan_tipo_cobro", "plan_ciclo_ancla_at"::text AS entrada FROM "organizacion" WHERE "id" = ANY($1)`,
      [[e1, e2, e3]],
    );
    const porId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(porId[e1]).toMatchObject({ plan_id: planA, plan_tipo_cobro: "anual", entrada: hoy });
    expect(porId[e2]).toMatchObject({ plan_id: planB, plan_tipo_cobro: "mensual", entrada: hoy });
    expect(porId[e3]).toMatchObject({ plan_id: null, entrada: null });
    const corto = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'organizacion' AND column_name = 'plan_ciclo_corto_desde_at'`,
    );
    expect(corto.rows).toEqual([]);
  });

  it("R35: el período en curso es el tramo de hoy al fin del año, y la orden de hoy creada antes de migrar cuenta", async () => {
    const plan = await planDeLaEmpresa(e1);
    const hoy = (await inicioDeHoy()).replace(" ", "T");
    const anioLocal = new Date(Date.now() - 6 * 3600 * 1000).getUTCFullYear();
    expect(plan.ciclo_inicio).toBe(hoy);
    expect(plan.ciclo_fin).toBe(`${anioLocal + 1}-01-01T06:00:00`);
    expect((plan.uso as Record<string, unknown>).ordenes).toBe(1);
    expect(plan.tipo_cobro).toBe("anual");
    expect(plan.descuentos).toEqual({ anual: { tipo: "porcentaje", porcentaje: "10.00" } });
    expect(plan.precio_del_periodo).toEqual({ precio_mensual: "1000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } });
    expect(plan.cambio_empresa).toBeNull();
    for (const clave of ["precio_anual", "descuento_anual_pct", "tope_ordenes_ciclo", "ciclo_corto_desde"]) {
      expect(plan).not.toHaveProperty(clave);
    }
  });

  it("R1, R10, R32: la base rechaza otro tipo y las formas inválidas de descuento, y servi_app no toca las tablas nuevas", async () => {
    expect(await sqlstateDe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'semanal' WHERE "id" = $1`, [e1])).toBe("23514");
    expect(await sqlstateDe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'bimestral' WHERE "id" = $1`, [e1])).toBeNull();
    const insertar = `INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje", "monto") VALUES ($1, $2, $3, $4)`;
    expect(await sqlstateDe(insertar, [planC, "mensual", 5, 10])).toBe("23514");
    expect(await sqlstateDe(insertar, [planC, "mensual", 0, null])).toBe("23514");
    expect(await sqlstateDe(insertar, [planC, "mensual", null, -1])).toBe("23514");
    expect(await sqlstateDe(insertar, [planC, "semanal", 5, null])).toBe("23514");
    expect(await sqlstateDe(insertar, [planC, "quincenal", 100, null])).toBeNull();
    for (const tabla of ["plan_descuento_periodo", "plan_precio_historial"]) {
      expect(await sqlstateDe(`SET LOCAL ROLE servi_app; SELECT * FROM "${tabla}"`)).toBe("42501");
    }
  });

  it("R36: el down.sql se niega, sin tocar nada, con cada dato que la forma de antes no puede representar", async () => {
    const con = await fotoSinFilas();
    const casos: { preparar: string; deshacer: string; valores: unknown[]; mensaje: RegExp }[] = [
      {
        preparar: `UPDATE "organizacion" SET "plan_tipo_cobro" = 'quincenal' WHERE "id" = $1`,
        deshacer: `UPDATE "organizacion" SET "plan_tipo_cobro" = 'anual' WHERE "id" = $1`,
        valores: [e1],
        mensaje: /SLT-86 down: hay empresas con tipo de cobro quincenal o bimestral/,
      },
      {
        preparar: `UPDATE "organizacion" SET "plan_cambio_id" = 'c1', "plan_cambio_plan_id" = $2, "plan_cambio_tipo_cobro" = 'mensual',
                     "plan_cambio_desde_at" = (now() AT TIME ZONE 'UTC') + interval '3 days', "plan_cambio_actor_id" = 'superadmin' WHERE "id" = $1`,
        deshacer: `UPDATE "organizacion" SET "plan_cambio_id" = NULL, "plan_cambio_plan_id" = NULL, "plan_cambio_tipo_cobro" = NULL,
                     "plan_cambio_desde_at" = NULL, "plan_cambio_actor_id" = NULL WHERE "id" = $1 AND $2::text IS NOT NULL`,
        valores: [e3, planC],
        mensaje: /SLT-86 down: hay empresas con un cambio de plan pendiente/,
      },
      {
        preparar: `INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje") VALUES ($1, 'bimestral', 5)`,
        deshacer: `DELETE FROM "plan_descuento_periodo" WHERE "plan_id" = $1 AND "periodo" = 'bimestral'`,
        valores: [planC],
        mensaje: /SLT-86 down: hay planes con descuento quincenal, mensual o bimestral/,
      },
      {
        preparar: `UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{precio,descuentos,mensual}', '{"tipo": "porcentaje", "porcentaje": "5"}') WHERE "plan_id" = $1`,
        deshacer: `UPDATE "plan_cambio_programado" SET "version" = "version" #- '{precio,descuentos,mensual}' WHERE "plan_id" = $1`,
        valores: [planC],
        mensaje: /SLT-86 down: hay planes con descuento quincenal, mensual o bimestral/,
      },
      {
        preparar: `UPDATE "plan_descuento_periodo" SET "porcentaje" = NULL, "monto" = 12000.01 WHERE "plan_id" = $1`,
        deshacer: `UPDATE "plan_descuento_periodo" SET "monto" = NULL, "porcentaje" = 10 WHERE "plan_id" = $1`,
        valores: [planA],
        mensaje: /SLT-86 down: hay planes con un descuento anual que el precio anual de antes no puede representar/,
      },
      {
        preparar: `UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{precio,descuentos,anual,monto}', '"24000.01"') WHERE "plan_id" = $1`,
        deshacer: `UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{precio,descuentos,anual,monto}', '"4000.00"') WHERE "plan_id" = $1`,
        valores: [planB],
        mensaje: /SLT-86 down: hay planes con un descuento anual que el precio anual de antes no puede representar/,
      },
    ];
    for (const caso of casos) {
      await db.query(caso.preparar, caso.valores);
      const error = await correrYCapturar(sqlDe(M, "down.sql"), `${M}/down.sql`);
      expect(error?.sqlstate).toBe("P0001");
      expect(error?.message).toMatch(caso.mensaje);
      await db.query(caso.deshacer, caso.valores);
      expect(diferencias(await fotoSinFilas(), con)).toEqual([]);
    }
  });

  it("R36: el down.sql deja esquema, cuerpos de función (md5), triggers y privilegios como antes, con las pérdidas de la cabecera", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(diferencias(await fotoSinFilas(), antes)).toEqual([]);

    const { rows } = await db.query(
      `SELECT "nombre", "precio_anual"::text AS anual, "descuento_anual_pct"::text AS pct, "tope_ordenes_ciclo" AS tope
         FROM "plan" WHERE "id" = ANY($1) ORDER BY "nombre"`,
      [[planA, planB, planC, planD]],
    );
    expect(rows).toEqual([
      { nombre: "SLT86 A", anual: null, pct: "10.00", tope: null }, // el tope de 50 se pierde
      { nombre: "SLT86 B", anual: "10000.00", pct: null, tope: null },
      { nombre: "SLT86 C", anual: null, pct: null, tope: null },
      { nombre: "SLT86 D", anual: null, pct: null, tope: null },
    ]);
    expect(await version(planB)).toEqual({ ...VERSION_B, topes: { ...VERSION_B.topes, ordenesPorCiclo: null } });
    expect(await version(planC)).toEqual(VERSION_C);

    // Las entradas no vuelven a su ancla de antes, y el ciclo corto vuelve en NULL.
    const hoy = await inicioDeHoy();
    const empresas = await db.query(
      `SELECT "plan_ciclo_ancla_at"::text AS entrada, "plan_ciclo_corto_desde_at" AS corto FROM "organizacion" WHERE "id" = $1`,
      [e2],
    );
    expect(empresas.rows).toEqual([{ entrada: hoy, corto: null }]);
    // El rastro solo recibe filas: la de la subida se queda.
    expect(Number(await uno(`SELECT count(*)::int AS v FROM "plan_rastro"`))).toBe(rastroAntes + 1);
  });

  it("R36: reaplicada tras bajar, la migración deja lo mismo que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    expect(diferencias(await fotoSinFilas(), subida)).toEqual([]);
    expect(await version(planB)).toEqual({
      ...VERSION_B,
      topes: { porRol: {}, apiKeys: null },
      precio: { tipo: "monto", mensual: "2000.00", descuentos: { anual: { tipo: "monto", monto: "4000.00" } } },
    });
  });
});
