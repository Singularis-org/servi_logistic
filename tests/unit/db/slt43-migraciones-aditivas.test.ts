import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SLT-43 · R19 (design §3, §7) — LAS SEIS MIGRACIONES DE SLT-43 SON SOLO ADITIVAS.
 *
 * La guardia general (`tests/guards/migraciones-destructivas.guard.test.ts`) deja pasar una migración
 * destructiva si trae su `DESTRUCTIVA.md`; la épica GEO no admite ninguna, con o sin papel. Esto lee el
 * `migration.sql` de cada carpeta `202610291*` (los `down.sql` deshacen a propósito y no cuentan) y
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
  "20261029120000_geo_enums_nodo_geografico",
  "20261029120100_tipo_nivel_geografico",
  "20261029120200_nodo_geografico",
  "20261029120300_nodo_geografico_sincronia",
  "20261029120400_columnas_nodo_geografico",
  "20261029120500_indices_nodo_geografico",
];

/**
 * Sin comentarios y sin la comparación `TG_OP = 'DELETE'` de las funciones de trigger (nombra el evento,
 * no lo ejecuta). Los demás literales se quedan: un `EXECUTE 'DROP …'` tiene que seguir saltando.
 */
function sinComentarios(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "")
    .replace(/\bTG_OP\s*=\s*'[A-Z]+'/g, "TG_OP = ''");
}

const IDENT = String.raw`(?:ONLY\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?`;

/** Lo que R19 reprocha en un conjunto de migraciones; vacío = aditivas. Pura, para probarla con texto inventado. */
function faltasR19(migraciones: readonly { nombre: string; sql: string }[]): string[] {
  const limpias = migraciones.map((m) => ({ nombre: m.nombre, sql: sinComentarios(m.sql) }));
  const nuevas = new Set(
    limpias.flatMap((m) =>
      [...m.sql.matchAll(new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}`, "gi"))].map((x) =>
        x[1].toLowerCase(),
      ),
    ),
  );
  const faltas: string[] = [];

  for (const { nombre, sql } of limpias) {
    const falta = (que: string) => faltas.push(`${nombre}: ${que}`);

    for (const m of sql.matchAll(/\b(DROP|TRUNCATE|RENAME|ALTER\s+COLUMN)\b/gi)) {
      falta(m[1].toUpperCase().replace(/\s+/g, " "));
    }

    for (const m of sql.matchAll(/\bALTER\s+TYPE\s+"?[A-Za-z0-9_]+"?\s+([^;]*)/gi)) {
      if (!/^ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\b/i.test(m[1])) falta(`ALTER TYPE ${m[1].trim().slice(0, 40)}`);
    }

    for (const m of sql.matchAll(new RegExp(String.raw`\bINSERT\s+INTO\s+${IDENT}`, "gi"))) {
      if (!nuevas.has(m[1].toLowerCase())) falta(`INSERT en la tabla existente ${m[1]}`);
    }

    for (const m of sql.matchAll(/\b(DELETE|UPDATE)\b/gi)) {
      const i = m.index ?? 0;
      const antes = sql.slice(0, i);
      const anterior = /([A-Za-z]+)\s*$/.exec(antes)?.[1]?.toUpperCase();
      const despues = sql.slice(i + m[0].length);
      const sentencia = antes.slice(antes.lastIndexOf(";") + 1);
      // Eventos de trigger (`OR UPDATE`, `UPDATE OF`, `AFTER UPDATE`), acciones de FK (`ON DELETE`), el
      // `DO UPDATE` de un upsert (su tabla la mira la regla de INSERT) y los permisos no escriben filas.
      if (anterior !== undefined && ["ON", "OR", "DO", "BEFORE", "AFTER"].includes(anterior)) continue;
      if (/^\s*OF\b/i.test(despues)) continue;
      if (/^\s*(REVOKE|GRANT)\b/i.test(sentencia)) continue;
      const tabla =
        m[1].toUpperCase() === "DELETE"
          ? new RegExp(String.raw`^\s*FROM\s+${IDENT}`, "i").exec(despues)?.[1]
          : new RegExp(String.raw`^\s*${IDENT}`, "i").exec(despues)?.[1];
      if (tabla === undefined || !nuevas.has(tabla.toLowerCase())) {
        falta(`${m[1].toUpperCase()} sobre ${tabla ?? "una tabla que no se reconoce"}`);
      }
    }

    for (const m of sql.matchAll(new RegExp(String.raw`\bALTER\s+TABLE\s+${IDENT}\s+ADD\s+COLUMN\s+([^;]*)`, "gi"))) {
      if (nuevas.has(m[1].toLowerCase())) continue;
      if (/\bNOT\s+NULL\b|\bDEFAULT\b/i.test(m[2])) falta(`ADD COLUMN con NOT NULL o DEFAULT en ${m[1]}`);
    }
  }
  return faltas;
}

function leer(nombre: string): { nombre: string; sql: string } {
  return { nombre, sql: readFileSync(resolve(DIR_MIGRACIONES, nombre, "migration.sql"), "utf8") };
}

describe("SLT-43 · R19 — migraciones solo aditivas", () => {
  it("las carpetas de SLT-43 son exactamente las seis del spec y cada una trae su down.sql", () => {
    const enDisco = readdirSync(DIR_MIGRACIONES).filter((n) => n.startsWith("202610291")).sort();
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
    expect(sql).toMatch(/UPDATE nodo_geografico/);
    expect(sql).toMatch(/ALTER TABLE "orden" ADD COLUMN "nodo_geografico_id" TEXT;/);
  });
});

describe("SLT-43 · R19 — contraprueba con texto inventado", () => {
  const base = leer("20261029120400_columnas_nodo_geografico");
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
