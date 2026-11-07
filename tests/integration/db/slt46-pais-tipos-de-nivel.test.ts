import { readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { MIGRACIONES } from "./_fixtures/ida-y-vuelta-32";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T2.5; design §2.4) — `pais_tipos_de_nivel` de `20261106120200`, contra Postgres.
//   · R47: en Costa Rica y en un país de 3 tipos, la misma escritura de `pais` deja los mismos tipos
//     con la función de SLT-46 que con la de SLT-43, comparados campo a campo. La de SLT-43 se pone
//     dentro de la transacción revertida (`CREATE OR REPLACE` con el cuerpo leído de
//     `20261104120100`), así que la base compartida nunca la ve.
//   · R46: un `pais` con '' en el nivel 3 queda con exactamente `nivel_1` y `nivel_2` tras el INSERT,
//     tras editar sus nombres de nivel 1 y 2 y tras un UPDATE de otra columna. Contraprueba: con la
//     función de SLT-43 el mismo INSERT le crea un `nivel_3` vacío.
//   · R50: poner '' en el nivel 3 de un país que ya tiene `nivel_3` no lo borra.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** La función de SLT-43, copiada del archivo de su migración, como `CREATE OR REPLACE`. */
function funcionDeSlt43(): string {
  const sql = readFileSync(path.join(MIGRACIONES, "20261104120100_tipo_nivel_geografico", "migration.sql"), "utf8");
  const m = /CREATE FUNCTION pais_tipos_de_nivel\(\)[\s\S]*?END \$\$;/.exec(sql);
  if (m === null) throw new Error("no encuentro pais_tipos_de_nivel en 20261104120100");
  return m[0].replace(/^CREATE FUNCTION/, "CREATE OR REPLACE FUNCTION").replace(/;$/, "");
}

interface Tipo {
  id: string;
  clave: string;
  nombre_singular: string;
  nombre_plural: string;
  digitos_codigo: number | null;
  codigo_hereda_prefijo: boolean;
}

async function tiposDe(tx: TxDeTest, paisId: string): Promise<Tipo[]> {
  return tx.$queryRawUnsafe<Tipo[]>(
    `SELECT id, clave, nombre_singular, nombre_plural, digitos_codigo, codigo_hereda_prefijo
       FROM tipo_nivel_geografico WHERE pais_id = $1 ORDER BY clave`,
    paisId,
  );
}

/**
 * El id de cada tipo como «conservado» (ya estaba antes de la escritura) o «nuevo»: los ids nuevos son
 * aleatorios en cada corrida, y lo que R47 compara es si el upsert conserva o crea.
 */
function sinIdsNuevos(tipos: Tipo[], previos: Tipo[]): Tipo[] {
  const conocidos = new Set(previos.map((t) => t.id));
  return tipos.map((t) => ({ ...t, id: conocidos.has(t.id) ? "(conservado)" : "(nuevo)" }));
}

/** La secuencia de R47: alta de un país de 3 tipos, su edición, y una edición de Costa Rica. */
async function escriturasDeR47(tx: TxDeTest): Promise<Record<string, unknown>> {
  const crAntes = await tiposDe(tx, "CR");
  await crearPaisDePrueba(tx, "XA");
  const alta = sinIdsNuevos(await tiposDe(tx, "XA"), []);
  const xaAntes = await tiposDe(tx, "XA");
  await tx.$executeRawUnsafe(
    `UPDATE pais SET nivel_3_singular = 'Vecindario', nivel_3_plural = 'Vecindarios', digitos_codigo_nivel_1 = 1, digitos_codigo_nivel_2 = 3, digitos_codigo_nivel_3 = 5 WHERE id = 'XA'`,
  );
  const edicion = sinIdsNuevos(await tiposDe(tx, "XA"), xaAntes);
  await tx.$executeRawUnsafe(`UPDATE pais SET nivel_2_plural = nivel_2_plural || ' (r47)', nivel_3_singular = nivel_3_singular WHERE id = 'CR'`);
  const cr = sinIdsNuevos(await tiposDe(tx, "CR"), crAntes);
  return { alta, edicion, cr, crCuantos: crAntes.length };
}

