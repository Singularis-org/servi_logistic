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
 * SLT-215 (design §1, §2.5, §2.6; R6, R7, R36, R37) — las dos migraciones de los niveles por volumen, de ida y
 * vuelta, en una base PROPIA (`slt215_iv_<rand>`): recrean `job_tipo` al bajar, y en la base compartida tomarían
 * su lock bajo los demás archivos. La base de `DATABASE_URL` no se toca.
 *
 * Se siembra ANTES de las migraciones un plan P y tres empresas: A y B con P (B con versión propia, sin `niveles`,
 * como toda versión anterior a SLT-215) y C sin plan; un cambio programado de P y un borrador de cambio de P. Los
 * casos van en orden y cada uno parte de lo que dejó el anterior.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261121130000_pago_plataforma_por_fuera";
const M_ENUM = "20261121140000_plan_nivel_job_enum";
const M = "20261121140100_plan_nivel";
const BASE = `slt215_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const TABLAS = ["plan_nivel", "plan_nivel_empresa", "plan_nivel_historial"];
const FUNCIONES = [
  "plan_nivel_cerrar_meses",
  "plan_nivel_metas_de_la_empresa",
  "plan_nivel_ordenes_efectivas",
  "plan_nivel_recalcular",
  "plan_nivel_tomar_plan",
];
/** Todo lo que las dos migraciones pueden añadir a la foto: sus tablas, sus funciones, el CHECK de pasos y el enum. */
const LO_NUEVO = /plan_nivel|plan_borrador_pasos_conocidos|^tipos: job_tipo /;

/** Lo que la foto del fixture no mira y la migración sí cambia: funciones, privilegios, políticas, RLS y triggers. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
                     || ' ' || COALESCE(p.proacl::text, '-') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.table_privileges
    WHERE table_schema = 'public'`,
  politicas: `SELECT tablename || '.' || policyname AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity::text AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  triggers: `SELECT c.relname || '.' || t.tgname AS l FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
};

let db: Conexion;
let admin: Conexion | undefined;
let antes: Foto;
let despues: Foto;
/** El inicio del mes en que se aplicó la migración (R37), en UTC. */
let mesDeLaMigracion = "";
const ids = { P: "", A: "", B: "", C: "", cambio: "", borrador: "" };

