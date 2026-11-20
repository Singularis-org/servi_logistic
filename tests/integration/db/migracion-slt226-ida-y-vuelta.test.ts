import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
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
 * SLT-226 (T7.1; R28, design §3.10) — las dos migraciones del cobro en línea, de ida y vuelta, contra Postgres.
 * Molde: `migracion-slt143-ida-y-vuelta.test.ts`.
 *
 * - Aplicadas con un pago ya confirmado, no crean datos: la confirmación sigue igual, con `en_linea = false` y su
 *   `confirmado_por` (R28).
 * - El `down.sql` de 20261124140100 aborta si hay un intento, sin tocar nada. Sin intentos, los dos `down.sql` (en
 *   orden inverso) dejan el esquema como antes, y el tope y `_pago_plataforma_aplicar` de 7 argumentos vuelven a ser
 *   los de antes (`pg_get_functiondef`).
 * - Reaplicadas, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `slt226_`): el down reescribe el tope de los pagos a la plataforma y recrea dos enums del
 * historial; en la base compartida cambiaría lo que miden los archivos que corren a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La mayor de `dev` antes de SLT-226 (T0.1; la de SLT-247 desde la segunda sincronización con `dev`). */
const PREVIA = "20261124130000_orden_historial_origen_retorno_rechazo_cierre";
const ENUM = "20261124140000_cobro_historial_enum";
const M = "20261124140100_cobro_intento";

const TABLAS = ["cobro_intento", "cobro_webhook_evento"];
const FUNCIONES_NUEVAS = [
  "_cobro_aprobar",
  "_cobro_historial",
  "_cobro_intento_pasar",
  "cobro_evento_cerrar",
  "cobro_evento_registrar",
  "cobro_intento_anular_por_saldo",
  "cobro_intento_avanzar",
  "cobro_intento_obtener_o_crear",
  "cobro_intento_registrar_enlace",
  "cobro_intento_solo_avanza",
  "cobro_marcar_pagado_manual",
  "cobro_registrar_pago_aprobado",
  "cobro_webhook_evento_inmutable",
];
/** Las anteriores que 20261124140100 reescribe y su down repone, por su firma (la sobrecarga de 8 es nueva). */
const FUNCIONES_CAMBIADAS = [
  "_pago_plataforma_aplicar(p_org text, p_pago_id text, p_monto numeric, p_aplicaciones jsonb, p_por text, p_ahora timestamp without time zone, p_por_fuera boolean)",
  "wallet_movimiento_tope_pago_plataforma()",
];

const BASE = `slt226_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-226 T7.1 — las migraciones en disco", () => {
  it("traen su down.sql y van detrás de la mayor de dev, el enum primero", () => {
    const carpetas = carpetasDeMigracion();
    const previa = carpetas.indexOf(PREVIA);
    const delEnum = carpetas.indexOf(ENUM);
    const propia = carpetas.indexOf(M);
    expect(previa, "falta la previa").toBeGreaterThanOrEqual(0);
    expect(delEnum, "falta la del enum").toBeGreaterThan(previa);
    expect(propia, "falta la del modelo").toBeGreaterThan(delEnum);
    for (const c of [ENUM, M]) expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
  });

  it("R28: no insertan ni cambian datos", () => {
    // Los únicos INSERT/UPDATE de los archivos están dentro de las funciones (cuerpos `$$ … $$`).
    for (const c of [ENUM, M]) {
      const fueraDeCuerpos = sqlDe(c, "migration.sql").replace(/\$\$[\s\S]*?\$\$/g, "");
      expect(fueraDeCuerpos, c).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(fueraDeCuerpos, c).not.toMatch(/\bUPDATE\s+"/i);
      expect(fueraDeCuerpos, c).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let filasAntes: Set<string>;
let definicionesPrevias: Record<string, string>;
let organizacionId: string;
let pagoConfirmado: string;
let confirmadoPor: string;

// Lo que estas migraciones mueven y la foto base no mira: funciones (con su definición), triggers, políticas, RLS y
// privilegios de `servi_app` (molde de SLT-143).
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  politicas: `SELECT tablename || '.' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
      coalesce(qual, '') || ' | ' || coalesce(with_check, '') AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
  ejecutables: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || coalesce(array_to_string(p.proacl, ','), '') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
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

