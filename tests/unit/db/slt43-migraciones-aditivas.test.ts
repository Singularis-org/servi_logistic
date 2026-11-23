import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { faltasR19, sinComentarios } from "./_migraciones-aditivas";

/**
 * SLT-43 · R19 (design §3, §7) — LAS SEIS MIGRACIONES DE SLT-43 SON SOLO ADITIVAS.
 *
 * La guardia general (`tests/guards/migraciones-destructivas.guard.test.ts`) deja pasar una migración
 * destructiva si trae su `DESTRUCTIVA.md`; la épica GEO no admite ninguna, con o sin papel. Esto lee el
 * `migration.sql` de cada una de las seis carpetas del spec, por su NOMBRE exacto (no por fecha: dev
 * suma migraciones propias el mismo día; los `down.sql` deshacen a propósito y no cuentan) y
 * reprocha:
 *   · `DROP`, `TRUNCATE`, `RENAME` y `ALTER COLUMN` en cualquier sitio;
 *   · `DELETE`, `UPDATE` o `INSERT` sobre una tabla que no crearon estas migraciones (los eventos de
 *     trigger, las acciones de FK, el `DO UPDATE` de un upsert y los `GRANT`/`REVOKE` no son escrituras);
 *   · `ALTER TYPE` que no sea `ADD VALUE IF NOT EXISTS`;
 *   · `ADD COLUMN` en una tabla existente con `NOT NULL` o `DEFAULT` (reescribiría o bloquearía la tabla).
 * Los comentarios se quitan antes: explicar un `DROP` no es hacerlo.
 */

const DIR_MIGRACIONES = resolve(__dirname, "../../../db/migrations");
const CARPETAS_SLT43 = [
  "20261104120000_geo_enums_nodo_geografico",
  "20261104120100_tipo_nivel_geografico",
  "20261104120200_nodo_geografico",
  "20261104120300_nodo_geografico_sincronia",
  "20261104120400_columnas_nodo_geografico",
  "20261104120500_indices_nodo_geografico",
];

// Las reglas (`faltasR19`, `sinComentarios`) viven en `_migraciones-aditivas.ts` desde SLT-46 (T2.3),
// sin cambios para SLT-43: este archivo las llama sin opciones.

function leer(nombre: string): { nombre: string; sql: string } {
  return { nombre, sql: readFileSync(resolve(DIR_MIGRACIONES, nombre, "migration.sql"), "utf8") };
}

describe("SLT-43 · R19 — migraciones solo aditivas", () => {
  it("las carpetas de SLT-43 son exactamente las seis del spec y cada una trae su down.sql", () => {
    // Por nombre exacto, no por fecha: las migraciones de dev del mismo día no son de SLT-43.
    const enDisco = readdirSync(DIR_MIGRACIONES)
      .filter((n) => (CARPETAS_SLT43 as readonly string[]).includes(n))
      .sort();
    expect(enDisco).toEqual(CARPETAS_SLT43);
    for (const c of CARPETAS_SLT43) {
      expect(readFileSync(resolve(DIR_MIGRACIONES, c, "down.sql"), "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("verde sobre los migration.sql reales de las seis", () => {
    expect(faltasR19(CARPETAS_SLT43.map(leer))).toEqual([]);
  });

  it("control: las reales sí escriben, pero solo en tablas nuevas, y añaden columnas a tablas existentes", () => {
    const sql = CARPETAS_SLT43.map((c) => sinComentarios(leer(c).sql)).join("\n");
    expect(sql).toMatch(/DELETE FROM nodo_geografico/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(sql).toMatch(/ALTER TABLE "orden" ADD COLUMN "nodo_geografico_id" TEXT;/);
  });
});

describe("SLT-43 · R19 — contraprueba con texto inventado", () => {
  const base = leer("20261104120400_columnas_nodo_geografico");
  const con = (extra: string) => faltasR19([base, { nombre: "inventada", sql: extra }]);

  it("rojo con DROP COLUMN", () => {
    expect(con(`ALTER TABLE "orden" DROP COLUMN "distrito_id";`)).toEqual(["inventada: DROP"]);
  });

  it("rojo con UPDATE, DELETE o INSERT sobre una tabla existente", () => {
    expect(con(`UPDATE "orden" SET "nodo_geografico_id" = "distrito_id";`)).toEqual(["inventada: UPDATE sobre orden"]);
    expect(con(`DELETE FROM provincia WHERE id = '1';`)).toEqual(["inventada: DELETE sobre provincia"]);
    expect(con(`INSERT INTO "canton" (id) VALUES ('x');`)).toEqual(["inventada: INSERT en la tabla existente canton"]);
  });

  it("rojo con TRUNCATE, RENAME, ALTER COLUMN y ALTER TYPE que no añade", () => {
    expect(con(`TRUNCATE "orden";`)).toEqual(["inventada: TRUNCATE"]);
    expect(con(`ALTER TABLE "orden" RENAME COLUMN "a" TO "b";`)).toEqual(["inventada: RENAME"]);
    expect(con(`ALTER TABLE "orden" ALTER COLUMN "a" TYPE INT;`)).toEqual(["inventada: ALTER COLUMN"]);
    expect(con(`ALTER TYPE "historial_accion_entidad" ADD VALUE 'x';`)).toHaveLength(1);
  });

  it("rojo con ADD COLUMN NOT NULL o con DEFAULT en una tabla existente; verde en una tabla nueva", () => {
    expect(con(`ALTER TABLE "orden" ADD COLUMN "x" TEXT NOT NULL;`)).toHaveLength(1);
    expect(con(`ALTER TABLE "zona_distrito" ADD COLUMN "x" INT DEFAULT 0;`)).toHaveLength(1);
    expect(con(`CREATE TABLE "nueva" (id TEXT); ALTER TABLE "nueva" ADD COLUMN "x" TEXT NOT NULL DEFAULT '';`)).toEqual([]);
  });

  it("verde con lo que no escribe: comentarios, eventos de trigger, acciones de FK y permisos", () => {
    expect(
      con(`-- aquí se explica por qué no hay DROP COLUMN ni UPDATE orden
        CREATE TRIGGER t BEFORE INSERT OR UPDATE OF "a" ON "orden" FOR EACH ROW EXECUTE FUNCTION f();
        CREATE TRIGGER u AFTER UPDATE OR DELETE ON "orden" FOR EACH ROW EXECUTE FUNCTION f();
        ALTER TABLE "orden" ADD CONSTRAINT k FOREIGN KEY (a) REFERENCES b(id) ON DELETE CASCADE ON UPDATE RESTRICT;
        REVOKE INSERT, UPDATE, DELETE ON "orden" FROM servi_app;
        CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;`),
    ).toEqual([]);
  });

  it("rojo con SQL dinámico destructivo dentro de un literal", () => {
    expect(con(`DO $$ BEGIN EXECUTE 'DROP TABLE orden'; END $$;`)).toEqual(["inventada: DROP"]);
  });
});
