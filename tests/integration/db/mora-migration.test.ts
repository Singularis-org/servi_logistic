import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
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
import { empresa, intentar } from "./_fixtures/mora-121";
import { revertida } from "./_fixtures/planes";

/**
 * SLT-121 · T1.1, T1.2 (design §1, §8; R16 en la migración) — las dos migraciones de la mora.
 *
 *   · en disco: van juntas y después de la última de `dev` al abrir la ficha; la de enums va sola y su `down` es
 *     la función de SLT-136 byte a byte salvo el sufijo;
 *   · en la base de `DATABASE_URL` (ya migrada), en una transacción que se revierte: el CHECK de la gracia y que
 *     `servi_app` lee las columnas pero no las escribe;
 *   · de ida y vuelta, en una base PROPIA (`slt121_iv_<rand>`): el `down` de enums recrea `job_tipo` y
 *     `historial_accion_tipo`, y en la base compartida tomaría su lock bajo los demás archivos. Subir, ver que el
 *     `down` de enums aborta si hay uso, bajar, bajar otra vez (idempotente) y volver a subir.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_DEV = "20261123120100_zona_activa";
const M_ENUM = "20261126120000_mora_enums";
const M = "20261126120100_mora_congelamiento";
const BASE = `slt121_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const VALORES_HISTORIAL = [
  "empresa_congelada",
  "empresa_descongelada_por_pago",
  "empresa_descongelada_a_mano",
  "empresa_descongelada_por_gracia",
  "factura_dias_gracia_cambiada",
];
const VALORES_JOB = ["mora_diaria", "mora_aviso_correo"];
const FUNCIONES = [
  "bloqueo_por_mora",
  "factura_plataforma_mora",
  "organizacion_mora_congelar",
  "organizacion_mora_descongelar_a_mano",
  "organizacion_mora_descongelar_si_pagada",
];
const COLUMNAS = ["congelada_at", "descongelada_hasta", "factura_dias_gracia"];

/** Todo lo que las dos migraciones pueden añadir a la foto. */
const LO_NUEVO =
  /bloqueo_por_mora|factura_plataforma_mora|organizacion_mora_|organizacion_congelada_idx|organizacion_factura_dias_gracia_rango|organizacion\.(congelada_at|descongelada_hasta|factura_dias_gracia)|^tipos: (job_tipo|historial_accion_tipo) /;

