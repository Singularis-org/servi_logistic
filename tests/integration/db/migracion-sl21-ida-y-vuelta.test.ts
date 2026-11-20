import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * SL-21 (T1.3; R1, R3, R19) — la migración de la moneda y el impuesto del país, de ida y vuelta.
 *
 * - La subida deja Costa Rica con CRC, «₡», «.», «,», 2 decimales e «IVA» (R3), y añade a `pais` solo
 *   las seis columnas del spec: ninguna es una tasa de impuesto (R1).
 * - No cambia ninguna otra columna ni fila: las columnas de antes de cada fila de `pais` (CR y un país
 *   de prueba sin moneda) quedan idénticas, el país de prueba sigue sin moneda, y el recuento de filas
 *   de todas las tablas, los enums y las filas de `wallet_movimiento` no se mueven (R3, R19).
 * - El `down.sql` deja el esquema EXACTO de antes y las mismas filas; reaplicada, todo vuelve igual.
 *
 * BASE PROPIA (prefijo `sl21_`), construida aplicando las migraciones anteriores (patrón SLT-42): el
 * down suelta columnas de `pais`, que la base compartida usa en paralelo.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `origin/dev` al escribir la ficha (2026-11-19): la de SL-21 va detrás. */
const ULTIMA_ANTERIOR = "20261121130000_pago_plataforma_por_fuera";
const M = "20261122120000_sl21_pais_moneda_impuesto";
const BASE = `sl21_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const NUEVAS = [
  "moneda_codigo",
  "moneda_simbolo",
  "moneda_separador_miles",
  "moneda_separador_decimal",
  "moneda_decimales",
  "impuesto_nombre",
];

describe("SL-21 R3 — la migración en disco", () => {
  it("trae su down.sql y va detrás de la última anterior", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(ULTIMA_ANTERIOR), "falta la anterior").toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M), "fuera de orden").toBeGreaterThan(carpetas.indexOf(ULTIMA_ANTERIOR));
    expect(existsSync(path.join(MIGRACIONES, M, "down.sql")), "sin down.sql").toBe(true);
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let paisAntes: string[];
let walletAntes: string[];

/** Cada fila de `pais` como JSON, sin las columnas nuevas, ordenada por `id`. */
async function paisSinNuevas(): Promise<string[]> {
  const quitar = NUEVAS.map((c) => ` - '${c}'`).join("");
  const { rows } = await db.query(`SELECT (to_jsonb(p)${quitar})::text AS l FROM "pais" p ORDER BY p."id"`);
  return rows.map((r) => String(r.l));
}

async function filasDeWallet(): Promise<string[]> {
  const { rows } = await db.query(`SELECT to_jsonb(w)::text AS l FROM "wallet_movimiento" w ORDER BY 1`);
  return rows.map((r) => String(r.l));
}

async function columnasDePais(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pais' ORDER BY 1`,
  );
  return rows.map((r) => String(r.c));
}

async function monedaDe(id: string): Promise<Record<string, unknown> | undefined> {
  const { rows } = await db.query(`SELECT ${NUEVAS.map((c) => `"${c}"`).join(", ")} FROM "pais" WHERE "id" = $1`, [id]);
  return rows[0];
}

describeSiHayBase("SL-21 — moneda e impuesto del país, de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);
    // Un segundo país, como uno dado de alta por la pantalla de SL-20: la subida no lo toca.
    await db.query(
      `INSERT INTO "pais" ("id","nombre","nivel_1_singular","nivel_1_plural","nivel_2_singular","nivel_2_plural",
         "nivel_3_singular","nivel_3_plural") VALUES ('XA','País XA','Región','Regiones','Comuna','Comunas','Barrio','Barrios')`,
    );
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R1, R3, R19: la subida carga CR, añade solo las seis columnas y no cambia nada más", async () => {
    antes = await foto(db);
    paisAntes = await paisSinNuevas();
    walletAntes = await filasDeWallet();
    const columnasAntes = await columnasDePais();

    await ejecutar(db, sqlDe(M, "migration.sql"), `${M}/migration.sql`);
    con = await foto(db);

    // R3: Costa Rica con su moneda y su impuesto.
    expect(await monedaDe("CR")).toEqual({
      moneda_codigo: "CRC",
      moneda_simbolo: "₡",
      moneda_separador_miles: ".",
      moneda_separador_decimal: ",",
      moneda_decimales: 2,
      impuesto_nombre: "IVA",
    });
    // El país sin moneda sigue sin ella: el UPDATE es solo de CR.
    expect(await monedaDe("XA")).toEqual(Object.fromEntries(NUEVAS.map((c) => [c, null])));

    // R1: solo nacen las seis columnas, y ninguna es una tasa.
    const nuevas = (await columnasDePais()).filter((c) => !columnasAntes.includes(c));
    expect(nuevas.sort()).toEqual([...NUEVAS].sort());
    expect(nuevas.filter((c) => /tasa|pct|porcentaje/.test(c))).toEqual([]);

    // R3: ninguna otra columna de `pais` cambió de valor.
    expect(await paisSinNuevas()).toEqual(paisAntes);
    // R3, R19: ni filas de otras tablas ni enums. Lo único que cambia son columnas y CHECK de `pais`.
    const cambios = diferencias(con, antes);
    expect(cambios.filter((l) => !/^sobra en (columnas: pais\.|constraints: pais \| pais_(moneda|impuesto)_)/.test(l))).toEqual([]);
    expect(cambios.filter((l) => l.startsWith("sobra en constraints"))).toHaveLength(8);
    expect(await filasDeWallet()).toEqual(walletAntes);
  }, 120_000);

  it("R3: el down.sql deja el esquema y las filas de antes", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(diferencias(await foto(db), antes), "tras el down").toEqual([]);
    expect(await paisSinNuevas()).toEqual(paisAntes);
    expect(await filasDeWallet()).toEqual(walletAntes);
  }, 120_000);

  it("R3: reaplicada, todo vuelve igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), `${M}/migration.sql (otra vez)`);
    expect(diferencias(await foto(db), con), "tras reaplicar").toEqual([]);
    expect(await monedaDe("CR")).toMatchObject({ moneda_codigo: "CRC", impuesto_nombre: "IVA" });
    expect(await paisSinNuevas()).toEqual(paisAntes);
  }, 120_000);
});
