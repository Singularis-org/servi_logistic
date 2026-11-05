import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { VEHICULOS_SEED } from "@/lib/types/vehiculos";
import { comoApp, datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { intentar, revertida } from "./_fixtures/pais-20";

// Feature 50: cobertura ESTATICA de la migracion de vehiculos (enum Postgres +
// tabla + RLS). Patron order-status-enum-migration.test.ts / cobros-rls.test.ts:
// NO requiere Postgres real, lee migration.sql/down.sql y hace asserts (R3/R4/R5).
// La aplicacion real contra Postgres queda DIFERIDA (deuda de despliegue).

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "db", "migrations");

function vehiculosMigrationDir(): string {
  const dir = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .find((name) => name.endsWith("_vehiculos"));
  if (!dir) throw new Error("No se encontro la carpeta de migracion *_vehiculos");
  return path.join(MIGRATIONS_DIR, dir);
}

const migrationDir = vehiculosMigrationDir();
const upSql = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
const downSql = fs.readFileSync(path.join(migrationDir, "down.sql"), "utf8");

function extractEnumValues(sql: string): string[] {
  const match = sql.match(/CREATE TYPE "vehiculo_value" AS ENUM \(([\s\S]*?)\);/);
  if (!match) throw new Error('No se encontro CREATE TYPE "vehiculo_value" AS ENUM (...)');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("vehiculos migration.sql (UP) — enum + tabla + RLS (R3)", () => {
  it("crea el tipo CREATE TYPE vehiculo_value AS ENUM", () => {
    expect(upSql).toMatch(/CREATE TYPE "vehiculo_value" AS ENUM/);
  });

  it("el enum tiene exactamente los 3 valores de VEHICULOS_SEED (R3)", () => {
    const enumValues = extractEnumValues(upSql);
    expect(enumValues).toHaveLength(3);
    expect(new Set(enumValues)).toEqual(new Set(VEHICULOS_SEED));
  });

  it("crea la tabla vehiculos con id TEXT PK y columna name (NO value) (R3)", () => {
    expect(upSql).toMatch(/CREATE TABLE "vehiculos"/);
    expect(upSql).toContain('"id" TEXT NOT NULL');
    expect(upSql).toContain('"name" "vehiculo_value" NOT NULL');
    expect(upSql).toMatch(/CONSTRAINT "vehiculos_pkey" PRIMARY KEY \("id"\)/);
    // Diferencia clave: la columna NO se llama value.
    expect(upSql).not.toMatch(/"value"\s+"vehiculo_value"/);
  });

  it("crea el indice unico vehiculos_name_key sobre name (R3)", () => {
    expect(upSql).toContain('CREATE UNIQUE INDEX "vehiculos_name_key" ON "vehiculos"("name");');
  });

  it("habilita RLS sobre vehiculos (R3)", () => {
    expect(upSql).toContain('ALTER TABLE "vehiculos" ENABLE ROW LEVEL SECURITY;');
  });

  it("no crea FKs (el FK vehiculo_id de la feature 21 no se implementa aqui) (R13)", () => {
    expect(upSql).not.toContain("ADD CONSTRAINT");
    expect(upSql).not.toMatch(/FOREIGN KEY/);
  });
});

describe("vehiculos down.sql (DOWN) — revierte tabla antes que tipo (R4, R5)", () => {
  it("hace DROP TABLE IF EXISTS vehiculos y DROP TYPE IF EXISTS vehiculo_value", () => {
    expect(downSql).toMatch(/DROP TABLE IF EXISTS "vehiculos";/);
    expect(downSql).toMatch(/DROP TYPE IF EXISTS "vehiculo_value";/);
  });

  it("elimina la tabla ANTES que el tipo del que depende (R4/R5)", () => {
    const idxTable = downSql.indexOf('DROP TABLE IF EXISTS "vehiculos"');
    const idxType = downSql.indexOf('DROP TYPE IF EXISTS "vehiculo_value"');
    expect(idxTable).toBeGreaterThanOrEqual(0);
    expect(idxType).toBeGreaterThan(idxTable);
  });

  it("no menciona ninguna otra tabla ni tipo del esquema", () => {
    for (const otro of ["cobro", "orden", "usuario", "rol_value", "order_status"]) {
      expect(downSql).not.toContain(`"${otro}"`);
    }
  });
});

describe("no se modifico ninguna migracion previa (R3)", () => {
  // Invariante: cada migracion conserva su orden relativo respecto de sus
  // predecesoras conocidas; nuevas migraciones apendidas despues NO la afectan.
  // Por eso comparamos contra un PREDECESOR FIJO (la ultima migracion que existia
  // cuando se creo vehiculos), no contra el maximo de todo el repo (que crece con
  // features futuras). La asercion sigue fallando si alguien re-fechara vehiculos
  // ANTES de su predecesor.
  it("vehiculos fue apendida despues de su predecesor conocido (order_status_value_enum)", () => {
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const vehiculosDir = dirs.find((d) => d.endsWith("_vehiculos"));
    expect(vehiculosDir).toBeDefined();

    // Ultima migracion que existia cuando se creo la feature 50 (vehiculos).
    const predecesor = "20260710150000_order_status_value_enum";
    // Si alguien borra/renombra el predecesor, este test debe fallar.
    expect(dirs).toContain(predecesor);
    // El timestamp (prefijo) de vehiculos es posterior al de su predecesor.
    expect(vehiculosDir! > predecesor).toBe(true);
  });
});

// =================================================================================================
// SL-42 (design §2.1, R23) — `20261103120000_vehiculo_activo`.
//
// Lo que hay que demostrar son HECHOS DEL MOTOR, como en `geografia-activo-migration.test.ts`: en un
// esquema desechable se reconstruye `vehiculos` en su forma PREVIA (id + name TEXT único), se siembran
// filas y encima se aplica el SQL REAL leído de disco, solo cualificado al esquema temporal. Y, contra
// la tabla real, que `servi_app` sigue sin poder escribir `vehiculos` (SL-17 R40).
// =================================================================================================

const DIR_ACTIVO = path.join(MIGRATIONS_DIR, "20261103120000_vehiculo_activo");
const upActivo = fs.readFileSync(path.join(DIR_ACTIVO, "migration.sql"), "utf8");
const downActivo = fs.readFileSync(path.join(DIR_ACTIVO, "down.sql"), "utf8");

/** El SQL sin la prosa: lo que Postgres ejecuta de verdad. */
function soloEjecutable(sql: string): string {
  return sql
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n");
}

async function aplicarEnEsquema(admin: PrismaClient, sql: string, esquema: string): Promise<void> {
  const cualificado = soloEjecutable(sql).replaceAll(`"vehiculos"`, `"${esquema}"."vehiculos"`);
  for (const stmt of cualificado.split(";").map((s) => s.trim()).filter(Boolean)) {
    await admin.$executeRawUnsafe(stmt);
  }
}

async function crearVehiculosPrevios(admin: PrismaClient, esquema: string): Promise<void> {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${esquema}"`);
  await admin.$executeRawUnsafe(
    `CREATE TABLE "${esquema}"."vehiculos" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE)`,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO "${esquema}"."vehiculos" ("id","name") VALUES ('v1','moto'),('v2','carro'),('v3','bicicleta')`,
  );
}

async function columnaActivo(
  admin: PrismaClient,
  esquema: string,
): Promise<Array<{ is_nullable: string; column_default: string | null }>> {
  return admin.$queryRawUnsafe(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'vehiculos' AND column_name = 'activo'`,
    esquema,
  );
}

async function filasVehiculos(
  admin: PrismaClient,
  esquema: string,
): Promise<Array<{ id: string; name: string }>> {
  return admin.$queryRawUnsafe(`SELECT "id", "name" FROM "${esquema}"."vehiculos" ORDER BY "id"`);
}

describe("SL-42/R23 — migracion vehiculo_activo: forma en disco", () => {
  it("trae migration.sql y down.sql", () => {
    expect(fs.existsSync(path.join(DIR_ACTIVO, "migration.sql"))).toBe(true);
    expect(fs.existsSync(path.join(DIR_ACTIVO, "down.sql"))).toBe(true);
  });

  it("el up solo añade `activo` NOT NULL DEFAULT true, sin tocar privilegios ni politicas", () => {
    const ejecutable = soloEjecutable(upActivo);
    expect(ejecutable).toMatch(/ALTER TABLE "vehiculos" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true/);
    expect(ejecutable).not.toMatch(/\bGRANT\b|\bREVOKE\b|\bPOLICY\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it("el down solo suelta la columna: ni un DELETE, ni un UPDATE, ni un GRANT", () => {
    const ejecutable = soloEjecutable(downActivo);
    expect(ejecutable).toMatch(/ALTER TABLE "vehiculos" DROP COLUMN IF EXISTS "activo"/);
    expect(ejecutable).not.toMatch(/\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b|\bGRANT\b/i);
  });
});

describe.skipIf(!HAY_BASE_DE_DATOS)("SL-42/R23 — el up y el down, contra Postgres", () => {
  const esquema = `t_sl42_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  let admin: PrismaClient;
  let antes: Array<{ id: string; name: string }> = [];

  beforeAll(async () => {
    admin = crearPrismaDeTest();
    await crearVehiculosPrevios(admin, esquema);
    antes = await filasVehiculos(admin, esquema);
    await aplicarEnEsquema(admin, upActivo, esquema);
  }, 120_000);

  afterAll(async () => {
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await admin?.$disconnect();
  });

  it("R23 — el corpus llego a la base: 3 vehiculos antes del up", () => {
    // ANTI-VACUIDAD: sin filas previas, «todas quedan activas» seria verdad por ausencia.
    expect(antes.map((f) => f.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("R23 — tras el up, `activo` es NOT NULL con default true y TODAS las filas previas quedan activas", async () => {
    expect(await columnaActivo(admin, esquema)).toEqual([{ is_nullable: "NO", column_default: "true" }]);
    const [{ activos }] = await admin.$queryRawUnsafe<Array<{ activos: number }>>(
      `SELECT COUNT(*)::int AS activos FROM "${esquema}"."vehiculos" WHERE "activo" IS TRUE`,
    );
    expect(activos).toBe(antes.length);
  });

  it("R23 — el down quita la columna y deja las mismas filas; correrlo dos veces es un no-op", async () => {
    await admin.$executeRawUnsafe(`UPDATE "${esquema}"."vehiculos" SET "activo" = false WHERE "id" = 'v2'`);
    await aplicarEnEsquema(admin, downActivo, esquema);
    expect(await columnaActivo(admin, esquema)).toEqual([]);
    expect(await filasVehiculos(admin, esquema)).toEqual(antes);
    await aplicarEnEsquema(admin, downActivo, esquema);
    expect(await filasVehiculos(admin, esquema)).toEqual(antes);
  });
});

describe.skipIf(!HAY_BASE_DE_DATOS)("SL-42/R23 — `servi_app` sigue sin escribir `vehiculos` (SL-17 R40)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R23 — control: con servi_app, leer `vehiculos` (incluida `activo`) pasa", async () => {
    const r = await revertida(base, async (tx) => {
      const { id } = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
      await comoApp(tx, id);
      return intentar(tx, `SELECT "id", "name", "activo" FROM "vehiculos" LIMIT 1`);
    });
    expect(r).toBeNull();
  });

  it("R23 — con servi_app, INSERT, UPDATE (tambien de `activo`) y DELETE en `vehiculos` dan 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const vehiculoId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "vehiculos" ("id", "name") VALUES ($1, $2)`,
        vehiculoId,
        `sl42 r23 ${vehiculoId.slice(0, 8)}`,
      );
      const { id } = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
      await comoApp(tx, id);
      return {
        insertar: await intentar(
          tx,
          `INSERT INTO "vehiculos" ("id", "name") VALUES ($1, $2)`,
          randomUUID(),
          `sl42 r23 otro ${randomUUID().slice(0, 8)}`,
        ),
        renombrar: await intentar(tx, `UPDATE "vehiculos" SET "name" = 'x' WHERE "id" = $1`, vehiculoId),
        desactivar: await intentar(tx, `UPDATE "vehiculos" SET "activo" = false WHERE "id" = $1`, vehiculoId),
        borrar: await intentar(tx, `DELETE FROM "vehiculos" WHERE "id" = $1`, vehiculoId),
      };
    });
    for (const [caso, sqlstate] of Object.entries(r)) expect(sqlstate, caso).toBe("42501");
  });
});
