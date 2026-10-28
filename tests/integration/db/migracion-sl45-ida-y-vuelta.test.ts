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
 * SL-45 (R27, design §8) — las dos migraciones del pago a la plataforma, de ida y vuelta, contra Postgres.
 *
 * - Con las dos, un pago a la plataforma entra en el libro de la caja como egreso, y no como ingreso.
 * - Con un pago registrado, los `down.sql` abortan sin tocar nada: el de la regla tipo-categoría con
 *   23514, y el del enum con su RAISE.
 * - Borrado el pago, los dos `down.sql` en orden inverso dejan el esquema como antes de SL-45: el valor
 *   fuera de `pg_enum` y el CHECK igual que el de la 458.
 * - Reaplicadas, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `sl45_`), construida aplicando las migraciones anteriores, como en
 * `migracion-sl40-ida-y-vuelta.test.ts`. El down del enum recrea el tipo de `wallet_movimiento`, y en la
 * base compartida chocaría con los archivos que escriben en la caja a la vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `dev` antes de SL-45 (T0). */
const PREVIA = "20261024120000_cobro_plataforma_blindaje_orden";
const M_CATEGORIA = "20261024130000_pago_plataforma_categoria";
const M_CHECK = "20261024130100_pago_plataforma_check";
const DE_SL45 = [M_CATEGORIA, M_CHECK];
/** Review B1: el REVOKE y el tope en la base. Se mide aparte, al final: no entra en los downs de R27. */
const M_BLINDAJE = "20261024140000_pago_plataforma_blindaje";

const BASE = `sl45_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SL-45 R27 — las dos migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última de dev", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SL45, M_BLINDAJE].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of [...DE_SL45, M_BLINDAJE]) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let checkDeLa458: string;
let organizacionId: string;

/** La foto del fixture sin las filas: el pago que siembra el test las mueve. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  return resto;
}

async function definicionDelCheck(): Promise<string> {
  const { rows } = await db.query(
    `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname = 'wallet_movimiento_tipo_categoria_check'`,
  );
  expect(rows, "el CHECK tipo-categoria no existe").toHaveLength(1);
  return String(rows[0].d);
}

async function etiquetas(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'wallet_movimiento_categoria' AND n.nspname = 'public' ORDER BY e.enumsortorder`,
  );
  return rows.map((r) => String(r.l));
}

/** Un pago como dueño, con la empresa explícita. Devuelve su id. */
async function insertarPago(tipo: "egreso" | "ingreso" = "egreso"): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id")
     VALUES ($1, $2::wallet_movimiento_tipo, 'egreso_pago_plataforma', 500.00, 'gasto', 'Pago SL45', $3)`,
    [id, tipo, organizacionId],
  );
  return id;
}

async function pagos(): Promise<number> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM "wallet_movimiento" WHERE "categoria"::text = 'egreso_pago_plataforma'`);
  return Number(rows[0].n);
}

