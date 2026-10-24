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
 * SL-40 (R29) — las cuatro migraciones del cobro de la plataforma, de ida y vuelta, contra Postgres.
 *
 * - Con las cuatro, crear y anular una orden deja su cargo y su reverso.
 * - Los cuatro `down.sql`, en orden inverso, dejan el esquema como antes de SL-40: columnas,
 *   constraints, índices, tipos, y además funciones, triggers y políticas, que la foto del fixture
 *   de SL-32 no mira y que estas migraciones sí crean. Crear y anular otra orden sigue funcionando.
 * - Reaplicadas, todo vuelve igual que la primera vez y el trigger vuelve a cobrar.
 *
 * BASE PROPIA (prefijo `sl40_`), construida aplicando las migraciones anteriores, como en
 * `migracion-sl32-ida-y-vuelta.test.ts`. El down de la 2.ª borra la tabla de cargos, y en la base
 * compartida se llevaría los de otros archivos que corren a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PREVIA = "20261023100200_usuario_empresa_o_superadmin";
const M_TARIFA = "20261023130000_cobro_plataforma_tarifa";
const M_MOVIMIENTO = "20261023130100_cobro_plataforma_movimiento";
const M_TRIGGERS = "20261023130200_cobro_plataforma_triggers_orden";
/** La de la review (B1, B2): sin DELETE de `orden` para `servi_app`, y cargo aunque la orden nazca borrada. */
const M_BLINDAJE = "20261024120000_cobro_plataforma_blindaje_orden";
const DE_SL40 = [M_TARIFA, M_MOVIMIENTO, M_TRIGGERS, M_BLINDAJE];

const BASE = `sl40_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SL-40 R29 — las cuatro migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SL40].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SL40) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
/** La empresa, la tienda y la zona de las órdenes de este archivo. */
let fks: { organizacionId: string; tiendaId: string; zonaId: string; estatusId: string; provinciaId: string; cantonId: string };

/** Lo que la foto del fixture no mira y estas migraciones sí crean, más el resto sin las filas. */
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

/** La foto sin las filas (las órdenes que crea el test las mueven) y con lo de `CONSULTAS_EXTRA`. */
async function fotoCompleta(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

async function sembrar(): Promise<typeof fks> {
  const uno = async (sql: string, valores: unknown[] = []) => {
    const { rows } = await db.query(sql, valores);
    if (rows.length !== 1) throw new Error(`la siembra esperaba una fila: ${sql.slice(0, 80)}`);
    return String(rows[0].id);
  };
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const organizacionId = await uno(
    `INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id"`,
    [randomUUID(), `SL40 ida y vuelta ${sufijo}`, `prueba-${sufijo}`],
  );
  const tiendaId = await uno(
    `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
       "rol_id", "estado", "updated_at", "organizacion_id")
     SELECT $1, 'Tienda SL40', $2, '88880000', 'x', $3, t."id", r."id", 'activo', now(), $4
       FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
    [randomUUID(), `sl40-iv-${sufijo}@example.com`, `sl40-iv-${sufijo}`, organizacionId],
  );
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
    [randomUUID(), `Zona SL40 ${sufijo}`, organizacionId],
  );
  const estatusId = await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`);
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  return { organizacionId, tiendaId, zonaId, estatusId, cantonId: String(rows[0].canton), provinciaId: String(rows[0].provincia) };
}

/** Crea una orden como dueño, con la empresa explícita, y la anula. Devuelve su id. */
async function crearYAnular(): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id")
     VALUES ($1, $2, $3, 'SL40', '88887777', $4, $5, $6, $7, 'Caja', now(), $8)`,
    [id, `SL40-IV-${id.slice(0, 8)}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, fks.organizacionId],
  );
  await db.query(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = $1`, [id]);
  const { rows } = await db.query(`SELECT "deleted_at" FROM "orden" WHERE "id" = $1`, [id]);
  expect(rows[0]?.deleted_at, "la orden no quedo anulada").not.toBeNull();
  return id;
}

async function movimientosDe(ordenId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT "tipo"::text || ' ' || "monto"::text || ' ' || "fuente"::text AS l FROM "cobro_plataforma_movimiento"
      WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    [ordenId],
  );
  return rows.map((r) => String(r.l));
}

async function existe(consulta: string): Promise<boolean> {
  const { rows } = await db.query(consulta);
  return rows.length > 0;
}

describeSiHayBase("SL-40 R29 — cobro_plataforma de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    for (const carpeta of carpetasDeMigracion()) {
      if (carpeta >= M_TARIFA) break;
      await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    }
    // Mismo motivo que en SL-17 y SL-32: el autovacuum de la base recién llenada pide locks que chocan
    // con los ALTER de las migraciones (40P01 medido allí).
    const { rows: tablas } = await db.query(
      `SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    for (const { t } of tablas) await db.query(`ALTER TABLE ${String(t)} SET (autovacuum_enabled = false)`);
    fks = await sembrar();

    antes = await fotoCompleta();
    for (const carpeta of DE_SL40) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoCompleta();
    // Sin esto el ciclo sería verde con migraciones vacías o mal leídas.
    expect(await existe(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND t.tgname = 'cobro_plataforma_al_crear_orden'`), "la 3.ª no creo el trigger").toBe(true);
    expect(diferencias(con, antes).length, "las cuatro migraciones no cambiaron nada").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("con las cuatro, crear y anular una orden deja su cargo (sin configurar) y su reverso", async () => {
    const id = await crearYAnular();
    expect(await movimientosDe(id)).toEqual(["cargo 0.00 sin_configurar", "reverso 0.00 sin_configurar"]);
  });

  it("los cuatro down.sql, en orden inverso, dejan el esquema como antes de SL-40, y crear y anular sigue funcionando", async () => {
    for (const carpeta of [...DE_SL40].reverse()) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);

    expect(diferencias(await fotoCompleta(), antes), "tras los cuatro downs").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await existe(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'cobro_plataforma%'`)).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND t.tgname LIKE '%cobro_plataforma%'`)).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname LIKE 'cobro_plataforma%'`)).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname LIKE 'cobro_plataforma%'`)).toBe(false);
    expect(
      await existe(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizacion' AND column_name = 'cobro_plataforma_por_orden'`,
      ),
    ).toBe(false);

    await crearYAnular();
  }, 120_000);

  it("reaplicadas las cuatro, todo vuelve igual que la primera vez y el trigger vuelve a cobrar", async () => {
    for (const carpeta of DE_SL40) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);

    await db.query(`INSERT INTO "cobro_plataforma_tarifa" ("monto") VALUES (250.00)`);
    const id = await crearYAnular();
    expect(await movimientosDe(id)).toEqual(["cargo 250.00 global", "reverso 250.00 global"]);
  }, 120_000);
});
