import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearPaisDePrueba, type MonedaDePrueba } from "@/tests/fabricas/paises";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-21 (T1.3; design §2.1) — la moneda y el impuesto de `pais` contra Postgres real.
//   · R1: las seis columnas admiten «sin dato», y una moneda completa y válida entra.
//   · R2: cada CHECK rechaza su caso (23514) y la fila queda como estaba.
//   · R4: una empresa (`servi_app`) lee la moneda y el impuesto y no puede escribirlos (42501).
//
// Cada caso corre en una transacción del dueño que se revierte. El de R4 baja a `servi_app` con
// `comoApp`: con la conexión del dueño el REVOKE no actúa y el caso pasaría aunque no existiera.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Una moneda válida que no es la de CR en nada, para que ningún caso pase por casualidad. */
const VALIDA: MonedaDePrueba = { codigo: "XTS", simbolo: "€", separadorMiles: " ", separadorDecimal: ".", decimales: 0 };

const COLUMNAS = `"moneda_codigo", "moneda_simbolo", "moneda_separador_miles", "moneda_separador_decimal",
  "moneda_decimales", "impuesto_nombre"`;

/** Las seis columnas de `XA` tal como están en la base. */
async function monedaDeXA(tx: TxDeTest): Promise<Record<string, unknown>> {
  const [fila] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${COLUMNAS} FROM pais WHERE id = 'XA'`);
  return fila;
}

/** Un UPDATE de `XA` que pone `cambios` sobre la moneda válida. SQLSTATE o `null`. */
async function intentarSobreValida(tx: TxDeTest, cambios: string): Promise<string | null> {
  return intentar(tx, `UPDATE pais SET ${cambios} WHERE id = 'XA'`);
}

let base: PrismaClient;

describeSiHayBase("SL-21 — moneda e impuesto de pais", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: un país nace sin moneda ni impuesto; la moneda completa y el impuesto solo entran", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const sinDatos = await monedaDeXA(tx);
      const soloImpuesto = await intentar(tx, `UPDATE pais SET impuesto_nombre = 'IGV' WHERE id = 'XA'`);
      const completa = await intentar(
        tx,
        `UPDATE pais SET moneda_codigo = 'XTS', moneda_simbolo = '€', moneda_separador_miles = ' ',
           moneda_separador_decimal = '.', moneda_decimales = 0 WHERE id = 'XA'`,
      );
      return { sinDatos, soloImpuesto, completa, final: await monedaDeXA(tx) };
    });
    expect(r.sinDatos).toEqual({
      moneda_codigo: null,
      moneda_simbolo: null,
      moneda_separador_miles: null,
      moneda_separador_decimal: null,
      moneda_decimales: null,
      impuesto_nombre: null,
    });
    expect(r.soloImpuesto).toBeNull();
    expect(r.completa).toBeNull();
    expect(r.final).toEqual({
      moneda_codigo: "XTS",
      moneda_simbolo: "€",
      moneda_separador_miles: " ",
      moneda_separador_decimal: ".",
      moneda_decimales: 0,
      impuesto_nombre: "IGV",
    });
  });

  it("R1: los tres rangos de decimales (0, 1 y 2) y los separadores de miles habituales entran", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA", { moneda: VALIDA, impuestoNombre: "IGV" });
      return {
        uno: await intentarSobreValida(tx, `moneda_decimales = 1`),
        dos: await intentarSobreValida(tx, `moneda_decimales = 2`),
        punto: await intentarSobreValida(tx, `moneda_separador_miles = '.', moneda_separador_decimal = ','`),
        coma: await intentarSobreValida(tx, `moneda_separador_miles = ',', moneda_separador_decimal = '.'`),
        apostrofo: await intentarSobreValida(tx, `moneda_separador_miles = ''''`),
        espacioDuro: await intentarSobreValida(tx, `moneda_separador_miles = chr(160)`),
        simboloDeCinco: await intentarSobreValida(tx, `moneda_simbolo = 'US$$$'`),
        impuestoDeVeinte: await intentarSobreValida(tx, `impuesto_nombre = repeat('I', 20)`),
      };
    });
    expect(r).toEqual({
      uno: null,
      dos: null,
      punto: null,
      coma: null,
      apostrofo: null,
      espacioDuro: null,
      simboloDeCinco: null,
      impuestoDeVeinte: null,
    });
  });

  it("R2: cada regla rechaza su caso (23514) y la fila queda como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA", { moneda: VALIDA, impuestoNombre: "IGV" });
      const antes = await monedaDeXA(tx);
      const intentos = {
        monedaIncompleta: await intentarSobreValida(tx, `moneda_simbolo = NULL`),
        monedaSoloCodigo: await intentar(
          tx,
          `UPDATE pais SET moneda_simbolo = NULL, moneda_separador_miles = NULL, moneda_separador_decimal = NULL,
             moneda_decimales = NULL WHERE id = 'XA'`,
        ),
        codigoMinusculas: await intentarSobreValida(tx, `moneda_codigo = 'xts'`),
        codigoDeDos: await intentarSobreValida(tx, `moneda_codigo = 'XT'`),
        codigoDeCuatro: await intentarSobreValida(tx, `moneda_codigo = 'XTSS'`),
        decimalesNegativos: await intentarSobreValida(tx, `moneda_decimales = -1`),
        decimalesTres: await intentarSobreValida(tx, `moneda_decimales = 3`),
        decimalNiPuntoNiComa: await intentarSobreValida(tx, `moneda_separador_decimal = ' '`),
        separadoresIguales: await intentarSobreValida(tx, `moneda_separador_miles = '.'`),
        milesDeDos: await intentarSobreValida(tx, `moneda_separador_miles = '..'`),
        milesVacio: await intentarSobreValida(tx, `moneda_separador_miles = ''`),
        simboloVacio: await intentarSobreValida(tx, `moneda_simbolo = ''`),
        simboloEnBlanco: await intentarSobreValida(tx, `moneda_simbolo = '   '`),
        simboloDeSeis: await intentarSobreValida(tx, `moneda_simbolo = 'US$$$$'`),
        impuestoVacio: await intentarSobreValida(tx, `impuesto_nombre = ''`),
        impuestoEnBlanco: await intentarSobreValida(tx, `impuesto_nombre = '  '`),
        impuestoDeVeintiuno: await intentarSobreValida(tx, `impuesto_nombre = repeat('I', 21)`),
      };
      return { intentos, despues: await monedaDeXA(tx), antes };
    });
    for (const [caso, sqlstate] of Object.entries(r.intentos)) {
      expect(sqlstate, caso).toBe("23514");
    }
    expect(r.despues).toEqual(r.antes);
  });

  it("R4: una empresa lee la moneda y el impuesto de los países pero no puede escribirlos (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA", { moneda: VALIDA, impuestoNombre: "IGV" });
      const { id } = await crearOrganizacion(tx);
      await comoApp(tx, id);
      const lee = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT id, ${COLUMNAS} FROM pais WHERE id IN ('CR', 'XA') ORDER BY id`,
      );
      const resultado = {
        lee,
        cambiaMoneda: await intentar(tx, `UPDATE pais SET moneda_simbolo = '$' WHERE id = 'CR'`),
        cambiaImpuesto: await intentar(tx, `UPDATE pais SET impuesto_nombre = 'IGV' WHERE id = 'CR'`),
        borraMoneda: await intentar(
          tx,
          `UPDATE pais SET moneda_codigo = NULL, moneda_simbolo = NULL, moneda_separador_miles = NULL,
             moneda_separador_decimal = NULL, moneda_decimales = NULL WHERE id = 'XA'`,
        ),
      };
      await comoDueno(tx);
      const [cr] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT moneda_simbolo, impuesto_nombre FROM pais WHERE id = 'CR'`,
      );
      return { ...resultado, crTrasLosIntentos: cr, xaTrasLosIntentos: await monedaDeXA(tx) };
    });
    expect(r.lee).toEqual([
      {
        id: "CR",
        moneda_codigo: "CRC",
        moneda_simbolo: "₡",
        moneda_separador_miles: ".",
        moneda_separador_decimal: ",",
        moneda_decimales: 2,
        impuesto_nombre: "IVA",
      },
      {
        id: "XA",
        moneda_codigo: "XTS",
        moneda_simbolo: "€",
        moneda_separador_miles: " ",
        moneda_separador_decimal: ".",
        moneda_decimales: 0,
        impuesto_nombre: "IGV",
      },
    ]);
    expect(r.cambiaMoneda).toBe("42501");
    expect(r.cambiaImpuesto).toBe("42501");
    expect(r.borraMoneda).toBe("42501");
    expect(r.crTrasLosIntentos).toEqual({ moneda_simbolo: "₡", impuesto_nombre: "IVA" });
    expect(r.xaTrasLosIntentos).toMatchObject({ moneda_codigo: "XTS", impuesto_nombre: "IGV" });
  });
});
