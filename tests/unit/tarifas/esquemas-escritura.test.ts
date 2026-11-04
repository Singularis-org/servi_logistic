import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { ivaDe } from "@/lib/tarifas/calculo";
import {
  escrituraCobroSchema,
  escrituraPagoSchema,
  escrituraValorSchema,
  type ValorCobro,
  type ValorPago,
} from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 T2.4 (R3, R4, R45) — la validacion de escritura discriminada por actor. Decision P4: los
 * cobros a la tienda llevan IVA y los pagos al mensajero y a la satelite NO, ni siquiera `"0"`.
 * La base lo respalda con el CHECK `tarifa_valor_iva_solo_tienda` (T1.6); esto es el borde.
 */

const NIVEL = { zonaId: "zona-1", grupoId: null, tiendaId: null, vehiculoId: null };

function rutasDelError(r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }): string[] {
  return (r.error?.issues ?? []).map((i) => i.path.join("."));
}

describe("R3 · un cobro a la tienda guarda modo, valor y su IVA", () => {
  it("un cobro con IVA pasa y conserva lo que llego como texto", () => {
    const r = escrituraValorSchema.safeParse({
      concepto: "tienda_flete_entregado",
      modo: "monto",
      valor: "1500.00",
      ivaPct: "13.00",
      ...NIVEL,
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      concepto: "tienda_flete_entregado",
      modo: "monto",
      valor: "1500.00",
      ivaPct: "13.00",
      ...NIVEL,
    });
  });

  it("un cobro con IVA 0 pasa (0 es un IVA valido en un cobro)", () => {
    const r = escrituraValorSchema.safeParse({ concepto: "tienda_comision_cod", modo: "porcentaje", valor: "3.5", ivaPct: "0", ...NIVEL });
    expect(r.success).toBe(true);
  });

  it("un pago sin IVA pasa, al mensajero y a la satelite", () => {
    for (const concepto of ["mensajero_entregado", "satelite_rechazo"]) {
      const r = escrituraValorSchema.safeParse({ concepto, modo: "monto", valor: "2000.00", ...NIVEL });
      expect(r.success, concepto).toBe(true);
    }
  });
});

describe("R4 · rangos del valor y del IVA del cobro", () => {
  it("un cobro SIN IVA no pasa, con el error en `ivaPct`", () => {
    const r = escrituraValorSchema.safeParse({ concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ...NIVEL });
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("ivaPct");
  });

  it.each(["-1", "100.01", "101", "13,00", "abc", ""])("un cobro con IVA %j no pasa", (ivaPct) => {
    const r = escrituraCobroSchema.safeParse({ concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct, ...NIVEL });
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("ivaPct");
  });

  it.each(["0", "100", "100.00", "13.5"])("un cobro con IVA %j pasa", (ivaPct) => {
    const r = escrituraCobroSchema.safeParse({ concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct, ...NIVEL });
    expect(r.success).toBe(true);
  });

  it.each(["-0.01", "-5", "1.234", "1e3", "12345678901"])("un valor %j no pasa", (valor) => {
    const r = escrituraPagoSchema.safeParse({ concepto: "mensajero_entregado", modo: "monto", valor, ...NIVEL });
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("valor");
  });

  it("un porcentaje mayor que 100 no pasa; un monto de 150 si", () => {
    const pct = escrituraPagoSchema.safeParse({ concepto: "satelite_entregado", modo: "porcentaje", valor: "100.01", ...NIVEL });
    expect(pct.success).toBe(false);
    expect(rutasDelError(pct)).toContain("valor");
    const monto = escrituraPagoSchema.safeParse({ concepto: "satelite_entregado", modo: "monto", valor: "150", ...NIVEL });
    expect(monto.success).toBe(true);
  });
});

describe("R45 · un pago con IVA no pasa, aunque sea 0", () => {
  it.each([
    ["mensajero_entregado", "13.00"],
    ["mensajero_rechazo", "0"],
    ["satelite_entregado", "0.00"],
    ["satelite_incidente", "13"],
  ])("%s con ivaPct %j → rechazo en `ivaPct`", (concepto, ivaPct) => {
    const r = escrituraValorSchema.safeParse({ concepto, modo: "monto", valor: "2000.00", ivaPct, ...NIVEL });
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("ivaPct");
  });

  it("un pago con `ivaPct: null` tampoco pasa (no hay IVA que anular)", () => {
    const r = escrituraPagoSchema.safeParse({ concepto: "mensajero_entregado", modo: "monto", valor: "2000.00", ivaPct: null, ...NIVEL });
    expect(r.success).toBe(false);
    expect(rutasDelError(r)).toContain("ivaPct");
  });

  it("un concepto inventado no cae en ninguna rama", () => {
    const r = escrituraValorSchema.safeParse({ concepto: "mensajero_bono", modo: "monto", valor: "1.00", ...NIVEL });
    expect(r.success).toBe(false);
  });
});

describe("R45 · el compilador impide calcular un IVA de pago", () => {
  it("pasar un ValorPago a ivaDe no compila; un ValorCobro si", () => {
    const valorPago: ValorPago = {
      concepto: "mensajero_entregado",
      modo: "monto",
      valor: "2000.00",
      nivel: "zona",
      tarifaValorId: "tv-1",
    };
    const valorCobro: ValorCobro = { ...valorPago, concepto: "tienda_flete_entregado", ivaPct: "13.00" };
    const importe = new Prisma.Decimal("2000.00");

    // Si este `@ts-expect-error` deja de hacer falta (alguien da IVA a los pagos), el typecheck
    // falla con «Unused '@ts-expect-error' directive»: ese es el rojo que protege P4.
    // @ts-expect-error — ValorPago no tiene ivaPct ni un concepto de la tienda (P4, R34, R45).
    expect(() => ivaDe(valorPago, importe)).toThrow(); // forzado en runtime: no hay IVA que leer
    expect(ivaDe(valorCobro, importe).toFixed(2)).toBe("260.00");
  });
});
