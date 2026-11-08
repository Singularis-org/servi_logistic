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
 * SLT-94 (T1.5; R2, R34, R35) — las cuatro migraciones del cobro de fulfillment, de ida y vuelta,
 * contra Postgres. Molde: `migracion-sl40-ida-y-vuelta.test.ts`.
 *
 * - M2 deja la marca = NOT fulfillment en cada usuario sin cambiar ninguna otra columna (R2).
 * - Con las cuatro, una orden nueva se cobra y al eliminarla se devuelve; una orden ANTERIOR no tiene
 *   cobro y eliminarla no escribe nada (R34, R28).
 * - Los cuatro `down.sql`, en orden inverso, dejan el esquema como antes; el de M3 borra SOLO las filas
 *   de los libros con origen `orden_fulfillment` (una fila manual de cada libro sobrevive) y el de M2
 *   devuelve a la columna vieja el cambio hecho en la nueva (R35).
 * - Reaplicadas, todo vuelve igual que la primera vez y el trigger vuelve a cobrar.
 *
 * BASE PROPIA (prefijo `slt94_`), construida aplicando las migraciones anteriores: el down de M3 borra
 * filas de los libros, y en una base compartida se llevaría las de otros archivos.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PREVIA = "20261107130100_organizacion_tope_intentos";
const M1 = "20261108120000_slt94_fulfillment_enums";
const M2 = "20261108120100_slt94_se_recoge_en_tienda";
const M3 = "20261108120200_slt94_fulfillment_movimiento";
const M4 = "20261108120300_slt94_fulfillment_triggers";
const DE_SLT94 = [M1, M2, M3, M4];

const BASE = `slt94_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-94 T1.5 — las cuatro migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SLT94].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SLT94) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let fks: {
  organizacionId: string;
  tiendaId: string;
  tiendaBodegaId: string;
  zonaId: string;
  estatusId: string;
  provinciaId: string;
  cantonId: string;
  ordenAnterior: string;
};
/** Las filas de `usuario` (todas las columnas que ya existían) antes de M2. */
let usuariosAntes: string[];

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

async function fotoCompleta(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resto[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resto;
}

/** Cada usuario como texto con TODAS sus columnas salvo la marca nueva (R2: nada más cambia). */
async function usuariosSinMarca(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT (to_jsonb(u) - 'se_recoge_en_tienda')::text AS l FROM "usuario" u ORDER BY u."id"`,
  );
  return rows.map((r) => String(r.l));
}

async function uno(sql: string, valores: unknown[] = []): Promise<string> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`la siembra esperaba una fila: ${sql.slice(0, 80)}`);
  return String(rows[0].id);
}

async function insertarOrden(): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
       "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id")
     VALUES ($1, $2, $3, 'SLT94', '88887777', $4, $5, $6, $7, 'Caja', now(), $8)`,
    [id, `SLT94-IV-${id.slice(0, 8)}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.provinciaId, fks.cantonId, fks.organizacionId],
  );
  return id;
}

