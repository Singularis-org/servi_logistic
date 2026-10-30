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
 * SLT-68 (R21, design §3) — las dos migraciones del incentivo, de ida y vuelta, contra Postgres.
 *
 * - Aplicadas sobre el esquema de produccion no mueven ninguna fila.
 * - Con un incentivo registrado, los `down.sql` abortan sin tocar nada: el de los checks con 23514 y
 *   el de los enums con su RAISE.
 * - Sin incentivos, los dos `down.sql` en orden inverso dejan el esquema EXACTAMENTE como antes
 *   (tipos, constraints, indices, columnas), incluido `origen_uq` y el CHECK de la 293.
 * - Reaplicadas, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `slt68_`), construida aplicando las migraciones anteriores, como SL-45: el down
 * de los enums recrea `wallet_origen_tipo`, que usan tres libros, y en la base compartida chocaria con
 * los archivos que escriben en ellos a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La ultima de `origin/prod` (T0). */
const PREVIA = "20261028120000_modulo_wallet_nucleo";
const M_ENUMS = "20261030120000_incentivo_mensajero_enums";
const M_CHECKS = "20261030120100_incentivo_mensajero_checks";
const DE_SLT68 = [M_ENUMS, M_CHECKS];
/** La ultima de `origin/dev` medida en T0: las de esta rama van detras (R21). */
const ULTIMA_DE_DEV = "20261029150000_plan_ciclo_inicio_elegido";

const BASE = `slt68_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-68 R21 — las dos migraciones en disco", () => {
  it("cada una trae su down.sql, van en orden detras de la ultima de prod y su timestamp supera la ultima de dev", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SLT68].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SLT68) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
      expect(c > ULTIMA_DE_DEV, `${c} no es posterior a ${ULTIMA_DE_DEV}`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let organizacionId: string;
let mensajeroId: string;
let cierreId: string;

/** Etiquetas vigentes de un enum de `public`. */
async function etiquetas(tipo: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = $1 AND n.nspname = 'public' ORDER BY e.enumsortorder`,
    [tipo],
  );
  return rows.map((r) => String(r.l));
}

