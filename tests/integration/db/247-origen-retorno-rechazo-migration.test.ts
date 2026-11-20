import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  ORDEN_HISTORIAL_ORIGEN_TIPO_SEED,
  ORIGEN_TIPOS_CON_GESTION,
  ORIGEN_TIPOS_VISITA_REAL,
} from "@/lib/types/orden-historial";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  etiquetasDeEnum,
} from "./_postgres-real";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-247 / T1.4 (R1771) — cobertura de
// `20261124130000_orden_historial_origen_retorno_rechazo_cierre`.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// LO QUE MIDE, y de DONDE sale cada cosa:
//   (estatico) el `up` es UN `ADD VALUE IF NOT EXISTS` sin `BEFORE`/`AFTER` ni uso del valor; el
//       `down` no nombra el valor, lleva el aviso de lista fechada y retipa LAS DOS columnas que
//       usan el tipo (`orden_historial_estado.origen_tipo` y `orden_evento.familia_aplicacion`),
//       soltando y recreando el CHECK de la segunda;
//   (a) el enum de `public` tiene el valor AL FINAL y coincide con el SEED de TypeScript;
//   (b) la lista que el `down.sql` recrea es la PREVIA EXACTA — comparada con la historia
//       RECONSTRUIDA leyendo `db/migrations` (no con el propio `down.sql`, que seria circular) y con
//       la de `public` menos el valor nuevo;
//   (c) el up y el down REALES ejecutan en un esquema desechable con las dos columnas y el CHECK
//       real, dentro de una transaccion que se revierte;
//   (d) con UNA fila que use el valor nuevo, el down FALLA ruidosamente y no la borra.

const MIGRACIONES = path.join(process.cwd(), "db", "migrations");
const DIR_ESTA = "20261124130000_orden_historial_origen_retorno_rechazo_cierre";
const TIPO = "orden_historial_origen_tipo";
const VALOR = "retorno_por_rechazo_cierre";

const upSql = fs.readFileSync(path.join(MIGRACIONES, DIR_ESTA, "migration.sql"), "utf8");
const downSql = fs.readFileSync(path.join(MIGRACIONES, DIR_ESTA, "down.sql"), "utf8");

function soloEjecutable(sql: string): string {
  return sql
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n");
}

