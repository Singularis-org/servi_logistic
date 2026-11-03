import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import {
  derivarCaja,
  derivarComposicionGanancia,
  esCategoriaIva,
} from "@/lib/utils/caja-tesoreria";
import {
  WALLET_INGRESO_GANANCIA_SEED,
  WALLET_MOVIMIENTO_CATEGORIA_SEED,
  type AgregadoCajaRow,
  type WalletMovimientoCategoria,
} from "@/lib/types/wallet";

/**
 * SL-39 / T1 — el IVA no es ganancia (R1–R5, R8, R20; design §1, §2.2, §2.3).
 *
 * Funcion pura, sin base. Todos los esperados son LITERALES con la cuenta a mano al lado: compararlos
 * con otra salida de `derivarCaja` estaria siempre en verde.
 */

const fila = (categoria: WalletMovimientoCategoria, total: string): AgregadoCajaRow => ({
  categoria,
  tipo: categoria.startsWith("ingreso_") ? "ingreso" : "egreso",
  total,
});

/**
 * El ejemplo de design §1: una entrega con contra-entrega de 20 000,00, flete 2 500,00 e IVA del
 * flete 325,00, comision COD 700,00 e IVA de la comision 91,00, y 1 500,00 pagados al mensajero.
 */
const EJEMPLO: AgregadoCajaRow[] = [
  fila("ingreso_cod_recaudado", "20000.00"),
  fila("ingreso_flete", "2500.00"),
  fila("ingreso_iva_flete", "325.00"),
  fila("ingreso_comision_cod", "700.00"),
  fila("ingreso_iva_comision_cod", "91.00"),
  fila("egreso_pago_mensajero", "1500.00"),
];

/** Las cuatro de IVA, escritas: son el sujeto de la ficha (glosario de requirements). */
const LAS_CUATRO_DE_IVA = [
  "ingreso_iva_flete",
  "ingreso_iva_flete_devolucion",
  "ingreso_iva_comision_cod",
  "egreso_reverso_iva_flete_devolucion",
];

const suma = (...xs: string[]) =>
  xs.reduce((a, x) => a.add(new Prisma.Decimal(x)), new Prisma.Decimal(0)).toFixed(2);

describe("SL-39 — `esCategoriaIva` reconoce exactamente las cuatro de IVA", () => {
  it("las cuatro de IVA si, y ninguna otra del catalogo", () => {
    const deIva = WALLET_MOVIMIENTO_CATEGORIA_SEED.filter((c) => esCategoriaIva(c));
    expect([...deIva].sort()).toEqual([...LAS_CUATRO_DE_IVA].sort());
    // Control de no vacuidad del lado negativo: el catalogo tiene muchas mas.
    expect(WALLET_MOVIMIENTO_CATEGORIA_SEED.length - deIva.length).toBeGreaterThan(20);
  });
});

describe("SL-39 — el ejemplo de design §1", () => {
  const r = derivarCaja(EJEMPLO);

  it("R1/R3: la ganancia es (2 500 + 700) − 1 500 = 1 700,00, con los dos lados sin IVA", () => {
    expect(r.ingresosPropios).toBe("3200.00"); // 2500 + 700
    expect(r.egresosPropios).toBe("1500.00");
    expect(r.ganancia).toBe("1700.00"); // antes de la ficha: 2116.00
    expect(r.signoGanancia).toBe("positivo");
  });

  it("R2: el IVA va aparte, 325 + 91 = 416,00 y positivo", () => {
    expect(r.iva).toBe("416.00");
    expect(r.signoIva).toBe("positivo");
  });

  it("R5: lo que no se mueve — Entro, Salio, la cifra, «De las tiendas», capital, «De la empresa» y la barra", () => {
    expect(r.entradas).toBe("20000.00"); // solo el contra-entrega es efectivo
    expect(r.salidas).toBe("1500.00");
    expect(r.enCaja).toBe("18500.00"); // 20000 − 1500
    expect(r.deTerceros).toBe("16384.00"); // 20000 − (2500 + 325 + 700 + 91)
    expect(r.capital).toBe("0.00");
    expect(r.deEmpresa).toBe("2116.00"); // ganancia 1700 + IVA 416 + capital 0: lo mismo que antes
    // La barra se reparte sobre «De la empresa», que no cambia: 16384 / 18500 = 88,5621… → 88,56.
    expect(r.modoComposicion).toBe("dos_bolsillos");
    expect(r.porcentajeTiendas).toBe("88.56");
  });

  it("R4: ganancia + IVA + capital + «De las tiendas» = la cifra principal (1 700 + 416 + 0 + 16 384)", () => {
    expect(suma(r.ganancia, r.iva, r.capital, r.deTerceros)).toBe("18500.00");
    expect(r.enCaja).toBe("18500.00");
  });

  it("R8: la composicion — Ingresos = «Ingresos de la empresa», Egresos = «Gastos», y el IVA en su bloque", () => {
    const c = derivarComposicionGanancia(EJEMPLO);
    expect(c.totalIngresos).toBe("3200.00");
    expect(c.totalIngresos).toBe(r.ingresosPropios);
    expect(c.totalEgresos).toBe("1500.00");
    expect(c.totalEgresos).toBe(r.egresosPropios);
    // La columna de ingresos son las cinco de la ganancia, y ninguna de IVA.
    expect(Object.keys(c.ingresos).sort()).toEqual([...WALLET_INGRESO_GANANCIA_SEED].sort());
    expect(Object.keys(c.ingresos)).toHaveLength(5);
    expect(c.ingresos.ingreso_flete).toBe("2500.00");
    expect(c.ingresos.ingreso_comision_cod).toBe("700.00");
    expect(c.egresos).not.toHaveProperty("egreso_reverso_iva_flete_devolucion");
    // El bloque del IVA: una fila por categoria de IVA y su total, el mismo del resumen.
    expect(c.iva).toEqual({
      ingreso_iva_flete: "325.00",
      ingreso_iva_flete_devolucion: "0.00",
      ingreso_iva_comision_cod: "91.00",
      egreso_reverso_iva_flete_devolucion: "0.00",
    });
    expect(c.totalIva).toBe("416.00");
  });
});