async function filas(): Promise<Set<string>> {
  return (await foto(db)).filas;
}

/** `pg_get_functiondef` de las funciones cambiadas, por su firma. */
async function definiciones(): Promise<Record<string, string>> {
  const { rows } = await db.query(
    `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS n, pg_get_functiondef(p.oid) AS d
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('_pago_plataforma_aplicar', 'wallet_movimiento_tope_pago_plataforma')`,
  );
  return Object.fromEntries(rows.map((r) => [String(r.n), String(r.d)]));
}

async function nombresDe(consulta: string, nombres: string[]): Promise<string[]> {
  const { rows } = await db.query(consulta, [nombres]);
  return [...new Set(rows.map((r) => String(r.n)))].sort();
}

const funcionesNuevas = () =>
  nombresDe(
    `SELECT p.proname AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    FUNCIONES_NUEVAS,
  );
const tablasNuevas = () =>
  nombresDe(
    `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
    TABLAS,
  );
const valoresDelHistorial = () =>
  nombresDe(
    `SELECT e.enumlabel AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace ns ON ns.oid = t.typnamespace
      WHERE ns.nspname = 'public' AND t.typname IN ('historial_plataforma_accion', 'historial_plataforma_entidad') AND e.enumlabel = ANY($1::text[])`,
    ["cobro_intento_transicion", "cobro_intento"],
  );

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const { rows } = await db.query(sql, valores);
  return Number(rows[0].n);
}

async function confirmacion(): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query(
    `SELECT "pago_id", "confirmado_por", "por_fuera" FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1`,
    [organizacionId],
  );
  return rows;
}

/**
 * Un pago ya confirmado antes de SLT-226 (molde de SLT-143). Lo que se mide es la migración, no el tope ni las FK
 * de la confirmación (sin usuarios ni facturas en esta base): se escriben como dueño con los triggers apagados en
 * esta sesión.
 */
async function sembrar(): Promise<void> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  organizacionId = randomUUID();
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    organizacionId,
    `SLT226 ida y vuelta ${sufijo}`,
    `slt226-iv-${sufijo}`,
  ]);
  pagoConfirmado = randomUUID();
  confirmadoPor = randomUUID();
  await db.query(`SET session_replication_role = replica`);
  try {
    await db.query(
      `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id")
       VALUES ($1, 'egreso', 'egreso_pago_plataforma', 500.00, 'gasto', 'Pago SLT226', $2)`,
      [pagoConfirmado, organizacionId],
    );
    await db.query(
      `INSERT INTO "pago_plataforma_confirmacion" ("id", "organizacion_id", "pago_id", "confirmado_por", "confirmado_at")
       VALUES ($1, $2, $3, $4, now() AT TIME ZONE 'UTC')`,
      [randomUUID(), organizacionId, pagoConfirmado, confirmadoPor],
    );
  } finally {
    await db.query(`SET session_replication_role = origin`);
  }
}

async function subir(etiqueta = ""): Promise<void> {
  await ejecutar(db, sqlDe(ENUM, "migration.sql"), `${ENUM}${etiqueta}`);
  await ejecutar(db, sqlDe(M, "migration.sql"), `${M}${etiqueta}`);
}

async function bajar(): Promise<void> {
  // En orden inverso: el modelo primero, después los valores del enum (design §3.10).
  await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
  await ejecutar(db, sqlDe(ENUM, "down.sql"), `${ENUM}/down.sql`);
}

