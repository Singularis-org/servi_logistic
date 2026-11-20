import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatearMontoEn, type FormatoMoneda } from "@/lib/config/moneda";
import { normalizarMontoCobrar, redondearMontoCobrar, redondearMontoCobrarTexto } from "@/lib/utils/monto-cobrar";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SL-21 (design §5.7; R18) — el monto a cobrar de una orden (carga masiva y API) se sigue redondeando a la unidad
// aunque la moneda del país de la empresa tenga decimales. La moneda de cada país cambia cómo se PINTA un importe,
// no cuánto se cobra: la regla de la feature 299 (el desglose de pago solo admite enteros) no depende del país.
// `lib/utils/monto-cobrar.ts` no se toca en SL-21.

/** Un país de prueba cuya moneda SÍ usa céntimos (2 decimales), distinta de la de CR en código y símbolo. */
const MONEDA_CON_CENTIMOS: FormatoMoneda = {
  codigo: "XTS",
  simbolo: "€",
  separadorMiles: " ",
  separadorDecimal: ".",
  decimales: 2,
};
const PAIS_CON_CENTIMOS = reglasPaisFijas({ paisId: "XA", moneda: MONEDA_CON_CENTIMOS });

describe("SL-21 R18 · el monto a cobrar se redondea a la unidad sea cual sea la moneda del país", () => {
  it("con una moneda de 2 decimales, «125.50» se guarda como 126 y se avisa del ajuste, como hoy", async () => {
    const moneda = await PAIS_CON_CENTIMOS.moneda();
    expect(moneda.decimales).toBe(2);
    // El país pintaría los céntimos…
    expect(formatearMontoEn(moneda, "125.50")).toBe("€125.50");
    // …pero lo que se cobra sigue entrando redondeado al entero (carga masiva y API).
    expect(normalizarMontoCobrar(125.5)).toEqual({ valor: 126, ajuste: { original: 125.5, aplicado: 126 } });
    expect(redondearMontoCobrar(125.5)).toBe(126);
    // La cotización por API, que transporta el monto como texto, tampoco cambia.
    expect(redondearMontoCobrarTexto("125.50")).toBe("126");
  });

  it("un monto ya entero no gana aviso, y el que baja sigue bajando", () => {
    expect(normalizarMontoCobrar(125)).toEqual({ valor: 125, ajuste: null });
    expect(normalizarMontoCobrar(125.49)).toEqual({ valor: 125, ajuste: { original: 125.49, aplicado: 125 } });
    expect(normalizarMontoCobrar(null)).toEqual({ valor: null, ajuste: null });
  });

  it("el redondeo no lee la moneda ni el país: `monto-cobrar.ts` no importa nada de moneda ni del puerto", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../../../lib/utils/monto-cobrar.ts"), "utf8");
    expect(fuente).not.toMatch(/^import .*(config\/moneda|IReglasPaisEmpresa|ReglasPaisEmpresa)/m);
    expect(fuente).not.toMatch(/\.moneda\(\)/);
  });
});