async function incentivos(): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM "pago_mensajero_movimiento" WHERE "categoria"::text IN ('incentivo','reverso_incentivo')`,
  );
  return Number(rows[0].n);
}

async function insertarIncentivo(): Promise<void> {
  await db.query(
    `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
     VALUES ($1,$2,'devengo','incentivo',2500.00,'cierre_dia',$3,$4)`,
    [randomUUID(), mensajeroId, cierreId, organizacionId],
  );
}

async function fallaDe(promesa: Promise<unknown>): Promise<ErrorDeScript | null> {
  try {
    await promesa;
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
}

/** La foto sin las filas: el incentivo que siembra el test las mueve. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  return resto;
}

describeSiHayBase("SLT-68 R21 — incentivo_mensajero de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_ENUMS);

    // Una empresa, un mensajero y un cierre minimos para poder escribir un incentivo.
    organizacionId = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id","nombre","slug") VALUES ($1,'SLT68 ida y vuelta',$2)`, [
      organizacionId,
      `slt68-iv-${organizacionId.slice(0, 8)}`,
    ]);
    const rol = await db.query(`SELECT "id" FROM "rol" WHERE "value" = 'mensajero'`);
    const tipo = await db.query(`SELECT "id" FROM "tipo_identificacion" LIMIT 1`);
    expect(rol.rows, "falta el rol mensajero en la base propia").toHaveLength(1);
    expect(tipo.rows.length, "falta un tipo de identificacion en la base propia").toBeGreaterThan(0);
    mensajeroId = randomUUID();
    await db.query(
      `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
       VALUES ($1,'Mensajero SLT68',$2,'88880000','x',$3,$4,$5,$6,now())`,
      [mensajeroId, `slt68-${mensajeroId.slice(0, 8)}@example.test`, `SLT68-${mensajeroId.slice(0, 8)}`, tipo.rows[0].id, rol.rows[0].id, organizacionId],
    );
    const zonaId = randomUUID();
    await db.query(
      `INSERT INTO "zona" ("id","nombre","sinpe_numero","sinpe_nombre","organizacion_id") VALUES ($1,'Zona SLT68','80000000','Titular',$2)`,
      [zonaId, organizacionId],
    );
    cierreId = randomUUID();
    await db.query(
      `INSERT INTO "cierre_dia" ("id","mensajero_id","estado","destino_tipo","destino_zona_id","organizacion_id","updated_at")
       VALUES ($1,$2,'aprobado','bodega_central',$3,$4,now())`,
      [cierreId, mensajeroId, zonaId, organizacionId],
    );

    antes = await fotoSinFilas();
    const filasAntes = (await foto(db)).filas;
    expect(await etiquetas("pago_mensajero_movimiento_categoria")).not.toContain("incentivo");

    for (const carpeta of DE_SLT68) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoSinFilas();
    // Aditivas: ni una fila se movio (R21).
    expect(diferencias({ filas: (await foto(db)).filas }, { filas: filasAntes }), "filas movidas por la ida").toEqual([]);
    // Sin esto el ciclo seria verde con migraciones vacias o mal leidas.
    expect(await etiquetas("pago_mensajero_movimiento_categoria")).toEqual(expect.arrayContaining(["incentivo", "reverso_incentivo"]));
    expect(await etiquetas("wallet_origen_tipo")).toContain("incentivo_mensajero");
    expect(diferencias(con, antes).length, "la ida no cambio el esquema").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("con las dos, un incentivo imputado a un cierre entra", async () => {
    await insertarIncentivo();
    expect(await incentivos()).toBe(1);
  });

  it("R21: con un incentivo registrado, el down de los checks aborta con 23514 y el de los enums con su RAISE, sin tocar nada", async () => {
    expect(await incentivos(), "el caso necesita un incentivo en la base").toBe(1);

    const deChecks = await fallaDe(ejecutar(db, sqlDe(M_CHECKS, "down.sql"), `${M_CHECKS}/down.sql`));
    expect(deChecks, "el down de los checks no aborto").toBeInstanceOf(ErrorDeScript);
    expect(deChecks?.sqlstate).toBe("23514");
    expect(diferencias(await fotoSinFilas(), con), "tras el down de los checks abortado").toEqual([]);

    const deEnums = await fallaDe(ejecutar(db, sqlDe(M_ENUMS, "down.sql"), `${M_ENUMS}/down.sql`));
    expect(deEnums, "el down de los enums no aborto").toBeInstanceOf(ErrorDeScript);
    expect(deEnums?.sqlstate).toBe("P0001");
    expect(deEnums?.message).toContain("se aborta sin borrar nada");
    expect(diferencias(await fotoSinFilas(), con), "tras el down de los enums abortado").toEqual([]);

    expect(await incentivos()).toBe(1);
  }, 120_000);

  it("R21: sin incentivos, los dos down.sql en orden inverso dejan el esquema como antes de SLT-68", async () => {
    await db.query(`DELETE FROM "pago_mensajero_movimiento" WHERE "categoria"::text IN ('incentivo','reverso_incentivo')`);
    expect(await incentivos()).toBe(0);

    for (const carpeta of [...DE_SLT68].reverse()) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);

    expect(diferencias(await fotoSinFilas(), antes), "tras los dos downs").toEqual([]);
    expect(await etiquetas("pago_mensajero_movimiento_categoria")).not.toContain("incentivo");
    expect(await etiquetas("wallet_origen_tipo")).not.toContain("incentivo_mensajero");
  }, 120_000);

  it("reaplicadas las dos, todo vuelve igual que la primera vez y el incentivo vuelve a entrar", async () => {
    for (const carpeta of DE_SLT68) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
    await insertarIncentivo();
    expect(await incentivos()).toBe(1);
  }, 120_000);
});
