import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { faltasR19, sinComentarios, type Migracion, type OpcionesAditivas } from "./_migraciones-aditivas";

/**
 * SLT-46 · R8, R10 (design §3) — LAS MIGRACIONES DE SLT-46 SON SOLO ADITIVAS Y NO TOCAN `orden`.
 *
 * Mismas reglas que SLT-43 (`_migraciones-aditivas.ts`), con las dos opciones de SLT-46:
 *   · el `INSERT`/`UPDATE`/`DELETE` dentro del cuerpo de un `CREATE FUNCTION` es la escritura del
 *     trigger al correr (la copia nodo → geografía vieja escribe `provincia`, `canton` y `distrito`) y
 *     no cuenta; `DROP`, `TRUNCATE`, `RENAME`, `ALTER COLUMN` y `EXECUTE` siguen contando ahí;
 *   · `CREATE OR REPLACE FUNCTION` solo sobre `pais_tipos_de_nivel` (P2).
 * Por NOMBRE exacto de carpeta, como SLT-43: dev suma migraciones propias el mismo día. Los `down.sql`
 * deshacen a propósito y no cuentan (R9 los prueba de ida y vuelta).
 */

const DIR_MIGRACIONES = resolve(__dirname, "../../../db/migrations");
const CARPETAS_SLT46 = [
  "20261106120000_slt46_historial_tipos_de_nivel",
  "20261106120100_slt46_nodo_copia_a_geografia_vieja",
  "20261106120200_slt46_pais_tipos_de_nivel_opcional",
];
const OPCIONES: OpcionesAditivas = { dmlEnCuerpoDeFuncion: true, reemplazablesPermitidas: ["pais_tipos_de_nivel"] };

function leer(nombre: string): Migracion {
  return { nombre, sql: readFileSync(resolve(DIR_MIGRACIONES, nombre, "migration.sql"), "utf8") };
}

