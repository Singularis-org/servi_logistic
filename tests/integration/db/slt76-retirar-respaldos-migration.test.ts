import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { errorEnSavepoint, sqlstateDe } from "./_fixtures/pais-20";
import { soloEjecutable } from "./_fixtures/sql-ejecutable";
import { conectar, type Conexion } from "./_fixtures/ida-y-vuelta-32";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ SLT-76 / T9 (R17-R20) — LA MIGRACION QUE RETIRA LOS RESPALDOS DE SLT-73 Y SLT-75, Y LOS DOWN
// DE ESAS FICHAS CUANDO EL RESPALDO YA NO ESTA.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Cada caso corre en una transaccion que SIEMPRE se revierte y recrea primero el estado PREVIO a
// SLT-76: el esquema `respaldo` con sus dos tablas y una fila sintetica en cada una (la base de test
// ya tiene aplicada esta migracion, asi que sin recrearlo no habria nada que retirar). Los archivos
// se leen de disco y corren tal cual: cada uno es UN bloque `DO`.
//
// La fila de `respaldo.slt73_asientos` lleva una `tabla` inventada: el down de SLT-73 solo reinserta
// `wallet_movimiento`, `wallet_tienda_movimiento` y `pago_mensajero_movimiento`, asi que no toca los
// libros. La de SLT-75 apunta a zona y distrito inexistentes: su down la salta por el `WHERE EXISTS`.

const MIGRACIONES = path.join(process.cwd(), "db", "migrations");
const leer = (carpeta: string, archivo: "migration.sql" | "down.sql") =>
  fs.readFileSync(path.join(MIGRACIONES, carpeta, archivo), "utf8");

const ESTA = "20261102090100_slt76_retirar_respaldos";
const UP = leer(ESTA, "migration.sql");
const DOWN = leer(ESTA, "down.sql");
const DOWN_SLT73 = leer("20261031140200_slt73_retirar_asientos_satelite", "down.sql");
const DOWN_SLT75_DATOS = leer("20261101090000_zona_distrito_duplicados_sin_zona", "down.sql");

const T73 = "respaldo.slt73_asientos";
const T75 = "respaldo.slt75_zona_distrito_duplicado";
const AJENA = "respaldo.slt76_test_ajena";

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** El estado previo a SLT-76: las dos tablas con la forma de sus migraciones y una fila cada una. */
const RECREAR_RESPALDOS = `
  CREATE SCHEMA IF NOT EXISTS respaldo;
  CREATE TABLE IF NOT EXISTS ${T73} (
    tabla text NOT NULL,
    fila jsonb NOT NULL,
    id text GENERATED ALWAYS AS (fila ->> 'id') STORED,
    PRIMARY KEY (tabla, id)
  );
  INSERT INTO ${T73} (tabla, fila) VALUES ('slt76_test_marca', jsonb_build_object('id', '${randomUUID()}'));
  CREATE TABLE IF NOT EXISTS ${T75} (
    id text, zona_id text, distrito_id text, organizacion_id text, respaldado_at timestamptz
  );
  INSERT INTO ${T75} (id, zona_id, distrito_id, organizacion_id, respaldado_at)
    VALUES ('${randomUUID()}', '${randomUUID()}', '${randomUUID()}', '${randomUUID()}', now());
`;

async function ejecutarSql(tx: TxDeTest, sql: string): Promise<void> {
  for (const s of soloEjecutable(sql).split(/;\s*$/m).map((x) => x.trim()).filter(Boolean)) {
    await tx.$executeRawUnsafe(s);
  }
}

async function existe(tx: TxDeTest, objeto: string): Promise<boolean> {
  const [{ ok }] = await tx.$queryRawUnsafe<{ ok: boolean }[]>(
    `SELECT to_regclass('${objeto}') IS NOT NULL AS ok`,
  );
  return ok;
}

async function existeEsquema(tx: TxDeTest): Promise<boolean> {
  const [{ ok }] = await tx.$queryRawUnsafe<{ ok: boolean }[]>(
    `SELECT to_regnamespace('respaldo') IS NOT NULL AS ok`,
  );
  return ok;
}

