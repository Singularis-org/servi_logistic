import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  fkCubierta,
  fkDeNegocio,
  nombreTrigger,
  tablaSinCambioCubierta,
  triggersVivos,
} from "@/lib/db/fk-de-negocio";
import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";

/**
 * SL-17 · R39 (design §3 M3, §8, D15) — GUARDIA: CADA FK DE NEGOCIO A NEGOCIO TIENE SU TRIGGER.
 *
 * La FK de Postgres comprueba que la fila referida exista, no que sea de la misma empresa, y la RLS
 * no interviene en esa comprobacion. M3 cierra el hueco con un trigger por FK. Una relacion nueva
 * en `db/schema.prisma` entre dos modelos de negocio nace SIN trigger: esta guardia la pone en rojo,
 * nombrando modelo y campo, hasta que una migracion lo cree (`tsx scripts/generar-misma-empresa.ts
 * --faltantes`). Las FK se calculan con `fkDeNegocio`, la misma funcion que usa el generador.
 *
 * Limite conocido (design §12): una FK escrita solo en SQL, fuera del esquema, no se ve.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const DIR_MIGRACIONES = path.join(RAIZ, "db", "migrations");

function migracionesEnOrden(): { nombre: string; sql: string }[] {
  return readdirSync(DIR_MIGRACIONES, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((nombre) => ({ nombre, archivo: path.join(DIR_MIGRACIONES, nombre, "migration.sql") }))
    .filter((m) => existsSync(m.archivo))
    .map((m) => ({ nombre: m.nombre, sql: readFileSync(m.archivo, "utf8") }));
}

/** Lo que la guardia reprocha; vacio = verde. Puro para poder probarlo contra si mismo. */
function faltasR39(
  esquema: string,
  sqls: readonly string[],
  modelosDeNegocio: readonly string[],
  tablasDeNegocio: readonly string[],
): string[] {
  let fks;
  try {
    fks = fkDeNegocio(esquema, modelosDeNegocio);
  } catch (e) {
    return [(e as Error).message];
  }
  const vivos = triggersVivos(sqls);
  return [
    ...fks
      .filter((fk) => !fkCubierta(fk, vivos))
      .map(
        (fk) =>
          `${fk.modelo}.${fk.campo} (${fk.tabla}.${fk.columna} -> ${fk.tablaRef}) sin trigger ` +
          `"${nombreTrigger(fk.tabla, fk.columna)}" … verificar_misma_empresa`,
      ),
    ...tablasDeNegocio
      .filter((t) => !tablaSinCambioCubierta(t, vivos))
      .map((t) => `${t} sin trigger "${t}_sin_cambio_de_empresa"`),
  ];
}

const ESQUEMA_REAL = readFileSync(path.join(RAIZ, "db", "schema.prisma"), "utf8");
const MIGRACIONES = migracionesEnOrden();
const NEGOCIO = MODELOS_DE_NEGOCIO.map((m) => m.modelo);
const TABLAS = MODELOS_DE_NEGOCIO.map((m) => m.tabla);

describe("R39: misma empresa en cada FK de negocio a negocio", () => {
  it("toda FK de negocio a negocio y toda tabla de negocio tienen su trigger vivo en db/migrations", () => {
    expect(faltasR39(ESQUEMA_REAL, MIGRACIONES.map((m) => m.sql), NEGOCIO, TABLAS)).toEqual([]);
  });

  it("control positivo: el esquema real tiene FK de negocio y entre ellas orden.tienda_id -> usuario", () => {
    const fks = fkDeNegocio(ESQUEMA_REAL);
    expect(fks.length).toBeGreaterThan(0);
    expect(fks).toContainEqual(
      expect.objectContaining({ modelo: "Orden", tabla: "orden", columna: "tienda_id", tablaRef: "usuario" }),
    );
    // Lo excluido no cuela: ni la propia `organizacion_id` ni las FK a catalogos.
    expect(fks.some((f) => f.columna === "organizacion_id" || f.tablaRef === "provincia")).toBe(false);
  });

  it("mutacion sobre el SQL real: sin el trigger de orden.tienda_id, falla nombrando Orden.tienda", () => {
    const nombre = nombreTrigger("orden", "tienda_id");
    let quitados = 0;
    const mutadas = MIGRACIONES.map((m) =>
      m.sql.replace(new RegExp(`CREATE TRIGGER "${nombre}"[^;]*;`, "g"), () => {
        quitados++;
        return "";
      }),
    );
    expect(quitados).toBe(1);
    const faltas = faltasR39(ESQUEMA_REAL, mutadas, NEGOCIO, TABLAS);
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toMatch(/^Orden\.tienda \(orden\.tienda_id -> usuario\)/);
  });
});