describeSiHayBase("SLT-46 — pais_tipos_de_nivel sin nivel 3 opcional (R46, R47, R50)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R47: Costa Rica y un país de 3 tipos quedan con los mismos tipos que con la función de SLT-43 tras la misma escritura", async () => {
    const conSlt46 = await revertida(base, escriturasDeR47);
    const conSlt43 = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(funcionDeSlt43());
      return escriturasDeR47(tx);
    });
    expect(conSlt46).toEqual(conSlt43);
    // Control: la secuencia escribió algo en los dos casos (Costa Rica tiene sus tres tipos y la
    // edición llegó a ellos).
    expect(conSlt46.crCuantos).toBe(3);
    expect((conSlt46.edicion as Tipo[]).map((t) => [t.clave, t.nombre_singular, t.digitos_codigo, t.codigo_hereda_prefijo])).toEqual([
      ["nivel_1", "Región", 1, false],
      ["nivel_2", "Comuna", 3, true],
      ["nivel_3", "Vecindario", 5, true],
    ]);
    expect((conSlt46.cr as Tipo[]).find((t) => t.clave === "nivel_2")?.nombre_plural).toMatch(/ \(r47\)$/);
  });

  it("R46: un país con '' en el nivel 3 queda con 2 tipos tras el INSERT, tras editar los niveles 1 y 2 y tras otro UPDATE", async () => {
    const r = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular, nivel_2_plural, nivel_3_singular, nivel_3_plural)
         VALUES ('XB', 'País de prueba de 2 niveles', 'Departamento', 'Departamentos', 'Municipio', 'Municipios', '', '')`,
      );
      const claves = async () => (await tiposDe(tx, "XB")).map((t) => `${t.clave}:${t.nombre_singular}/${t.nombre_plural}`);
      const trasAlta = await claves();
      await tx.$executeRawUnsafe(`UPDATE pais SET nivel_1_singular = 'Provincia', nivel_1_plural = 'Provincias' WHERE id = 'XB'`);
      const trasNivel1 = await claves();
      await tx.$executeRawUnsafe(`UPDATE pais SET nivel_2_plural = 'Municipalidades' WHERE id = 'XB'`);
      const trasNivel2 = await claves();
      await tx.$executeRawUnsafe(`UPDATE pais SET nombre = 'País de 2 niveles renombrado', nivel_3_plural = '' WHERE id = 'XB'`);
      const trasOtro = await claves();
      return { trasAlta, trasNivel1, trasNivel2, trasOtro };
    });
    expect(r).toEqual({
      trasAlta: ["nivel_1:Departamento/Departamentos", "nivel_2:Municipio/Municipios"],
      trasNivel1: ["nivel_1:Provincia/Provincias", "nivel_2:Municipio/Municipios"],
      trasNivel2: ["nivel_1:Provincia/Provincias", "nivel_2:Municipio/Municipalidades"],
      trasOtro: ["nivel_1:Provincia/Provincias", "nivel_2:Municipio/Municipalidades"],
    });
  });

  it("R46 contraprueba: con la función de SLT-43 el mismo INSERT le crea un nivel_3 de nombre vacío", async () => {
    const claves = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(funcionDeSlt43());
      await tx.$executeRawUnsafe(
        `INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular, nivel_2_plural, nivel_3_singular, nivel_3_plural)
         VALUES ('XB', 'País de prueba de 2 niveles', 'Departamento', 'Departamentos', 'Municipio', 'Municipios', '', '')`,
      );
      return (await tiposDe(tx, "XB")).map((t) => `${t.clave}:${t.nombre_singular}`);
    });
    expect(claves).toEqual(["nivel_1:Departamento", "nivel_2:Municipio", "nivel_3:"]);
  });

  it("R50: poner '' en el nivel 3 de un país que ya tiene nivel_3 no lo borra ni lo cambia", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const antes = await tiposDe(tx, "XA");
      await tx.$executeRawUnsafe(`UPDATE pais SET nivel_3_singular = '', nivel_3_plural = '' WHERE id = 'XA'`);
      return { antes, despues: await tiposDe(tx, "XA") };
    });
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.map((t) => t.clave)).toEqual(["nivel_1", "nivel_2", "nivel_3"]);
  });
});
