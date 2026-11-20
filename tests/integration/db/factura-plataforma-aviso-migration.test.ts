import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  etiquetasDeEnum,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-136 (T5.1, R31) — la migración que añade el aviso de factura emitida a TRES enums
// (`notificacion_evento`, `notificacion_entidad_tipo` y `job_tipo`) y su `down.sql` dinámico.
// Se afirma:
//  (a) el UP añade solo esos tres valores, con `IF NOT EXISTS`, sin backfill ni DDL de tablas, y no los usa
//      (`55P04`); su timestamp es posterior a la última migración de `dev` al abrir la ficha;
//  (b) el DOWN no recrea con lista fija, no borra ni reescribe filas, quita solo esos tres valores y su función
//      es la de la 462 salvo el sufijo;
//  (c) la base aplicada tiene los tres valores, añadidos detrás de los previos;
//  (d) el DOWN ejercitado: aborta sin borrar nada si un aviso o un trabajo usa los valores; sin filas, quita
//      solo los tres valores, conserva los índices y es idempotente.
// Todo lo que escribe corre en transacciones que siempre se revierten (el DDL también es transaccional).

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "db", "migrations");

function carpetaQueTerminaEn(sufijo: string): string {
  const dir = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .find((n) => n.endsWith(sufijo));
  if (!dir) throw new Error(`No se encontró la carpeta de migración ${sufijo}`);
  return path.join(MIGRATIONS_DIR, dir);
}

const dirNueva = carpetaQueTerminaEn("_factura_plataforma_aviso_enums");
const dirPagoPlataforma = carpetaQueTerminaEn("_pago_plataforma_confirmacion");
const dir462 = carpetaQueTerminaEn("_notificacion_evento_reprogramadas_esperan_cierre");

const upSql = fs.readFileSync(path.join(dirNueva, "migration.sql"), "utf8");
const downSql = fs.readFileSync(path.join(dirNueva, "down.sql"), "utf8");
const down462 = fs.readFileSync(path.join(dir462, "down.sql"), "utf8");

function sinComentarios(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !l.trimStart().startsWith("--"))
    .join("\n");
}

const upDdl = sinComentarios(upSql);
const downDdl = sinComentarios(downSql);

const EVENTO = "factura_plataforma_emitida";
const ENTIDAD = "factura_plataforma";
const JOB = "factura_plataforma_aviso";

/** La función de reversión, tal cual está en el down (una sola sentencia), con su sufijo. */
function funcionDe(down: string, sufijo: string): string {
  const m = new RegExp(
    `CREATE OR REPLACE FUNCTION pg_temp\\.quitar_valores_de_enum_${sufijo}[\\s\\S]*?\\$fn\\$;`,
  ).exec(down);
  if (m === null) throw new Error(`el down.sql no trae la función de reversión _${sufijo}`);
  return m[0];
}

describe("SLT-136/R31 — el UP solo añade los tres valores", () => {
  it("añade EXACTAMENTE los tres valores, con `IF NOT EXISTS`, y nada más", () => {
    expect(upDdl).toMatch(/ALTER TYPE "notificacion_evento" ADD VALUE IF NOT EXISTS 'factura_plataforma_emitida';/);
    expect(upDdl).toMatch(/ALTER TYPE "notificacion_entidad_tipo" ADD VALUE IF NOT EXISTS 'factura_plataforma';/);
    expect(upDdl).toMatch(/ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'factura_plataforma_aviso';/);
    expect(upDdl.split(";").filter((s) => s.trim().length > 0)).toHaveLength(3);
  });

  it("no crea tablas, no altera columnas, no crea índices y no tiene backfill", () => {
    expect(upDdl).not.toMatch(/CREATE TABLE/i);
    expect(upDdl).not.toMatch(/ALTER TABLE/i);
    expect(upDdl).not.toMatch(/CREATE (UNIQUE )?INDEX/i);
    expect(upDdl).not.toMatch(/POLICY/i);
    expect(upDdl).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\s/im);
  });

  it("no usa los valores que acaba de añadir (`55P04`)", () => {
    const sinAdd = upDdl.split("\n").filter((l) => !l.includes("ADD VALUE")).join("\n");
    expect(sinAdd).not.toContain(EVENTO);
    expect(sinAdd).not.toContain(JOB);
  });

  it("va sola, con timestamp posterior a la última de `dev` al abrir la ficha", () => {
    expect(path.basename(dirNueva) > path.basename(dirPagoPlataforma)).toBe(true);
    expect(path.basename(dirNueva)).toMatch(/^20261117120000_/);
  });
});

