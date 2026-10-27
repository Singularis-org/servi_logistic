import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { UNICOS_SIN_EMPRESA, type UnicoSinEmpresa } from "@/lib/db/excepciones-aislamiento";
import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";

import {
  entradasSinUnico,
  globalesSinNombrarEnDocs,
  MIGRACION_UNICOS_POR_EMPRESA,
  migracionesEnOrden,
  type Migracion,
  problemasDeForma,
  RAIZ,
  seccionMultiEmpresa,
  unicosDeNegocio,
  unicosFinales,
  unicosSinEmpresaFueraDeLista,
} from "./_unicos-por-empresa";

/**
 * SL-18 · R22, R23, R30 (design §5) — GUARDIA: LOS ÚNICOS DE NEGOCIO EMPIEZAN POR `organizacion_id`
 * O ESTÁN EN `UNICOS_SIN_EMPRESA`.
 *
 * Un único global en una tabla de negocio hace que la segunda empresa choque con la primera (el
 * `zona_nombre_key` de antes de SL-17). La guardia lee las migraciones, no el esquema: el esquema no
 * expresa los índices parciales ni `NULLS NOT DISTINCT`, y la review de SL-17 vio que seguía
 * declarando el compuesto aunque la migración lo hubiera perdido (M4b).
 *
 * El detector recorre todo el historial para saber el estado final de cada índice; (a) se aplica a
 * todo único final de negocio, que incluye los que crean las migraciones desde `20261023090000` (R22).
 */

const TABLAS = MODELOS_DE_NEGOCIO.map((m) => m.tabla);
const MIGRACIONES = migracionesEnOrden();
const FINALES = unicosFinales(MIGRACIONES);
const ARCHITECTURE = readFileSync(path.join(RAIZ, "docs", "architecture.md"), "utf8");

