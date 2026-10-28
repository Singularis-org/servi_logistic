import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SL-20 (T1.1, T1.7; design §2.1) — la tabla `pais` contra Postgres real.
//   · R1: código ISO alfa-2 (CHECK), nombre único, los seis nombres de nivel y la regla de código de
//     los tres niveles a la vez o ninguno.
//   · R2: la migración deja Costa Rica cargado con sus niveles y su regla 1/3/5.
//   · R3: una empresa (`servi_app`) lee los países y no puede crear, cambiar ni borrar ninguno.
//
// Cada caso corre en una transacción del dueño que se revierte. El de R3 baja a `servi_app` con
// `comoApp`: con la conexión del dueño el REVOKE no actúa y el caso pasaría aunque no existiera.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

describeSiHayBase("SL-20 — tabla pais", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2: Costa Rica está cargado con sus tres niveles en singular y plural y la regla 1/3/5", async () => {
    const cr = await base.pais.findUnique({ where: { id: "CR" } });
    expect(cr).toMatchObject({
      id: "CR",
      nombre: "Costa Rica",
      nivel1Singular: "Provincia",
      nivel1Plural: "Provincias",
      nivel2Singular: "Cantón",
      nivel2Plural: "Cantones",
      nivel3Singular: "Distrito",
      nivel3Plural: "Distritos",
      digitosCodigoNivel1: 1,
      digitosCodigoNivel2: 3,
      digitosCodigoNivel3: 5,
    });
  });

  it("R1: el código tiene que ser ISO alfa-2 en mayúsculas (23514)", async () => {
    const r = await revertida(base, async (tx) => ({
      minusculas: await intentar(tx, NUEVO_PAIS, "xa", "País xa"),
      tres: await intentar(tx, NUEVO_PAIS, "XAA", "País XAA"),
      digito: await intentar(tx, NUEVO_PAIS, "X1", "País X1"),
      valido: await intentar(tx, NUEVO_PAIS, "XA", "País XA"),
    }));
    expect(r).toEqual({ minusculas: "23514", tres: "23514", digito: "23514", valido: null });
  });

  it("R1: el código y el nombre son únicos (23505)", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      return {
        mismoCodigo: await intentar(tx, NUEVO_PAIS, "XA", "Otro nombre"),
        mismoNombre: await intentar(tx, NUEVO_PAIS, "XB", "Costa Rica"),
      };
    });
    expect(r).toEqual({ mismoCodigo: "23505", mismoNombre: "23505" });
  });

  it("R1/R17: la regla de código va en los tres niveles o en ninguno (23514)", async () => {
    const r = await revertida(base, async (tx) => ({
      aMedias: await intentar(tx, `${NUEVO_PAIS_CON_REGLA} VALUES ('XA', 'País XA', 'a','b','c','d','e','f', 1, 3, NULL)`),
      completa: await intentar(tx, `${NUEVO_PAIS_CON_REGLA} VALUES ('XB', 'País XB', 'a','b','c','d','e','f', 2, 4, 6)`),
      ninguna: await intentar(tx, `${NUEVO_PAIS_CON_REGLA} VALUES ('XC', 'País XC', 'a','b','c','d','e','f', NULL, NULL, NULL)`),
    }));
    expect(r).toEqual({ aMedias: "23514", completa: null, ninguna: null });
  });

  it("R3: una empresa lee los países pero no puede crear, cambiar ni borrar ninguno (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      const { id } = await crearOrganizacion(tx);
      await comoApp(tx, id);
      const lee = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM pais WHERE id = 'CR'`);
      const resultado = {
        lee: lee.map((f) => f.id),
        crea: await intentar(tx, NUEVO_PAIS, "XA", "País XA"),
        cambia: await intentar(tx, `UPDATE pais SET nombre = 'Otro' WHERE id = 'CR'`),
        borra: await intentar(tx, `DELETE FROM pais WHERE id = 'CR'`),
      };
      await comoDueno(tx);
      const cr = await tx.pais.findUnique({ where: { id: "CR" }, select: { nombre: true } });
      return { ...resultado, nombreTrasLosIntentos: cr?.nombre };
    });
    expect(r).toEqual({
      lee: ["CR"],
      crea: "42501",
      cambia: "42501",
      borra: "42501",
      nombreTrasLosIntentos: "Costa Rica",
    });
  });
});

const NUEVO_PAIS = `INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular, nivel_2_plural,
  nivel_3_singular, nivel_3_plural) VALUES ($1, $2, 'Región', 'Regiones', 'Comuna', 'Comunas', 'Barrio', 'Barrios')`;

const NUEVO_PAIS_CON_REGLA = `INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular,
  nivel_2_plural, nivel_3_singular, nivel_3_plural, digitos_codigo_nivel_1, digitos_codigo_nivel_2, digitos_codigo_nivel_3)`;
