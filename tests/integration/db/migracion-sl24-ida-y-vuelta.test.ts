import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  MIGRACIONES,
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
 * SL-24 / T9 y T10 (design §10, §16.6; R14, R31) — las cinco migraciones de planes, de ida y vuelta.
 *
 * 1. Se aplican sobre una base con todo lo anterior y dos empresas previas, una con su tienda y su
 *    zona para crear órdenes.
 * 2. R14: ninguna empresa previa queda con plan ni con ancla.
 * 3. R31: tablas, columnas, tipos y valores, funciones y triggers nuevos con los nombres del design,
 *    en español, leídos de `information_schema`, `pg_enum`, `pg_proc` y `pg_trigger`. Escritos a
 *    mano: compararlos con el catálogo contra sí mismo no probaría nada.
 * 4. Un plan con tope 1 asignado a A: la primera orden entra y la segunda da `SL024`.
 * 5. Los cinco `down.sql`, en orden inverso, dejan el esquema como antes (con funciones, triggers,
 *    políticas, RLS y grants, que la foto del fixture de SL-32 no mira). Borran el rastro que nombra
 *    los valores que quitan y no tocan el resto. Después, dos órdenes seguidas entran sin error.
 * 6. Reaplicadas, todo vuelve igual que la primera vez y el tope vuelve a frenar.
 *
 * BASE PROPIA (`sl24_iv_<rand>`), como SL-23, SL-40 y SL-45: los down recrean `job_tipo`,
 * `historial_accion_tipo` y `historial_accion_entidad`, y en la base compartida chocarían con los
 * archivos que escriben en esas tablas. La base de `DATABASE_URL` no se toca.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SL-24 (T0). */
const PREVIA = "20261027120000_modulos_nucleo";
const M_PLAN = "20261027130000_plan";
const M_HISTORIAL = "20261027130100_historial_accion_planes";
const M_TRIGGERS = "20261027130200_plan_topes_triggers";
const M_CAMBIO = "20261028120000_plan_cambio_programado";
const M_ENUMS = "20261028120100_plan_cambio_enums";
const DE_SL24 = [M_PLAN, M_HISTORIAL, M_TRIGGERS, M_CAMBIO, M_ENUMS];

const BASE = `sl24_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** Los cuatro trabajos de §16.3 y §16.4, en el orden en que los añade la migración. */
const JOBS_DEL_CAMBIO = ["plan_aplicar_cambio", "plan_recordatorio_cambio", "plan_aviso_correo", "plan_cambios_vencidos"];

// Lo que la foto del fixture de SL-32 no mira y estas migraciones sí mueven.
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'`,
  politicas: `SELECT concat_ws(' | ', tablename || '.' || policyname, permissive, roles::text, cmd, qual, with_check) AS l
    FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' rls=' || c.relrowsecurity AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
  ejecucion: `SELECT routine_name || ' ' || privilege_type AS l FROM information_schema.role_routine_grants
    WHERE grantee = 'servi_app' AND specific_schema = 'public'`,
};

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let empresaA: string;
let empresaB: string;
/** Lo que hace falta para crear una orden de A como dueño. */
let fks: { tiendaId: string; zonaId: string; estatusId: string; provinciaId: string; cantonId: string };

/** La foto sin las filas (las órdenes y los planes del test las mueven) y con `CONSULTAS_EXTRA`. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function lista(sql: string, valores: unknown[] = []): Promise<string[]> {
  const { rows } = await db.query(sql, valores);
  return rows.map((r) => String(r.l)).sort();
}

async function etiquetas(tipo: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = $1 AND n.nspname = 'public' ORDER BY e.enumsortorder`,
    [tipo],
  );
  return rows.map((r) => String(r.l));
}

async function crearEmpresa(etiqueta: string): Promise<string> {
  const id = randomUUID();
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    id,
    `SL24 ${etiqueta}`,
    `sl24-iv-${etiqueta}-${id.slice(0, 8)}`,
  ]);
  return id;
}

async function uno(sql: string, valores: unknown[] = []): Promise<string> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`la siembra esperaba una fila: ${sql.slice(0, 80)}`);
  return String(rows[0].id);
}