describeSiHayBase("SLT-226 R28 — cobro_historial_enum y cobro_intento de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    // Apaga el autovacuum antes de cada migración, no al acabar: el 40P01 de SL-17 (ver el helper).
    await aplicarMigracionesHasta(db, ENUM);
    await sembrar();

    antes = await fotoCompleta();
    filasAntes = await filas();
    definicionesPrevias = await definiciones();
    // Sin esto el ciclo sería verde con una migración vacía o mal leída.
    expect(Object.keys(definicionesPrevias).sort()).toEqual([...FUNCIONES_CAMBIADAS].sort());
    expect(await tablasNuevas()).toEqual([]);
    expect(await funcionesNuevas()).toEqual([]);
    expect(await valoresDelHistorial()).toEqual([]);

    await subir();
    con = await fotoCompleta();
    expect(await tablasNuevas()).toEqual(TABLAS);
    expect(await funcionesNuevas()).toEqual(FUNCIONES_NUEVAS);
    expect(await valoresDelHistorial()).toEqual(["cobro_intento", "cobro_intento_transicion"]);
    const reescritas = await definiciones();
    for (const firma of FUNCIONES_CAMBIADAS) {
      expect(reescritas[firma], `${firma} no se reescribió`).not.toBe(definicionesPrevias[firma]);
    }
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R28: no crean datos: las tablas que había tienen las mismas filas y las dos nuevas nacen vacías", async () => {
    const nuevas = new Set(TABLAS.map((t) => `${t} = 0`));
    const despues = await filas();
    expect([...despues].filter((l) => !nuevas.has(l)).sort()).toEqual([...filasAntes].sort());
    for (const l of nuevas) expect(despues.has(l), l).toBe(true);
  });

  it("R28: la confirmación que ya existía sigue igual, sin la marca de pago en línea y con su persona", async () => {
    const { rows } = await db.query(
      `SELECT "pago_id", "confirmado_por", "por_fuera", "en_linea" FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1`,
      [organizacionId],
    );
    expect(rows).toEqual([{ pago_id: pagoConfirmado, confirmado_por: confirmadoPor, por_fuera: false, en_linea: false }]);
    expect(await contar(`SELECT count(*)::int AS n FROM pago_plataforma_por_confirmar($1)`, [organizacionId])).toBe(0);
  });

  it("R28: el down.sql aborta sin tocar nada si hay un intento", async () => {
    await db.query(`SET session_replication_role = replica`);
    try {
      await db.query(
        `INSERT INTO "cobro_intento"
           ("id", "organizacion_id", "factura_id", "proveedor", "metodo", "clave", "monto_local", "moneda_local",
            "moneda_cobro", "monto_cobrado", "estado", "created_at", "estado_at")
         VALUES ($1, $2, $3, 'rebill', 'tarjeta', 'iv', 100.00, 'CRC', 'CRC', 100.00, 'creado', now() AT TIME ZONE 'UTC',
                 now() AT TIME ZONE 'UTC')`,
        [randomUUID(), organizacionId, randomUUID()],
      );
    } finally {
      await db.query(`SET session_replication_role = origin`);
    }

    const error = await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect((error as ErrorDeScript).message).toMatch(/rollback SLT-226: 1 filas en cobro_intento/);
    expect(diferencias(await fotoCompleta(), con), "el down abortado cambió algo").toEqual([]);
    expect(await contar(`SELECT count(*)::int AS n FROM "cobro_intento"`)).toBe(1);

    await db.query(`DELETE FROM "cobro_intento" WHERE "organizacion_id" = $1`, [organizacionId]);
  }, 120_000);

  it("R28: sin intentos, los dos down.sql dejan el esquema como antes y reponen el tope y `_pago_plataforma_aplicar`", async () => {
    await bajar();

    expect(diferencias(await fotoCompleta(), antes), "tras el down").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await tablasNuevas()).toEqual([]);
    expect(await funcionesNuevas()).toEqual([]);
    expect(await valoresDelHistorial()).toEqual([]);
    expect(await definiciones()).toEqual(definicionesPrevias);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'pago_plataforma_confirmacion' AND column_name = 'en_linea'`,
      ),
    ).toBe(0);
    expect(await confirmacion()).toEqual([{ pago_id: pagoConfirmado, confirmado_por: confirmadoPor, por_fuera: false }]);
    expect([...(await filas())].sort()).toEqual([...filasAntes].sort());
  }, 300_000);

  it("reaplicadas, todo vuelve igual que la primera vez", async () => {
    await subir(" (otra vez)");
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(await contar(`SELECT count(*)::int AS n FROM "cobro_intento"`)).toBe(0);
  }, 120_000);
});
