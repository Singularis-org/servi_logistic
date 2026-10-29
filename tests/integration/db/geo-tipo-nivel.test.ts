import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-43 (T1.3; design §2.1) — `tipo_nivel_geografico` contra Postgres real.
//   · R1: clave única por país (23505), con formato (23514) y país existente (23503).
//   · R2: ningún país de la base queda sin sus tres tipos, y los de Costa Rica son copia de `pais`.
//   · R3: el alta de un país crea sus tres tipos y un cambio de nombres o dígitos los alcanza, en la
//     misma transacción (trigger `pais_tipos_de_nivel`).
//   · R12 (lado de los tipos): una empresa lee solo los de su país y no escribe ninguno (42501).
//
// Cada caso corre en una transacción del dueño que se revierte. El de R12 baja a `servi_app` con
// `comoApp`: con la conexión del dueño ni la RLS ni el REVOKE actúan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface FilaTipo {
  clave: string;
  nombre_singular: string;
  nombre_plural: string;
  digitos_codigo: number | null;
  codigo_hereda_prefijo: boolean;
}

async function tiposDe(tx: TxDeTest, paisId: string): Promise<FilaTipo[]> {
  return tx.$queryRawUnsafe<FilaTipo[]>(
    `SELECT clave, nombre_singular, nombre_plural, digitos_codigo, codigo_hereda_prefijo
       FROM tipo_nivel_geografico WHERE pais_id = $1 ORDER BY clave`,
    paisId,
  );
}

const NUEVO_TIPO = `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural)
  VALUES (gen_random_uuid()::text, $1, $2, 'x', 'xs')`;

describeSiHayBase("SLT-43 — tipo_nivel_geografico", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2: Costa Rica tiene sus tres tipos, copia de `pais.nivel_N_*` y de su regla 1/3/5", async () => {
    const tipos = await revertida(base, (tx) => tiposDe(tx, "CR"));
    expect(tipos).toEqual([
      { clave: "nivel_1", nombre_singular: "Provincia", nombre_plural: "Provincias", digitos_codigo: 1, codigo_hereda_prefijo: false },
      { clave: "nivel_2", nombre_singular: "Cantón", nombre_plural: "Cantones", digitos_codigo: 3, codigo_hereda_prefijo: true },
      { clave: "nivel_3", nombre_singular: "Distrito", nombre_plural: "Distritos", digitos_codigo: 5, codigo_hereda_prefijo: true },
    ]);
  });

  it("R2: ningún país de la base queda sin sus tres tipos nivel_1..3", async () => {
    const sinCatalogo = await revertida(base, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT p.id FROM pais p
          WHERE (SELECT count(*) FROM tipo_nivel_geografico t
                  WHERE t.pais_id = p.id AND t.clave IN ('nivel_1', 'nivel_2', 'nivel_3')) <> 3`,
      ),
    );
    expect(sinCatalogo).toEqual([]);
  });

  it("R3: el alta de un país crea sus tres tipos en la misma transacción", async () => {
    const tipos = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XB");
      return tiposDe(tx, "XB");
    });
    expect(tipos).toEqual([
      { clave: "nivel_1", nombre_singular: "Región", nombre_plural: "Regiones", digitos_codigo: null, codigo_hereda_prefijo: false },
      { clave: "nivel_2", nombre_singular: "Comuna", nombre_plural: "Comunas", digitos_codigo: null, codigo_hereda_prefijo: false },
      { clave: "nivel_3", nombre_singular: "Barrio", nombre_plural: "Barrios", digitos_codigo: null, codigo_hereda_prefijo: false },
    ]);
  });

  it("R3: cambiar un nombre de nivel o los dígitos actualiza el tipo, sin crear otro ni cambiar su id", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XB");
      const ids = await tx.$queryRawUnsafe<{ clave: string; id: string }[]>(
        `SELECT clave, id FROM tipo_nivel_geografico WHERE pais_id = 'XB' ORDER BY clave`,
      );
      await tx.$executeRawUnsafe(`UPDATE pais SET nivel_2_singular = 'Municipio', nivel_2_plural = 'Municipios' WHERE id = 'XB'`);
      const trasNombre = await tiposDe(tx, "XB");
      await tx.$executeRawUnsafe(
        `UPDATE pais SET digitos_codigo_nivel_1 = 2, digitos_codigo_nivel_2 = 4, digitos_codigo_nivel_3 = 6 WHERE id = 'XB'`,
      );
      const trasDigitos = await tiposDe(tx, "XB");
      const idsDespues = await tx.$queryRawUnsafe<{ clave: string; id: string }[]>(
        `SELECT clave, id FROM tipo_nivel_geografico WHERE pais_id = 'XB' ORDER BY clave`,
      );
      return { ids, trasNombre, trasDigitos, idsDespues };
    });
    expect(r.trasNombre[1]).toMatchObject({ clave: "nivel_2", nombre_singular: "Municipio", nombre_plural: "Municipios" });
    expect(r.trasNombre[0]).toMatchObject({ nombre_singular: "Región" });
    expect(r.trasDigitos.map((t) => [t.clave, t.digitos_codigo, t.codigo_hereda_prefijo])).toEqual([
      ["nivel_1", 2, false],
      ["nivel_2", 4, true],
      ["nivel_3", 6, true],
    ]);
    expect(r.idsDespues).toEqual(r.ids);
  });

  it("R1: la clave es única por país (23505), con formato (23514) y de un país que existe (23503)", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XB");
      return {
        repetida: await intentar(tx, NUEVO_TIPO, "XB", "nivel_1"),
        otraClave: await intentar(tx, NUEVO_TIPO, "XB", "region_extra"),
        mayusculas: await intentar(tx, NUEVO_TIPO, "XB", "Nivel_4"),
        vacia: await intentar(tx, NUEVO_TIPO, "XB", ""),
        paisInexistente: await intentar(tx, NUEVO_TIPO, "XZ", "nivel_1"),
      };
    });
    expect(r).toEqual({
      repetida: "23505",
      otraClave: null,
      mayusculas: "23514",
      vacia: "23514",
      paisInexistente: "23503",
    });
  });

  it("R12: una empresa lee solo los tipos de su país y no puede crear, cambiar ni borrar ninguno (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XB");
      const { id } = await crearOrganizacionEnPais(tx, "XB");
      await comoApp(tx, id);
      const lee = await tx.$queryRawUnsafe<{ pais_id: string }[]>(
        `SELECT DISTINCT pais_id FROM tipo_nivel_geografico`,
      );
      const resultado = {
        lee: lee.map((f) => f.pais_id),
        crea: await intentar(tx, NUEVO_TIPO, "XB", "region_extra"),
        cambia: await intentar(tx, `UPDATE tipo_nivel_geografico SET nombre_singular = 'Otro' WHERE pais_id = 'XB'`),
        borra: await intentar(tx, `DELETE FROM tipo_nivel_geografico WHERE pais_id = 'XB'`),
      };
      await comoDueno(tx);
      const trasLosIntentos = await tiposDe(tx, "XB");
      return { ...resultado, nombresTrasLosIntentos: trasLosIntentos.map((t) => t.nombre_singular) };
    });
    expect(r).toEqual({
      lee: ["XB"],
      crea: "42501",
      cambia: "42501",
      borra: "42501",
      nombresTrasLosIntentos: ["Región", "Comuna", "Barrio"],
    });
  });
});
