import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { faltasR19, sinComentarios, type Migracion, type OpcionesAditivas } from "./_migraciones-aditivas";

/**
 * SLT-48 · R13, R14 (design §2.2) — LO DESTRUCTIVO DE SLT-48 VA POR LISTA CERRADA.
 *
 * A diferencia de SLT-43, 46 y 89, aquí se quitan FK, NOT NULL, triggers, funciones y las tres tablas
 * viejas. Cada una de esas sentencias está en `DESTRUCTIVAS`, una vez; cualquier otra sentencia
 * destructiva sigue en rojo con las reglas de siempre (`_migraciones-aditivas.ts`), y los dos
 * `CREATE OR REPLACE FUNCTION` van en `REEMPLAZABLES`. Además, lo que es de SLT-196 «Geografía
 * jerárquica: borrar el modelo viejo» (R14) se prohíbe por nombre: borrar columnas o vistas, tocar
 * `pais`, `nivel_N_*` o `digitos_codigo_nivel_N`, poner NOT NULL al nodo de la orden y renombrar.
 *
 * Solo los `migration.sql`: los `down.sql` deshacen a propósito y los prueba la ida y vuelta
 * (`migracion-slt48-ida-y-vuelta.test.ts`, R11). Por nombre exacto de carpeta, como SLT-43, 46 y 89.
 */

const DIR_MIGRACIONES = resolve(__dirname, "../../../db/migrations");
const CARPETAS_SLT48 = [
  "20261117120000_slt48_historial_nodo_movido",
  "20261117120100_slt48_geografia_vieja_a_vistas",
];

const DESTRUCTIVAS = [
  // R4: las 5 FK hacia las tablas viejas y dos NOT NULL de la orden.
  `DROP CONSTRAINT "orden_provincia_id_fkey"`,
  `DROP CONSTRAINT "orden_canton_id_fkey"`,
  `DROP CONSTRAINT "orden_distrito_id_fkey"`,
  `DROP CONSTRAINT "zona_distrito_distrito_id_fkey"`,
  `DROP CONSTRAINT "distrito_zona_especial_distrito_id_fkey"`,
  `ALTER COLUMN "provincia_id" DROP NOT NULL`,
  `ALTER COLUMN "canton_id" DROP NOT NULL`,
  // R5: la sincronía en los dos sentidos y el país del padre de las tablas viejas.
  `DROP TRIGGER "provincia_sincroniza_nodo_geografico" ON "provincia"`,
  `DROP TRIGGER "canton_sincroniza_nodo_geografico" ON "canton"`,
  `DROP TRIGGER "distrito_sincroniza_nodo_geografico" ON "distrito"`,
  `DROP FUNCTION geo_sincronizar_provincia()`,
  `DROP FUNCTION geo_sincronizar_canton()`,
  `DROP FUNCTION geo_sincronizar_distrito()`,
  `DROP TRIGGER "nodo_geografico_copia_a_geografia_vieja" ON "nodo_geografico"`,
  `DROP FUNCTION geo_copiar_nodo_a_geografia_vieja()`,
  `DROP TRIGGER "canton_pais_del_padre" ON "canton"`,
  `DROP TRIGGER "distrito_pais_del_padre" ON "distrito"`,
  `DROP FUNCTION geografia_pais_del_padre()`,
  // R7, R8: los triggers de país se recrean para saltar también al cambiar el nodo.
  `DROP TRIGGER "orden_geografia_del_pais_de_la_empresa" ON "orden"`,
  `DROP TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa" ON "zona_distrito"`,
  `DROP TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa" ON "distrito_zona_especial"`,
  // R1: las tablas viejas dejan sitio a las vistas.
  `DROP TABLE "distrito"`,
  `DROP TABLE "canton"`,
  `DROP TABLE "provincia"`,
] as const;

const REEMPLAZABLES = ["orden_nodo_geografico", "geografia_del_pais_de_la_empresa"] as const;

const OPCIONES: OpcionesAditivas = {
  destructivasDeclaradas: DESTRUCTIVAS,
  reemplazablesPermitidas: REEMPLAZABLES,
};

/** R14: lo que es de SLT-196 no entra aquí, ni declarado. */
const DE_SLT196: [string, RegExp][] = [
  ["DROP COLUMN", /\bDROP\s+COLUMN\b/i],
  ["DROP VIEW", /\bDROP\s+VIEW\b/i],
  ["ALTER TABLE pais", /\bALTER\s+TABLE\s+(?:ONLY\s+)?"?pais"?(?=[\s;])/i],
  ["nivel_N_* o digitos_codigo_nivel_N", /\b(?:nivel_\d+_(?:singular|plural)|digitos_codigo_nivel_\d+)\b/i],
  ["NOT NULL sobre nodo_geografico_id", /"?nodo_geografico_id"?\s+SET\s+NOT\s+NULL/i],
  ["RENAME", /\bRENAME\b/i],
];

function leer(nombre: string): Migracion {
  return { nombre, sql: readFileSync(resolve(DIR_MIGRACIONES, nombre, "migration.sql"), "utf8") };
}

function faltasDeSlt196(migraciones: readonly Migracion[]): string[] {
  return migraciones.flatMap((m) =>
    DE_SLT196.filter(([, patron]) => patron.test(sinComentarios(m.sql))).map(([que]) => `${m.nombre}: ${que}`),
  );
}

