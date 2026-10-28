import { describe, expect, it } from "vitest";

import { facturadoSinIva, ivaFacturado } from "@/lib/utils/iva-cierre";

// SL-39 (R21–R23, design §12.3) — la regla «que parte de lo facturado en un cierre es IVA».
//
// Las cifras van ESCRITAS A MANO y llevan CENTIMOS en cada concepto: con importes redondos una
// suma con `Number` o un concepto olvidado que valga lo mismo que otro podrian cuadrar por azar.

describe("SL-39 R21 — ivaFacturado suma los tres IVA del cierre", () => {
  it("suma el IVA del flete, el del flete por devolucion a origen y el de la comision COD", () => {
    expect(
      ivaFacturado({
        total: "5418.39",
        ivaFlete: "325.07",
        ivaFleteDevolucion: "156.06",
        ivaComisionCod: "91.13",
      }),
    ).toBe("572.26"); // 325.07 + 156.06 + 91.13
  });

  it("cada uno de los tres IVA cuenta por separado (ninguno se queda fuera)", () => {
    const base = { total: "1000.00", ivaFlete: "0.00", ivaFleteDevolucion: "0.00", ivaComisionCod: "0.00" };
    expect(ivaFacturado({ ...base, ivaFlete: "11.11" })).toBe("11.11");
    expect(ivaFacturado({ ...base, ivaFleteDevolucion: "22.22" })).toBe("22.22");
    expect(ivaFacturado({ ...base, ivaComisionCod: "33.33" })).toBe("33.33");
  });

  it("un concepto null o ausente no aporta, y sin ninguno el IVA es 0.00", () => {
    expect(ivaFacturado({ total: "2260.00", ivaFlete: null, ivaFleteDevolucion: "260.00" })).toBe(
      "260.00",
    );
    expect(ivaFacturado({ total: "0.00", ivaFlete: null, ivaFleteDevolucion: null, ivaComisionCod: null })).toBe(
      "0.00",
    );
    expect(ivaFacturado({ total: "0.00" })).toBe("0.00");
  });

  it("devuelve texto con dos decimales (money-safe)", () => {
    const iva = ivaFacturado({ total: "113.00", ivaFlete: "13" });
    expect(iva).toBe("13.00");
    expect(typeof iva).toBe("string");
  });
});

describe("SL-39 R22/R23 — facturadoSinIva es lo facturado menos su IVA", () => {
  it("cierre A de §12.4: 3.616,00 facturado con 416,00 de IVA deja 3.200,00", () => {
    expect(
      facturadoSinIva({
        total: "3616.00",
        ivaFlete: "325.00",
        ivaFleteDevolucion: "0.00",
        ivaComisionCod: "91.00",
      }),
    ).toBe("3200.00");
  });

  it("con centimos en los tres IVA: 5.418,39 − 572,26 = 4.846,13", () => {
    expect(
      facturadoSinIva({
        total: "5418.39",
        ivaFlete: "325.07",
        ivaFleteDevolucion: "156.06",
        ivaComisionCod: "91.13",
      }),
    ).toBe("4846.13");
  });

  it("los IVA null o ausentes no restan: sin IVA, lo facturado sale intacto", () => {
    expect(facturadoSinIva({ total: "2000.45", ivaFlete: null })).toBe("2000.45");
    expect(facturadoSinIva({ total: "0.00" })).toBe("0.00");
  });
});