/** Una versión del plan con la forma de `versionPlanSchema` de antes de SLT-215 (sin `niveles`). */
const VERSION = {
  nombre: "SLT215 IV P",
  topes: { porRol: {}, apiKeys: 3 },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000", descuentos: {} },
  costoPorOrden: "100",
  costoPorOrdenPorcentual: null,
  periodicidadOrdenes: "quincenal",
  beneficios: [],
};
const NIVELES = [
  { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10" } },
  { meta: 200, descuento: { tipo: "monto", monto: "1500" } },
];

/** La foto del esquema con funciones, privilegios, políticas, RLS y triggers; `conFilas` compara también los conteos. */
async function fotoCompleta(conFilas: boolean): Promise<Foto> {
  const { filas, ...resto } = await foto(db);
  const salida: Foto = conFilas ? { ...resto, filas } : resto;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    salida[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return salida;
}

async function lista(sql: string, valores: unknown[] = []): Promise<string[]> {
  const { rows } = await db.query(sql, valores);
  return rows.map((r) => String(r.k)).sort();
}

const tablasQueQuedan = () =>
  lista(`SELECT c.relname AS k FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY ($1)`, [TABLAS]);
const funcionesQueQuedan = () =>
  lista(`SELECT p.proname AS k FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname LIKE 'plan\\_nivel\\_%'`);

/** SQLSTATE y constraint de una escritura, u `ok`. */
function intento(sql: string, valores: unknown[]): Promise<string> {
  return db.query(sql, valores).then(
    () => "ok",
    (e: { code?: string; constraint?: string }) => `${e.code} ${e.constraint ?? ""}`.trim(),
  );
}

/** El inicio del mes de la plataforma (−06:00) que contiene `t`, como texto UTC sin zona (`plan_inicio_periodo_calendario`). */
function inicioDelMes(t: Date): string {
  const local = new Date(t.getTime() - 6 * 3_600_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01 06:00:00`;
}

async function crearEmpresa(planId: string | null): Promise<string> {
  const id = randomUUID();
  const sufijo = id.replace(/-/g, "").slice(0, 12);
  await db.query(
    `INSERT INTO "organizacion" ("id", "nombre", "slug", "plan_id", "plan_ciclo_ancla_at", "plan_tipo_cobro")
     VALUES ($1, $2, $3, $4, $5::timestamp, $6)`,
    [id, `SLT215 IV ${sufijo}`, `slt215-iv-${sufijo}`, planId, planId ? "2026-10-14 06:00:00" : null, "mensual"],
  );
  return id;
}

describe("SLT-215 — las migraciones en disco", () => {
  it("van justo detrás de la última de dev, en orden: primero el valor del enum, solo, y después las tablas", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_ANTERIOR)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M_ENUM)).toBe(carpetas.indexOf(M_ANTERIOR) + 1);
    expect(carpetas.indexOf(M)).toBe(carpetas.indexOf(M_ENUM) + 1);
    expect(sqlDe(M_ENUM, "migration.sql")).toMatch(/ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_niveles_cerrar';/);
    // Va sola: un valor de enum no se puede usar en la transacción que lo añade (55P04).
    expect(sqlDe(M_ENUM, "migration.sql")).not.toMatch(/^\s*(BEGIN|INSERT|UPDATE|CREATE)\b/m);
    expect(sqlDe(M, "migration.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M, "down.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M_ENUM, "down.sql")).toMatch(/quitar_valores_de_enum_slt215\('public', 'job_tipo', ARRAY\['plan_niveles_cerrar'\]\)/);
  });

  it("el down.sql quita las tres tablas y las cinco funciones que crea la subida", () => {
    const subida = sqlDe(M, "migration.sql");
    const bajada = sqlDe(M, "down.sql");
    for (const t of TABLAS) {
      expect(subida).toContain(`CREATE TABLE "${t}"`);
      expect(bajada).toContain(`DROP TABLE "${t}"`);
    }
    const creadas = [...subida.matchAll(/CREATE FUNCTION (\w+)\(/g)].map((m) => m[1]).sort();
    const borradas = [...bajada.matchAll(/DROP FUNCTION (\w+)\(/g)].map((m) => m[1]).sort();
    expect(creadas).toEqual(FUNCIONES);
    expect(borradas).toEqual(FUNCIONES);
  });
});

describeSiHayBase("SLT-215 — subir, bajar y volver a subir", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_ENUM);

    ids.P = randomUUID();
    await db.query(
      `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_mensual", "costo_por_orden", "tope_api_keys")
       VALUES ($1, $2, 'publico', 50000, 100, 3)`,
      [ids.P, `SLT215 IV P ${ids.P.slice(0, 8)}`],
    );
    ids.A = await crearEmpresa(ids.P);
    ids.B = await crearEmpresa(ids.P);
    ids.C = await crearEmpresa(null);
    ids.cambio = randomUUID();
    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, '2099-01-01 06:00:00', $3::jsonb, '[]'::jsonb, $4, 'Superadmin SLT215')`,
      [ids.cambio, ids.P, JSON.stringify(VERSION), randomUUID()],
    );
    await db.query(
      `INSERT INTO "plan_version_empresa" ("empresa_id", "plan_id", "cambio_id", "version", "desde_at")
       VALUES ($1, $2, $3, $4::jsonb, '2026-11-01 06:00:00')`,
      [ids.B, ids.P, ids.cambio, JSON.stringify({ ...VERSION, nombre: "SLT215 IV propia de B" })],
    );
    ids.borrador = randomUUID();
    await db.query(
      `INSERT INTO "plan_borrador" ("id", "plan_id", "pasos", "iniciado_por_usuario_id", "iniciado_por_nombre")
       VALUES ($1, $2, $3::jsonb, 'u-slt215', 'Superadmin SLT215')`,
      [ids.borrador, ids.P, JSON.stringify({ beneficios: { beneficios: [] } })],
    );

    antes = await fotoCompleta(true);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R6, R36: subir crea las tres tablas, con plan_nivel cerrada a servi_app y las de negocio solo de lectura por empresa", async () => {
    await ejecutar(db, sqlDe(M_ENUM, "migration.sql"), M_ENUM);
    const ahora = new Date();
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    despues = await fotoCompleta(false);

    expect(await tablasQueQuedan()).toEqual(TABLAS);
    expect(await funcionesQueQuedan()).toEqual(FUNCIONES);
    const { rows } = await db.query(
      `SELECT c.relname AS tabla, c.relrowsecurity AS rls,
              (SELECT string_agg(p.policyname, ',') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
              has_table_privilege('servi_app', c.oid, 'SELECT') AS leer,
              has_table_privilege('servi_app', c.oid, 'INSERT, UPDATE, DELETE') AS escribir
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY ($1) ORDER BY c.relname`,
      [TABLAS],
    );
    expect(rows).toEqual([
      { tabla: "plan_nivel", rls: true, politicas: null, leer: false, escribir: false },
      { tabla: "plan_nivel_empresa", rls: true, politicas: "plan_nivel_empresa_por_empresa", leer: true, escribir: false },
      { tabla: "plan_nivel_historial", rls: true, politicas: "plan_nivel_historial_por_empresa", leer: true, escribir: false },
    ]);
    // Ninguna de las cinco funciones la puede llamar servi_app.
    const ejecutables = await lista(
      `SELECT p.proname AS k FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'plan\\_nivel\\_%' AND has_function_privilege('servi_app', p.oid, 'EXECUTE')`,
    );
    expect(ejecutables).toEqual([]);

    // Lo nuevo de la foto es solo lo de estas migraciones.
    const { filas: _f, ...antesSinFilas } = antes;
    void _f;
    const otras = diferencias(despues, antesSinFilas).filter((l) => !LO_NUEVO.test(l.replace(/^(sobra|falta) en /, "")));
    expect(otras).toEqual([]);

    mesDeLaMigracion = inicioDelMes(ahora);
  });

  it("R37: cada empresa con plan queda en el nivel 0, cuenta 0, entrada en su ancla y el mes de la migración como primero; sin historial", async () => {
    const { rows } = await db.query(
      `SELECT "organizacion_id" AS org, "nivel", "meses_sin_cumplir" AS cuenta, "entrada_at"::text AS entrada,
              "cerrado_hasta_at"::text AS cerrado
         FROM "plan_nivel_empresa" WHERE "organizacion_id" = ANY ($1) ORDER BY "organizacion_id"`,
      [[ids.A, ids.B, ids.C]],
    );
    const fila = (org: string) => ({
      org,
      nivel: 0,
      cuenta: 0,
      entrada: "2026-10-14 06:00:00",
      cerrado: mesDeLaMigracion,
    });
    expect(rows).toEqual([fila(ids.A), fila(ids.B)].sort((x, y) => x.org.localeCompare(y.org)));
    const { rows: historial } = await db.query(`SELECT count(*)::int AS n FROM "plan_nivel_historial"`);
    expect(historial).toEqual([{ n: 0 }]);
  });

  it("R7: el borrador admite el paso `niveles` y sigue rechazando un paso desconocido; la cola admite el trabajo nuevo", async () => {
    expect(
      await intento(
        `UPDATE "plan_borrador" SET "pasos" = "pasos" || jsonb_build_object('niveles', $2::jsonb) WHERE "id" = $1`,
        [ids.borrador, JSON.stringify({ niveles: NIVELES })],
      ),
    ).toBe("ok");
    expect(
      await intento(`UPDATE "plan_borrador" SET "pasos" = "pasos" || '{"otro": {}}'::jsonb WHERE "id" = $1`, [ids.borrador]),
    ).toBe("23514 plan_borrador_pasos_conocidos");
    // Lo que bajar tiene que limpiar: los niveles del plan, de las versiones y el trabajo recurrente.
    await db.query(`INSERT INTO "plan_nivel" ("plan_id", "nivel", "meta", "descuento_pct") VALUES ($1, 1, 100, 10)`, [ids.P]);
    await db.query(
      `UPDATE "plan_cambio_programado" SET "version" = "version" || jsonb_build_object('niveles', $2::jsonb) WHERE "id" = $1`,
      [ids.cambio, JSON.stringify(NIVELES)],
    );
    await db.query(
      `UPDATE "plan_version_empresa" SET "version" = "version" || jsonb_build_object('niveles', $2::jsonb) WHERE "empresa_id" = $1`,
      [ids.B, JSON.stringify(NIVELES)],
    );
    expect(
      await intento(
        `INSERT INTO "jobs" ("id", "tipo", "payload", "max_intentos", "dedupe_key")
         VALUES ($1, 'plan_niveles_cerrar', '{}'::jsonb, 5, 'plan_niveles_cerrar:2026-12-01')`,
        [randomUUID()],
      ),
    ).toBe("ok");
  });

  it("bajar quita las tablas, las funciones, el paso, la clave `niveles` y el valor del enum, y deja la base como antes", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    await ejecutar(db, sqlDe(M_ENUM, "down.sql"), `${M_ENUM}/down.sql`);

    expect(await tablasQueQuedan()).toEqual([]);
    expect(await funcionesQueQuedan()).toEqual([]);
    expect(diferencias(await fotoCompleta(true), antes)).toEqual([]);
    expect(await lista(`SELECT jsonb_object_keys("pasos") AS k FROM "plan_borrador"`)).toEqual(["beneficios"]);
    expect(await lista(`SELECT jsonb_object_keys("version") AS k FROM "plan_cambio_programado"`)).toEqual(
      Object.keys(VERSION).sort(),
    );
    expect(await lista(`SELECT jsonb_object_keys("version") AS k FROM "plan_version_empresa"`)).toEqual(
      Object.keys(VERSION).sort(),
    );
    expect(await lista(`SELECT e.enumlabel AS k FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                         JOIN pg_namespace n ON n.oid = t.typnamespace
                         WHERE n.nspname = 'public' AND t.typname = 'job_tipo' AND e.enumlabel = 'plan_niveles_cerrar'`)).toEqual([]);
    // El CHECK de pasos vuelve a sus siete pasos.
    expect(
      await intento(`UPDATE "plan_borrador" SET "pasos" = "pasos" || '{"niveles": {"niveles": []}}'::jsonb WHERE "id" = $1`, [
        ids.borrador,
      ]),
    ).toBe("23514 plan_borrador_pasos_conocidos");
  });

  it("subir otra vez da el mismo esquema que la primera", async () => {
    await ejecutar(db, sqlDe(M_ENUM, "migration.sql"), M_ENUM);
    await ejecutar(db, sqlDe(M, "migration.sql"), M);

    expect(diferencias(await fotoCompleta(false), despues)).toEqual([]);
  });
});
