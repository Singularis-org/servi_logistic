import { describe, expect, it } from "vitest";

import { porcentajesReparto } from "@/lib/utils/porcentajes-reparto";

// SLT-111 (R70, R260-R262) — la regla del mayor resto. Cada resultado esta CALCULADO A MANO (la
// tabla de `specs/SLT-111-cifras-reparto-senales-cola/design.md > Servidor 1`): son el contrato y
// no se derivan de la funcion bajo test.

describe("porcentajesReparto — mayor resto, enteros que suman 100 (R260)", () => {
  it("literal del madre, mensajero: 94 350,00 / 5 650,00 de 100 000,00 → [94, 6]", () => {
    // 94,35 / 5,65 → pisos 94 / 5, restos 0,35 / 0,65 → el punto que falta va a la segunda.
    expect(porcentajesReparto(["94350.00", "5650.00"], "100000.00")).toEqual([94, 6]);
  });

  it("literal del madre, bodega: 96 500,00 / 3 000,00 / 500,00 → [97, 3, 0] (empate: gana la primera)", () => {
    // 96,5 / 3 / 0,5 → pisos 96 / 3 / 0 (suman 99), restos 0,5 / 0 / 0,5: empate entre la
    // primera y la tercera; gana la primera. La tercera, > 0, se queda en «0» (PA1: como el madre).
    expect(porcentajesReparto(["96500.00", "3000.00", "500.00"], "100000.00")).toEqual([97, 3, 0]);
  });

  it("escenario B6 del E2E: 7 680,00 / 2 200,00 / 120,00 de 10 000,00 → [77, 22, 1]", () => {
    // 76,8 / 22 / 1,2 → pisos 76 / 22 / 1, restos 0,8 / 0 / 0,2.
    expect(porcentajesReparto(["7680.00", "2200.00", "120.00"], "10000.00")).toEqual([77, 22, 1]);
  });

  it("26 610,00 / 3 390,00 de 30 000,00 → [89, 11]", () => {
    // 88,7 / 11,3 → pisos 88 / 11, restos 0,7 / 0,3.
    expect(porcentajesReparto(["26610.00", "3390.00"], "30000.00")).toEqual([89, 11]);
  });

  it("empate triple 1,00 / 1,00 / 1,00 de 3,00 → [34, 33, 33] (gana la primera)", () => {
    expect(porcentajesReparto(["1.00", "1.00", "1.00"], "3.00")).toEqual([34, 33, 33]);
  });

  it("una parte con todo y otra en cero: 100 000,00 / 0,00 → [100, 0]", () => {
    expect(porcentajesReparto(["100000.00", "0.00"], "100000.00")).toEqual([100, 0]);
  });

  it("el orden de salida es el de entrada: las mismas partes al reves dan el resultado al reves", () => {
    expect(porcentajesReparto(["5650.00", "94350.00"], "100000.00")).toEqual([6, 94]);
    // En un empate, «la primera» es la que va primero en la ENTRADA: invertida, gana la otra.
    expect(porcentajesReparto(["500.00", "3000.00", "96500.00"], "100000.00")).toEqual([1, 3, 96]);
  });

  it("una parte > 0 que redondea a 0 se emite «0» y la suma sigue siendo 100", () => {
    // 0,01 de 100,00 = 0,01 % → piso 0, resto mínimo; 99,99 → piso 99, resto 0,99 → [100, 0].
    expect(porcentajesReparto(["99.99", "0.01"], "100.00")).toEqual([100, 0]);
  });

  it("acepta importes sin escala fija (centimos enteros): «100000» y «5650.5»", () => {
    // 94 349,50 / 5 650,50 de 100 000 → 94,3495 / 5,6505 → pisos 94 / 5, restos .3495 / .6505.
    expect(porcentajesReparto(["94349.5", "5650.5"], "100000")).toEqual([94, 6]);
  });

  it("la suma es 100 en todos los casos no nulos", () => {
    const casos: Array<[string[], string]> = [
      [["94350.00", "5650.00"], "100000.00"],
      [["96500.00", "3000.00", "500.00"], "100000.00"],
      [["7680.00", "2200.00", "120.00"], "10000.00"],
      [["26610.00", "3390.00"], "30000.00"],
      [["1.00", "1.00", "1.00"], "3.00"],
      [["100000.00", "0.00"], "100000.00"],
      [["0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01"], "0.07"],
    ];
    for (const [partes, total] of casos) {
      const r = porcentajesReparto(partes, total);
      if (r === null) throw new Error(`no deberia ser null: ${partes.join(" / ")} de ${total}`);
      expect(r.reduce((s, n) => s + n, 0)).toBe(100);
      for (const n of r) expect(Number.isInteger(n) && n >= 0 && n <= 100).toBe(true);
    }
  });

  it("siete partes iguales de 0,01: los dos puntos que faltan van a las dos primeras", () => {
    // 100/7 = 14,28… → pisos 14 × 7 = 98, restos iguales → +1 a la 1.ª y a la 2.ª.
    expect(
      porcentajesReparto(["0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01"], "0.07"),
    ).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });
});

