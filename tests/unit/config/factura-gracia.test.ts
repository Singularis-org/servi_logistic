import { describe, expect, it } from "vitest";

import { diasDeGraciaGlobal } from "@/lib/config/factura-gracia";

// SLT-121 · T2.1 (design §3.1, R2) — la gracia global sale de `FACTURA_DIAS_GRACIA` solo si es un entero de 1 a
// 60; en cualquier otro caso, 7. Se pasa el entorno por parámetro: el de verdad no se toca.

const con = (valor: string | undefined): NodeJS.ProcessEnv =>
  (valor === undefined ? {} : { FACTURA_DIAS_GRACIA: valor }) as NodeJS.ProcessEnv;

describe("SLT-121 R2 — diasDeGraciaGlobal", () => {
  it.each([
    ["ausente", undefined],
    ["vacía", ""],
    ["no numérica", "abc"],
    ["cero", "0"],
    ["por encima de 60", "61"],
    ["con decimales", "7.5"],
    ["negativa", "-3"],
    ["con basura detrás", "15abc"],
  ])("vale 7 con la variable %s", (_caso, valor) => {
    expect(diasDeGraciaGlobal(con(valor))).toBe(7);
  });

  it.each([
    ["15", 15],
    ["1", 1],
    ["60", 60],
    [" 30 ", 30],
  ])("toma «%s» como %i días", (valor, dias) => {
    expect(diasDeGraciaGlobal(con(valor))).toBe(dias);
  });

  it("sin argumento lee process.env", () => {
    const antes = process.env.FACTURA_DIAS_GRACIA;
    process.env.FACTURA_DIAS_GRACIA = "12";
    try {
      expect(diasDeGraciaGlobal()).toBe(12);
    } finally {
      if (antes === undefined) delete process.env.FACTURA_DIAS_GRACIA;
      else process.env.FACTURA_DIAS_GRACIA = antes;
    }
  });
});
