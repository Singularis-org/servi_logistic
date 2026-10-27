import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODELOS_CON_EMPRESA_OPCIONAL, MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";

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

type EstadoRls = {
  /** tabla -> política viva para `servi_app` -> si compara con `app.organizacion_id`. */
  vivas: Map<string, Map<string, boolean>>;
  /** tabla -> migración que le desactivó la RLS (si sigue desactivada). */
  desactivada: Map<string, string>;
};

/**
 * Si una política aplica a `servi_app`: la nombra en su `TO`, o su `TO` es `PUBLIC`, o no lleva `TO`
 * (en Postgres, sin `TO` la política es para `PUBLIC`, y `PUBLIC` incluye a `servi_app`; m2 de la
 * revisión de SL-19). Solo se mira la cabecera, antes de `USING`/`WITH CHECK`, para no leer un `TO`
 * de la expresión.
 */
function aplicaAServiApp(cuerpo: string): boolean {
  const cabecera = cuerpo.split(/\b(?:USING|WITH\s+CHECK)\b/i)[0];
  const to = /\bTO\s+([\s\S]+)$/i.exec(cabecera);
  if (!to) return true;
  const roles = to[1].split(",").map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase());
  return roles.includes("servi_app") || roles.includes("public");
}

/**
 * Recorre las migraciones y deja, por tabla, TODAS las políticas vivas para `servi_app` (no solo
 * las de empresa): SL-19 necesita ver también las abiertas, porque las permisivas se suman con OR.
 */