/** Lo que la foto del fixture no mira y la migración sí cambia: funciones, privilegios y triggers. */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
                     || ' ' || COALESCE(p.proacl::text, '-') AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`,
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.table_privileges
    WHERE table_schema = 'public'`,
  privilegiosDeColumna: `SELECT table_name || '.' || column_name || ' ' || grantee || ' ' || privilege_type AS l
    FROM information_schema.column_privileges WHERE table_schema = 'public' AND grantee = 'servi_app'`,
  triggers: `SELECT c.relname || '.' || t.tgname AS l FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
};

/** Las líneas de la función de quitar valores de enum de un `down.sql`, con el sufijo neutralizado. */
function funcionDeQuitar(sql: string, sufijo: string): string {
  const desde = sql.indexOf(`CREATE OR REPLACE FUNCTION pg_temp.quitar_valores_de_enum_${sufijo}`);
  const hasta = sql.indexOf("$fn$;", desde);
  return sql.slice(desde, hasta).replaceAll(`_${sufijo}`, "_X").replaceAll(`rollback ${sufijo}`, "rollback X");
}

describe("SLT-121 — las migraciones en disco", () => {
  it("van juntas, después de la última de dev al abrir la ficha; la de enums va sola y sin usar sus valores", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_DEV)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M_ENUM)).toBeGreaterThan(carpetas.indexOf(M_DEV));
    expect(carpetas.indexOf(M)).toBe(carpetas.indexOf(M_ENUM) + 1);

    const enums = sqlDe(M_ENUM, "migration.sql");
    for (const v of VALORES_HISTORIAL) {
      expect(enums).toContain(`ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS '${v}';`);
    }
    for (const v of VALORES_JOB) expect(enums).toContain(`ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS '${v}';`);
    // Va sola: un valor de enum no se puede usar en la transacción que lo añade (55P04).
    expect(enums).not.toMatch(/^\s*(BEGIN|INSERT|UPDATE|CREATE)\b/m);
    expect(sqlDe(M, "migration.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M, "down.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M_ENUM, "down.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
  });

  it("el down de enums usa la función de SLT-136 byte a byte salvo el sufijo, y quita los siete valores", () => {
    const propia = sqlDe(M_ENUM, "down.sql");
    const slt136 = sqlDe("20261117120000_factura_plataforma_aviso_enums", "down.sql");
    expect(funcionDeQuitar(propia, "121").length).toBeGreaterThan(1000);
    expect(funcionDeQuitar(propia, "121")).toBe(funcionDeQuitar(slt136, "136"));
    for (const v of [...VALORES_HISTORIAL, ...VALORES_JOB]) expect(propia).toContain(`'${v}'`);
  });

  it("SLT-255: la de la prórroga va detrás, y el down de enums de la mora no nombra sus dos valores", () => {
    // Los dos valores de `20261127120000_prorroga_enums` quedan al final de `historial_accion_tipo`; el down de la
    // mora lee la lista vigente y quita solo los suyos, así que no puede llevarse los de SLT-255.
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf("20261127120000_prorroga_enums")).toBe(carpetas.indexOf(M) + 1);
    const propia = sqlDe(M_ENUM, "down.sql");
    for (const v of ["empresa_prorroga_fijada", "empresa_prorroga_quitada"]) expect(propia).not.toContain(v);
  });

  it("el down de la principal borra las cinco funciones que crea la subida, el índice y las tres columnas", () => {
    const subida = sqlDe(M, "migration.sql");
    const bajada = sqlDe(M, "down.sql");
    const creadas = [...subida.matchAll(/CREATE FUNCTION (\w+)\(/g)].map((m) => m[1]).sort();
    const borradas = [...bajada.matchAll(/DROP FUNCTION IF EXISTS (\w+)\(/g)].map((m) => m[1]).sort();
    expect(creadas).toEqual(FUNCIONES);
    expect(borradas).toEqual(FUNCIONES);
    expect(bajada).toContain(`DROP INDEX IF EXISTS "organizacion_congelada_idx"`);
    for (const c of COLUMNAS) expect(bajada).toContain(`DROP COLUMN IF EXISTS "${c}"`);
  });
});

describeSiHayBase("SLT-121 — las columnas en la base migrada", () => {
  let base: PrismaClient;
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R3: la gracia propia admite NULL y de 1 a 60; 0 y 61 → 23514 (organizacion_factura_dias_gracia_rango)", async () => {
    const r = await revertida(base, async (tx) => {
      const org = await empresa(tx);
      const fijar = (dias: number | null) =>
        intentar(tx, `UPDATE "organizacion" SET "factura_dias_gracia" = $2 WHERE "id" = $1`, org, dias);
      return { cero: await fijar(0), uno: await fijar(1), sesenta: await fijar(60), sesentaYUno: await fijar(61), nulo: await fijar(null) };
    });
    expect(r).toEqual({ cero: "23514", uno: null, sesenta: null, sesentaYUno: "23514", nulo: null });
  });

  it("servi_app lee las tres columnas y no puede escribir ninguna; ninguna empresa nace congelada", async () => {
    const filas = await base.$queryRawUnsafe<{ columna: string; leer: boolean; escribir: boolean }[]>(
      `SELECT a.attname::text AS columna,
              has_column_privilege('servi_app', c.oid, a.attname, 'SELECT') AS leer,
              has_column_privilege('servi_app', c.oid, a.attname, 'UPDATE') AS escribir
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'organizacion' AND a.attname = ANY ($1::text[])
        ORDER BY 1`,
      COLUMNAS,
    );
    expect(filas).toEqual(COLUMNAS.map((columna) => ({ columna, leer: true, escribir: false })));
  });
});

describeSiHayBase("SLT-121 — subir, bajar y volver a subir", () => {
  let db: Conexion;
  let admin: Conexion | undefined;
  let antes: Foto;
  let despues: Foto;
  let org = "";

  async function fotoCompleta(conFilas: boolean): Promise<Foto> {
    const { filas, ...resto } = await foto(db);
    const salida: Foto = conFilas ? { ...resto, filas } : resto;
    for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
      const { rows } = await db.query(consulta);
      salida[seccion] = new Set(rows.map((r) => String(r.l)));
    }
    return salida;
  }

  async function etiquetas(tipo: string, valores: string[]): Promise<string[]> {
    const { rows } = await db.query(
      `SELECT e.enumlabel::text AS k FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = $1 AND e.enumlabel = ANY ($2::text[])`,
      [tipo, valores],
    );
    return rows.map((r) => String(r.k)).sort();
  }

  async function bajar(): Promise<void> {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    await ejecutar(db, sqlDe(M_ENUM, "down.sql"), `${M_ENUM}/down.sql`);
  }

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_ENUM);
    org = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
      org,
      `SLT121 IV ${org.slice(0, 8)}`,
      `slt121-iv-${org.slice(0, 8)}`,
    ]);
    antes = await fotoCompleta(true);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R16: subir añade solo lo de la mora, el trigger en cada tabla de negocio, y no toca filas", async () => {
    await ejecutar(db, sqlDe(M_ENUM, "migration.sql"), M_ENUM);
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    despues = await fotoCompleta(false);

    const { filas, ...antesSinFilas } = antes;
    const otras = diferencias(despues, antesSinFilas).filter((l) => !LO_NUEVO.test(l.replace(/^(sobra|falta) en /, "")));
    expect(otras).toEqual([]);
    expect(diferencias({ filas: (await fotoCompleta(true)).filas }, { filas })).toEqual([]);

    expect(await etiquetas("historial_accion_tipo", VALORES_HISTORIAL)).toEqual([...VALORES_HISTORIAL].sort());
    expect(await etiquetas("job_tipo", VALORES_JOB)).toEqual([...VALORES_JOB].sort());
    const { rows } = await db.query(
      `SELECT (SELECT count(*)::int FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND p.polname = c.relname || '_por_empresa') AS politicas,
              (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND t.tgname = c.relname || '_bloqueo_por_mora') AS triggers,
              (SELECT count(*)::int FROM "organizacion"
                WHERE "congelada_at" IS NOT NULL OR "factura_dias_gracia" IS NOT NULL
                   OR "descongelada_hasta" IS NOT NULL) AS tocadas`,
    );
    expect(rows[0].politicas).toBeGreaterThan(50);
    expect(rows[0]).toEqual({ politicas: rows[0].politicas, triggers: Number(rows[0].politicas) + 1, tocadas: 0 });
  });

  it("el down de enums aborta sin tocar nada si un trabajo usa un valor de la mora", async () => {
    // Una empresa congelada: el down de la principal la deja operativa (se pierde el estado, design §8.2).
    await db.query(`UPDATE "organizacion" SET "congelada_at" = '2026-11-24 06:30', "factura_dias_gracia" = 15 WHERE "id" = $1`, [org]);
    const job = randomUUID();
    await db.query(`INSERT INTO "jobs" ("id", "tipo", "payload", "max_intentos") VALUES ($1, 'mora_diaria', '{}'::jsonb, 3)`, [job]);

    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    const error = await ejecutar(db, sqlDe(M_ENUM, "down.sql"), `${M_ENUM}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect((error as ErrorDeScript).sqlstate).toBe("P0001");
    expect((error as Error).message).toContain("rollback 121: 1 filas de jobs.tipo usan {mora_diaria,mora_aviso_correo}");
    expect(await etiquetas("job_tipo", VALORES_JOB)).toEqual([...VALORES_JOB].sort());
    expect(await etiquetas("historial_accion_tipo", VALORES_HISTORIAL)).toEqual([...VALORES_HISTORIAL].sort());

    await db.query(`DELETE FROM "jobs" WHERE "id" = $1`, [job]);
    await ejecutar(db, sqlDe(M_ENUM, "down.sql"), `${M_ENUM}/down.sql`);
    expect(diferencias(await fotoCompleta(true), antes)).toEqual([]);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "organizacion" WHERE "id" = $1`, [org]);
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("bajar otra vez no hace nada (idempotente)", async () => {
    await bajar();
    expect(diferencias(await fotoCompleta(true), antes)).toEqual([]);
  });

  it("subir otra vez da el mismo esquema que la primera", async () => {
    await ejecutar(db, sqlDe(M_ENUM, "migration.sql"), M_ENUM);
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    expect(diferencias(await fotoCompleta(false), despues)).toEqual([]);
  });
});
