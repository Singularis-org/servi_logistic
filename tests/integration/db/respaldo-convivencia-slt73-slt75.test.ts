import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { errorEnSavepoint, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { sentenciasSql } from "./_fixtures/sql-ejecutable";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-75 (review B1 y m1) — el esquema `respaldo` lo comparten dos fichas:
//
//   SLT-73  20261031140200_slt73_retirar_asientos_satelite  → respaldo.slt73_asientos
//   SLT-75  20261101090000_zona_distrito_duplicados_sin_zona → respaldo.slt75_zona_distrito_duplicado
//
// Cada `down.sql` quita SOLO su tabla, y el esquema solo si queda vacio. Se mide con los dos
// respaldos presentes (la base de test tiene aplicadas las dos fichas), dentro de una transaccion del
// dueno que SIEMPRE se revierte: ni las tablas quitadas ni las marcas sembradas sobreviven.
//
// Mutaciones (progress/impl_SLT-75.md): el down de SLT-73 de vuelta a `DROP SCHEMA … CASCADE` (cae
// «el down de SLT-73 deja intacto el de SLT-75»); el de SLT-75 con `DROP SCHEMA` sin condicion (cae
// «el down de SLT-75 deja intacto el de SLT-73», con 2BP01).

const MIGRACIONES = path.join(process.cwd(), "db", "migrations");
const DOWN_SLT73 = fs.readFileSync(
  path.join(MIGRACIONES, "20261031140200_slt73_retirar_asientos_satelite", "down.sql"),
  "utf8",
);
const DOWN_SLT75_INDICE = fs.readFileSync(
  path.join(MIGRACIONES, "20261101090100_zona_distrito_distrito_unico_por_empresa", "down.sql"),
  "utf8",
);
const DOWN_SLT75_DATOS = fs.readFileSync(
  path.join(MIGRACIONES, "20261101090000_zona_distrito_duplicados_sin_zona", "down.sql"),
  "utf8",
);

const T73 = "respaldo.slt73_asientos";
const T75 = "respaldo.slt75_zona_distrito_duplicado";

async function aplicar(tx: TxDeTest, sql: string): Promise<void> {
  for (const stmt of sentenciasSql(sql)) await tx.$executeRawUnsafe(stmt);
}

/** SLT-75 en orden inverso: el indice primero (design §3.1). */
async function bajarSlt75(tx: TxDeTest): Promise<void> {
  await aplicar(tx, DOWN_SLT75_INDICE);
  await aplicar(tx, DOWN_SLT75_DATOS);
}

async function bajarSlt73(tx: TxDeTest): Promise<void> {
  await aplicar(tx, DOWN_SLT73);
}

async function existe(tx: TxDeTest, tabla: string): Promise<boolean> {
  const [{ ok }] = await tx.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT to_regclass('${tabla}') IS NOT NULL AS ok`,
  );
  return ok;
}

async function existeEsquema(tx: TxDeTest): Promise<boolean> {
  const [{ ok }] = await tx.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT to_regnamespace('respaldo') IS NOT NULL AS ok`,
  );
  return ok;
}

/** Cuantas filas de la tabla llevan la marca; `null` si la tabla ya no existe. */
async function marcas(tx: TxDeTest, tabla: string, where: string, valor: string): Promise<number | null> {
  if (!(await existe(tx, tabla))) return null;
  const [f] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM ${tabla} WHERE ${where} = $1`,
    valor,
  );
  return f.n;
}

/** Una fila marcada en cada respaldo (sin FKs: los dos son tablas sueltas). */
async function sembrarMarcas(tx: TxDeTest): Promise<{ m73: string; m75: string }> {
  const m73 = `slt75-test-${randomUUID()}`;
  const m75 = randomUUID();
  // `tabla` inventada: el down de SLT-73 solo reinserta 'wallet_movimiento', 'wallet_tienda_movimiento'
  // y 'pago_mensajero_movimiento', asi que esta fila no toca los libros.
  await tx.$executeRawUnsafe(
    `INSERT INTO ${T73} (tabla, fila) VALUES ('slt75_test_marca', jsonb_build_object('id', $1::text))`,
    m73,
  );
  // Zona y distrito inexistentes: el down de SLT-75 la salta por su `WHERE EXISTS`.
  await tx.$executeRawUnsafe(
    `INSERT INTO ${T75} (id, zona_id, distrito_id, organizacion_id) VALUES ($1, $2, $3, $4)`,
    m75,
    randomUUID(),
    randomUUID(),
    randomUUID(),
  );
  return { m73, m75 };
}

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Medida {
  precondicion: { t73: boolean; t75: boolean };
  error: string | null;
  t73: boolean;
  t75: boolean;
  marca73: number | null;
  marca75: number | null;
  esquema: boolean;
}

describeSiHayBase("respaldo compartido — SLT-73 y SLT-75 conviven en el esquema `respaldo`", () => {
  let base: PrismaClient;
  let trasDown73: Medida;
  let trasDown75: Medida;
  let losDos: { error: string | null; esquema: boolean };

  async function medir(bajar: (tx: TxDeTest) => Promise<void>): Promise<Medida> {
    return revertida(base, async (tx) => {
      const precondicion = { t73: await existe(tx, T73), t75: await existe(tx, T75) };
      const { m73, m75 } = await sembrarMarcas(tx);
      const fallo = await errorEnSavepoint(tx, () => bajar(tx));
      return {
        precondicion,
        error: fallo === null ? null : sqlstateDe(fallo),
        t73: await existe(tx, T73),
        t75: await existe(tx, T75),
        marca73: await marcas(tx, T73, "id", m73),
        marca75: await marcas(tx, T75, "id", m75),
        esquema: await existeEsquema(tx),
      };
    });
  }

  beforeAll(async () => {
    base = crearPrismaDeTest();
    trasDown73 = await medir(bajarSlt73);
    trasDown75 = await medir(bajarSlt75);
    losDos = await revertida(base, async (tx) => {
      const fallo = await errorEnSavepoint(tx, async () => {
        await bajarSlt75(tx);
        await bajarSlt73(tx);
      });
      return { error: fallo === null ? null : sqlstateDe(fallo), esquema: await existeEsquema(tx) };
    });
  }, 120_000);

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("PRECONDICION: la base de test tiene los dos respaldos", () => {
    expect(trasDown73.precondicion).toEqual({ t73: true, t75: true });
    expect(trasDown75.precondicion).toEqual({ t73: true, t75: true });
  });

  it("m1 — el down de SLT-73 quita SU tabla y deja intacto el respaldo de SLT-75 (con su fila)", () => {
    expect(trasDown73.error).toBeNull();
    expect(trasDown73.t73).toBe(false);
    expect(trasDown73.t75).toBe(true);
    expect(trasDown73.marca75).toBe(1);
    expect(trasDown73.esquema).toBe(true);
  });

  it("B1 — el down de SLT-75 quita SU tabla y deja intacto el respaldo de SLT-73 (con su fila)", () => {
    expect(trasDown75.error).toBeNull();
    expect(trasDown75.t75).toBe(false);
    expect(trasDown75.t73).toBe(true);
    expect(trasDown75.marca73).toBe(1);
    expect(trasDown75.esquema).toBe(true);
  });

  it("los dos down (SLT-75 y luego SLT-73) dejan el esquema vacio y lo quitan", () => {
    expect(losDos.error).toBeNull();
    expect(losDos.esquema).toBe(false);
  });
});