/** La tienda y la zona de A, como en SL-40: lo mínimo que piden las FK de `orden`. */
async function sembrarParaOrdenes(organizacionId: string): Promise<typeof fks> {
  const s = randomUUID().replace(/-/g, "").slice(0, 12);
  const tiendaId = await uno(
    `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
       "rol_id", "estado", "updated_at", "organizacion_id")
     SELECT $1, 'Tienda SL24', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
       FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
    [randomUUID(), `sl24-iv-${s}@example.test`, `sl24-iv-${s}`, organizacionId],
  );
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
    [randomUUID(), `Zona SL24 ${s}`, organizacionId],
  );
  const estatusId = await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`);
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  return { tiendaId, zonaId, estatusId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };
}

/** Una orden viva de A, como dueño y con la empresa explícita. */
async function crearOrden(): Promise<void> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id", "created_at")
     VALUES ($1, $2, $3, 'SL24', '88887777', $4, $5, $6, $7, 'Caja', now(), $8, now() AT TIME ZONE 'UTC')`,
    [id, `SL24-IV-${id.slice(0, 8)}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, empresaA],
  );
}

/**
 * Un plan público con tope de órdenes `maximo`, asignado a A con el ancla una hora atrás: las
 * órdenes que el caso crea después caen en el ciclo aunque los relojes no casen al milisegundo.
 */
async function asignarPlanConTope(maximo: number): Promise<string> {
  const planId = randomUUID();
  await db.query(
    `INSERT INTO "plan" ("id", "nombre", "visibilidad", "tope_ordenes_ciclo") VALUES ($1, $2, 'publico', $3)`,
    [planId, `SL24 iv ${planId.slice(0, 8)}`, maximo],
  );
  await db.query(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
    [planId, empresaA],
  );
  return planId;
}

async function existe(consulta: string): Promise<boolean> {
  const { rows } = await db.query(consulta);
  return rows.length > 0;
}