describe("R39: autocomprobacion con un esquema inventado", () => {
  const ESQUEMA = `
model Padre {
  id    String @id
  hijos Hijo[]
  @@map("padre")
}
model Hijo {
  id      String @id
  padreId String @map("padre_id")
  padre   Padre  @relation(fields: [padreId], references: [id])
  @@map("hijo")
}`;
  const MODELOS = ["Padre", "Hijo"];
  const TABLAS_INV = ["padre", "hijo"];
  const FK = `CREATE TRIGGER "${nombreTrigger("hijo", "padre_id")}" BEFORE INSERT OR UPDATE OF "padre_id", "organizacion_id"
  ON "hijo" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('padre', 'padre_id', 'id');`;
  const SIN_CAMBIO = TABLAS_INV.map(
    (t) =>
      `CREATE TRIGGER "${t}_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id" ON "${t}" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();`,
  ).join("\n");

  it("verde con todos los triggers", () => {
    expect(faltasR39(ESQUEMA, [FK, SIN_CAMBIO], MODELOS, TABLAS_INV)).toEqual([]);
  });

  it("rojo si falta el trigger de una FK, nombrando modelo y campo", () => {
    expect(faltasR39(ESQUEMA, [SIN_CAMBIO], MODELOS, TABLAS_INV)).toEqual([
      expect.stringMatching(/^Hijo\.padre \(hijo\.padre_id -> padre\) sin trigger/),
    ]);
  });

  it("rojo si un DROP TRIGGER posterior se lo quita", () => {
    const drop = `DROP TRIGGER "${nombreTrigger("hijo", "padre_id")}" ON "hijo";`;
    expect(faltasR39(ESQUEMA, [FK, SIN_CAMBIO, drop], MODELOS, TABLAS_INV)).toHaveLength(1);
  });

  it("rojo si el trigger apunta a otra columna o a otra funcion", () => {
    const otraColumna = FK.replace("'padre_id', 'id'", "'otra_id', 'id'");
    const otraFuncion = FK.replace("verificar_misma_empresa", "otra_funcion");
    expect(faltasR39(ESQUEMA, [otraColumna, SIN_CAMBIO], MODELOS, TABLAS_INV)).toHaveLength(1);
    expect(faltasR39(ESQUEMA, [otraFuncion, SIN_CAMBIO], MODELOS, TABLAS_INV)).toHaveLength(1);
  });

  it("rojo si una tabla de negocio no tiene <tabla>_sin_cambio_de_empresa", () => {
    const soloHijo = SIN_CAMBIO.split("\n").filter((l) => l.includes('"hijo"')).join("\n");
    expect(faltasR39(ESQUEMA, [FK, soloHijo], MODELOS, TABLAS_INV)).toEqual([
      'padre sin trigger "padre_sin_cambio_de_empresa"',
    ]);
  });

  it("rojo si una FK de negocio es compuesta", () => {
    const compuesta = ESQUEMA.replace("fields: [padreId], references: [id]", "fields: [padreId, id], references: [id, id]");
    expect(compuesta).not.toBe(ESQUEMA);
    expect(faltasR39(compuesta, [FK, SIN_CAMBIO], MODELOS, TABLAS_INV)).toEqual([
      expect.stringMatching(/compuesta.*Hijo\.padre/),
    ]);
  });
});