async function sembrar(): Promise<typeof fks> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const organizacionId = await uno(
    `INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3) RETURNING "id"`,
    [randomUUID(), `SLT94 ida y vuelta ${sufijo}`, `slt94-iv-${sufijo}`],
  );
  const tienda = (n: string, fulfillment: boolean) =>
    uno(
      `INSERT INTO "usuario" ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id",
         "rol_id", "estado", "updated_at", "organizacion_id", "fulfillment")
       SELECT $1, $2, $3, '88880000', 'x', $4, t."id", r."id", 'activo', now(), $5, $6
         FROM "tipo_identificacion" t, "rol" r WHERE t."value" = 'cedula' AND r."value" = 'Admin Tienda' RETURNING "id"`,
      [randomUUID(), `Tienda SLT94 ${n}`, `slt94-iv-${n}-${sufijo}@example.com`, `slt94-iv-${n}-${sufijo}`, organizacionId, fulfillment],
    );
  const tiendaId = await tienda("a", false);
  const tiendaBodegaId = await tienda("b", true);
  const zonaId = await uno(
    `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
     VALUES ($1, $2, '80000000', 'Titular de Prueba', $3) RETURNING "id"`,
    [randomUUID(), `Zona SLT94 ${sufijo}`, organizacionId],
  );
  const estatusId = await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`);
  const { rows } = await db.query(
    `SELECT c."id" AS canton, c."provincia_id" AS provincia FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  // La empresa ya calculaba con el modelo nuevo y la tienda ya tenía fulfillment antes del despliegue.
  await db.query(`INSERT INTO "tarifa_activacion" ("id", "organizacion_id") VALUES ($1, $2)`, [randomUUID(), organizacionId]);
  await db.query(
    `INSERT INTO "tarifa_valor" ("id", "organizacion_id", "concepto", "modo", "valor", "iva_pct", "tienda_id")
     VALUES ($1, $2, 'tienda_fulfillment', 'monto', 1000.00, 13.00, $3)`,
    [randomUUID(), organizacionId, tiendaId],
  );
  // Una fila MANUAL en cada libro: el down de M3 no debe tocarlas.
  await db.query(
    `INSERT INTO "wallet_movimiento" ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "descripcion")
     VALUES ($1, $2, 'ingreso', 'ingreso_ajuste', 10.00, 'manual', 'SLT94 control')`,
    [randomUUID(), organizacionId],
  );
  await db.query(
    `INSERT INTO "wallet_tienda_movimiento" ("id", "organizacion_id", "tienda_id", "tipo", "categoria", "monto", "origen_tipo", "descripcion")
     VALUES ($1, $2, $3, 'credito', 'ajuste_credito', 10.00, 'manual', 'SLT94 control')`,
    [randomUUID(), organizacionId, tiendaId],
  );
  const base = {
    organizacionId,
    tiendaId,
    tiendaBodegaId,
    zonaId,
    estatusId,
    cantonId: String(rows[0].canton),
    provinciaId: String(rows[0].provincia),
    ordenAnterior: "",
  };
  return base;
}

async function existe(consulta: string): Promise<boolean> {
  const { rows } = await db.query(consulta);
  return rows.length > 0;
}

async function movimientosDe(ordenId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT "secuencia"::text || ' ' || "tipo"::text || ' ' || "causa"::text || ' ' || "monto"::text || ' ' || "iva"::text AS l
       FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    [ordenId],
  );
  return rows.map((r) => String(r.l));
}