describe("SL-24 — las cinco migraciones en disco", () => {
  it("cada una trae su down.sql y van en su orden, detrás de la última de dev", () => {
    // Detrás y en orden, no «seguidas»: una migración de otra rama mergeada antes puede ordenar en
    // medio sin que eso cambie lo que prueba este archivo.
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(PREVIA);
    expect(previa, `${PREVIA} no está en disco`).toBeGreaterThanOrEqual(0);
    const posiciones = DE_SL24.map((c) => carpetas.indexOf(c));
    for (const [i, c] of DE_SL24.entries()) {
      expect(posiciones[i], `${c} no está en disco`).toBeGreaterThan(previa);
      if (i > 0) expect(posiciones[i], `${c} va antes que ${DE_SL24[i - 1]}`).toBeGreaterThan(posiciones[i - 1]);
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

describeSiHayBase("SL-24 — planes, topes y cambio programado de ida y vuelta (R14, R31)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M_PLAN) break;
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17, SL-32, SL-40 y SL-45: el autovacuum de la base recién llenada pide
    // locks que chocan con los ALTER de las migraciones (40P01 medido allí).
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);

    // Las dos empresas que «existen al desplegar».
    empresaA = await crearEmpresa("a");
    empresaB = await crearEmpresa("b");
    fks = await sembrarParaOrdenes(empresaA);

    antes = await fotoSinFilas();
    for (const carpeta of DE_SL24) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoSinFilas();
    // Sin esto el ciclo sería verde con migraciones vacías o mal leídas.
    expect(
      await existe(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'orden' AND t.tgname = 'plan_tope_ordenes'`),
      "la 3.ª no creó el trigger de órdenes",
    ).toBe(true);
    expect(diferencias(con, antes).length, "las cinco migraciones no cambiaron nada").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R14 — ninguna empresa previa queda con plan ni con ancla, y no hay ningún plan", async () => {
    const { rows } = await db.query(
      `SELECT "id", "plan_id", "plan_ciclo_ancla_at" FROM "organizacion" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
      [[empresaA, empresaB]],
    );
    expect(rows).toHaveLength(2);
    for (const fila of rows) expect(fila, String(fila.id)).toMatchObject({ plan_id: null, plan_ciclo_ancla_at: null });
    const { rows: conPlan } = await db.query(`SELECT count(*)::int AS n FROM "organizacion" WHERE "plan_id" IS NOT NULL`);
    expect(conPlan[0].n).toBe(0);
    const { rows: planes } = await db.query(`SELECT count(*)::int AS n FROM "plan"`);
    expect(planes[0].n).toBe(0);
  });

  it("R31 — tablas y columnas nuevas con los nombres del design, en español", async () => {
    expect(
      await lista(`SELECT table_name AS l FROM information_schema.tables
        WHERE table_schema = 'public' AND (table_name = 'plan' OR table_name LIKE 'plan\\_%')`),
    ).toEqual(["plan", "plan_cambio_programado", "plan_modulo", "plan_rastro", "plan_tope_rol"]);

    const columnas = (tabla: string) =>
      lista(
        `SELECT column_name || ' ' || udt_name || ' ' || is_nullable AS l FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [tabla],
      );
    expect(await columnas("plan")).toEqual([
      "archivado_at timestamp YES",
      "created_at timestamp NO",
      "descuento_anual_pct numeric YES",
      "id text NO",
      "nombre varchar NO",
      "organizacion_exclusiva_id text YES",
      "precio_anual numeric YES",
      "precio_mensual numeric YES",
      "precio_negociable bool NO",
      "tope_api_keys int4 YES",
      "tope_ordenes_ciclo int4 YES",
      "updated_at timestamp NO",
      "visibilidad plan_visibilidad NO",
    ]);
    expect(await columnas("plan_tope_rol")).toEqual(["maximo int4 NO", "plan_id text NO", "rol rol_value NO"]);
    expect(await columnas("plan_modulo")).toEqual(["modulo modulo_apagable NO", "plan_id text NO"]);
    expect(await columnas("plan_rastro")).toEqual([
      "accion plan_rastro_accion NO",
      "actor_nombre varchar NO",
      "actor_usuario_id text NO",
      "cambios jsonb NO",
      "created_at timestamp NO",
      "id text NO",
      "plan_id text NO",
      "plan_nombre varchar NO",
    ]);
    expect(await columnas("plan_cambio_programado")).toEqual([
      "actor_nombre varchar NO",
      "actor_usuario_id text NO",
      "avisos_al_programar jsonb NO",
      "created_at timestamp NO",
      "id text NO",
      "plan_id text NO",
      "version jsonb NO",
      "vigente_desde timestamp NO",
    ]);
    const anadidasEnOrganizacion = diferencias(con, antes).filter((d) => d.startsWith("sobra en columnas: organizacion."));
    expect(anadidasEnOrganizacion.map((d) => d.split(" | ")[0])).toEqual([
      "sobra en columnas: organizacion.plan_ciclo_ancla_at",
      "sobra en columnas: organizacion.plan_id",
    ]);
  });

  it("R31 — tipos, valores, funciones y triggers nuevos con los nombres del design, en español", async () => {
    expect(await etiquetas("plan_visibilidad")).toEqual(["publico", "custom"]);
    expect(await etiquetas("plan_rastro_accion")).toEqual([
      "creado",
      "editado",
      "archivado",
      "cambio_programado",
      "cambio_reemplazado",
      "cambio_cancelado",
      "cambio_aplicado",
    ]);
    expect((await etiquetas("historial_accion_tipo")).slice(-1)).toEqual(["plan_asignado"]);
    expect((await etiquetas("historial_accion_entidad")).slice(-1)).toEqual(["plan"]);
    expect((await etiquetas("job_tipo")).slice(-4)).toEqual(JOBS_DEL_CAMBIO);

    expect(
      await lista(`SELECT p.proname AS l FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'plan\\_%'`),
    ).toEqual([
      "plan_cupo_ordenes",
      "plan_inicio_ciclo",
      "plan_tope_api_key",
      "plan_tope_ordenes",
      "plan_tope_usuario",
      "plan_uso_api_keys",
      "plan_uso_ordenes",
      "plan_uso_rol",
    ]);
    expect(
      await lista(`SELECT c.relname || '.' || t.tgname AS l FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname LIKE 'plan\\_%'`),
    ).toEqual([
      "api_key.plan_tope_api_key_alta",
      "api_key.plan_tope_api_key_cambio",
      "orden.plan_tope_ordenes",
      "usuario.plan_tope_usuario_alta",
      "usuario.plan_tope_usuario_cambio",
    ]);
    expect(
      await lista(`SELECT indexname AS l FROM pg_indexes WHERE schemaname = 'public'
        AND ((tablename = 'plan' OR tablename LIKE 'plan\\_%') OR indexname = 'orden_organizacion_id_created_at_vivas_idx')`),
    ).toEqual([
      "orden_organizacion_id_created_at_vivas_idx",
      "plan_cambio_programado_pkey",
      "plan_cambio_programado_plan_id_key",
      "plan_modulo_pkey",
      "plan_pkey",
      "plan_rastro_pkey",
      "plan_rastro_plan_id_created_at_idx",
      "plan_tope_rol_pkey",
    ]);
  });

  it("R8 — las tablas de plataforma con RLS, sin políticas y sin ningún permiso para servi_app; solo el cupo es ejecutable", async () => {
    const PLATAFORMA = ["plan", "plan_cambio_programado", "plan_modulo", "plan_rastro", "plan_tope_rol"];
    const anadido = diferencias(con, antes);
    for (const tabla of PLATAFORMA) expect(anadido, tabla).toContain(`sobra en rls: ${tabla} rls=true`);
    expect(
      await lista(`SELECT policyname AS l FROM pg_policies WHERE schemaname = 'public' AND (tablename = 'plan' OR tablename LIKE 'plan\\_%')`),
    ).toEqual([]);
    expect(
      await lista(`SELECT table_name AS l FROM information_schema.role_table_grants
        WHERE grantee = 'servi_app' AND table_schema = 'public' AND (table_name = 'plan' OR table_name LIKE 'plan\\_%')`),
    ).toEqual([]);
    expect(
      await lista(`SELECT routine_name AS l FROM information_schema.role_routine_grants
        WHERE grantee = 'servi_app' AND specific_schema = 'public' AND routine_name LIKE 'plan\\_%'`),
    ).toEqual(["plan_cupo_ordenes"]);
  });

  let rastroDePlan: string;
  let rastroAjeno: string;
  let rastroDelCambio: string;
  let rastroCreado: string;
  let jobDelCambio: string;
  let jobAjeno: string;

  it("con un plan de tope 1, la primera orden de A entra y la segunda da SL024; B, sin plan, no tiene límite", async () => {
    const planId = await asignarPlanConTope(1);
    await crearOrden();
    await expect(crearOrden()).rejects.toMatchObject({ code: "SL024" });
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "orden" WHERE "organizacion_id" = $1 AND "deleted_at" IS NULL`,
      [empresaA],
    );
    expect(rows[0].n, "la segunda orden quedó escrita").toBe(1);

    // El rastro que los down tienen que borrar (lo que nombra los valores que quitan) y el que no.
    const historial = async (accion: string, entidad: string): Promise<string> => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
                                         "valor_nuevo", "lote_id", "organizacion_id")
         VALUES ($1, $2::historial_accion_tipo, $3::historial_accion_entidad, $4, 'SL24', NULL, $5, $6)`,
        [id, accion, entidad, planId, randomUUID(), empresaA],
      );
      return id;
    };
    rastroDePlan = await historial("plan_asignado", "plan");
    rastroAjeno = await historial("usuario_creado", "usuario");

    const rastro = async (accion: string): Promise<string> => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO "plan_rastro" ("id", "plan_id", "plan_nombre", "accion", "cambios", "actor_usuario_id", "actor_nombre")
         VALUES ($1, $2, 'SL24', $3::plan_rastro_accion, '{}'::jsonb, $4, 'Superadmin SL24')`,
        [id, planId, accion, randomUUID()],
      );
      return id;
    };
    rastroCreado = await rastro("creado");
    rastroDelCambio = await rastro("cambio_programado");

    await db.query(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, (now() AT TIME ZONE 'UTC') + interval '10 days', '{}'::jsonb, '[]'::jsonb, $3, 'Superadmin SL24')`,
      [randomUUID(), planId, randomUUID()],
    );

    const job = async (tipo: string, estado: string): Promise<string> => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO "jobs" ("id", "tipo", "estado", "max_intentos", "organizacion_id")
         VALUES ($1, $2::job_tipo, $3::job_estado, 3, $4)`,
        [id, tipo, estado, empresaA],
      );
      return id;
    };
    jobDelCambio = await job("plan_aplicar_cambio", "pending");
    const [primerTipo] = await etiquetas("job_tipo");
    jobAjeno = await job(primerTipo, "done");
  });

  it("los cinco down.sql en orden inverso dejan el esquema como antes; borran solo el rastro de SL-24, y dos órdenes seguidas entran", async () => {
    expect(rastroDePlan, "el caso necesita el rastro del caso anterior").toBeDefined();

    // El primero, solo: borra el rastro de los valores que quita y deja el resto, antes de que el
    // down de la tabla se lleve `plan_rastro` entera.
    await ejecutar(db, sqlDe(M_ENUMS, "down.sql"), `${M_ENUMS}/down.sql`);
    expect(
      await lista(`SELECT "id" AS l FROM "plan_rastro" WHERE "id" = ANY($1::text[])`, [[rastroCreado, rastroDelCambio]]),
    ).toEqual([rastroCreado]);
    expect(await lista(`SELECT "id" AS l FROM "jobs" WHERE "id" = ANY($1::text[])`, [[jobDelCambio, jobAjeno]])).toEqual([
      jobAjeno,
    ]);
    for (const carpeta of [M_CAMBIO, M_TRIGGERS, M_HISTORIAL, M_PLAN]) {
      await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
    }

    expect(diferencias(await fotoSinFilas(), antes), "tras los cinco downs").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await existe(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND (c.relname = 'plan' OR c.relname LIKE 'plan\\_%')`)).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'plan\\_%'`)).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND t.tgname LIKE 'plan_tope%'`)).toBe(false);
    expect(await etiquetas("plan_visibilidad")).toEqual([]);
    expect(await etiquetas("plan_rastro_accion")).toEqual([]);
    expect(await etiquetas("historial_accion_tipo")).not.toContain("plan_asignado");
    expect(await etiquetas("historial_accion_entidad")).not.toContain("plan");
    for (const tipo of JOBS_DEL_CAMBIO) expect(await etiquetas("job_tipo")).not.toContain(tipo);

    expect(
      await lista(`SELECT "id" AS l FROM "historial_accion" WHERE "id" = ANY($1::text[])`, [[rastroDePlan, rastroAjeno]]),
    ).toEqual([rastroAjeno]);
    expect(await lista(`SELECT "id" AS l FROM "jobs" WHERE "id" = ANY($1::text[])`, [[jobDelCambio, jobAjeno]])).toEqual([
      jobAjeno,
    ]);

    // Sin los triggers, A ya no tiene tope: dos órdenes seguidas entran.
    await crearOrden();
    await crearOrden();
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "orden" WHERE "organizacion_id" = $1 AND "deleted_at" IS NULL`,
      [empresaA],
    );
    expect(rows[0].n).toBe(3);
  }, 180_000);

  it("reaplicadas las cinco, el esquema vuelve igual que la primera vez y el tope vuelve a frenar", async () => {
    for (const carpeta of DE_SL24) {
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    }
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);

    // Con tope igual a las vivas que A ya tiene en el ciclo, la siguiente ya no entra.
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "orden" WHERE "organizacion_id" = $1 AND "deleted_at" IS NULL`,
      [empresaA],
    );
    const vivas = Number(rows[0].n);
    expect(vivas, "A sin órdenes: el tope no se podría alcanzar").toBeGreaterThan(0);
    await asignarPlanConTope(vivas);
    await expect(crearOrden()).rejects.toMatchObject({ code: "SL024" });
  }, 180_000);
});
