import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { faltasR19, sinComentarios, type Migracion, type OpcionesAditivas } from "./_migraciones-aditivas";

/**
 * SLT-89 · R32 (design §2.5) — LAS MIGRACIONES DE SLT-89 SON SOLO ADITIVAS Y NO TOCAN `orden`.
 *
 * Mismas reglas que SLT-43 (`_migraciones-aditivas.ts`) con una sola opción: `CREATE OR REPLACE
 * FUNCTION` solo sobre la función de trigger `orden_nodo_geografico`. Sin `dmlEnCuerpoDeFuncion`: los
 * cuerpos de SLT-89 solo LEEN, así que un `INSERT`/`UPDATE`/`DELETE` en cualquier sitio cuenta.
 * Por NOMBRE exacto de carpeta, como SLT-43 y SLT-46. Los timestamps son los de la rama
 * (`20261110130000`/`…130100`), no los del spec (`20261109120000`/`…120100`), que chocaban con dev
 * (progress/impl_SLT-89.md). Los `down.sql` deshacen a propósito y no cuentan (R33 los prueba de ida y
 * vuelta).
 */

const DIR_MIGRACIONES = resolve(__dirname, "../../../db/migrations");
const CARPETAS_SLT89 = ["20261110130000_slt89_zona_nodo", "20261110130100_slt89_historial_zona_nodo"];
const OPCIONES: OpcionesAditivas = { reemplazablesPermitidas: ["orden_nodo_geografico"] };

function leer(nombre: string): Migracion {
  return { nombre, sql: readFileSync(resolve(DIR_MIGRACIONES, nombre, "migration.sql"), "utf8") };
}

describe("SLT-89 · R32 — migraciones solo aditivas", () => {
  it("las carpetas de SLT-89 son exactamente las de la rama y cada una trae su down.sql", () => {
    const enDisco = readdirSync(DIR_MIGRACIONES)
      .filter((n) => n.includes("_slt89_"))
      .sort();
    expect(enDisco).toEqual(CARPETAS_SLT89);
    for (const c of CARPETAS_SLT89) {
      expect(existsSync(resolve(DIR_MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
      expect(readFileSync(resolve(DIR_MIGRACIONES, c, "down.sql"), "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("verde sobre los migration.sql reales", () => {
    expect(faltasR19(CARPETAS_SLT89.map(leer), OPCIONES)).toEqual([]);
  });

  it("control: las reales sí reemplazan orden_nodo_geografico, crean las dos tablas y el valor de enum va solo", () => {
    const [tablas, enumeracion] = CARPETAS_SLT89.map((c) => sinComentarios(leer(c).sql));
    expect(tablas).toMatch(/CREATE OR REPLACE FUNCTION orden_nodo_geografico\(\)/);
    expect(tablas).toMatch(/CREATE TABLE "zona_nodo"/);
    expect(tablas).toMatch(/CREATE TABLE "grupo_distritos_nodo"/);
    expect(tablas).toMatch(/CREATE TRIGGER "grupo_distritos_distrito_sin_duplicado"/);
    expect(enumeracion.trim()).toBe(`ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'zona_nodo_cambiado';`);
    // Sin la lista de reemplazables, el reemplazo no se mira: la opción es la que lo acota.
    expect(faltasR19(CARPETAS_SLT89.map(leer))).toEqual([]);
    expect(faltasR19(CARPETAS_SLT89.map(leer), { reemplazablesPermitidas: [] })).toEqual([
      "20261110130000_slt89_zona_nodo: CREATE OR REPLACE FUNCTION orden_nodo_geografico",
    ]);
  });
});

describe("SLT-89 · R32 — ninguna migración altera, indexa ni escribe `orden`", () => {
  it("ninguna de las migraciones de SLT-89 nombra la tabla orden fuera de los comentarios", () => {
    for (const c of CARPETAS_SLT89) {
      expect(sinComentarios(leer(c).sql), c).not.toMatch(/"?\borden\b"?/i);
    }
  });

  it("contraprueba: un índice o un ALTER sobre orden sí se ve; el nombre de la función no", () => {
    expect(`CREATE INDEX x ON "orden" (nodo_geografico_id);`).toMatch(/"?\borden\b"?/i);
    expect(`ALTER TABLE orden ADD COLUMN x text;`).toMatch(/"?\borden\b"?/i);
    expect(`CREATE OR REPLACE FUNCTION orden_nodo_geografico()`).not.toMatch(/"?\borden\b"?/i);
  });
});

describe("SLT-89 · R32 — contraprueba con texto inventado", () => {
  const base = leer("20261110130000_slt89_zona_nodo");
  const con = (extra: string) => faltasR19([base, { nombre: "inventada", sql: extra }], OPCIONES);

  it("rojo con DML sobre una tabla existente, también dentro del cuerpo de una función", () => {
    expect(con(`UPDATE zona_distrito SET zona_id = 'x';`)).toEqual(["inventada: UPDATE sobre zona_distrito"]);
    expect(con(`INSERT INTO "grupo_distritos_distrito" (id) VALUES ('x');`)).toEqual([
      "inventada: INSERT en la tabla existente grupo_distritos_distrito",
    ]);
    expect(
      con(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM zona_distrito; RETURN NULL; END $$;`),
    ).toEqual(["inventada: DELETE sobre zona_distrito"]);
  });

  it("verde con DML sobre las tablas nuevas de SLT-89 (las crea la propia migración)", () => {
    expect(con(`INSERT INTO "zona_nodo" (id) VALUES ('x');`)).toEqual([]);
  });

  it("rojo con CREATE OR REPLACE FUNCTION de otra función; verde con orden_nodo_geografico", () => {
    expect(
      con(`CREATE OR REPLACE FUNCTION geografia_del_pais_de_la_empresa() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`),
    ).toEqual(["inventada: CREATE OR REPLACE FUNCTION geografia_del_pais_de_la_empresa"]);
    expect(
      con(`CREATE OR REPLACE FUNCTION orden_nodo_geografico() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`),
    ).toEqual([]);
  });

  it("las reglas de SLT-43 siguen: DROP, ALTER COLUMN, ALTER TYPE que no añade y ADD COLUMN NOT NULL en una tabla existente", () => {
    expect(con(`DROP TRIGGER t ON zona_distrito;`)).toEqual(["inventada: DROP"]);
    expect(con(`ALTER TABLE zona ALTER COLUMN nombre TYPE text;`)).toEqual(["inventada: ALTER COLUMN"]);
    expect(con(`ALTER TYPE "historial_accion_tipo" ADD VALUE 'x';`)).toHaveLength(1);
    expect(con(`ALTER TABLE "zona_distrito" ADD COLUMN "x" TEXT NOT NULL;`)).toHaveLength(1);
  });
});
