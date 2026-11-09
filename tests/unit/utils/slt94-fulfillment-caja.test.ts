import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { getMetrica } from "@/lib/analytics/metrics";
import type { AgregadoCajaRow, WalletMovimientoCategoria, WalletMovimientoTipo } from "@/lib/types/wallet";
import type { WalletTiendaMovimientoCategoria } from "@/lib/types/wallet-tienda";
import { derivarCaja, derivarComposicionGanancia } from "@/lib/utils/caja-tesoreria";
import { CUBETA_POR_CATEGORIA, derivarDesgloseTienda } from "@/lib/utils/desglose-tienda";
import { derivarSaldoTienda } from "@/lib/utils/saldo-tienda";

/**
 * SLT-94 T4.1 (R20, R37) — el cobro de fulfillment en la caja y en el libro de la tienda.
 *
 * Las filas son las que escribe el trigger (design §1 M4), ESCRITAS A MANO: el libro de la tienda por
 * un lado y la caja por otro, sin derivar una de la otra con la tabla de contrapartidas (comparar un
 * diccionario consigo mismo esta siempre verde). Los importes esperados, tambien a mano.
 *
 * Punto de partida: una tienda con 5000.00 de contra-entrega recaudado (credito ↔ ingreso de terceros),
 * para que «De las tiendas» y el saldo no sean cero y una resta con el signo cambiado se note.
 * Cobro: 1000.00 de fulfillment + 130.00 de IVA (13 %). Devolucion: los mismos importes.
 */

type FilaTienda = { tipo: "credito" | "debito"; categoria: WalletTiendaMovimientoCategoria; monto: string };

const COD_TIENDA: FilaTienda[] = [{ tipo: "credito", categoria: "cod_recaudado", monto: "5000.00" }];
const COD_CAJA: AgregadoCajaRow[] = [{ tipo: "ingreso", categoria: "ingreso_cod_recaudado", total: "5000.00" }];

const COBRO_TIENDA: FilaTienda[] = [
  { tipo: "debito", categoria: "fulfillment", monto: "1000.00" },
  { tipo: "debito", categoria: "iva_fulfillment", monto: "130.00" },
];
const COBRO_CAJA: AgregadoCajaRow[] = [
  { tipo: "ingreso", categoria: "ingreso_fulfillment", total: "1000.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_fulfillment", total: "130.00" },
];
const DEVOLUCION_TIENDA: FilaTienda[] = [
  { tipo: "credito", categoria: "fulfillment_anulado", monto: "1000.00" },
  { tipo: "credito", categoria: "iva_fulfillment_anulado", monto: "130.00" },
];
const DEVOLUCION_CAJA: AgregadoCajaRow[] = [
  { tipo: "egreso", categoria: "egreso_reverso_fulfillment", total: "1000.00" },
  { tipo: "egreso", categoria: "egreso_reverso_iva_fulfillment", total: "130.00" },
];

/** Agrega por (categoria, tipo) como lo hace el repositorio (`GROUP BY`). */
function agregar(filas: AgregadoCajaRow[]): AgregadoCajaRow[] {
  const acc = new Map<string, Prisma.Decimal>();
  for (const f of filas) {
    const k = `${f.categoria}|${f.tipo}`;
    acc.set(k, (acc.get(k) ?? new Prisma.Decimal(0)).plus(f.total));
  }
  return [...acc].map(([k, total]) => {
    const [categoria, tipo] = k.split("|") as [WalletMovimientoCategoria, WalletMovimientoTipo];
    return { categoria, tipo, total: total.toFixed(2) };
  });
}

function saldo(filas: FilaTienda[]): string {
  const cred = filas.filter((f) => f.tipo === "credito").reduce((s, f) => s.plus(f.monto), new Prisma.Decimal(0));
  const deb = filas.filter((f) => f.tipo === "debito").reduce((s, f) => s.plus(f.monto), new Prisma.Decimal(0));
  return derivarSaldoTienda(cred, deb).saldo;
}

