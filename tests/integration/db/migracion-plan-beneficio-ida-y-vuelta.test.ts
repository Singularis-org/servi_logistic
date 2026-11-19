import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * SLT-214 (design §1.3; R1, R6, R7, R18, R23) — la migración de los beneficios de texto, de ida y vuelta, en una
 * base PROPIA (`slt214_iv_<rand>`): reemplaza `plan_de_la_empresa`, que leen «Mi plan» y otros tests; en la base
 * compartida tomaría su lock bajo los demás archivos. La base de `DATABASE_URL` no se toca.
 *
 * Se siembra ANTES de la migración un plan P con un módulo y dos empresas: A con versión propia (sin
 * `beneficios`, como toda versión anterior a SLT-214) y B sin ella; un cambio programado de P y un borrador de
 * cambio de P. Los casos van en orden y cada uno parte de lo que dejó el anterior.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261119120100_cobro_plataforma_ocurrido_utc";
const M = "20261120120000_plan_beneficio";
/** La última definición de `plan_de_la_empresa` antes de M: la que repone el down.sql. */
const ORIGEN_FUNCION = "20261114120000_plan_cambio_por_empresa";
const BASE = `slt214_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** Lo que la foto del fixture no mira y la migración sí cambia: funciones, privilegios, políticas y RLS. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
                     || ' ' || COALESCE(p.proacl::text, '-') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.table_privileges
    WHERE table_schema = 'public'`,
  politicas: `SELECT tablename || '.' || policyname AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity::text AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
};

/** De `FUNCTION nombre(` a su `END $$;`, sin el `CREATE [OR REPLACE]` de delante. */
function definicionDe(carpeta: string, archivo: "migration.sql" | "down.sql", funcion: string): string {
  const texto = sqlDe(carpeta, archivo);
  const inicio = texto.indexOf(`FUNCTION ${funcion}(`);
  if (inicio < 0) throw new Error(`${funcion} no está en ${carpeta}/${archivo}`);
  const fin = texto.indexOf("END $$;", inicio);
  return texto.slice(inicio, fin + "END $$;".length);
}

let db: Conexion;
let admin: Conexion | undefined;
let antesDeM: Foto;
let despuesDeM: Foto;
const miPlanAntes: Record<"A" | "B", Record<string, unknown>> = { A: {}, B: {} };
const ids = { P: "", A: "", B: "", cambio: "", borrador: "" };

/** Una versión del plan con la forma de `versionPlanSchema` de antes de SLT-214 (sin `beneficios`). */
const VERSION = {
  nombre: "SLT214 IV P",
  topes: { porRol: {}, apiKeys: 3 },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "50000", descuentos: {} },
  costoPorOrden: "100",
  costoPorOrdenPorcentual: null,
  periodicidadOrdenes: "quincenal",
};

const BENEFICIOS_DEL_PLAN = [
  { icono: "soporte", texto: "Soporte 24 h" },
  { icono: "rayo", texto: "Acceso anticipado" },
];
const BENEFICIOS_DE_LA_VERSION = [{ icono: "estrella", texto: "Features nuevas" }];

/** La foto del esquema con funciones, privilegios, políticas y RLS; `conFilas` para comparar también los conteos. */
async function fotoCompleta(conFilas: boolean): Promise<Foto> {
  const { filas, ...resto } = await foto(db);
  const salida: Foto = conFilas ? { ...resto, filas } : resto;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    salida[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return salida;
}

/** «Mi plan» de una empresa con su contexto, en una transacción que se revierte. */
async function miPlan(organizacionId: string): Promise<Record<string, unknown>> {
  await db.query("BEGIN");
  try {
    await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [organizacionId]);
    const { rows } = await db.query(`SELECT plan_de_la_empresa($1) AS p`, [organizacionId]);
    return rows[0].p as Record<string, unknown>;
  } finally {
    await db.query("ROLLBACK");
  }
}

/** «Mi plan» sin lo que depende del reloj de la consulta (por si el caso cruza un cambio de segundo o de período). */
function sinReloj(p: Record<string, unknown>): Record<string, unknown> {
  const { ciclo_fin: _f, ciclo_inicio: _i, ...resto } = p;
  void _f;
  void _i;
  return resto;
}

async function existe(): Promise<boolean> {
  const { rows } = await db.query(`SELECT to_regclass('public.plan_beneficio') IS NOT NULL AS e`);
  return rows[0].e === true;
}

/** SQLSTATE y constraint de una escritura, u `ok`. */
function intento(sql: string, valores: unknown[]): Promise<string> {
  return db.query(sql, valores).then(
    () => "ok",
    (e: { code?: string; constraint?: string }) => `${e.code} ${e.constraint ?? ""}`.trim(),
  );
}

async function claves(sql: string): Promise<string[]> {
  const { rows } = await db.query(sql);
  return rows.map((r) => String(r.k)).sort();
}

async function crearEmpresa(): Promise<string> {
  const id = randomUUID();
  const sufijo = id.replace(/-/g, "").slice(0, 12);
  await db.query(
    `INSERT INTO "organizacion" ("id", "nombre", "slug", "plan_id", "plan_ciclo_ancla_at", "plan_tipo_cobro")
     VALUES ($1, $2, $3, $4, '2026-11-01 06:00:00', 'mensual')`,
    [id, `SLT214 IV ${sufijo}`, `slt214-iv-${sufijo}`, ids.P],
  );
  return id;
}

describe("SLT-214 — la migración en disco", () => {
  it("va justo detrás de la última de dev, es atómica y su down.sql quita la tabla", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_ANTERIOR)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M)).toBe(carpetas.indexOf(M_ANTERIOR) + 1);
    expect(sqlDe(M, "migration.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M, "down.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M, "down.sql")).toMatch(/DROP TABLE "plan_beneficio"/);
  });

  it("el down.sql repone LITERALMENTE la última definición de plan_de_la_empresa y la subida la reemplaza", () => {
    const deOrigen = definicionDe(ORIGEN_FUNCION, "migration.sql", "plan_de_la_empresa");
    expect(definicionDe(M, "down.sql", "plan_de_la_empresa")).toBe(deOrigen);
    expect(definicionDe(M, "migration.sql", "plan_de_la_empresa")).not.toBe(deOrigen);
    expect(sqlDe(M, "migration.sql")).toContain("CREATE OR REPLACE FUNCTION plan_de_la_empresa(");
  });

  it("control: ninguna migración entre el origen y M redefine plan_de_la_empresa", () => {
    const entre = carpetasDeMigracion()
      .filter((c) => c > ORIGEN_FUNCION && c < M)
      .filter((c) => /FUNCTION plan_de_la_empresa\(/.test(sqlDe(c, "migration.sql")));
    expect(entre).toEqual([]);
  });
});

describeSiHayBase("SLT-214 — subir, bajar y volver a subir", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    ids.P = randomUUID();
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden", "tope_api_keys")
       VALUES ($1, $2, 'publico', 50000, 100, 3)`,
      [ids.P, `SLT214 IV P ${ids.P.slice(0, 8)}`],
    );
    await db.query(`INSERT INTO "plan_modulo" ("plan_id", "modulo") VALUES ($1, 'analitica')`, [ids.P]);
    ids.A = await crearEmpresa();
    ids.B = await crearEmpresa();
    ids.cambio = randomUUID();
    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, '2099-01-01 06:00:00', $3::jsonb, '[]'::jsonb, $4, 'Superadmin SLT214')`,
      [ids.cambio, ids.P, JSON.stringify(VERSION), randomUUID()],
    );
    await db.query(
      `INSERT INTO "plan_version_empresa" ("empresa_id", "plan_id", "cambio_id", "version", "desde_at")
       VALUES ($1, $2, $3, $4::jsonb, '2026-11-01 06:00:00')`,
      [ids.A, ids.P, ids.cambio, JSON.stringify({ ...VERSION, nombre: "SLT214 IV propia de A" })],
    );
    ids.borrador = randomUUID();
    await db.query(
      `INSERT INTO "plan_borrador" ("id", "plan_id", "pasos", "iniciado_por_usuario_id", "iniciado_por_nombre")
       VALUES ($1, $2, $3::jsonb, 'u-slt214', 'Superadmin SLT214')`,
      [ids.borrador, ids.P, JSON.stringify({ modulos: { modulos: ["analitica"] } })],
    );

    antesDeM = await fotoCompleta(true);
    miPlanAntes.A = await miPlan(ids.A);
    miPlanAntes.B = await miPlan(ids.B);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R6: subir crea plan_beneficio como tabla de plataforma: RLS sin políticas y nada para servi_app", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    despuesDeM = await fotoCompleta(false);

    expect(await existe()).toBe(true);
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls,
              (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
              has_table_privilege('servi_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE') AS app
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'plan_beneficio'`,
    );
    expect(rows).toEqual([{ rls: true, politicas: 0, app: false }]);

    // Lo nuevo de la foto es la tabla, el CHECK de pasos y la función; ni una fila de otra tabla cambia.
    const { filas: _f, ...antesSinFilas } = antesDeM;
    void _f;
    const nuevas = diferencias(despuesDeM, antesSinFilas).filter(
      (l) => !/plan_beneficio|plan_borrador_pasos_conocidos|plan_de_la_empresa\(/.test(l),
    );
    expect(nuevas).toEqual([]);
  });

  it("R18, R23: sin beneficios y con versiones previas, «Mi plan» es el de antes con `beneficios: []`", async () => {
    expect(sinReloj(await miPlan(ids.A))).toEqual({ ...sinReloj(miPlanAntes.A), beneficios: [] });
    expect(sinReloj(await miPlan(ids.B))).toEqual({ ...sinReloj(miPlanAntes.B), beneficios: [] });
  });

  it("R18, R23: los del plan en orden; la versión propia sin `beneficios` usa los del plan y con ellos, los suyos", async () => {
    // Al revés a propósito: el orden lo da `posicion`.
    for (const [posicion, b] of [...BENEFICIOS_DEL_PLAN.entries()].reverse()) {
      await db.query(`INSERT INTO "plan_beneficio" ("plan_id", "posicion", "icono", "texto") VALUES ($1, $2, $3, $4)`, [
        ids.P,
        posicion,
        b.icono,
        b.texto,
      ]);
    }
    expect((await miPlan(ids.B)).beneficios).toEqual(BENEFICIOS_DEL_PLAN);
    expect((await miPlan(ids.A)).beneficios).toEqual(BENEFICIOS_DEL_PLAN);

    await db.query(
      `UPDATE "plan_version_empresa" SET "version" = "version" || jsonb_build_object('beneficios', $2::jsonb) WHERE "empresa_id" = $1`,
      [ids.A, JSON.stringify(BENEFICIOS_DE_LA_VERSION)],
    );
    expect((await miPlan(ids.A)).beneficios).toEqual(BENEFICIOS_DE_LA_VERSION);
    expect((await miPlan(ids.B)).beneficios).toEqual(BENEFICIOS_DEL_PLAN);

    // Una versión propia con la lista vacía es «sin beneficios», no «sin cambio».
    await db.query(
      `UPDATE "plan_version_empresa" SET "version" = jsonb_set("version", '{beneficios}', '[]'::jsonb) WHERE "empresa_id" = $1`,
      [ids.A],
    );
    expect((await miPlan(ids.A)).beneficios).toEqual([]);
    await db.query(
      `UPDATE "plan_version_empresa" SET "version" = jsonb_set("version", '{beneficios}', $2::jsonb) WHERE "empresa_id" = $1`,
      [ids.A, JSON.stringify(BENEFICIOS_DE_LA_VERSION)],
    );
  });

  it("R7: el borrador admite el paso `beneficios` y sigue rechazando un paso desconocido", async () => {
    expect(
      await intento(
        `UPDATE "plan_borrador" SET "pasos" = "pasos" || jsonb_build_object('beneficios', $2::jsonb) WHERE "id" = $1`,
        [ids.borrador, JSON.stringify({ beneficios: BENEFICIOS_DE_LA_VERSION })],
      ),
    ).toBe("ok");
    expect(
      await intento(`UPDATE "plan_borrador" SET "pasos" = "pasos" || '{"otro": {}}'::jsonb WHERE "id" = $1`, [ids.borrador]),
    ).toBe("23514 plan_borrador_pasos_conocidos");
    await db.query(
      `UPDATE "plan_cambio_programado" SET "version" = "version" || jsonb_build_object('beneficios', $2::jsonb) WHERE "id" = $1`,
      [ids.cambio, JSON.stringify(BENEFICIOS_DE_LA_VERSION)],
    );
  });

  it("bajar quita la tabla, el paso del borrador y la clave de las versiones, y deja la base y «Mi plan» como antes", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(await existe()).toBe(false);
    expect(diferencias(await fotoCompleta(true), antesDeM)).toEqual([]);
    expect(sinReloj(await miPlan(ids.A))).toEqual(sinReloj(miPlanAntes.A));
    expect(sinReloj(await miPlan(ids.B))).toEqual(sinReloj(miPlanAntes.B));
    expect(await claves(`SELECT jsonb_object_keys("pasos") AS k FROM "plan_borrador"`)).toEqual(["modulos"]);
    expect(await claves(`SELECT jsonb_object_keys("version") AS k FROM "plan_cambio_programado"`)).toEqual(
      Object.keys(VERSION).sort(),
    );
    expect(await claves(`SELECT jsonb_object_keys("version") AS k FROM "plan_version_empresa"`)).toEqual(
      Object.keys(VERSION).sort(),
    );
    // El CHECK de pasos vuelve a sus seis pasos.
    expect(
      await intento(
        `UPDATE "plan_borrador" SET "pasos" = "pasos" || '{"beneficios": {"beneficios": []}}'::jsonb WHERE "id" = $1`,
        [ids.borrador],
      ),
    ).toBe("23514 plan_borrador_pasos_conocidos");
  });

  it("subir otra vez da el mismo esquema que la primera", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);

    expect(diferencias(await fotoCompleta(false), despuesDeM)).toEqual([]);
  });
});
