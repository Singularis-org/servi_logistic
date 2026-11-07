import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
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

/**
 * SLT-81 (design §2.1; R17) — la migración `slt81_historial_datos_pais`, de ida y vuelta.
 *
 * 1. Aplicada, los cinco valores de acción y la entidad `tipo_documento` quedan en sus enums y se
 *    pueden escribir.
 * 2. Con una fila que usa un valor nuevo, el down aborta (P0001) sin tocar nada: es el rastro del
 *    superadmin.
 * 3. Sin esas filas, el down deja el esquema como antes y una fila vieja (`pais_creado`) intacta;
 *    reaplicada, el esquema vuelve igual que la primera vez.
 *
 * BASE PROPIA (`slt81_iv_<rand>`): el down recrea los dos enums y reescribe las columnas de
 * `historial_plataforma`; en la base compartida tomaría su lock exclusivo bajo los demás archivos.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261107120200_slt42_usuario_documento_unico_por_tipo";
const M = "20261108120000_slt81_historial_datos_pais";
const ACCIONES_NUEVAS = [
  "pais_datos_cambiados",
  "tipo_documento_creado",
  "tipo_documento_editado",
  "tipo_documento_activado",
  "tipo_documento_desactivado",
];

const BASE = `slt81_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

let db: Conexion;
let admin: Conexion;

/** La foto del fixture SIN el conteo de filas: el caso escribe filas de historial entre fotos. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  return resto;
}

async function etiquetas(tipo: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = $1 AND n.nspname = 'public' ORDER BY e.enumsortorder`,
    [tipo],
  );
  return rows.map((r) => String(r.l));
}

async function historial(accion: string, entidad: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "historial_plataforma" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta", "pais_id")
     VALUES ($1, $2::historial_plataforma_accion, $3::historial_plataforma_entidad, 'CR', 'Costa Rica', 'CR')`,
    [id, accion, entidad],
  );
  return id;
}

describe("SLT-81 — la migración en disco", () => {
  it("carpeta detrás de las de SLT-42, con un down que aborta ante el rastro y recrea los dos enums", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M), `${M} no está en disco`).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M), `${M} no va detrás de ${M_ANTERIOR}`).toBeGreaterThan(carpetas.indexOf(M_ANTERIOR));
    const subida = sqlDe(M, "migration.sql");
    for (const v of ACCIONES_NUEVAS) {
      expect(subida).toContain(`ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS '${v}'`);
    }
    expect(subida).toContain(`ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'tipo_documento'`);
    const down = sqlDe(M, "down.sql");
    expect(down).toMatch(/RAISE EXCEPTION/);
    expect(down).not.toMatch(/DELETE FROM "historial_plataforma"/);
  });
});

describeSiHayBase("SLT-81 — slt81_historial_datos_pais de ida y vuelta", () => {
  let antes: Foto;
  let subida: Foto;
  let vieja: string;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    vieja = await historial("pais_creado", "pais");
    antes = await fotoSinFilas();
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    subida = await fotoSinFilas();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("control: la migración cambia el esquema (si no, la vuelta no probaría nada)", () => {
    expect(diferencias(subida, antes).length).toBeGreaterThan(0);
  });

  it("R17: los cinco valores de acción y la entidad tipo_documento quedan en sus enums y se pueden escribir", async () => {
    expect(await etiquetas("historial_plataforma_accion")).toEqual(expect.arrayContaining(ACCIONES_NUEVAS));
    expect(await etiquetas("historial_plataforma_entidad")).toContain("tipo_documento");
    const id = await historial("tipo_documento_creado", "tipo_documento");
    const { rows } = await db.query(
      `SELECT accion::text AS a, entidad_tipo::text AS e FROM historial_plataforma WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([{ a: "tipo_documento_creado", e: "tipo_documento" }]);
    await db.query(`DELETE FROM historial_plataforma WHERE id = $1`, [id]);
  });

  it("con una fila que usa un valor nuevo, el down aborta (P0001) sin tocar nada", async () => {
    const id = await historial("pais_datos_cambiados", "pais");
    const previo = await fotoSinFilas();

    const fallo = await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(fallo, "el down no abortó").toBeInstanceOf(ErrorDeScript);
    expect((fallo as ErrorDeScript).sqlstate).toBe("P0001");
    expect((fallo as ErrorDeScript).message).toContain("historial_plataforma");
    expect(diferencias(await fotoSinFilas(), previo)).toEqual([]);

    await db.query(`DELETE FROM historial_plataforma WHERE id = $1`, [id]);
  }, 120_000);

  it("sin esas filas, el down deja el esquema como antes y la fila vieja intacta; reaplicada, igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    const acciones = await etiquetas("historial_plataforma_accion");
    for (const v of ACCIONES_NUEVAS) expect(acciones).not.toContain(v);
    expect(await etiquetas("historial_plataforma_entidad")).not.toContain("tipo_documento");
    const { rows } = await db.query(`SELECT accion::text AS a FROM historial_plataforma WHERE id = $1`, [vieja]);
    expect(rows).toEqual([{ a: "pais_creado" }]);
    expect(diferencias(await fotoSinFilas(), antes)).toEqual([]);

    await ejecutar(db, sqlDe(M, "migration.sql"), `${M} (otra vez)`);
    expect(diferencias(await fotoSinFilas(), subida)).toEqual([]);
  }, 180_000);
});