describe("SL-39 — el reverso del IVA", () => {
  it("R2: un reverso de IVA solo deja el IVA en negativo y no toca la ganancia", () => {
    const r = derivarCaja([fila("egreso_reverso_iva_flete_devolucion", "130.00")]);
    expect(r.iva).toBe("-130.00");
    expect(r.signoIva).toBe("negativo");
    expect(r.ganancia).toBe("0.00");
    expect(r.egresosPropios).toBe("0.00");
    // Es un reverso de cargo: no sale dinero, le devuelve 130 a la tienda (ficha 458-B).
    expect(r.salidas).toBe("0.00");
    expect(r.deTerceros).toBe("130.00");
    expect(r.deEmpresa).toBe("-130.00");
  });

  it("R2/R8: en la composicion el reverso va en el bloque del IVA, en positivo como toda fila de egreso", () => {
    const c = derivarComposicionGanancia([
      fila("ingreso_iva_flete_devolucion", "195.00"),
      fila("egreso_reverso_iva_flete_devolucion", "130.00"),
      fila("egreso_reverso_flete_devolucion", "1000.00"),
    ]);
    expect(c.iva.ingreso_iva_flete_devolucion).toBe("195.00");
    expect(c.iva.egreso_reverso_iva_flete_devolucion).toBe("130.00");
    expect(c.totalIva).toBe("65.00"); // 195 − 130
    // El reverso del flete SI es ganancia: sigue en «Egresos», con su nombre.
    expect(c.egresos.egreso_reverso_flete_devolucion).toBe("1000.00");
    expect(c.totalEgresos).toBe("1000.00");
  });

  it("R2: sin movimientos de IVA, el IVA esta en cero", () => {
    const r = derivarCaja([fila("ingreso_flete", "10.00")]);
    expect(r.iva).toBe("0.00");
    expect(r.signoIva).toBe("cero");
  });
});

describe("SL-39 — R4 y R5 sobre cualquier conjunto (semilla fija)", () => {
  /** mulberry32, la misma semilla de `caja-derivacion-459.test.ts`: un rojo se reproduce. */
  function prng(semilla: number): () => number {
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("R4: ganancia + IVA + capital + «De las tiendas» = cifra principal, y «De la empresa» = ganancia + IVA + capital, en 500 conjuntos", () => {
    const azar = prng(459);
    let conIva = 0;
    for (let n = 0; n < 500; n += 1) {
      const filas: AgregadoCajaRow[] = [];
      for (const categoria of WALLET_MOVIMIENTO_CATEGORIA_SEED) {
        if (azar() < 0.4) continue;
        const centimos = Math.floor(azar() * 100_000_000);
        filas.push(fila(categoria, new Prisma.Decimal(centimos).div(100).toFixed(2)));
      }
      const r = derivarCaja(filas);
      // SLT-73 (design §2.9.4, R27): − «Por cobrar a satélites» (el catalogo trae las dos diferencias).
      expect(
        new Prisma.Decimal(suma(r.ganancia, r.iva, r.capital, r.deTerceros))
          .sub(r.porCobrarSatelites)
          .toFixed(2),
        `conjunto ${n}`,
      ).toBe(r.enCaja);
      expect(suma(r.ganancia, r.iva, r.capital), `conjunto ${n}`).toBe(r.deEmpresa);
      // R8 sobre el mismo conjunto: la tarjeta de la composicion habla del mismo IVA y de los
      // mismos dos lados de la ganancia.
      const c = derivarComposicionGanancia(filas);
      expect(c.totalIva, `conjunto ${n}`).toBe(r.iva);
      expect(c.totalIngresos, `conjunto ${n}`).toBe(r.ingresosPropios);
      expect(c.totalEgresos, `conjunto ${n}`).toBe(r.egresosPropios);
      if (filas.some((f) => esCategoriaIva(f.categoria))) conIva += 1;
    }
    // Anti-vacuidad: el IVA estuvo dentro en casi todos los conjuntos.
    expect(conIva).toBeGreaterThan(400);
  });

  it("R5: quitar las filas de IVA mueve la ganancia 0,00 y el IVA a cero; con ellas, «De la empresa» sube el IVA", () => {
    const sinIva = EJEMPLO.filter((f) => !esCategoriaIva(f.categoria));
    const a = derivarCaja(sinIva);
    const b = derivarCaja(EJEMPLO);
    expect(a.ganancia).toBe(b.ganancia); // 1700.00 con y sin IVA
    expect(a.iva).toBe("0.00");
    expect(a.deEmpresa).toBe("1700.00");
    expect(b.deEmpresa).toBe("2116.00");
  });
});

describe("SL-39 — R20: el IVA y su signo vienen derivados del servidor, como texto", () => {
  it("son STRING con dos decimales y un signo del dominio", () => {
    const r = derivarCaja(EJEMPLO);
    expect(typeof r.iva).toBe("string");
    expect(r.iva).toMatch(/^-?\d+\.\d{2}$/);
    expect(["positivo", "negativo", "cero"]).toContain(r.signoIva);
    const c = derivarComposicionGanancia(EJEMPLO);
    for (const v of [...Object.values(c.iva), c.totalIva]) {
      expect(v).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});