describe("SLT-46 · R8 — migraciones solo aditivas", () => {
  it("las carpetas de SLT-46 son exactamente las del spec y cada una trae su down.sql", () => {
    const enDisco = readdirSync(DIR_MIGRACIONES)
      .filter((n) => n.includes("_slt46_"))
      .sort();
    expect(enDisco).toEqual(CARPETAS_SLT46);
    for (const c of CARPETAS_SLT46) {
      expect(existsSync(resolve(DIR_MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
      expect(readFileSync(resolve(DIR_MIGRACIONES, c, "down.sql"), "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("verde sobre los migration.sql reales", () => {
    expect(faltasR19(CARPETAS_SLT46.map(leer), OPCIONES)).toEqual([]);
  });

  it("control: las reales escriben la geografía vieja solo dentro del cuerpo de la función de copia", () => {
    const sql = CARPETAS_SLT46.map((c) => sinComentarios(leer(c).sql)).join("\n");
    expect(sql).toMatch(/DELETE FROM provincia WHERE id = OLD\.id/);
    expect(sql).toMatch(/INSERT INTO distrito AS v/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION pais_tipos_de_nivel\(\)/);
    // Sin la opción del cuerpo de función, la regla de SLT-43 las reprocha: la opción es la que decide.
    expect(faltasR19(CARPETAS_SLT46.map(leer))).toEqual(
      expect.arrayContaining([
        "20261106120100_slt46_nodo_copia_a_geografia_vieja: DELETE sobre provincia",
        "20261106120100_slt46_nodo_copia_a_geografia_vieja: INSERT en la tabla existente canton",
        "20261106120200_slt46_pais_tipos_de_nivel_opcional: INSERT en la tabla existente tipo_nivel_geografico",
      ]),
    );
  });

  it("control: con una lista de reemplazables vacía, el CREATE OR REPLACE de pais_tipos_de_nivel es falta", () => {
    expect(faltasR19(CARPETAS_SLT46.map(leer), { ...OPCIONES, reemplazablesPermitidas: [] })).toEqual([
      "20261106120200_slt46_pais_tipos_de_nivel_opcional: CREATE OR REPLACE FUNCTION pais_tipos_de_nivel",
    ]);
  });
});

describe("SLT-46 · R10 — ninguna migración altera, indexa ni escribe `orden`", () => {
  it("ninguna de las migraciones de SLT-46 nombra la tabla orden fuera de los comentarios", () => {
    for (const c of CARPETAS_SLT46) {
      expect(sinComentarios(leer(c).sql), c).not.toMatch(/"?\borden\b"?/i);
    }
  });

  it("contraprueba: un índice o un ALTER sobre orden sí se ve", () => {
    expect(`CREATE INDEX x ON "orden" (nodo_geografico_id);`).toMatch(/"?\borden\b"?/i);
  });
});

describe("SLT-46 · R8 — contraprueba con texto inventado", () => {
  const base = leer("20261106120100_slt46_nodo_copia_a_geografia_vieja");
  const con = (extra: string) => faltasR19([base, { nombre: "inventada", sql: extra }], OPCIONES);

  it("rojo con DML suelto sobre una tabla existente (fuera de un cuerpo de función, también en un DO)", () => {
    expect(con(`UPDATE provincia SET nombre = 'x' WHERE id = '1';`)).toEqual(["inventada: UPDATE sobre provincia"]);
    expect(con(`DELETE FROM canton WHERE id = '1';`)).toEqual(["inventada: DELETE sobre canton"]);
    expect(con(`INSERT INTO "distrito" (id) VALUES ('x');`)).toEqual(["inventada: INSERT en la tabla existente distrito"]);
    expect(con(`DO $$ BEGIN UPDATE provincia SET activo = true; END $$;`)).toEqual(["inventada: UPDATE sobre provincia"]);
  });

  it("verde con DML dentro del cuerpo de una función de trigger", () => {
    expect(
      con(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN DELETE FROM provincia WHERE id = OLD.id; RETURN NULL; END IF;
          UPDATE canton SET nombre = NEW.nombre WHERE id = NEW.id;
          INSERT INTO distrito (id) VALUES (NEW.id);
          RETURN NULL;
        END $$;`),
    ).toEqual([]);
  });

  it("rojo con EXECUTE 'DROP …' dentro del cuerpo de una función, y con EXECUTE a secas ahí", () => {
    expect(
      con(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN EXECUTE 'DROP TABLE orden'; RETURN NULL; END $body$;`),
    ).toEqual(["inventada: DROP", "inventada: EXECUTE en el cuerpo de una función"]);
    expect(
      con(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN EXECUTE format('UPDATE %I SET x = 1', 'canton'); RETURN NULL; END $$;`),
    ).toEqual(["inventada: EXECUTE en el cuerpo de una función"]);
  });

  it("rojo con TRUNCATE, RENAME o ALTER COLUMN dentro del cuerpo de una función", () => {
    expect(con(`CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ TRUNCATE provincia $$;`)).toEqual(["inventada: TRUNCATE"]);
    expect(con(`CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ ALTER TABLE canton RENAME TO c $$;`)).toEqual([
      "inventada: RENAME",
    ]);
  });

  it("rojo con CREATE OR REPLACE FUNCTION de otra función; verde con pais_tipos_de_nivel", () => {
    expect(
      con(`CREATE OR REPLACE FUNCTION geo_sincronizar_canton() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;`),
    ).toEqual(["inventada: CREATE OR REPLACE FUNCTION geo_sincronizar_canton"]);
    expect(
      con(`CREATE OR REPLACE FUNCTION public.geo_sincronizar_provincia() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;`),
    ).toEqual(["inventada: CREATE OR REPLACE FUNCTION geo_sincronizar_provincia"]);
    expect(
      con(`CREATE OR REPLACE FUNCTION pais_tipos_de_nivel() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO tipo_nivel_geografico (id) VALUES ('x') ON CONFLICT (pais_id, clave) DO UPDATE SET clave = EXCLUDED.clave; RETURN NULL; END $$;`),
    ).toEqual([]);
  });

  it("las reglas de SLT-43 siguen: DROP, ALTER TYPE que no añade y ADD COLUMN NOT NULL en una tabla existente", () => {
    expect(con(`DROP TRIGGER t ON provincia;`)).toEqual(["inventada: DROP"]);
    expect(con(`ALTER TYPE "historial_plataforma_accion" ADD VALUE 'x';`)).toHaveLength(1);
    expect(con(`ALTER TABLE "pais" ADD COLUMN "x" TEXT NOT NULL;`)).toHaveLength(1);
  });

  it("sin opciones (como SLT-43) el DML de un cuerpo de función sobre una tabla existente sí cuenta", () => {
    expect(
      faltasR19([{ nombre: "inventada", sql: `CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM provincia; RETURN NULL; END $$;` }]),
    ).toEqual(["inventada: DELETE sobre provincia"]);
  });
});