function sentencias(sql: string): string[] {
  return soloEjecutable(sql)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function valoresEntreComillas(texto: string): string[] {
  return [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Los valores del `CREATE TYPE "<TIPO>" AS ENUM ( … )` de un SQL, en orden. */
function valoresDelCreateType(sql: string): string[] {
  const m = new RegExp(`CREATE TYPE "${TIPO}" AS ENUM \\(([\\s\\S]*?)\\)`, "m").exec(
    soloEjecutable(sql),
  );
  if (m === null) throw new Error(`no hay CREATE TYPE "${TIPO}"`);
  return valoresEntreComillas(m[1]);
}

function carpetasDeMigracion(): string[] {
  return fs
    .readdirSync(MIGRACIONES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function migrationSqlDe(dir: string): string {
  const ruta = path.join(MIGRACIONES, dir, "migration.sql");
  return fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : "";
}

const ampliacionesDe = (dir: string): string[] =>
  soloEjecutable(migrationSqlDe(dir)).match(
    new RegExp(`ALTER TYPE "${TIPO}"\\s+ADD VALUE[^;]*`, "g"),
  ) ?? [];

/**
 * La lista PREVIA a esta migracion, RECONSTRUIDA de la historia: el `CREATE TYPE` de la carpeta que
 * crea el tipo MAS cada `ADD VALUE` de las carpetas posteriores (anteriores a esta), en orden de
 * carpeta. Si `dev` mergea otra ampliacion con timestamp anterior a esta, entra aqui sola y el caso
 * (b) se pone rojo diciendo que valor le falta al `down.sql`.
 */
function listaPreviaReconstruida(): string[] {
  const carpetas = carpetasDeMigracion();
  const origen = carpetas.find((dir) =>
    new RegExp(`CREATE TYPE "${TIPO}" AS ENUM`).test(soloEjecutable(migrationSqlDe(dir))),
  );
  if (origen === undefined) throw new Error(`ninguna migracion crea "${TIPO}"`);
  const lista = valoresDelCreateType(migrationSqlDe(origen));
  for (const dir of carpetas.filter((d) => d > origen && d < DIR_ESTA)) {
    for (const ampliacion of ampliacionesDe(dir)) {
      lista.push(...valoresEntreComillas(ampliacion));
    }
  }
  return lista;
}

// ---------------------------------------------------------------------------------------------
// Estatico: corre SIEMPRE, tambien sin base.
// ---------------------------------------------------------------------------------------------

describe("SLT-247/T1.1 — la migracion del origen nuevo: forma en disco", () => {
  it("el UP es UNA sola sentencia: `ADD VALUE IF NOT EXISTS`, sin BEFORE/AFTER ni uso del valor", () => {
    const s = sentencias(upSql);
    expect(s).toEqual([`ALTER TYPE "${TIPO}" ADD VALUE IF NOT EXISTS '${VALOR}'`]);
  });

  it("es la ULTIMA migracion que amplia el tipo (si no, el down de esta seria rancio)", () => {
    const posteriores = carpetasDeMigracion().filter((d) => d > DIR_ESTA && ampliacionesDe(d).length > 0);
    expect(posteriores).toEqual([]);
    // Anti-vacuidad: la propia carpeta SI amplia el tipo.
    expect(ampliacionesDe(DIR_ESTA)).toHaveLength(1);
  });

  it("el DOWN no nombra el valor nuevo en su SQL ejecutable, y lleva el aviso de lista fechada", () => {
    expect(soloEjecutable(downSql)).not.toContain(VALOR);
    expect(downSql).toContain("ESTA LISTA ES UNA FOTO DEL 2026-11-20");
  });

  it("⭑ el DOWN recrea la lista PREVIA EXACTA, igual a la historia reconstruida de `db/migrations`", () => {
    const previa = listaPreviaReconstruida();
    // Anti-vacuidad: un parser que no encontrara nada daria [] == [].
    expect(previa.length).toBeGreaterThan(30);
    expect(valoresDelCreateType(downSql)).toEqual(previa);
  });

  it("el DOWN retipa las DOS columnas del tipo y suelta/recrea el CHECK de `orden_evento`", () => {
    const ejecutable = soloEjecutable(downSql);
    expect(ejecutable).toContain(`USING ("origen_tipo"::text::"${TIPO}")`);
    expect(ejecutable).toContain(`USING ("familia_aplicacion"::text::"${TIPO}")`);
    expect(ejecutable).toContain(
      'ALTER TABLE "orden_evento" DROP CONSTRAINT "orden_evento_familia_aplicacion_check"',
    );
    expect(ejecutable).toContain(
      'ALTER TABLE "orden_evento" ADD CONSTRAINT "orden_evento_familia_aplicacion_check"',
    );
    expect(ejecutable).toContain(`DROP TYPE "${TIPO}_old"`);
    // Ni una escritura de datos.
    expect(ejecutable).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it("el catalogo de TypeScript es la lista previa MAS el valor nuevo, al final", () => {
    // Como CONJUNTO: el SEED no sigue el orden de `enumsortorder` (agrupa por familia). Lo que si
    // se exige es que el valor nuevo sea el ultimo declarado.
    expect([...ORDEN_HISTORIAL_ORIGEN_TIPO_SEED].sort()).toEqual(
      [...listaPreviaReconstruida(), VALOR].sort(),
    );
    expect(ORDEN_HISTORIAL_ORIGEN_TIPO_SEED.at(-1)).toBe(VALOR);
    expect(ORIGEN_TIPOS_VISITA_REAL as readonly string[]).not.toContain(VALOR);
    expect(ORIGEN_TIPOS_CON_GESTION as readonly string[]).not.toContain(VALOR);
  });
});

// ---------------------------------------------------------------------------------------------
// Postgres real.
// ---------------------------------------------------------------------------------------------

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Medicion {
  despuesDelUp: string[];
  despuesDelDown: string[];
  familiasTrasElDown: string[];
  checkRecreadoRechaza: boolean;
  downConFilaFalla: boolean;
  filaConValorSobrevive: boolean;
}

/** El esquema desechable con la MINIMA forma que el down necesita: las dos columnas y el CHECK. */
async function crearEsquema(
  tx: { $executeRawUnsafe: (sql: string) => Promise<number> },
  esquema: string,
  valores: string[],
): Promise<void> {
  await tx.$executeRawUnsafe(`CREATE SCHEMA "${esquema}"`);
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${esquema}", public`);
  await tx.$executeRawUnsafe(
    `CREATE TYPE "${esquema}"."${TIPO}" AS ENUM (${valores.map((v) => `'${v}'`).join(", ")})`,
  );
  await tx.$executeRawUnsafe(
    `CREATE TABLE "${esquema}"."orden_historial_estado" (
       "id" uuid PRIMARY KEY,
       "origen_tipo" "${esquema}"."${TIPO}" NOT NULL)`,
  );
  await tx.$executeRawUnsafe(
    `CREATE TABLE "${esquema}"."orden_evento" (
       "id" uuid PRIMARY KEY,
       "tipo" text NOT NULL,
       "familia_aplicacion" "${esquema}"."${TIPO}")`,
  );
  // El CHECK REAL, copiado de `20260923120100_orden_evento` (no de este down).
  const check = /ALTER TABLE "orden_evento" ADD CONSTRAINT "orden_evento_familia_aplicacion_check"[\s\S]*?\);/.exec(
    soloEjecutable(migrationSqlDe("20260923120100_orden_evento")),
  );
  if (check === null) throw new Error("no se encontro el CHECK de orden_evento");
  await tx.$executeRawUnsafe(check[0].replace(/;$/, ""));
}

describeSiHayBase("SLT-247/T1.4 — el enum y el DDL contra Postgres real", () => {
  let prisma: PrismaClient;
  let enPublic: string[];
  let medicion: Medicion;
  const previa = listaPreviaReconstruida();

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    enPublic = await etiquetasDeEnum(prisma, TIPO);

    medicion = await enTransaccionRevertida(prisma, async (tx) => {
      const esquema = `t247_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      await crearEsquema(tx, esquema, previa);
      const labels = async () => etiquetasEnEsquema(tx, esquema);

      // Filas legitimas que el down debe conservar y que el CHECK recreado debe seguir admitiendo.
      await tx.$executeRawUnsafe(
        `INSERT INTO "orden_historial_estado" VALUES ('${randomUUID()}', 'gestion'), ('${randomUUID()}', 'liberacion_sin_gestionar')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "orden_evento" VALUES ('${randomUUID()}', 'gestion_registrada', 'incidente'), ('${randomUUID()}', 'ayuda_solicitada', NULL)`,
      );

      for (const s of sentencias(upSql)) await tx.$executeRawUnsafe(s);
      const despuesDelUp = await labels();

      // EL DOWN REAL: si el CHECK no se soltara, o faltara retipar una columna, revienta AQUI.
      for (const s of sentencias(downSql)) await tx.$executeRawUnsafe(s);
      const despuesDelDown = await labels();

      const familiasTrasElDown = (
        await tx.$queryRawUnsafe<{ f: string }[]>(
          `SELECT "origen_tipo"::text AS f FROM "orden_historial_estado"
           UNION ALL SELECT "familia_aplicacion"::text FROM "orden_evento" WHERE "familia_aplicacion" IS NOT NULL
           ORDER BY 1`,
        )
      ).map((r) => r.f);

      // El CHECK recreado sigue vivo: una familia fuera de las tres de calle se rechaza.
      let checkRecreadoRechaza = false;
      await tx.$executeRawUnsafe("SAVEPOINT sp_check");
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "orden_evento" VALUES ('${randomUUID()}', 'gestion_registrada', 'deshacer_gestion')`,
        );
      } catch {
        checkRecreadoRechaza = true;
      }
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT sp_check");

      // (d) La precondicion ruidosa, en un SEGUNDO esquema con el valor ya en su CREATE TYPE (un
      // valor añadido con ADD VALUE no se puede usar en la misma transaccion: 55P04).
      const esquema2 = `${esquema}_b`;
      await crearEsquema(tx, esquema2, [...previa, VALOR]);
      const idFila = randomUUID();
      await tx.$executeRawUnsafe(`INSERT INTO "orden_historial_estado" VALUES ('${idFila}', '${VALOR}')`);
      let downConFilaFalla = false;
      await tx.$executeRawUnsafe("SAVEPOINT sp_pre");
      try {
        for (const s of sentencias(downSql)) await tx.$executeRawUnsafe(s);
      } catch {
        downConFilaFalla = true;
      }
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT sp_pre");
      const sobrevive = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "orden_historial_estado" WHERE "id" = '${idFila}' AND "origen_tipo"::text = '${VALOR}'`,
      );

      return {
        despuesDelUp,
        despuesDelDown,
        familiasTrasElDown,
        checkRecreadoRechaza,
        downConFilaFalla,
        filaConValorSobrevive: sobrevive[0]?.n === 1,
      };
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("(a) `public` tiene el valor AL FINAL y, como conjunto, los mismos que el SEED de TypeScript", () => {
    expect(enPublic.at(-1), "la migracion no esta aplicada en esta base").toBe(VALOR);
    expect([...enPublic].sort()).toEqual([...ORDEN_HISTORIAL_ORIGEN_TIPO_SEED].sort());
  });

  it("(b) la historia reconstruida es `public` menos el valor nuevo (tres fuentes, una lista)", () => {
    expect(previa).toEqual(enPublic.filter((v) => v !== VALOR));
  });

  it("(c) el UP apende el valor al final de la lista previa", () => {
    expect(medicion.despuesDelUp).toEqual([...previa, VALOR]);
  });

  it("⭑ (c) el DOWN devuelve EXACTAMENTE la lista previa, valor a valor y en orden", () => {
    expect(medicion.despuesDelDown).toEqual(previa);
  });

  it("(c) el DOWN conserva las filas de las dos columnas y recrea el CHECK de `orden_evento`", () => {
    expect(medicion.familiasTrasElDown).toEqual(["gestion", "incidente", "liberacion_sin_gestionar"]);
    expect(medicion.checkRecreadoRechaza).toBe(true);
  });

  it("(d) con una fila que usa el valor, el DOWN FALLA ruidosamente y la fila sigue ahi", () => {
    expect(medicion.downConFilaFalla).toBe(true);
    expect(medicion.filaConValorSobrevive).toBe(true);
  });
});

async function etiquetasEnEsquema(
  tx: { $queryRawUnsafe: <T>(sql: string, ...args: unknown[]) => Promise<T> },
  esquema: string,
): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ v: string }[]>(
    `SELECT e.enumlabel AS v
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1 AND t.typname = $2
      ORDER BY e.enumsortorder`,
    esquema,
    TIPO,
  );
  return filas.map((f) => f.v);
}