describe("SLT-94 R20 — el cobro de fulfillment en la caja", () => {
  const antes = derivarCaja(agregar(COD_CAJA));
  const conCobro = derivarCaja(agregar([...COD_CAJA, ...COBRO_CAJA]));
  const conDevolucion = derivarCaja(agregar([...COD_CAJA, ...COBRO_CAJA, ...DEVOLUCION_CAJA]));

  it("SLT-94 R20: el monto sube la GANANCIA y el IVA sube el IVA (no la ganancia)", () => {
    expect(antes.ganancia).toBe("0.00");
    expect(antes.iva).toBe("0.00");
    expect(conCobro.ganancia).toBe("1000.00");
    expect(conCobro.iva).toBe("130.00");
  });

  it("SLT-94 R20: «Entró» y «Salió» NO cambian (son cargos a la tienda, no dinero que entra)", () => {
    expect(antes.entradas).toBe("5000.00");
    expect(conCobro.entradas).toBe("5000.00");
    expect(conDevolucion.entradas).toBe("5000.00");
    expect(conCobro.salidas).toBe(antes.salidas);
    expect(conDevolucion.salidas).toBe(antes.salidas);
  });

  it("SLT-94 R20 (459 R8): «De las tiendas» = suma de saldos de las tiendas, antes, con el cobro y tras devolverlo", () => {
    expect(antes.deTerceros).toBe("5000.00");
    expect(saldo(COD_TIENDA)).toBe("5000.00");

    expect(conCobro.deTerceros).toBe("3870.00");
    expect(saldo([...COD_TIENDA, ...COBRO_TIENDA])).toBe("3870.00");

    expect(conDevolucion.deTerceros).toBe("5000.00");
    expect(saldo([...COD_TIENDA, ...COBRO_TIENDA, ...DEVOLUCION_TIENDA])).toBe("5000.00");
  });

  it("SLT-94 R26: la devolución deja ganancia e IVA como estaban", () => {
    expect(conDevolucion.ganancia).toBe("0.00");
    expect(conDevolucion.iva).toBe("0.00");
  });
});

describe("SLT-94 R19/R26 — el libro de la tienda", () => {
  it("SLT-94 R19: el cobro va a «cargos» y la devolución a «a favor»; el saldo baja 1130.00 y vuelve", () => {
    expect(CUBETA_POR_CATEGORIA.fulfillment).toBe("cargos");
    expect(CUBETA_POR_CATEGORIA.iva_fulfillment).toBe("cargos");
    expect(CUBETA_POR_CATEGORIA.fulfillment_anulado).toBe("aFavor");
    expect(CUBETA_POR_CATEGORIA.iva_fulfillment_anulado).toBe("aFavor");
    const filas = [...COD_TIENDA, ...COBRO_TIENDA].map((f) => ({ tipo: f.tipo, categoria: f.categoria, total: f.monto }));
    expect(derivarDesgloseTienda(filas)).toMatchObject({ aFavor: "5000.00", cargos: "1130.00", saldo: "3870.00" });
    const todas = [...COD_TIENDA, ...COBRO_TIENDA, ...DEVOLUCION_TIENDA].map((f) => ({
      tipo: f.tipo,
      categoria: f.categoria,
      total: f.monto,
    }));
    expect(derivarDesgloseTienda(todas)).toMatchObject({ aFavor: "6130.00", cargos: "1130.00", saldo: "5000.00" });
  });
});

describe("SLT-94 R37 — composición de la ganancia y analítica", () => {
  it("SLT-94 R37: la composición muestra el fulfillment, su devolución (neto 0 tras devolver) y el IVA en su bloque", () => {
    const c = derivarComposicionGanancia(agregar([...COD_CAJA, ...COBRO_CAJA, ...DEVOLUCION_CAJA]));
    expect(c.ingresos.ingreso_fulfillment).toBe("1000.00");
    expect(c.egresos.egreso_reverso_fulfillment).toBe("1000.00");
    expect(c.iva.ingreso_iva_fulfillment).toBe("130.00");
    expect(c.iva.egreso_reverso_iva_fulfillment).toBe("130.00");
    expect(c.totalIva).toBe("0.00");
    // La devolución no cae en «Otros gastos»: tiene su fila.
    expect(c.otrosEgresos).toBe("0.00");
    // Neto de devoluciones = ingreso − egreso de la composición.
    expect(new Prisma.Decimal(c.ingresos.ingreso_fulfillment).minus(c.egresos.egreso_reverso_fulfillment).toFixed(2)).toBe("0.00");
  });

  it("SLT-94 R37: las métricas cuentan cobros y devoluciones en ganancia, IVA, caja y cuenta por pagar a tiendas", () => {
    const cats = (id: string) => (getMetrica(id)?.definicion as { categorias?: readonly string[] } | undefined)?.categorias ?? [];
    expect(cats("ganancia_empresa")).toEqual(expect.arrayContaining(["ingreso_fulfillment", "egreso_reverso_fulfillment"]));
    expect(cats("ganancia_empresa")).not.toContain("ingreso_iva_fulfillment");
    expect(cats("ingreso_iva")).toEqual(expect.arrayContaining(["ingreso_iva_fulfillment", "egreso_reverso_iva_fulfillment"]));
    expect(cats("dinero_en_caja")).toEqual(
      expect.arrayContaining([
        "ingreso_fulfillment",
        "ingreso_iva_fulfillment",
        "egreso_reverso_fulfillment",
        "egreso_reverso_iva_fulfillment",
      ]),
    );
    expect(cats("cuenta_por_pagar_tienda")).toEqual(
      expect.arrayContaining(["fulfillment", "iva_fulfillment", "fulfillment_anulado", "iva_fulfillment_anulado"]),
    );
  });
});
