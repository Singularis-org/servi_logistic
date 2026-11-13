import { describe, it, expect } from "vitest";

import type { FacturaConSaldoDTO } from "@/lib/types/pago-plataforma";
import { proponerReparto, resumenDelReparto } from "@/lib/utils/reparto-pago-plataforma";

// SLT-60 (design §5; R14, R17) — la propuesta del reparto y su resumen en pantalla. El ejemplo es el de la
// decisión del 2026-11-11: un pago de 300 000 contra la factura 1–15 nov (saldo 200 000) y la 16–30 nov
// (saldo 180 000) propone 200 000 y 100 000.

const NOV_1_15: FacturaConSaldoDTO = {
  id: "f-1",
  numero: 1,
  desde: new Date("2026-11-01T06:00:00Z"),
  hasta: new Date("2026-11-16T06:00:00Z"),
  total: "200000.00",
  saldo: "200000.00",
};
const NOV_16_30: FacturaConSaldoDTO = {
  id: "f-2",
  numero: 2,
  desde: new Date("2026-11-16T06:00:00Z"),
  hasta: new Date("2026-12-01T06:00:00Z"),
  total: "180000.00",
  saldo: "180000.00",
};
const FACTURAS = [NOV_1_15, NOV_16_30];

describe("SLT-60 — proponerReparto (R14)", () => {
  it("R14: el pago de 300 000 propone 200 000 a la más vieja y 100 000 a la siguiente", () => {
    expect(proponerReparto("300000.00", FACTURAS)).toEqual({ "f-1": "200000.00", "f-2": "100000.00" });
  });

  it("R14: un pago menor que el saldo de la más vieja va entero a ella; las demás, 0.00", () => {
    expect(proponerReparto("150000.50", FACTURAS)).toEqual({ "f-1": "150000.50", "f-2": "0.00" });
  });

  it("R14: un pago igual a la suma de los saldos los agota todos", () => {
    expect(proponerReparto("380000.00", FACTURAS)).toEqual({ "f-1": "200000.00", "f-2": "180000.00" });
  });

  it("R14: si el pago supera los saldos, la propuesta se queda en los saldos (la suma no cuadra y no se confirma)", () => {
    const propuesta = proponerReparto("400000.00", FACTURAS);
    expect(propuesta).toEqual({ "f-1": "200000.00", "f-2": "180000.00" });
    expect(resumenDelReparto("400000.00", FACTURAS, propuesta).valido).toBe(false);
  });

  it("R14: respeta el orden recibido (el de `desde`): con la más vieja ya pagada en parte, toma su saldo", () => {
    const parcial = { ...NOV_1_15, saldo: "0.01" };
    expect(proponerReparto("100.00", [parcial, NOV_16_30])).toEqual({ "f-1": "0.01", "f-2": "99.99" });
  });

  it("sin facturas, no propone nada", () => {
    expect(proponerReparto("300000.00", [])).toEqual({});
  });

  it("los importes grandes no pierden céntimos", () => {
    const grande = { ...NOV_1_15, saldo: "9999999999.99" };
    expect(proponerReparto("9999999999.98", [grande])).toEqual({ "f-1": "9999999999.98" });
  });
});

describe("SLT-60 — resumenDelReparto (R17, para la pantalla)", () => {
  it("R17: la propuesta del ejemplo es válida: suma 300 000 y no falta nada", () => {
    expect(resumenDelReparto("300000.00", FACTURAS, { "f-1": "200000.00", "f-2": "100000.00" })).toEqual({
      suma: "300000.00",
      falta: "0.00",
      errores: {},
      valido: true,
    });
  });

  it("R17: si la suma no llega al monto, dice cuánto falta y no es válido", () => {
    expect(resumenDelReparto("300000.00", FACTURAS, { "f-1": "200000.00", "f-2": "99999.99" })).toEqual({
      suma: "299999.99",
      falta: "0.01",
      errores: { aplicaciones: "El reparto debe sumar exactamente el monto del pago." },
      valido: false,
    });
  });

  it("R17: si la suma pasa del monto, «falta» es negativo y no es válido", () => {
    const r = resumenDelReparto("300000.00", FACTURAS, { "f-1": "200000.00", "f-2": "100000.01" });
    expect(r.falta).toBe("-0.01");
    expect(r.valido).toBe(false);
  });

  it("R17: un monto mayor que el saldo de su factura es un error en su fila, aunque la suma cuadre", () => {
    const r = resumenDelReparto("300000.00", FACTURAS, { "f-1": "100000.00", "f-2": "200000.00" });
    expect(r.errores).toEqual({ "aplicaciones.f-2": "El monto supera el saldo de la factura." });
    expect(r.suma).toBe("300000.00");
    expect(r.valido).toBe(false);
  });

  it("R17: igual al saldo, cabe (el borde exacto)", () => {
    expect(resumenDelReparto("180000.00", FACTURAS, { "f-1": "0", "f-2": "180000.00" }).valido).toBe(true);
  });

  it.each(["-1.00", "1.001", "abc", "1,50", "1e3"])("R17: «%s» es un error de formato en su fila y no suma", (escrito) => {
    const r = resumenDelReparto("300000.00", FACTURAS, { "f-1": escrito, "f-2": "300000.00" });
    expect(r.errores["aplicaciones.f-1"]).toBe("El monto debe ser un número sin signo, con dos decimales como máximo.");
    expect(r.valido).toBe(false);
  });

  it("R17: vacío o ausente cuenta como 0, no como error", () => {
    const r = resumenDelReparto("200000.00", FACTURAS, { "f-1": "200000.00", "f-2": "  " });
    expect(r).toEqual({ suma: "200000.00", falta: "0.00", errores: {}, valido: true });
    expect(resumenDelReparto("200000.00", FACTURAS, { "f-1": "200000.00" }).valido).toBe(true);
  });

  it("R17: todo en 0 no es válido: la suma no llega al monto", () => {
    expect(resumenDelReparto("1.00", FACTURAS, { "f-1": "0.00", "f-2": "0.00" }).valido).toBe(false);
  });
});