describe("SLT-136/R31 — el DOWN es dinámico y solo quita lo suyo", () => {
  it("no recrea ningún tipo con una lista escrita a mano", () => {
    expect(downDdl).not.toMatch(/CREATE TYPE "[a-z_]+" AS ENUM \(\s*'/);
  });

  it("quita EXACTAMENTE los tres valores, uno por tipo", () => {
    expect(downDdl).toMatch(
      /quitar_valores_de_enum_136\('public', 'notificacion_evento', ARRAY\[\s*'factura_plataforma_emitida'\s*\]\)/,
    );
    expect(downDdl).toMatch(
      /quitar_valores_de_enum_136\('public', 'notificacion_entidad_tipo', ARRAY\[\s*'factura_plataforma'\s*\]\)/,
    );
    expect(downDdl).toMatch(/quitar_valores_de_enum_136\('public', 'job_tipo', ARRAY\[\s*'factura_plataforma_aviso'\s*\]\)/);
    expect(downDdl.match(/SELECT pg_temp\.quitar_valores_de_enum_136\(/g)).toHaveLength(3);
    for (const ajeno of ["factura_plataforma_cerrar", "reprogramadas_esperan_cierre", "plan_aviso_correo"]) {
      expect(downDdl).not.toContain(`'${ajeno}'`);
    }
  });

  it("no borra ni reescribe ninguna fila para hacer sitio", () => {
    expect(downDdl).not.toMatch(/^\s*DELETE\s/im);
    expect(downDdl).not.toMatch(/^\s*UPDATE\s/im);
    expect(downDdl).not.toMatch(/DROP TABLE/);
    expect(downDdl).not.toMatch(/TRUNCATE/i);
  });

  it("la función es la de la 462, byte a byte salvo el sufijo", () => {
    const normalizar = (f: string, n: string) =>
      f.replace(new RegExp(`_${n}\\b`, "g"), "_NNN").replace(new RegExp(`rollback ${n}`, "g"), "rollback NNN");
    expect(normalizar(funcionDe(downSql, "136"), "136")).toBe(normalizar(funcionDe(down462, "462"), "462"));
  });
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("SLT-136/R31 — la base aplicada", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("tiene los tres valores, añadidos detrás de los previos (no recreados)", async () => {
    const eventos = await etiquetasDeEnum(prisma, "notificacion_evento");
    const entidades = await etiquetasDeEnum(prisma, "notificacion_entidad_tipo");
    const jobs = await etiquetasDeEnum(prisma, "job_tipo");
    expect(eventos.indexOf(EVENTO)).toBeGreaterThan(eventos.indexOf("reprogramadas_esperan_cierre"));
    expect(entidades.indexOf(ENTIDAD)).toBeGreaterThan(entidades.indexOf("reprogramadas_esperan_cierre_dia"));
    expect(jobs.indexOf(JOB)).toBeGreaterThan(jobs.indexOf("factura_plataforma_cerrar"));
    expect(eventos.indexOf("reprogramadas_esperan_cierre")).toBeGreaterThan(-1);
    expect(jobs.indexOf("factura_plataforma_cerrar")).toBeGreaterThan(-1);
  });
});

describeSiHayBase("SLT-136/R31 — el DOWN ejercitado de verdad", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Las sentencias del down sin BEGIN/COMMIT (ya estamos en la tx del test); la función va entera. */
  function sentenciasDelDown(): string[] {
    const funcion = funcionDe(downDdl, "136");
    expect(downDdl).toContain(funcion);
    const resto = downDdl
      .replace(funcion, "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(BEGIN|COMMIT)$/i.test(s));
    expect(resto).toHaveLength(3);
    return [funcion, ...resto];
  }

  async function fotoIndices(tx: TxDeTest) {
    return tx.$queryRawUnsafe<{ indexname: string; def: string }[]>(
      `SELECT indexname, indexdef AS def FROM pg_indexes
        WHERE schemaname = 'public' AND tablename IN ('notificacion','push_envio_dia','jobs')
        ORDER BY 1`,
    );
  }

  async function correrDownYCapturar(tx: TxDeTest): Promise<string> {
    await tx.$executeRawUnsafe(`SAVEPOINT antes_del_down`);
    let error = "NO FALLO";
    try {
      for (const s of sentenciasDelDown()) await tx.$executeRawUnsafe(s);
    } catch (e) {
      error = String((e as Error).message);
    }
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT antes_del_down`);
    return error;
  }

  it("con un aviso de factura emitida ABORTA y el aviso sigue ahí", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "notificacion" ("id","tipo","evento","descripcion","entidad_tipo","entidad_id","destinatario_rol")
         VALUES ($1, 'alert'::"notificacion_tipo", $2::"notificacion_evento", 'x', $3::"notificacion_entidad_tipo", $4, 'maestro'::"rol_value")`,
        id,
        EVENTO,
        ENTIDAD,
        randomUUID(),
      );
      const error = await correrDownYCapturar(tx);
      const filas = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "notificacion" WHERE "id" = $1`,
        id,
      );
      return { error, n: Number(filas[0]?.n ?? 0) };
    });
    expect(r.error).toContain("rollback 136");
    expect(r.error).toContain("se aborta sin borrar nada");
    expect(r.n).toBe(1);
  });

  it("con un trabajo de aviso en la cola ABORTA y el trabajo sigue ahí", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await tx.$executeRawUnsafe(
        `DELETE FROM "notificacion" WHERE "evento"::text = $1 OR "entidad_tipo"::text = $2`,
        EVENTO,
        ENTIDAD,
      );
      await tx.$executeRawUnsafe(`DELETE FROM "push_envio_dia" WHERE "evento"::text = $1`, EVENTO);
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "jobs" ("id", "tipo", "payload", "estado", "intentos", "max_intentos")
         VALUES ($1, $2::"job_tipo", '{}'::jsonb, 'pending', 0, 5)`,
        id,
        JOB,
      );
      const error = await correrDownYCapturar(tx);
      const filas = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "jobs" WHERE "id" = $1`, id);
      return { error, n: Number(filas[0]?.n ?? 0) };
    });
    expect(r.error).toContain("rollback 136");
    expect(r.error).toContain("jobs");
    expect(r.error).toContain("se aborta sin borrar nada");
    expect(r.n).toBe(1);
  });

  it("CONTROL — sin filas, quita SOLO los tres valores, conserva los índices y es idempotente", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await tx.$executeRawUnsafe(
        `DELETE FROM "notificacion" WHERE "evento"::text = $1 OR "entidad_tipo"::text = $2`,
        EVENTO,
        ENTIDAD,
      );
      await tx.$executeRawUnsafe(`DELETE FROM "push_envio_dia" WHERE "evento"::text = $1`, EVENTO);
      await tx.$executeRawUnsafe(`DELETE FROM "jobs" WHERE "tipo"::text = $1`, JOB);
      const antes = {
        eventos: await etiquetasDeEnum(tx, "notificacion_evento"),
        entidades: await etiquetasDeEnum(tx, "notificacion_entidad_tipo"),
        jobs: await etiquetasDeEnum(tx, "job_tipo"),
        indices: await fotoIndices(tx),
      };
      for (const s of sentenciasDelDown()) await tx.$executeRawUnsafe(s);
      const despues = {
        eventos: await etiquetasDeEnum(tx, "notificacion_evento"),
        entidades: await etiquetasDeEnum(tx, "notificacion_entidad_tipo"),
        jobs: await etiquetasDeEnum(tx, "job_tipo"),
        indices: await fotoIndices(tx),
      };
      for (const s of sentenciasDelDown()) await tx.$executeRawUnsafe(s);
      const otraVez = await etiquetasDeEnum(tx, "job_tipo");
      return { antes, despues, otraVez };
    });

    // Anti-vacuidad: los valores estaban antes.
    expect(r.antes.eventos).toContain(EVENTO);
    expect(r.antes.entidades).toContain(ENTIDAD);
    expect(r.antes.jobs).toContain(JOB);
    expect(r.despues.eventos).toEqual(r.antes.eventos.filter((v) => v !== EVENTO));
    expect(r.despues.entidades).toEqual(r.antes.entidades.filter((v) => v !== ENTIDAD));
    expect(r.despues.jobs).toEqual(r.antes.jobs.filter((v) => v !== JOB));
    expect(r.otraVez).toEqual(r.despues.jobs);
    expect(r.despues.indices).toEqual(r.antes.indices);
    expect(r.antes.indices.map((i) => i.indexname)).toContain("notificacion_dedupe_key");
  });
});
