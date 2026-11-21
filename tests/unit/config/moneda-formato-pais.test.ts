import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  MONEDA_DE_LOS_PLANES,
  MONEDA_PLATAFORMA,
  SIN_MONTO,
  SIN_MONTO_RAYA,
  formatMontoString,
  formatearMontoEn,
  formatearTopeEn,
  type FormatoMoneda,
} from "@/lib/config/moneda";
import { MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "@/tests/integration/db/_postgres-real";

/**
 * SL-21 (T2.1, T2.3; design §3) — el formato de un importe con la moneda que se le pasa.
 *
 * R8: con `MONEDA_DE_PRUEBA` (sin decimales, espacio de miles, punto decimal) y con monedas de 1 y 2
 * decimales, el símbolo va delante, los miles se agrupan de tres en tres, el importe se cuadra a la
 * escala de la moneda con el medio alejándose del cero, la cola sale solo si no es toda ceros y el
 * menos se cae cuando queda cero. Los textos esperados van escritos a mano, a la vista: derivarlos del
 * propio formateador los volvería tautológicos.
 *
 * R9: la fila de Costa Rica que deja la migración, leída de Postgres, es `MONEDA_PLATAFORMA` con las
 * variables `MONEDA_*` sin poner. Es lo que hace que «CR por el puerto» pinte lo mismo que hoy (R16).
 * El resto de R9 (los siete caminos dan el mismo texto en el corpus) lo fija la guardia 359.
 */

/** Una moneda de un decimal con la coma de miles y el punto decimal. */
const UN_DECIMAL: FormatoMoneda = { codigo: "XTS", simbolo: "$", separadorMiles: ",", separadorDecimal: ".", decimales: 1 };
/** Dos decimales, apóstrofo de miles y un símbolo de varias letras. */
const DOS_DECIMALES: FormatoMoneda = { codigo: "XTS", simbolo: "Fr.", separadorMiles: "'", separadorDecimal: ".", decimales: 2 };

describe("formatearMontoEn — sin decimales (MONEDA_DE_PRUEBA)", () => {
  const f = (v: string | number | null, sinMonto?: string) => formatearMontoEn(MONEDA_DE_PRUEBA, v, sinMonto);

  it("R8: pone el símbolo delante y agrupa los miles con su separador", () => {
    expect(f("0")).toBe("€0");
    expect(f("999")).toBe("€999");
    expect(f("1000")).toBe("€1 000");
    expect(f("100000")).toBe("€100 000");
    expect(f("1234567")).toBe("€1 234 567");
    expect(f("99999999999")).toBe("€99 999 999 999");
  });

  it("R8: cuadra a la unidad mirando el primer decimal, con el medio alejándose del cero, y nunca pinta cola", () => {
    expect(f("1234567.49")).toBe("€1 234 567");
    expect(f("1234567.50")).toBe("€1 234 568");
    expect(f("10.4999")).toBe("€10");
    expect(f("10.5")).toBe("€11");
    expect(f("1500.00")).toBe("€1 500");
    expect(f("-1500.5")).toBe("-€1 501");
    expect(f("-1500.4")).toBe("-€1 500");
  });

  it("R8: el acarreo desborda hacia los miles", () => {
    expect(f("999.5")).toBe("€1 000");
    expect(f("999999.5")).toBe("€1 000 000");
    expect(f("99999999999.51")).toBe("€100 000 000 000");
  });

  it("R8: el menos se cae cuando lo que queda es cero", () => {
    expect(f("-0.49")).toBe("€0");
    expect(f("-0.00")).toBe("€0");
    expect(f("-0")).toBe("€0");
    expect(f("-0.5")).toBe("-€1");
  });

  it("R8: un number entra por toFixed de la escala de la moneda; sin importe, el marcador", () => {
    expect(f(2500)).toBe("€2 500");
    expect(f(1234.75)).toBe("€1 235");
    expect(f(null)).toBe(SIN_MONTO);
    expect(f(null, SIN_MONTO_RAYA)).toBe(SIN_MONTO_RAYA);
    expect(f("   ")).toBe(SIN_MONTO);
  });

  it("R8: lo que no tiene forma de importe se pinta tal cual detrás del símbolo", () => {
    expect(f("abc")).toBe("€abc");
  });
});

describe("formatearMontoEn — un decimal", () => {
  const f = (v: string) => formatearMontoEn(UN_DECIMAL, v);

  it("R8: cuadra a un decimal y lo pinta solo si no es cero", () => {
    expect(f("1234.56")).toBe("$1,234.6");
    expect(f("1234.54")).toBe("$1,234.5");
    expect(f("1234.5")).toBe("$1,234.5");
    expect(f("1234.04")).toBe("$1,234");
    expect(f("1234")).toBe("$1,234");
  });

  it("R8: el acarreo pasa de la cola a la parte entera y de ahí a los miles", () => {
    expect(f("9.96")).toBe("$10");
    expect(f("999.95")).toBe("$1,000");
  });

  it("R8: signo y cero", () => {
    expect(f("-0.04")).toBe("$0");
    expect(f("-0.05")).toBe("-$0.1");
    expect(f("-1234.56")).toBe("-$1,234.6");
  });
});

describe("formatearMontoEn — dos decimales con otros separadores y símbolo", () => {
  const f = (v: string) => formatearMontoEn(DOS_DECIMALES, v);

  it("R8: agrupa con su separador, cuadra a dos decimales y pinta la cola solo si existe", () => {
    expect(f("1234567.891")).toBe("Fr.1'234'567.89");
    expect(f("1234567.895")).toBe("Fr.1'234'567.90");
    expect(f("1234567.00")).toBe("Fr.1'234'567");
    expect(f("99999999999.995")).toBe("Fr.100'000'000'000");
    expect(f("-0.004")).toBe("Fr.0");
    expect(f("-0.49")).toBe("-Fr.0.49");
  });
});

describe("formatearTopeEn — la cota en la moneda del país (SLT-240 R10)", () => {
  /** Lo pintado, de vuelta a un decimal: sin símbolo ni separador de miles, con el punto decimal. */
  function recompuesto(moneda: FormatoMoneda, pintado: string): Prisma.Decimal {
    const crudo = pintado
      .replace(moneda.simbolo, "")
      .split(moneda.separadorMiles)
      .join("")
      .replace(moneda.separadorDecimal, ".");
    return new Prisma.Decimal(crudo);
  }

  it("R10: con la moneda de prueba (0 decimales) el tope de la indemnización se anuncia sin subir", () => {
    expect(formatearTopeEn(MONEDA_DE_PRUEBA, "9999999999.99")).toBe("€9 999 999 999");
  });

  it("R10: en un corpus de topes, lo recompuesto nunca supera la entrada", () => {
    const corpus = [
      "0", "0.01", "0.49", "0.5", "0.99", "1", "9.5", "9.99", "99.999", "999.5", "999.995",
      "1000", "1234.56", "99999.99", "999999.5", "1234567.891", "9999999999.99", "99999999999.995",
    ];
    const porEncima: string[] = [];
    for (const moneda of [MONEDA_DE_PRUEBA, UN_DECIMAL, DOS_DECIMALES]) {
      for (const entrada of corpus) {
        const pintado = formatearTopeEn(moneda, entrada);
        if (recompuesto(moneda, pintado).gt(new Prisma.Decimal(entrada))) {
          porEncima.push(`${moneda.simbolo} ${entrada} -> ${pintado}`);
        }
      }
    }
    expect(porEncima).toEqual([]);
    // Contraprueba: el formateador de redondeo SÍ sube en ese corpus, así que el censo distingue.
    expect(recompuesto(MONEDA_DE_PRUEBA, formatearMontoEn(MONEDA_DE_PRUEBA, "999.5")).gt(new Prisma.Decimal("999.5"))).toBe(true);
  });

  it("R10: sin importe pinta el marcador, por defecto `SIN_MONTO`", () => {
    expect(formatearTopeEn(MONEDA_DE_PRUEBA, null)).toBe(SIN_MONTO);
    expect(formatearTopeEn(MONEDA_DE_PRUEBA, null, SIN_MONTO_RAYA)).toBe(SIN_MONTO_RAYA);
  });
});

describe("la moneda de la plataforma", () => {
  it("R9: es la de los planes y los seis caminos de siempre pintan con ella", () => {
    expect(MONEDA_DE_LOS_PLANES).toBe(MONEDA_PLATAFORMA);
    for (const v of ["13331832.72", "-4500.50", "9.999", "-0.00", "320", "abc"]) {
      expect(formatearMontoEn(MONEDA_PLATAFORMA, v)).toBe(formatMontoString(v));
    }
  });
});

// ── T2.3: la fila de CR migrada = la moneda de la plataforma con el env vacío ─────────────────────

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const VARIABLES = ["MONEDA_LOCALE", "MONEDA_CURRENCY", "MONEDA_SIMBOLO", "MONEDA_SEPARADOR_MILES", "MONEDA_SEPARADOR_DECIMAL"];

let base: PrismaClient;

describeSiHayBase("SL-21 — Costa Rica migrada es la moneda de la plataforma (integración)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("R9, R16: la FormatoMoneda de la fila CR coincide con MONEDA_PLATAFORMA sin variables MONEDA_*", async () => {
    vi.resetModules();
    for (const v of VARIABLES) vi.stubEnv(v, "");
    const { MONEDA_PLATAFORMA: plataformaPorDefecto } = await import("@/lib/config/moneda");

    const cr = await base.pais.findUniqueOrThrow({
      where: { id: "CR" },
      select: {
        monedaCodigo: true,
        monedaSimbolo: true,
        monedaSeparadorMiles: true,
        monedaSeparadorDecimal: true,
        monedaDecimales: true,
      },
    });
    const deCR = {
      codigo: cr.monedaCodigo,
      simbolo: cr.monedaSimbolo,
      separadorMiles: cr.monedaSeparadorMiles,
      separadorDecimal: cr.monedaSeparadorDecimal,
      decimales: cr.monedaDecimales,
    };

    expect(deCR).toEqual(plataformaPorDefecto);
  });
});
