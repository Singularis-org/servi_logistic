import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

// Ficha 451 / SLT-72 (T4.4, R23/R40) — la migracion `*_cierre_sin_gestion_confirmacion_fisica`.
// Molde: `confirmacion-fisica-migration.test.ts` (238), la hermana sobre `gestion_orden`.
//
// DOS mitades:
//  1. FORMA de los dos .sql, por regex sobre las SENTENCIAS (sin comentarios).
//  2. LA BASE REAL: la columna existe, es nullable y sin default (R23); y el `down.sql` —ejecutado
//     DE VERDAD dentro de una transaccion que siempre se revierte— la suelta y es idempotente (R40).
//     El DDL de Postgres es transaccional, asi que el rollback deja la base como estaba.

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "db", "migrations");
const SUFIJO = "_cierre_sin_gestion_confirmacion_fisica";

function migrationDirFor(suffix: string): string {
  const dir = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .find((name) => name.endsWith(suffix));
  if (!dir) throw new Error(`No se encontro la carpeta de migracion ${suffix}`);
  return path.join(MIGRATIONS_DIR, dir);
}

/** Quita los comentarios `--`: las aserciones negativas miran SENTENCIAS, no la prosa que las explica. */
function soloSentencias(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}

const migrationDir = migrationDirFor(SUFIJO);
const upRaw = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
const downRaw = fs.readFileSync(path.join(migrationDir, "down.sql"), "utf8");
const upSql = soloSentencias(upRaw);
const downSql = soloSentencias(downRaw);
const schemaPrisma = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "db", "schema.prisma"),
  "utf8",
);

describe("451 · UP — una columna nullable y nada mas (R20/R23)", () => {
  it("anade `confirmada_fisica_at` a cierre_sin_gestion como TIMESTAMP(3)", () => {
    expect(upSql).toMatch(
      /ALTER TABLE "cierre_sin_gestion" ADD COLUMN "confirmada_fisica_at" TIMESTAMP\(3\);/,
    );
  });

  it("R23: NULLABLE, sin default y sin backfill — los cierres ya aprobados quedan en NULL", () => {
    expect(upSql).not.toMatch(/NOT NULL/i);
    expect(upSql).not.toMatch(/DEFAULT/i);
    expect(upSql).not.toMatch(/UPDATE /i);
    expect(upSql).not.toMatch(/INSERT INTO/i);
  });

  it("es ADITIVA: sin CHECK, sin indice, sin RLS, sin tocar otras columnas ni tablas", () => {
    for (const prohibido of [
      /CHECK/i,
      /ADD CONSTRAINT/i,
      /CREATE (UNIQUE )?INDEX/i,
      /DROP /i,
      /ALTER COLUMN/i,
      /DELETE FROM/i,
      /POLICY/i,
      /ROW LEVEL SECURITY/i,
      /CREATE TYPE/i,
    ]) {
      expect(upSql).not.toMatch(prohibido);
    }
    // Una sola sentencia.
    expect(upSql.split("\n").filter((l) => l.trim() !== "")).toHaveLength(1);
  });

  it("R22/R38: no nombra ninguna tabla de dinero", () => {
    for (const tabla of ["wallet_movimiento", "wallet_tienda_movimiento", "pago_mensajero_movimiento", "cierre_dia", "cierre_detail"]) {
      expect(upSql).not.toContain(tabla);
    }
  });
});

describe("451 · DOWN — reversible (R40, OBLIGATORIO)", () => {
  it("suelta la columna con `IF EXISTS` y NADA mas", () => {
    expect(downSql).toMatch(
      /ALTER TABLE "cierre_sin_gestion" DROP COLUMN IF EXISTS "confirmada_fisica_at";/,
    );
    expect(downSql.split("\n").filter((l) => l.trim() !== "")).toHaveLength(1);
  });

  it("declara la perdida de dato (las marcas de la ventana revertida)", () => {
    expect(downRaw).toMatch(/PERDIDA DE DATO DECLARADA/);
  });
});

