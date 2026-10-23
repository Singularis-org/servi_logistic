import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";

import { leer, RAIZ } from "./_aislamiento-por-empresa";

/**
 * SL-17 · R24 — GUARDIA: CADA TABLA DE NEGOCIO TIENE SU POLÍTICA RLS POR EMPRESA.
 *
 * La RLS es la segunda capa (D7): cubre el SQL a mano y cualquier hueco de la extensión. Si una
 * tabla de negocio nace sin política, o una migración posterior la quita, `servi_app` vuelve a
 * ver las filas de todas las empresas y ningún test de servicio lo nota.
 *
 * Se leen los `migration.sql` en orden de carpeta (el mismo que aplica `prisma migrate deploy`) y
 * dentro de cada uno en orden de texto. Los `down.sql` no cuentan: no se aplican al desplegar.
 */

const CARPETA_MIGRACIONES = "db/migrations";

type Migracion = { nombre: string; sql: string };

function migracionesReales(): Migracion[] {
  const absoluta = path.join(RAIZ, CARPETA_MIGRACIONES);
  return readdirSync(absoluta, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(absoluta, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort()
    .map((nombre) => ({ nombre, sql: leer(`${CARPETA_MIGRACIONES}/${nombre}/migration.sql`) }));
}

function sinComentariosSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

const IDENT = String.raw`(?:"([^"]+)"|(\w+))`;
const TABLA = String.raw`(?:"?public"?\.)?${IDENT}`;

/**
 * Tablas de `tablas` que, tras aplicar todas las migraciones, quedan sin política por empresa
 * para `servi_app`. Devuelve el motivo de cada una.
 */
function tablasSinPoliticaPorEmpresa(
  migraciones: readonly Migracion[],
  tablas: readonly string[],
): string[] {
  // tabla -> nombres de políticas por empresa vivas
  const vivas = new Map<string, Set<string>>();
  const desactivada = new Map<string, string>();
  const sentencia = new RegExp(
    String.raw`CREATE\s+POLICY\s+${IDENT}\s+ON\s+${TABLA}([^;]*);` +
      String.raw`|DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?${IDENT}\s+ON\s+${TABLA}` +
      String.raw`|ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${TABLA}\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY`,
    "gi",
  );
  for (const m of migraciones) {
    for (const s of sinComentariosSql(m.sql).matchAll(sentencia)) {
      if (s[0].toUpperCase().startsWith("CREATE")) {
        const politica = s[1] ?? s[2];
        const tabla = s[3] ?? s[4];
        const cuerpo = s[5];
        const paraApp = /\bTO\s+(?:[\w"]+\s*,\s*)*"?servi_app"?\b/i.test(cuerpo);
        const porEmpresa = /current_setting\(\s*'app\.organizacion_id'/.test(cuerpo);
        if (paraApp && porEmpresa) {
          if (!vivas.has(tabla)) vivas.set(tabla, new Set());
          vivas.get(tabla)!.add(politica);
        }
      } else if (s[0].toUpperCase().startsWith("DROP")) {
        vivas.get(s[8] ?? s[9])?.delete(s[6] ?? s[7]);
      } else {
        const tabla = s[10] ?? s[11];
        if (s[12].toUpperCase() === "DISABLE") desactivada.set(tabla, m.nombre);
        else desactivada.delete(tabla);
      }
    }
  }
  const problemas: string[] = [];
  for (const t of tablas) {
    if ((vivas.get(t)?.size ?? 0) === 0) {
      problemas.push(
        `"${t}": sin CREATE POLICY … TO servi_app con current_setting('app.organizacion_id') vigente`,
      );
    }
    const donde = desactivada.get(t);
    if (donde) problemas.push(`"${t}": RLS desactivada en ${donde}`);
  }
  return problemas;
}

const politica = (t: string, nombre = `${t}_por_empresa`) => `
CREATE POLICY "${nombre}" ON "${t}" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));`;

describe("SL-17 · RLS por empresa en cada tabla de negocio (R24)", () => {
  const migraciones = migracionesReales();
  const tablas = MODELOS_DE_NEGOCIO.map((m) => m.tabla);

  it("control positivo: hay migraciones y alguna crea políticas por empresa", () => {
    expect(migraciones.length).toBeGreaterThan(100);
    const conPolitica = migraciones.filter((m) => /current_setting\('app\.organizacion_id'/.test(m.sql));
    expect(conPolitica.length).toBeGreaterThan(0);
    expect(tablas.length).toBe(73);
  });

  it("cada tabla de negocio tiene su política vigente", () => {
    expect(tablasSinPoliticaPorEmpresa(migraciones, tablas)).toEqual([]);
  });

  it("autocomprobación sobre las migraciones reales: un DROP añadido al final deja «orden» sin cubrir", () => {
    const real = tablasSinPoliticaPorEmpresa(migraciones, tablas);
    const nombre = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+"orden"\s[^;]*app\.organizacion_id/
      .exec(migraciones.map((m) => m.sql).join("\n"))?.[1];
    expect(nombre).toBeDefined();
    const mutadas = [...migraciones, { nombre: "99999999999999_x", sql: `DROP POLICY "${nombre}" ON "orden";` }];
    expect(tablasSinPoliticaPorEmpresa(mutadas, tablas)).toEqual([
      ...real,
      expect.stringMatching(/^"orden": sin CREATE POLICY/),
    ]);
  });

  describe("autocomprobación con migraciones inventadas", () => {
    it("la política correcta pasa (si no, los casos rojos no valdrían)", () => {
      const m = [{ nombre: "1", sql: politica("orden") }];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden"])).toEqual([]);
    });

    it("una tabla sin política falla", () => {
      const m = [{ nombre: "1", sql: politica("orden") }];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden", "carga"])).toEqual([
        expect.stringMatching(/^"carga": sin CREATE POLICY/),
      ]);
    });

    it("una política que no es para servi_app o no mira la empresa no cuenta", () => {
      const otroRol = politica("orden").replace("TO servi_app", "TO postgres");
      const sinEmpresa = `CREATE POLICY "p" ON "carga" FOR ALL TO servi_app USING (true);`;
      const m = [{ nombre: "1", sql: `${otroRol}\n${sinEmpresa}` }];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden", "carga"])).toHaveLength(2);
    });

    it("una política comentada no cuenta", () => {
      const comentada = politica("orden")
        .split("\n")
        .map((l) => `-- ${l}`)
        .join("\n");
      expect(tablasSinPoliticaPorEmpresa([{ nombre: "1", sql: comentada }], ["orden"])).toHaveLength(1);
    });

    it("un DROP POLICY posterior la quita y falla", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `DROP POLICY IF EXISTS "orden_por_empresa" ON "orden";` },
      ];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden"])).toEqual([
        expect.stringMatching(/^"orden": sin CREATE POLICY/),
      ]);
    });

    it("un DROP seguido de un CREATE nuevo deja la tabla cubierta", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `DROP POLICY "orden_por_empresa" ON "orden";\n${politica("orden", "otra")}` },
      ];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden"])).toEqual([]);
    });

    it("un DISABLE ROW LEVEL SECURITY posterior falla", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `ALTER TABLE "orden" DISABLE ROW LEVEL SECURITY;` },
      ];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden"])).toEqual([
        expect.stringMatching(/RLS desactivada en 2/),
      ]);
    });
  });
});