async function filasDeLibros(): Promise<{ manual: number; fulfillment: number }> {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM "wallet_movimiento" WHERE "origen_tipo"::text = 'manual')
          + (SELECT count(*) FROM "wallet_tienda_movimiento" WHERE "origen_tipo"::text = 'manual') AS manual,
            (SELECT count(*) FROM "wallet_movimiento" WHERE "origen_tipo"::text = 'orden_fulfillment')
          + (SELECT count(*) FROM "wallet_tienda_movimiento" WHERE "origen_tipo"::text = 'orden_fulfillment') AS fulfillment`,
  );
  return { manual: Number(rows[0].manual), fulfillment: Number(rows[0].fulfillment) };
}

describeSiHayBase("SLT-94 T1.5 — cobro de fulfillment de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M1);
    fks = await sembrar();
    // R34: una orden creada ANTES del despliegue, de una tienda con valor y empresa activada.
    fks.ordenAnterior = await insertarOrden();

    antes = await fotoCompleta();
    usuariosAntes = await usuariosSinMarca();
    for (const carpeta of DE_SLT94) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoCompleta();
    expect(
      await existe(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND t.tgname = 'fulfillment_al_crear_orden'`),
      "M4 no creo el trigger",
    ).toBe(true);
    expect(diferencias(con, antes).length, "las cuatro migraciones no cambiaron nada").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R2: M2 deja la marca = NOT fulfillment en cada usuario, sin cambiar ninguna otra columna", async () => {
    const { rows } = await db.query(
      `SELECT "id", "fulfillment", "se_recoge_en_tienda" FROM "usuario" WHERE "id" = ANY($1::text[]) ORDER BY "fulfillment"`,
      [[fks.tiendaId, fks.tiendaBodegaId]],
    );
    expect(rows.map((r) => [r.id, r.fulfillment, r.se_recoge_en_tienda])).toEqual([
      [fks.tiendaId, false, true],
      [fks.tiendaBodegaId, true, false],
    ]);
    const { rows: malos } = await db.query(`SELECT count(*)::int AS n FROM "usuario" WHERE "se_recoge_en_tienda" = "fulfillment"`);
    expect(malos[0].n).toBe(0);
    expect(await usuariosSinMarca()).toEqual(usuariosAntes);
  });

  it("R34/R28: la orden anterior no tiene cobro y eliminarla no escribe nada; una nueva se cobra y al eliminarla se devuelve", async () => {
    expect(await movimientosDe(fks.ordenAnterior)).toEqual([]);
    await db.query(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = $1`, [fks.ordenAnterior]);
    expect(await movimientosDe(fks.ordenAnterior)).toEqual([]);

    const id = await insertarOrden();
    await db.query(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = $1`, [id]);
    expect(await movimientosDe(id)).toEqual(["1 cargo creacion 1000.00 130.00", "2 reverso eliminacion 1000.00 130.00"]);
    expect(await filasDeLibros()).toEqual({ manual: 2, fulfillment: 8 });
  });

  it("R35: los cuatro down.sql, en orden inverso, dejan el esquema como antes; M3 borra solo lo suyo y M2 conserva el cambio de la marca", async () => {
    // Un cambio hecho a la marca nueva DESPUÉS de migrar: la tienda «a» pasa a «no se recoge».
    await db.query(`UPDATE "usuario" SET "se_recoge_en_tienda" = false WHERE "id" = $1`, [fks.tiendaId]);

    await ejecutar(db, sqlDe(M4, "down.sql"), `${M4}/down.sql`);
    await ejecutar(db, sqlDe(M3, "down.sql"), `${M3}/down.sql`);
    expect(await filasDeLibros()).toEqual({ manual: 2, fulfillment: 0 });
    await ejecutar(db, sqlDe(M2, "down.sql"), `${M2}/down.sql`);
    const { rows } = await db.query(
      `SELECT "id", "fulfillment" FROM "usuario" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
      [[fks.tiendaId, fks.tiendaBodegaId]],
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.fulfillment]))).toEqual({
      [fks.tiendaId]: true, // el cambio hecho a la nueva volvió a la vieja
      [fks.tiendaBodegaId]: true,
    });
    await ejecutar(db, sqlDe(M1, "down.sql"), `${M1}/down.sql`);

    // La tienda «a» quedó con fulfillment = true por el cambio de arriba (R35): se devuelve a su valor de
    // la siembra para comparar la foto (que no mira filas) sin ruido.
    await db.query(`UPDATE "usuario" SET "fulfillment" = false WHERE "id" = $1`, [fks.tiendaId]);
    expect(diferencias(await fotoCompleta(), antes), "tras los cuatro downs").toEqual([]);
    expect(
      await existe(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'fulfillment_%'`),
    ).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_enum WHERE enumlabel IN ('orden_fulfillment', 'ingreso_fulfillment', 'fulfillment_anulado', 'usuario_se_recoge_en_tienda_cambiado')`)).toBe(false);
    expect(await existe(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname LIKE 'orden_fulfillment%'`)).toBe(false);

    // Sin las migraciones, crear y eliminar sigue funcionando.
    const id = await insertarOrden();
    await db.query(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = $1`, [id]);
  }, 180_000);

  it("reaplicadas las cuatro, todo vuelve igual que la primera vez y el trigger vuelve a cobrar", async () => {
    for (const carpeta of DE_SLT94) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    const id = await insertarOrden();
    expect(await movimientosDe(id)).toEqual(["1 cargo creacion 1000.00 130.00"]);
  }, 180_000);
});
