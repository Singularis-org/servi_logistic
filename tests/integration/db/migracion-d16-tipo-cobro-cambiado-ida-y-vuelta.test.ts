import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
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
 * Ajuste planes-custom (D16; 2026-11-03) — la migración `historial_accion_plan_tipo_cobro_cambiado`, de ida
 * y vuelta.
 *
 * 1. Con todo lo anterior aplicado, una empresa con plan y una fila `plan_asignado`, se aplica la migración:
 *    `plan_tipo_cobro_cambiado` queda AL FINAL del enum y se puede escribir.
 * 2. El down CONVIERTE las filas de la acción nueva a `plan_asignado` con su antes y su después intactos (la
 *    forma con la que el código anterior a D16 escribía el cambio de solo el tipo) y no toca las demás. El
 *    esquema vuelve a ser el de antes y el valor ya no está en el enum.
 * 3. Reaplicada, el esquema vuelve igual que la primera vez.
 *
 * BASE PROPIA (`d16_iv_<rand>`): el down recrea `historial_accion_tipo` y reescribe la columna de
 * `historial_accion`; en la base compartida tomaría su lock exclusivo bajo los demás archivos.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261104130000_plan_sin_negociable_y_tipo_cobro";
const M = "20261104130100_historial_accion_plan_tipo_cobro_cambiado";
const TIPO_NUEVO = "plan_tipo_cobro_cambiado";

const BASE = `d16_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

let db: Conexion;
let admin: Conexion;
let empresa: string;
let planId: string;

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

/** Una fila de historial del plan de la empresa, como la escribe `appendAccion` (sin actor: sistema). */
async function historial(accion: string, valorAnterior: string | null, valorNuevo: string | null): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
       "valor_anterior", "valor_nuevo", "lote_id", "organizacion_id")
     VALUES ($1, $2::historial_accion_tipo, 'plan', $3, 'Plan «D16 iv»', $4, $5, $6, $7)`,
    [id, accion, planId, valorAnterior, valorNuevo, randomUUID(), empresa],
  );
  return id;
}

async function filas(ids: string[]): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query(
    `SELECT "id", "accion"::text AS accion, "valor_anterior", "valor_nuevo", "entidad_id", "entidad_etiqueta", "lote_id"
       FROM "historial_accion" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
    [ids],
  );
  return rows;
}

describe("Ajuste planes-custom D16 — la migración en disco", () => {
  it("carpeta nueva detrás de la última de planes, con su down.sql que convierte antes de quitar el valor", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M), `${M} no está en disco`).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M), `${M} no va detrás de ${M_ANTERIOR}`).toBeGreaterThan(carpetas.indexOf(M_ANTERIOR));
    expect(sqlDe(M, "migration.sql")).toMatch(/ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'plan_tipo_cobro_cambiado'/);
    const down = sqlDe(M, "down.sql");
    expect(down).toMatch(/SET "accion" = 'plan_asignado'/);
    expect(down).not.toMatch(/DELETE FROM "historial_accion"/);
    // El UPDATE va ANTES de quitar el valor: la precondición ruidosa de la función abortaría.
    expect(down.indexOf(`SET "accion" = 'plan_asignado'`)).toBeLessThan(down.indexOf("SELECT pg_temp.quitar_valores_de_enum_d16("));
  });
});

describeSiHayBase("Ajuste planes-custom D16 — historial_accion_plan_tipo_cobro_cambiado de ida y vuelta", () => {
  let antes: Foto;
  let subida: Foto;
  let asignacion: string;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    empresa = randomUUID();
    planId = randomUUID();
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad") VALUES ($1, 'D16 iv', 'publico')`, [planId]);
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'D16 iv', $2)`, [
      empresa,
      `d16-iv-${empresa.slice(0, 8)}`,
    ]);
    await db.query(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '3 days' WHERE "id" = $2`,
      [planId, empresa],
    );
    // La asignación previa, que ningún paso puede tocar.
    asignacion = await historial("plan_asignado", null, "mensual");

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

  it("D16: el valor nuevo queda AL FINAL del enum, detrás de los de antes, y se puede escribir con su antes y después", async () => {
    const tipos = await etiquetas("historial_accion_tipo");
    expect(tipos.slice(-1)).toEqual([TIPO_NUEVO]);
    expect(tipos).toContain("plan_asignado");
    const id = await historial(TIPO_NUEVO, "mensual", "anual");
    expect(await filas([id])).toEqual([
      expect.objectContaining({ id, accion: TIPO_NUEVO, valor_anterior: "mensual", valor_nuevo: "anual", entidad_id: planId }),
    ]);
  });

  it("el down convierte las filas del valor a `plan_asignado` (antes y después intactos), no toca las demás y deja el esquema como antes; reaplicada, igual que la primera vez", async () => {
    const cambio = await historial(TIPO_NUEVO, "anual", "mensual");
    const filasAntes = await filas([asignacion, cambio]);

    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(await etiquetas("historial_accion_tipo")).not.toContain(TIPO_NUEVO);
    // Ninguna fila se pierde: la del cambio pasa a `plan_asignado` con todo lo demás igual; la asignación,
    // intacta.
    expect(await filas([asignacion, cambio])).toEqual(
      filasAntes.map((f) => (f.id === cambio ? { ...f, accion: "plan_asignado" } : f)),
    );
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "historial_accion" WHERE "organizacion_id" = $1`, [empresa]);
    // La asignación, la fila del caso anterior y la de este: las tres siguen.
    expect(rows[0].n).toBe(3);
    expect(diferencias(await fotoSinFilas(), antes)).toEqual([]);

    await ejecutar(db, sqlDe(M, "migration.sql"), `${M} (otra vez)`);
    expect(diferencias(await fotoSinFilas(), subida)).toEqual([]);
  }, 180_000);
});