/** El error de un script, o `null` si corrió entero. */
async function fallaDe(promesa: Promise<unknown>): Promise<ErrorDeScript | null> {
  try {
    await promesa;
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
}

describeSiHayBase("SL-45 R27 — egreso_pago_plataforma de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    // Apaga el autovacuum antes de cada migracion, no al acabar: el 40P01 de SL-17 (ver el helper).
    await aplicarMigracionesHasta(db, M_CATEGORIA);
    organizacionId = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'SL45 ida y vuelta', $2)`, [
      organizacionId,
      `sl45-iv-${organizacionId.slice(0, 8)}`,
    ]);

    antes = await fotoSinFilas();
    checkDeLa458 = await definicionDelCheck();
    expect(await etiquetas()).not.toContain("egreso_pago_plataforma");

    for (const carpeta of DE_SL45) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoSinFilas();
    // Sin esto el ciclo sería verde con migraciones vacías o mal leídas.
    expect(await etiquetas()).toContain("egreso_pago_plataforma");
    expect(await definicionDelCheck()).toContain("'egreso_pago_plataforma'::wallet_movimiento_categoria");
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("con las dos, el pago entra como egreso, y como ingreso lo rechaza la regla tipo-categoría (23514)", async () => {
    await insertarPago("egreso");
    expect(await pagos()).toBe(1);
    // Fuera de una transacción: la sentencia fallida no deja la conexión abortada.
    const fallo = await insertarPago("ingreso").then(
      () => null,
      (e: { code?: string }) => e.code,
    );
    expect(fallo).toBe("23514");
    expect(await pagos()).toBe(1);
  });

  it("R27: con un pago registrado, el down del CHECK aborta con 23514 y el del enum con su RAISE, sin tocar nada", async () => {
    expect(await pagos(), "el caso necesita un pago en la base").toBe(1);

    const delCheck = await fallaDe(ejecutar(db, sqlDe(M_CHECK, "down.sql"), `${M_CHECK}/down.sql`));
    expect(delCheck, "el down del CHECK no aborto").toBeInstanceOf(ErrorDeScript);
    expect(delCheck?.sqlstate).toBe("23514");
    expect(diferencias(await fotoSinFilas(), con), "tras el down del CHECK abortado").toEqual([]);

    const delEnum = await fallaDe(ejecutar(db, sqlDe(M_CATEGORIA, "down.sql"), `${M_CATEGORIA}/down.sql`));
    expect(delEnum, "el down del enum no aborto").toBeInstanceOf(ErrorDeScript);
    expect(delEnum?.sqlstate).toBe("P0001");
    expect(delEnum?.message).toContain("se aborta sin borrar nada");
    expect(diferencias(await fotoSinFilas(), con), "tras el down del enum abortado").toEqual([]);

    expect(await pagos()).toBe(1);
  }, 120_000);

  it("R27: sin pagos, los dos down.sql en orden inverso dejan el esquema como antes de SL-45", async () => {
    await db.query(`DELETE FROM "wallet_movimiento" WHERE "categoria"::text = 'egreso_pago_plataforma'`);
    expect(await pagos()).toBe(0);

    for (const carpeta of [...DE_SL45].reverse()) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);

    expect(diferencias(await fotoSinFilas(), antes), "tras los dos downs").toEqual([]);
    // Nombrados aparte: si la foto dejara de mirarlos, este caso lo diría igual.
    expect(await etiquetas()).not.toContain("egreso_pago_plataforma");
    expect(await definicionDelCheck()).toBe(checkDeLa458);
  }, 120_000);

  it("reaplicadas las dos, todo vuelve igual que la primera vez y el pago vuelve a entrar", async () => {
    for (const carpeta of DE_SL45) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
    await insertarPago("egreso");
    expect(await pagos()).toBe(1);
  }, 120_000);

  /* ------------------ review B1: 20261024140000_pago_plataforma_blindaje ------------------ */

  async function privilegioDeApp(privilegio: "INSERT" | "UPDATE" | "DELETE"): Promise<boolean> {
    const { rows } = await db.query(`SELECT has_table_privilege('servi_app', 'public.wallet_movimiento', $1) AS si`, [privilegio]);
    return rows[0].si === true;
  }

  async function hayTriggerDelTope(): Promise<boolean> {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'public.wallet_movimiento'::regclass AND tgname = 'wallet_movimiento_tope_pago_plataforma'`,
    );
    return Number(rows[0].n) === 1;
  }

  it("blindaje: quita a servi_app UPDATE y DELETE (no INSERT) y pone el tope: sin cargos, un pago es 23514", async () => {
    expect(await privilegioDeApp("UPDATE")).toBe(true);
    await ejecutar(db, sqlDe(M_BLINDAJE, "migration.sql"), M_BLINDAJE);
    expect(await privilegioDeApp("UPDATE")).toBe(false);
    expect(await privilegioDeApp("DELETE")).toBe(false);
    expect(await privilegioDeApp("INSERT")).toBe(true);
    expect(await hayTriggerDelTope()).toBe(true);
    const fallo = await insertarPago("egreso").then(
      () => null,
      (e: { code?: string }) => e.code,
    );
    expect(fallo).toBe("23514");
    expect(await pagos()).toBe(1);
  }, 120_000);

  it("blindaje: su down.sql devuelve los privilegios, quita el tope y deja el esquema como con las dos de SL-45", async () => {
    await ejecutar(db, sqlDe(M_BLINDAJE, "down.sql"), `${M_BLINDAJE}/down.sql`);
    expect(await privilegioDeApp("UPDATE")).toBe(true);
    expect(await privilegioDeApp("DELETE")).toBe(true);
    expect(await hayTriggerDelTope()).toBe(false);
    expect(diferencias(await fotoSinFilas(), con), "tras el down del blindaje").toEqual([]);
    await insertarPago("egreso");
    expect(await pagos()).toBe(2);
  }, 120_000);
});