describe("451 · schema.prisma refleja la migracion (sin drift)", () => {
  it("CierreSinGestion declara `confirmadaFisicaAt` OPCIONAL, mapeada, sin default ni indice", () => {
    const modelo = schemaPrisma.match(/model CierreSinGestion \{([\s\S]*?)\n\}/);
    expect(modelo).not.toBeNull();
    const cuerpo = (modelo as RegExpMatchArray)[1];
    expect(cuerpo).toMatch(/confirmadaFisicaAt\s+DateTime\?\s+@map\("confirmada_fisica_at"\)/);
    expect(cuerpo).not.toMatch(/confirmadaFisicaAt[^\n]*@default/);
    expect(cuerpo).not.toMatch(/@@index\(\[confirmadaFisicaAt\]\)/);
    // Sigue sin `updated_at` / `deleted_at`: la fila no se edita ni se borra (264).
    expect(cuerpo).not.toMatch(/updatedAt|deletedAt/);
  });
});

describe("estructura de la carpeta de migracion", () => {
  it("contiene migration.sql y down.sql, con timestamp posterior a la ultima previa", () => {
    expect(fs.existsSync(path.join(migrationDir, "migration.sql"))).toBe(true);
    expect(fs.existsSync(path.join(migrationDir, "down.sql"))).toBe(true);
    // Posterior a `20261031120000_liberar_recolecciones_recibidas`, la ultima de `prod` y `dev`
    // cuando se escribio esta ficha: un timestamp anterior se aplicaria fuera de orden.
    expect(path.basename(migrationDir) > "20261031120000_liberar_recolecciones_recibidas").toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// La BASE REAL. Sin base alcanzable se SALTA (se ve en la salida); nunca un `return` silencioso.
// ---------------------------------------------------------------------------------------------

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type ClienteSql = { $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown> };

async function columna(
  cliente: ClienteSql,
): Promise<Array<{ data_type: string; is_nullable: string; column_default: string | null }>> {
  return (await cliente.$queryRawUnsafe(
    `SELECT data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'cierre_sin_gestion' AND column_name = 'confirmada_fisica_at'`,
  )) as Array<{ data_type: string; is_nullable: string; column_default: string | null }>;
}

describeSiHayBase("451 · la columna en Postgres, y su reversion ejecutada (R23/R40)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R23: existe, es NULLABLE, sin DEFAULT y de tipo timestamp", async () => {
    const filas = await columna(prisma);

    expect(filas, "la migracion no esta aplicada en esta base").toHaveLength(1);
    expect(filas[0].is_nullable).toBe("YES");
    expect(filas[0].column_default).toBeNull();
    expect(filas[0].data_type).toMatch(/timestamp/);
  });

  it("no se creo ningun indice sobre la columna", async () => {
    const filas = (await prisma.$queryRawUnsafe(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'cierre_sin_gestion' AND indexdef LIKE '%confirmada_fisica_at%'`,
    )) as unknown[];
    expect(filas).toEqual([]);
  });

  it("R40: el `down.sql` REAL suelta la columna, es idempotente, y la tabla queda como la leia el codigo anterior", async () => {
    // Las sentencias del down, ejecutadas tal cual, DENTRO de una transaccion que siempre se
    // revierte: el DDL de Postgres es transaccional, asi que la base no pierde la columna.
    const sentencia = downSql.trim();
    const columnasAntes = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cierre_sin_gestion' ORDER BY column_name`,
    )) as Array<{ column_name: string }>;

    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const antes = await columna(tx);
      await tx.$executeRawUnsafe(sentencia);
      const trasUno = await columna(tx);
      // Idempotente: una segunda pasada no falla (`IF EXISTS`).
      await tx.$executeRawUnsafe(sentencia);
      const trasDos = await columna(tx);
      const restantes = (await tx.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cierre_sin_gestion' ORDER BY column_name`,
      )) as Array<{ column_name: string }>;
      return { antes: antes.length, trasUno: trasUno.length, trasDos: trasDos.length, restantes };
    });

    // Anti-vacuidad: la columna estaba antes de ejecutar el down.
    expect(r.antes).toBe(1);
    expect(r.trasUno).toBe(0);
    expect(r.trasDos).toBe(0);
    // La tabla revertida es la de ANTES de la ficha: todas las demas columnas, ni una menos.
    expect(r.restantes.map((c) => c.column_name)).toEqual(
      columnasAntes.map((c) => c.column_name).filter((n) => n !== "confirmada_fisica_at"),
    );
    // Y la transaccion se revirtio: la columna sigue en la base.
    expect(await columna(prisma)).toHaveLength(1);
  });
});
