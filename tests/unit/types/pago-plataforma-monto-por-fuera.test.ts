import { describe, expect, it } from "vitest";

import { montoPagoPorFueraSchema, TEXTOS_PAGO_POR_FUERA } from "@/lib/types/pago-plataforma";

// SLT-143 (design §4.1; R7; decisión del leader tras T0) — el monto del pago por fuera. El tope es el mayor importe
// de `wallet_movimiento.monto` (`DECIMAL(12,2)`), escrito a mano: un monto mayor desbordaría la columna con un
// 22003 en la función de la base, antes del tope de lo disponible, y saldría sin traducir.

const mensajes = (v: string) => {
  const r = montoPagoPorFueraSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("SLT-143 — montoPagoPorFueraSchema (R7)", () => {
  it.each(["0.01", "1", "100000", "100000.5", "100000.50", " 25.00 ", "9999999999.99"])("acepta %s", (v) => {
    expect(montoPagoPorFueraSchema.safeParse(v).success).toBe(true);
  });

  it("devuelve el texto recortado, sin tocar los decimales", () => {
    expect(montoPagoPorFueraSchema.parse(" 100000.5 ")).toBe("100000.5");
  });

  it.each(["0", "0.00", "0.0"])("R7: %s no es mayor que 0", (v) => {
    expect(mensajes(v)).toEqual([TEXTOS_PAGO_POR_FUERA.montoNoPositivo]);
  });

  it.each(["10000000000", "10000000000.00", "9999999999.991", "99999999999999"])("R7: %s no cabe en el libro", (v) => {
    expect(mensajes(v)).toContain(
      v === "9999999999.991" ? TEXTOS_PAGO_POR_FUERA.montoFormato : TEXTOS_PAGO_POR_FUERA.montoMaximo,
    );
  });

  it("el límite es exacto: 9 999 999 999,99 cabe y un céntimo más no", () => {
    expect(mensajes("9999999999.99")).toEqual([]);
    expect(mensajes("10000000000.00")).toEqual([TEXTOS_PAGO_POR_FUERA.montoMaximo]);
  });

  it.each(["", "abc", "-5", "1,50", "1.001", "1e5", ".5", "5."])("R7: %j no tiene la forma de un importe, con un solo mensaje", (v) => {
    expect(mensajes(v)).toEqual([TEXTOS_PAGO_POR_FUERA.montoFormato]);
  });
});