function estadoRls(migraciones: readonly Migracion[]): EstadoRls {
  const vivas = new Map<string, Map<string, boolean>>();
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
        const paraApp = aplicaAServiApp(cuerpo);
        const porEmpresa = /current_setting\(\s*'app\.organizacion_id'/.test(cuerpo);
        if (paraApp) {
          if (!vivas.has(tabla)) vivas.set(tabla, new Map());
          vivas.get(tabla)!.set(politica, porEmpresa);
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
  return { vivas, desactivada };
}

/**
 * Tablas de `tablas` que, tras aplicar todas las migraciones, quedan sin política por empresa
 * para `servi_app`. Devuelve el motivo de cada una.
 */
function tablasSinPoliticaPorEmpresa(
  migraciones: readonly Migracion[],
  tablas: readonly string[],
): string[] {
  const { vivas, desactivada } = estadoRls(migraciones);
  const problemas: string[] = [];
  for (const t of tablas) {
    const porEmpresa = [...(vivas.get(t) ?? new Map<string, boolean>()).values()].filter(Boolean);
    if (porEmpresa.length === 0) {
      problemas.push(
        `"${t}": sin CREATE POLICY … TO servi_app con current_setting('app.organizacion_id') vigente`,
      );
    }
    const donde = desactivada.get(t);
    if (donde) problemas.push(`"${t}": RLS desactivada en ${donde}`);
  }
  return problemas;
}

/**
 * SL-19 · R9, R12 — políticas vivas para `servi_app` en `tablas` que NO comparan con
 * `app.organizacion_id` (p. ej. `USING (true)`). Las permisivas se suman con OR: una abierta junto a
 * la de empresa la anula. Nombra la tabla y la política.
 */
function politicasAbiertas(migraciones: readonly Migracion[], tablas: readonly string[]): string[] {
  const { vivas } = estadoRls(migraciones);
  const problemas: string[] = [];
  for (const t of tablas) {
    for (const [nombre, porEmpresa] of vivas.get(t) ?? []) {
      if (!porEmpresa) {
        problemas.push(`"${t}": la política "${nombre}" para servi_app no compara con app.organizacion_id`);
      }
    }
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
    // 73 de SL-17 + `distrito_zona_especial` (SL-38) + `cobro_plataforma_movimiento` (SL-40, 20261023130100)
    // + `integracion` e `integracion_prueba_minuto` (SL-36, 20261025120000)
    // + `organizacion_modulo` (SL-23, 20261026120000).
    expect(tablas.length).toBe(78);
  });

  it("cada tabla de negocio tiene su política vigente", () => {
    expect(tablasSinPoliticaPorEmpresa(migraciones, tablas)).toEqual([]);
  });

  describe("SL-19 · las tablas de empresa opcional y las políticas abiertas (R9, R12, R13)", () => {
    const opcionales = MODELOS_CON_EMPRESA_OPCIONAL.map((m) => m.tabla);
    const comprobadas = [...tablas, ...opcionales];
    const migracionSl19 = "20261025150000_jobs_por_empresa";

    it("control positivo: jobs se comprueba y la migración de SL-19 está entre las reales", () => {
      expect(opcionales).toEqual(["jobs"]);
      expect(migraciones.some((m) => m.nombre === migracionSl19)).toBe(true);
    });

    it("R13 — jobs y cada tabla de negocio tienen su política por empresa vigente", () => {
      expect(tablasSinPoliticaPorEmpresa(migraciones, comprobadas)).toEqual([]);
    });

    it("R9, R12 — ninguna tabla comprobada conserva una política abierta para servi_app", () => {
      expect(politicasAbiertas(migraciones, comprobadas)).toEqual([]);
    });

    it("R13 — autocomprobación: sin la migración de SL-19, jobs queda sin política por empresa y con jobs_abierta viva", () => {
      const sinSl19 = migraciones.filter((m) => m.nombre !== migracionSl19);
      expect(sinSl19).toHaveLength(migraciones.length - 1);
      expect(tablasSinPoliticaPorEmpresa(sinSl19, comprobadas)).toEqual([
        expect.stringMatching(/^"jobs": sin CREATE POLICY/),
      ]);
      expect(politicasAbiertas(sinSl19, comprobadas)).toEqual([
        `"jobs": la política "jobs_abierta" para servi_app no compara con app.organizacion_id`,
      ]);
    });

    it("R12 — autocomprobación: quitar el DROP POLICY jobs_abierta de la migración real la pone en rojo", () => {
      const mutadas = migraciones.map((m) =>
        m.nombre === migracionSl19 ? { ...m, sql: m.sql.replace(/DROP\s+POLICY\s+"jobs_abierta"\s+ON\s+"jobs"\s*;/, "") } : m,
      );
      expect(mutadas.find((m) => m.nombre === migracionSl19)?.sql).not.toBe(
        migraciones.find((m) => m.nombre === migracionSl19)?.sql,
      );
      expect(tablasSinPoliticaPorEmpresa(mutadas, comprobadas)).toEqual([]);
      expect(politicasAbiertas(mutadas, comprobadas)).toEqual([
        `"jobs": la política "jobs_abierta" para servi_app no compara con app.organizacion_id`,
      ]);
    });

    it("R12 — autocomprobación inventada: una USING (true) junto a la de empresa falla nombrando tabla y política", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `CREATE POLICY "orden_abierta" ON "orden" FOR ALL TO servi_app USING (true) WITH CHECK (true);` },
      ];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden"])).toEqual([]);
      expect(politicasAbiertas(m, ["orden"])).toEqual([
        `"orden": la política "orden_abierta" para servi_app no compara con app.organizacion_id`,
      ]);
    });

    it("R12 — autocomprobación inventada: un DROP posterior de la abierta la deja en verde", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `CREATE POLICY "orden_abierta" ON "orden" FOR ALL TO servi_app USING (true);` },
        { nombre: "3", sql: `DROP POLICY IF EXISTS "orden_abierta" ON "orden";` },
      ];
      expect(politicasAbiertas(m, ["orden"])).toEqual([]);
    });

    it("m2 — autocomprobación inventada: una USING (true) sin TO aplica a servi_app (PUBLIC) y falla", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `CREATE POLICY "orden_sin_to" ON "orden" FOR ALL USING (true);` },
      ];
      expect(politicasAbiertas(m, ["orden"])).toEqual([
        `"orden": la política "orden_sin_to" para servi_app no compara con app.organizacion_id`,
      ]);
    });

    it("m2 — autocomprobación inventada: una USING (true) TO PUBLIC aplica a servi_app y falla", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `CREATE POLICY "orden_publica" ON "orden" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);` },
      ];
      expect(politicasAbiertas(m, ["orden"])).toEqual([
        `"orden": la política "orden_publica" para servi_app no compara con app.organizacion_id`,
      ]);
    });

    it("m2 — una política por empresa sin TO también cubre la tabla", () => {
      const m = [{ nombre: "1", sql: politica("orden").replace(" TO servi_app", "") }];
      expect(tablasSinPoliticaPorEmpresa(m, ["orden"])).toEqual([]);
      expect(politicasAbiertas(m, ["orden"])).toEqual([]);
    });

    it("una política abierta para otro rol no es de la app y no cuenta", () => {
      const m = [
        { nombre: "1", sql: politica("orden") },
        { nombre: "2", sql: `CREATE POLICY "orden_dueno" ON "orden" FOR ALL TO postgres USING (true);` },
      ];
      expect(politicasAbiertas(m, ["orden"])).toEqual([]);
    });
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
