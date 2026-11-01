import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

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
  sentenciasDe,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";

/**
 * SLT-76 / T6 (design §6.2) — `zona_distrito_cambiado` en `historial_accion_tipo`, de ida y vuelta.
 *
 * BASE PROPIA (`slt76_hz_<rand>`), como SL-23: el down recrea `historial_accion_tipo`, y en la base
 * compartida chocaria con los archivos que escriben en `historial_accion`.
 *
 * 1. Se aplican todas las migraciones anteriores a esta, LEIDAS DE `db/migrations`.
 * 2. Se lee de `pg_enum` la lista previa del tipo. No se escribe a mano: el down tiene que dejar la
 *    lista VIGENTE menos su valor, sea cual sea.
 * 3. `up` añade el valor al final; `down` borra solo las filas de esa accion y deja el esquema
 *    exactamente como estaba (foto de catalogos y conteos de filas).
 * 4. `up` otra vez funciona.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ESTA = "20261102090000_slt76_historial_zona_distrito";
/** La ultima de `prod` antes de SLT-76 (design §10). */
const ULTIMA_DE_PROD = "20261101090100";
const VALOR = "zona_distrito_cambiado";

const BASE = `slt76_hz_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

let admin: Conexion;
let db: Conexion;

async function etiquetas(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'historial_accion_tipo' AND n.nspname = 'public' ORDER BY e.enumsortorder`,
  );
  return rows.map((r) => String(r.l));
}

async function insertarFila(organizacionId: string, accion: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "historial_accion"
       ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta", "lote_id", "organizacion_id")
     VALUES ($1, $2::"historial_accion_tipo", 'zona', $3, 'Zona sintetica', $4, $5)`,
    [id, accion, randomUUID(), randomUUID(), organizacionId],
  );
  return id;
}

async function accionDe(id: string): Promise<string | null> {
  const { rows } = await db.query(`SELECT "accion"::text AS a FROM "historial_accion" WHERE "id" = $1`, [id]);
  return rows.length === 0 ? null : String(rows[0].a);
}

describe("SLT-76 — la migracion del rastro de distritos, en disco", () => {
  it("trae down.sql y va detras de la ultima migracion de prod", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas).toContain(ESTA);
    expect(ESTA > ULTIMA_DE_PROD).toBe(true);
    expect(existsSync(path.join(MIGRACIONES, ESTA, "down.sql"))).toBe(true);
  });

  it("el up es UNA sola sentencia: el ADD VALUE, que no puede compartir transaccion con su uso", () => {
    expect(sentenciasDe(sqlDe(ESTA, "migration.sql")).map((s) => s.replace(/\s+/g, " ").trim())).toEqual([
      `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'zona_distrito_cambiado'`,
    ]);
  });

  it("el down no lleva lista fija: no nombra ningun otro valor del tipo", () => {
    const down = sqlDe(ESTA, "down.sql");
    // Dos valores de cualquier epoca del tipo: si aparecieran, el down recrearia con una foto.
    expect(down).not.toContain("'cierre_dia_aprobado'");
    expect(down).not.toContain("'zona_sinpe_cambiado'");
    expect(down).toContain("quitar_valores_de_enum_slt76('public', 'historial_accion_tipo', ARRAY['zona_distrito_cambiado'])");
  });
});

describeSiHayBase("SLT-76 — `zona_distrito_cambiado` de ida y vuelta (base propia)", () => {
  let previas: string[];
  let antes: Foto;
  let organizacionId: string;
  let filaAjena: string;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, ESTA);

    organizacionId = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
      organizacionId,
      "SLT76 empresa sintetica",
      `slt76-hz-${organizacionId.slice(0, 8)}`,
    ]);
    // Una fila de OTRA accion: el down no la puede tocar.
    filaAjena = await insertarFila(organizacionId, "zona_sinpe_cambiado");

    previas = await etiquetas();
    antes = await foto(db);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("up añade el valor AL FINAL, down lo quita con sus filas y deja el resto igual; up otra vez", async () => {
    // Premisa: la lista previa es real y no trae el valor.
    expect(previas.length).toBeGreaterThan(60);
    expect(previas).not.toContain(VALOR);

    await ejecutar(db, sqlDe(ESTA, "migration.sql"), `${ESTA} (up)`);
    expect(await etiquetas()).toEqual([...previas, VALOR]);

    // El valor se puede usar en una transaccion posterior: una fila de la accion nueva.
    const filaNueva = await insertarFila(organizacionId, VALOR);
    expect(await accionDe(filaNueva)).toBe(VALOR);

    await ejecutar(db, sqlDe(ESTA, "down.sql"), `${ESTA} (down)`);
    expect(await etiquetas()).toEqual(previas);
    expect(await accionDe(filaNueva)).toBeNull();
    expect(await accionDe(filaAjena)).toBe("zona_sinpe_cambiado");
    // Catalogos (columnas, constraints, indices, tipos) y conteos de filas, como antes del up.
    expect(diferencias(await foto(db), antes)).toEqual([]);

    await ejecutar(db, sqlDe(ESTA, "migration.sql"), `${ESTA} (up de nuevo)`);
    expect(await etiquetas()).toEqual([...previas, VALOR]);
  }, 120_000);
});