function faltas(migraciones: readonly Migracion[]): string[] {
  return [...faltasR19(migraciones, OPCIONES), ...faltasDeSlt196(migraciones)];
}

const REALES = CARPETAS_SLT48.map(leer);

describe("SLT-48 · R13 — lo destructivo, declarado una por una", () => {
  it("las carpetas de SLT-48 son exactamente las de la rama y cada una trae su down.sql", () => {
    const enDisco = readdirSync(DIR_MIGRACIONES)
      .filter((n) => n.includes("_slt48_"))
      .sort();
    expect(enDisco).toEqual(CARPETAS_SLT48);
    for (const c of CARPETAS_SLT48) {
      expect(existsSync(resolve(DIR_MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
      expect(readFileSync(resolve(DIR_MIGRACIONES, c, "down.sql"), "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("verde sobre los migration.sql reales", () => {
    expect(faltas(REALES)).toEqual([]);
  });

  it("control: sin la lista, las reales tienen exactamente las 24 destructivas y los dos reemplazos", () => {
    // Cada `ALTER COLUMN … DROP NOT NULL` cuenta dos veces (`ALTER COLUMN` y `DROP`).
    const dosVeces = DESTRUCTIVAS.filter((d) => d.startsWith("ALTER COLUMN")).length;
    const sinLista = faltasR19(REALES, { reemplazablesPermitidas: [] });
    expect(sinLista.filter((f) => /: (DROP|ALTER COLUMN)$/.test(f))).toHaveLength(DESTRUCTIVAS.length + dosVeces);
    expect(sinLista.filter((f) => f.includes("CREATE OR REPLACE FUNCTION")).sort()).toEqual(
      REEMPLAZABLES.map((r) => `20261117120100_slt48_geografia_vieja_a_vistas: CREATE OR REPLACE FUNCTION ${r}`).sort(),
    );
    expect(sinLista).toHaveLength(DESTRUCTIVAS.length + dosVeces + REEMPLAZABLES.length);
  });

  it("el valor de enum va solo en su migración", () => {
    expect(sinComentarios(REALES[0].sql).trim()).toBe(
      `ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'nodo_geografico_movido';`,
    );
  });
});

describe("SLT-48 · R13, R14 — contraprueba con texto inventado", () => {
  const con = (extra: string) => faltas([...REALES, { nombre: "inventada", sql: extra }]);

  it("rojo con una sentencia destructiva que no está en la lista", () => {
    expect(con(`ALTER TABLE "orden" DROP CONSTRAINT "orden_zona_id_fkey";`)).toEqual(["inventada: DROP"]);
    expect(con(`DROP TRIGGER "orden_nodo_geografico" ON "orden";`)).toEqual(["inventada: DROP"]);
    expect(con(`ALTER TABLE "orden" ALTER COLUMN "zona_id" DROP NOT NULL;`)).toEqual([
      "inventada: ALTER COLUMN",
      "inventada: DROP",
    ]);
  });

  it("rojo si una declarada se repite o falta", () => {
    expect(con(`DROP TABLE "distrito";`)).toEqual(['declarada 2 veces: DROP TABLE "distrito"']);
    expect(faltas(REALES.slice(0, 1))).toContain('declarada y ausente: DROP TABLE "distrito"');
  });

  it("rojo con un CREATE OR REPLACE FUNCTION de otra función", () => {
    expect(
      con(`CREATE OR REPLACE FUNCTION zona_nodo_valido() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`),
    ).toEqual(["inventada: CREATE OR REPLACE FUNCTION zona_nodo_valido"]);
  });

  it("R14: rojo con DROP COLUMN, DROP VIEW, ALTER TABLE pais, SET NOT NULL del nodo y RENAME", () => {
    expect(con(`ALTER TABLE "orden" DROP COLUMN "provincia_id";`)).toEqual([
      "inventada: DROP",
      "inventada: DROP COLUMN",
    ]);
    expect(con(`DROP VIEW "distrito";`)).toEqual(["inventada: DROP", "inventada: DROP VIEW"]);
    expect(con(`ALTER TABLE "pais" ADD COLUMN "x" TEXT;`)).toEqual(["inventada: ALTER TABLE pais"]);
    expect(con(`ALTER TABLE pais DROP COLUMN nivel_1_singular;`)).toEqual([
      "inventada: DROP",
      "inventada: DROP COLUMN",
      "inventada: ALTER TABLE pais",
      "inventada: nivel_N_* o digitos_codigo_nivel_N",
    ]);
    expect(con(`ALTER TABLE "orden" ALTER COLUMN "nodo_geografico_id" SET NOT NULL;`)).toEqual([
      "inventada: ALTER COLUMN",
      "inventada: NOT NULL sobre nodo_geografico_id",
    ]);
    expect(con(`ALTER TABLE "zona_distrito" RENAME TO "zona_nodo_hoja";`)).toEqual([
      "inventada: RENAME",
      "inventada: RENAME",
    ]);
  });

  it("verde con lo que no es destructivo (vistas, triggers nuevos, GRANT)", () => {
    expect(
      con(`CREATE VIEW "x" AS SELECT 1; CREATE TRIGGER "t" INSTEAD OF INSERT OR UPDATE OR DELETE ON "x"
        FOR EACH ROW EXECUTE FUNCTION f(); GRANT SELECT ON "x" TO servi_app;`),
    ).toEqual([]);
  });
});