describe("porcentajesReparto — los casos `null` (R261)", () => {
  it("total 0,00 → null", () => {
    expect(porcentajesReparto(["0.00", "0.00"], "0.00")).toBeNull();
  });

  it("entrega prepagada: −1 130,00 / 1 130,00 de 0,00 → null", () => {
    expect(porcentajesReparto(["-1130.00", "1130.00"], "0.00")).toBeNull();
  });

  it("total negativo → null", () => {
    expect(porcentajesReparto(["-100.00", "0.00"], "-100.00")).toBeNull();
  });

  it("una parte negativa con total positivo: −500,00 / 1 500,00 / 0,00 de 1 000,00 → null", () => {
    expect(porcentajesReparto(["-500.00", "1500.00", "0.00"], "1000.00")).toBeNull();
  });

  it("partes que no suman el total al centimo → null (60,00 + 30,00 ≠ 100,00; 99,99 ≠ 100,00)", () => {
    expect(porcentajesReparto(["60.00", "30.00"], "100.00")).toBeNull();
    expect(porcentajesReparto(["60.00", "39.99"], "100.00")).toBeNull();
    expect(porcentajesReparto(["60.00", "40.01"], "100.00")).toBeNull();
  });

  it("sin partes → null", () => {
    expect(porcentajesReparto([], "100.00")).toBeNull();
  });

  it("un importe que no es un entero de centimos o no es un numero → null", () => {
    expect(porcentajesReparto(["50.005", "49.995"], "100.00")).toBeNull();
    expect(porcentajesReparto(["abc", "100.00"], "100.00")).toBeNull();
    expect(porcentajesReparto(["100.00"], "NaN")).toBeNull();
  });
});

describe("porcentajesReparto — aritmetica exacta (R262)", () => {
  it("importes grandes sin perder centimos: 0,01 de 9 999 999 999,99 no se pierde en la suma", () => {
    // Doce cifras significativas: la suma se compara en centimos enteros, sin coma flotante, y
    // cuadra al centimo y el reparto sale. 0,01 / 9 999 999 999,99 ≈ 1e-10 % → [100, 0].
    expect(porcentajesReparto(["9999999999.98", "0.01"], "9999999999.99")).toEqual([100, 0]);
  });

  it("un resto que solo se distingue al centimo decide el punto: 33,33 / 33,34 / 33,33 de 100,00", () => {
    // Pisos 33 / 33 / 33; restos 0,33 / 0,34 / 0,33 → el punto va a la del medio: [33, 34, 33].
    expect(porcentajesReparto(["33.33", "33.34", "33.33"], "100.00")).toEqual([33, 34, 33]);
  });
});
