import { describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

import {
  lugarDeLaOrden,
  PROFUNDIDAD_DEL_NIVEL,
  sqlLugarEn,
  whereLugarEn,
} from "@/lib/repositories/_shared/lugar-orden";

// SLT-65 (T2.1; R1, R9, R13, R19; design §3) — el lugar de una orden y su `where`. El SQL que
// produce `whereLugarEn` lo prueban contra Postgres `geo-consultas-ordenes.test.ts` y las suites de
// conteo y zona; aqui se fija la regla y la forma.

describe("SLT-65 — lugarDeLaOrden", () => {
  it("con distrito, el lugar es el distrito", () => {
    expect(lugarDeLaOrden({ nodoGeograficoId: "d-1" })).toBe("d-1");
  });

  it("sin distrito, el lugar es el canton", () => {
    expect(lugarDeLaOrden({ nodoGeograficoId: "c-1" })).toBe("c-1");
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

// SLT-71 (T2.1; R1, R5; design §3.1) — la misma regla en SQL crudo y la profundidad de cada nivel.
// El resultado contra Postgres lo prueba `geo-analitica-lugar.test.ts`; aqui, la forma.

describe("SLT-71 — sqlLugarEn", () => {
  const texto = (s: Prisma.Sql) => s.text.replace(/\s+/g, " ").trim();

  it("es el OR de `whereLugarEn` con `= ANY` sobre el alias `o`, sin COALESCE", () => {
    const s = sqlLugarEn(["a", "b"]);
    expect(texto(s)).toBe(
      '(o."distrito_id" = ANY($1::text[]) OR (o."distrito_id" IS NULL AND o."canton_id" = ANY($2::text[])))',
    );
    expect(s.sql).not.toMatch(/COALESCE/i);
    expect(s.sql).not.toContain("nodo_geografico_id");
  });

  it("los ids viajan como UN array por rama, no como un parametro por id", () => {
    const s = sqlLugarEn(["a", "b", "c"]);
    expect(s.values).toEqual([
      ["a", "b", "c"],
      ["a", "b", "c"],
    ]);
  });

  it("copia la lista: mutar la de entrada despues no cambia los parametros", () => {
    const ids = ["a"];
    const s = sqlLugarEn(ids);
    ids.push("b");
    expect(s.values).toEqual([["a"], ["a"]]);
  });

  it("compuesto dentro de otro fragmento, sigue siendo un parametro por rama", () => {
    const where = Prisma.join([Prisma.sql`TRUE`, sqlLugarEn(["x", "y"])], " AND ");
    expect(where.values).toEqual([
      ["x", "y"],
      ["x", "y"],
    ]);
  });
});

describe("SLT-71 — PROFUNDIDAD_DEL_NIVEL", () => {
  it("provincia 1, canton 2, distrito 3: la unica correspondencia entre nivel y profundidad", () => {
    expect(PROFUNDIDAD_DEL_NIVEL).toEqual({ provincia: 1, canton: 2, distrito: 3 });
  });
});

// =================================================================================================
// SLT-48 (design §5; R22, R23) — el lugar de la orden es su nodo
// =================================================================================================

describe("SLT-48 R22/R23 — lugarDeLaOrden, whereLugarEn y sqlLugarEn leen el nodo", () => {
  it("el lugar es `nodoGeograficoId`; sin nodo (SQL a mano) es null", () => {
    expect(lugarDeLaOrden({ nodoGeograficoId: "n-4" })).toBe("n-4");
    expect(lugarDeLaOrden({ nodoGeograficoId: null })).toBeNull();
  });

  it("whereLugarEn es un `in` sobre el nodo, sin las FK viejas; copia la lista", () => {
    const ids = ["a", "b"];
    const where = whereLugarEn(ids);
    ids.push("c");
    expect(where).toEqual({ nodoGeograficoId: { in: ["a", "b"] } });
    expect(JSON.stringify(where)).not.toMatch(/distritoId|cantonId|provinciaId/);
    expect(whereLugarEn([])).toEqual({ nodoGeograficoId: { in: [] } });
  });

  it("sqlLugarEn es `o.nodo_geografico_id = ANY(...)` con UN parametro de array", () => {
    const ids = ["a", "b"];
    const s = sqlLugarEn(ids);
    ids.push("c");
    expect(s.text.replace(/\s+/g, " ").trim()).toBe('o."nodo_geografico_id" = ANY($1::text[])');
    expect(s.values).toEqual([["a", "b"]]);
    expect(s.sql).not.toMatch(/distrito_id|canton_id|provincia_id/);
  });
});