/** Conteo y huella de una tabla de `public`: si la migracion la tocara, cambiaria. */
async function huella(tx: TxDeTest, tabla: "zona_distrito" | "wallet_movimiento") {
  const [f] = await tx.$queryRawUnsafe<{ n: number; md5: string | null }[]>(
    `SELECT count(*)::int AS n, md5(string_agg(t::text, '|' ORDER BY t.id)) AS md5 FROM ${tabla} t`,
  );
  return f;
}

/** Una fila real en `zona_distrito`, de una empresa y una zona del caso, para que R19 no sea vacuo. */
async function sembrarZonaDistrito(tx: TxDeTest): Promise<void> {
  const distrito = await tx.distrito.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
  if (distrito === null) throw new Error("falta la geografia: aplica las migraciones");
  const zona = await tx.zona.create({
    data: { nombre: `Zona SLT76 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: distrito.id } });
}

describe("SLT-76 — la migracion de retirada, en disco", () => {
  it("es UN bloque DO que borra las dos tablas y el esquema SIN CASCADE, sin tocar `public`", () => {
    const sql = soloEjecutable(UP);
    expect(sql).toContain("DROP TABLE IF EXISTS respaldo.slt73_asientos;");
    expect(sql).toContain("DROP TABLE IF EXISTS respaldo.slt75_zona_distrito_duplicado;");
    expect(sql).toContain("DROP SCHEMA IF EXISTS respaldo;");
    expect(sql).not.toMatch(/CASCADE/i);
    expect(sql).not.toMatch(/\bpublic\b|zona_distrito\b|wallet_|INSERT|UPDATE|DELETE/i);
    expect(sql.trim().startsWith("DO $slt76$")).toBe(true);
  });

  it("R20: el down dice por escrito que los datos no se recuperan y no crea nada", () => {
    expect(DOWN).toContain("no se recuperan");
    expect(soloEjecutable(DOWN)).not.toMatch(/CREATE|INSERT/i);
  });
});

describeSiHayBase("SLT-76 — retirar los respaldos (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Transaccion revertida, serializada con el resto de escrituras reales, en el estado previo. */
  function enEstadoPrevio<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await ejecutarSql(tx, RECREAR_RESPALDOS);
      return fn(tx);
    });
  }

  it("⭑ R17: tras la migracion no queda ninguna de las dos tablas ni el esquema", async () => {
    const r = await enEstadoPrevio(async (tx) => {
      const antes = { t73: await existe(tx, T73), t75: await existe(tx, T75) };
      await tx.$executeRawUnsafe(UP);
      return {
        antes,
        t73: await existe(tx, T73),
        t75: await existe(tx, T75),
        esquema: await existeEsquema(tx),
      };
    });
    expect(r.antes).toEqual({ t73: true, t75: true });
    expect({ t73: r.t73, t75: r.t75, esquema: r.esquema }).toEqual({ t73: false, t75: false, esquema: false });
  }, 60_000);

  it("⭑ R17: con un objeto ajeno en `respaldo`, la migracion no falla y lo deja con su fila", async () => {
    const r = await enEstadoPrevio(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE TABLE ${AJENA} (x int)`);
      await tx.$executeRawUnsafe(`INSERT INTO ${AJENA} (x) VALUES (76)`);
      const fallo = await errorEnSavepoint(tx, () => tx.$executeRawUnsafe(UP));
      const ajena = (await existe(tx, AJENA))
        ? (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${AJENA} WHERE x = 76`))[0].n
        : null;
      return {
        error: fallo === null ? null : sqlstateDe(fallo),
        t73: await existe(tx, T73),
        t75: await existe(tx, T75),
        esquema: await existeEsquema(tx),
        ajena,
      };
    });
    expect(r.error).toBeNull();
    expect({ t73: r.t73, t75: r.t75 }).toEqual({ t73: false, t75: false });
    expect(r.esquema).toBe(true);
    expect(r.ajena).toBe(1);
  }, 60_000);

  it("⭑ R19: la migracion no cambia `zona_distrito` ni `wallet_movimiento`", async () => {
    const r = await enEstadoPrevio(async (tx) => {
      await sembrarZonaDistrito(tx);
      const antes = { zd: await huella(tx, "zona_distrito"), wm: await huella(tx, "wallet_movimiento") };
      await tx.$executeRawUnsafe(UP);
      return { antes, despues: { zd: await huella(tx, "zona_distrito"), wm: await huella(tx, "wallet_movimiento") } };
    });
    // Premisa: hay al menos la fila sembrada, asi que la huella no es la de una tabla vacia.
    expect(r.antes.zd.n).toBeGreaterThan(0);
    expect(r.despues).toEqual(r.antes);
  }, 60_000);

  it("⭑ R20: el down de SLT-76 no recrea ninguna tabla en `respaldo`", async () => {
    const r = await enEstadoPrevio(async (tx) => {
      await tx.$executeRawUnsafe(UP);
      await tx.$executeRawUnsafe(DOWN);
      return { t73: await existe(tx, T73), t75: await existe(tx, T75), esquema: await existeEsquema(tx) };
    });
    expect(r).toEqual({ t73: false, t75: false, esquema: false });
  }, 60_000);

  it("⭑ R18: sin respaldo, el down de SLT-73 falla nombrando SLT-76 y ningun libro cambia", async () => {
    const r = await enEstadoPrevio(async (tx) => {
      await tx.$executeRawUnsafe(UP);
      const libros = async () => ({
        wm: await huella(tx, "wallet_movimiento"),
        wtm: (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM wallet_tienda_movimiento`))[0].n,
        pmm: (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pago_mensajero_movimiento`))[0].n,
      });
      const antes = await libros();
      const fallo = await errorEnSavepoint(tx, () => tx.$executeRawUnsafe(DOWN_SLT73));
      return {
        mensaje: fallo === null ? null : String((fallo as Error).message),
        sqlstate: fallo === null ? null : sqlstateDe(fallo),
        antes,
        despues: await libros(),
      };
    });
    expect(r.mensaje).not.toBeNull();
    expect(r.sqlstate).toBe("P0001");
    expect(r.mensaje).toContain("SLT-76");
    expect(r.mensaje).toContain("no se pueden devolver");
    expect(r.despues).toEqual(r.antes);
  }, 60_000);

  it("⭑ R19: sin respaldo, el down de datos de SLT-75 no falla y `zona_distrito` queda igual", async () => {
    const r = await enEstadoPrevio(async (tx) => {
      await sembrarZonaDistrito(tx);
      await tx.$executeRawUnsafe(UP);
      const antes = await huella(tx, "zona_distrito");
      const fallo = await errorEnSavepoint(tx, () => tx.$executeRawUnsafe(DOWN_SLT75_DATOS));
      return { error: fallo === null ? null : sqlstateDe(fallo), antes, despues: await huella(tx, "zona_distrito") };
    });
    expect(r.antes.n).toBeGreaterThan(0);
    expect(r.error).toBeNull();
    expect(r.despues).toEqual(r.antes);
  }, 60_000);

  // El NOTICE no cruza Prisma: se escucha en una conexion `pg` propia, en una transaccion que se
  // revierte y que toma el mismo lock de aviso que el resto de escrituras reales.
  it("⭑ R19: sin respaldo, el down de datos de SLT-75 deja un NOTICE que nombra SLT-76", async () => {
    const pool = (await conectar(urlDeBaseDeDatos() as string)) as Conexion & {
      connect(): Promise<{
        query(texto: string): Promise<unknown>;
        on(evento: "notice", fn: (n: { message?: string }) => void): void;
        release(): void;
      }>;
    };
    const avisos: string[] = [];
    const cliente = await pool.connect();
    try {
      cliente.on("notice", (n) => avisos.push(String(n.message)));
      await cliente.query("BEGIN");
      await cliente.query(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
      await cliente.query(RECREAR_RESPALDOS);
      await cliente.query(UP);
      avisos.length = 0;
      await cliente.query(DOWN_SLT75_DATOS);
    } finally {
      await cliente.query("ROLLBACK").catch(() => undefined);
      cliente.release();
      await pool.end();
    }
    expect(avisos.some((a) => a.includes("SLT-76"))).toBe(true);
  }, 60_000);
});