describe("SL-18 · únicos de negocio por empresa (R22, R23, R30)", () => {
  it("control positivo: el detector ve el historial y los únicos de negocio de las dos clases", () => {
    expect(MIGRACIONES.length).toBeGreaterThan(200);
    expect(MIGRACIONES.some((m) => m.nombre === MIGRACION_UNICOS_POR_EMPRESA)).toBe(true);
    const negocio = unicosDeNegocio(FINALES, TABLAS);
    expect(negocio.filter((u) => u.columnas[0] === "organizacion_id").length).toBeGreaterThan(15);
    expect(negocio.filter((u) => u.columnas[0] !== "organizacion_id").length).toBeGreaterThan(50);
    // Formas que el detector tiene que seguir bien, vistas en el historial real.
    expect(FINALES.get("tarifas_zona_id_tienda_id_key")?.columnas).toEqual(["organizacion_id", "zona_id", "tienda_id"]);
    expect(FINALES.get("zona_es_central_unico")?.columnas).toEqual(["organizacion_id", "es_central"]);
    expect(FINALES.get("usuario_email_key")?.columnas).toEqual(["organizacion_id", "email"]);
  });

  it("R22 (a): todo único final de negocio empieza por organizacion_id o está en UNICOS_SIN_EMPRESA", () => {
    expect(
      unicosSinEmpresaFueraDeLista(FINALES, TABLAS, UNICOS_SIN_EMPRESA),
      "Pon organizacion_id como primera columna, o añade el índice a UNICOS_SIN_EMPRESA con su tipo y motivo",
    ).toEqual([]);
  });

  it("R23 (b): toda entrada de UNICOS_SIN_EMPRESA existe en las migraciones y sigue sin la columna", () => {
    expect(entradasSinUnico(FINALES, UNICOS_SIN_EMPRESA)).toEqual([]);
  });

  it("R23: cada entrada trae motivo, no se repite, y un anclado dice «FK NOT NULL a `<tabla>`»", () => {
    expect(problemasDeForma(UNICOS_SIN_EMPRESA)).toEqual([]);
  });

  it("R23, R30 (c): docs/architecture.md > Multi-empresa nombra cada único global a propósito", () => {
    const seccion = seccionMultiEmpresa(ARCHITECTURE);
    expect(seccion.length).toBeGreaterThan(0);
    expect(globalesSinNombrarEnDocs(UNICOS_SIN_EMPRESA, FINALES, seccion)).toEqual([]);
  });

  it("R30: docs/architecture.md dice que usuario.email y usuario.cedula son por empresa y por qué num_guia sigue global", () => {
    const seccion = seccionMultiEmpresa(ARCHITECTURE);
    expect(seccion).toMatch(/`usuario\.email` y\s+`usuario\.cedula` son únicos por empresa/);
    expect(seccion).toMatch(/`orden\.num_guia` y `orden_num_guia_seq` siguen globales a propósito/);
    expect(seccion).toContain("/paquete/[numGuia]");
    // Lo que decía antes y ya es falso.
    expect(seccion).not.toMatch(/globales a propósito `usuario\.email`/);
  });

  describe("autoprueba (d): con SQL de muestra la guardia se pone en rojo", () => {
    const conMigracion = (nombre: string, sql: string): Migracion[] => [...MIGRACIONES, { nombre, sql }];

    it("R22 (d): un único nuevo sin organizacion_id en una tabla de negocio hace fallar (a)", () => {
      const finales = unicosFinales(
        conMigracion(
          "20991231000000_muestra",
          'CREATE UNIQUE INDEX "zona_codigo_key" ON "zona" ("codigo");\n' +
            'ALTER TABLE "orden" ADD CONSTRAINT "orden_ref_externa_key" UNIQUE ("ref_externa");',
        ),
      );
      expect(unicosSinEmpresaFueraDeLista(finales, TABLAS, UNICOS_SIN_EMPRESA)).toEqual([
        'orden.orden_ref_externa_key (ref_externa) — 20991231000000_muestra',
        'zona.zona_codigo_key (codigo) — 20991231000000_muestra',
      ]);
    });

    it("R22 (d): con organizacion_id primero, o en una tabla de plataforma, no falla", () => {
      const finales = unicosFinales(
        conMigracion(
          "20991231000000_muestra",
          'CREATE UNIQUE INDEX "zona_codigo_key" ON "zona" ("organizacion_id", "codigo");\n' +
            'CREATE UNIQUE INDEX "provincia_codigo_key" ON "provincia" ("codigo");',
        ),
      );
      expect(unicosSinEmpresaFueraDeLista(finales, TABLAS, UNICOS_SIN_EMPRESA)).toEqual([]);
    });

    it("R22 (d): un único comentado no cuenta, y uno borrado después tampoco", () => {
      const finales = unicosFinales(
        conMigracion(
          "20991231000000_muestra",
          '-- CREATE UNIQUE INDEX "zona_codigo_key" ON "zona" ("codigo");\n' +
            'CREATE UNIQUE INDEX "zona_alias_key" ON "zona" ("alias");\n' +
            'DROP INDEX "zona_alias_key";',
        ),
      );
      expect(unicosSinEmpresaFueraDeLista(finales, TABLAS, UNICOS_SIN_EMPRESA)).toEqual([]);
    });

    it("R22 (d): mutación M4b — quitar organizacion_id de un índice de 20261023090000 hace fallar (a)", () => {
      const original = MIGRACIONES.find((m) => m.nombre === MIGRACION_UNICOS_POR_EMPRESA)!;
      const mutado = original.sql.replace(
        /("zona_nombre_key"\s+ON\s+"zona"\s+\()"organizacion_id",\s*/,
        "$1",
      );
      expect(mutado).not.toBe(original.sql);
      const finales = unicosFinales(
        MIGRACIONES.map((m) => (m.nombre === MIGRACION_UNICOS_POR_EMPRESA ? { ...m, sql: mutado } : m)),
      );
      expect(unicosSinEmpresaFueraDeLista(finales, TABLAS, UNICOS_SIN_EMPRESA)).toEqual([
        `zona.zona_nombre_key (nombre) — ${MIGRACION_UNICOS_POR_EMPRESA}`,
      ]);
    });

    it("R23 (d): una entrada que no existe, o cuyo índice ya empieza por organizacion_id, hace fallar (b)", () => {
      const lista: UnicoSinEmpresa[] = [
        { indice: "zona_fantasma_key", tabla: "zona", tipo: "anclado", motivo: "FK NOT NULL a `zona`" },
        { indice: "zona_nombre_key", tabla: "zona", tipo: "global", motivo: "x" },
      ];
      expect(entradasSinUnico(FINALES, lista)).toEqual([
        "zona.zona_fantasma_key: no existe en las migraciones",
        "zona.zona_nombre_key: ya empieza por organizacion_id; quítala de la lista",
      ]);
    });

    it("R23 (d): una entrada mal formada o repetida hace fallar la forma", () => {
      const mala: UnicoSinEmpresa = { indice: "a_key", tabla: "a", tipo: "anclado", motivo: "porque sí" };
      expect(problemasDeForma([mala, { ...mala, motivo: " " }])).toEqual([
        "a.a_key: el motivo de un anclado es «FK NOT NULL a `<tabla>`»",
        "a.a_key: repetida",
        "a.a_key: motivo vacío",
        "a.a_key: el motivo de un anclado es «FK NOT NULL a `<tabla>`»",
      ]);
    });

    it("R23, R30 (d): si la sección Multi-empresa deja de nombrar un global, (c) falla", () => {
      const seccion = seccionMultiEmpresa(ARCHITECTURE).replaceAll("`orden.num_guia`", "la guía");
      expect(globalesSinNombrarEnDocs(UNICOS_SIN_EMPRESA, FINALES, seccion)).toEqual(["orden.orden_num_guia_key"]);
      // Nombrarlo fuera de la sección no cuenta.
      expect(seccionMultiEmpresa("## Otra\n`orden.num_guia`\n## Multi-empresa\nnada\n## Fin\n`orden.num_guia`")).not.toContain(
        "num_guia",
      );
    });

    it("el detector sigue renombres, DROP CONSTRAINT, DROP COLUMN y DROP TABLE", () => {
      const finales = unicosFinales([
        {
          nombre: "1",
          sql:
            'CREATE TABLE "cobro" ("id" TEXT);\n' +
            'CREATE UNIQUE INDEX "cobro_x_key" ON "cobro"("x");\n' +
            'ALTER TABLE "cobro" RENAME TO "tarifas";\n' +
            'ALTER INDEX "cobro_x_key" RENAME TO "tarifas_x_key";\n' +
            'ALTER TABLE "tarifas" RENAME COLUMN "x" TO "y";\n' +
            'ALTER TABLE "zona" ADD CONSTRAINT "zona_a_key" UNIQUE NULLS NOT DISTINCT ("a", lower("b"));\n' +
            'CREATE UNIQUE INDEX IF NOT EXISTS "zona_c_key" ON public."zona" USING btree ("c" DESC) WHERE "c" IS NOT NULL;\n' +
            'CREATE UNIQUE INDEX "orden_d_key" ON "orden" ("d");\n' +
            'CREATE UNIQUE INDEX "carga_e_key" ON "carga" ("e");\n',
        },
        {
          nombre: "2",
          sql:
            'ALTER TABLE "zona" DROP CONSTRAINT "zona_a_key";\n' +
            'ALTER TABLE "orden" DROP COLUMN IF EXISTS "d";\n' +
            'DROP TABLE IF EXISTS "carga";\n' +
            "COMMENT ON COLUMN \"zona\".\"c\" IS 'UNIQUE: solo citado';\n",
        },
      ]);
      expect([...finales.values()].map((u) => `${u.tabla}.${u.indice}(${u.columnas.join(",")})`).sort()).toEqual([
        "tarifas.tarifas_x_key(y)",
        "zona.zona_c_key(c)",
      ]);
    });

    it("una forma de UNIQUE que el detector no sigue lo hace lanzar, no callar", () => {
      expect(() =>
        unicosFinales([{ nombre: "20991231000000_muestra", sql: 'CREATE TABLE "zona2" ("codigo" TEXT UNIQUE);' }]),
      ).toThrow(/20991231000000_muestra: 1 UNIQUE escritos y 0 reconocidos/);
      expect(() =>
        unicosFinales([{ nombre: "m", sql: 'ALTER TABLE "zona" ADD UNIQUE ("codigo");' }]),
      ).toThrow(/no sigue/);
    });
  });
});
