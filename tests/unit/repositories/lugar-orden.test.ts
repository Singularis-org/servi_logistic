import { describe, expect, it } from "vitest";

import { lugarDeLaOrden, whereLugarEn } from "@/lib/repositories/_shared/lugar-orden";

// SLT-65 (T2.1; R1, R9, R13, R19; design §3) — el lugar de una orden y su `where`. El SQL que
// produce `whereLugarEn` lo prueban contra Postgres `geo-consultas-ordenes.test.ts` y las suites de
// conteo y zona; aqui se fija la regla y la forma.

describe("SLT-65 — lugarDeLaOrden", () => {
  it("con distrito, el lugar es el distrito", () => {
    expect(lugarDeLaOrden({ distritoId: "d-1", cantonId: "c-1" })).toBe("d-1");
  });

  it("sin distrito, el lugar es el canton", () => {
    expect(lugarDeLaOrden({ distritoId: null, cantonId: "c-1" })).toBe("c-1");
  });

  it("no mira ninguna otra columna de la orden, tampoco nodoGeograficoId (R19)", () => {
    const orden = { distritoId: null, cantonId: "c-1", nodoGeograficoId: "otro" };
    expect(lugarDeLaOrden(orden)).toBe("c-1");
  });
});

describe("SLT-65 — whereLugarEn", () => {
  it("es un OR de dos ramas: el distrito en la lista, o sin distrito y el canton en la lista", () => {
    expect(whereLugarEn(["a", "b"])).toEqual({
      OR: [{ distritoId: { in: ["a", "b"] } }, { distritoId: null, cantonId: { in: ["a", "b"] } }],
    });
  });

  it("no usa nodoGeograficoId ni otra clave fuera de OR (R19)", () => {
    const where = whereLugarEn(["a"]);
    expect(Object.keys(where)).toEqual(["OR"]);
    expect(JSON.stringify(where)).not.toContain("nodoGeografico");
  });

  it("copia la lista: mutar la de entrada despues no cambia el where", () => {
    const ids = ["a"];
    const where = whereLugarEn(ids);
    ids.push("b");
    expect(where).toEqual({ OR: [{ distritoId: { in: ["a"] } }, { distritoId: null, cantonId: { in: ["a"] } }] });
  });

  it("con la lista vacia no casa ninguna orden (in: [] en las dos ramas)", () => {
    expect(whereLugarEn([])).toEqual({ OR: [{ distritoId: { in: [] } }, { distritoId: null, cantonId: { in: [] } }] });
  });
});
