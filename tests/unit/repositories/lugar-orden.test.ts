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

  // SLT-48 R22: el lugar de la orden es su nodo; las FK viejas ya no cuentan (antes ganaba el canton).
  it("no mira ninguna otra columna de la orden: solo nodoGeograficoId (SLT-48 R22)", () => {
    const orden = { distritoId: null, cantonId: "c-1", nodoGeograficoId: "otro" };
    expect(lugarDeLaOrden(orden)).toBe("otro");
  });
});

describe("SLT-65 — whereLugarEn", () => {
  // SLT-48 R23: el filtro selecciona por el nodo de la orden; el OR de dos FK desaparece.
  it("es un `in` sobre el nodo de la orden (SLT-48 R23; antes, un OR de distrito y canton)", () => {
    expect(whereLugarEn(["a", "b"])).toEqual({ nodoGeograficoId: { in: ["a", "b"] } });
  });

  // SLT-48 R23/R29: la unica clave es el nodo; ninguna FK vieja.
  it("usa solo nodoGeograficoId, ninguna FK vieja (SLT-48 R23)", () => {
    const where = whereLugarEn(["a"]);
    expect(Object.keys(where)).toEqual(["nodoGeograficoId"]);
    expect(JSON.stringify(where)).not.toMatch(/distritoId|cantonId|provinciaId/);
  });

  it("copia la lista: mutar la de entrada despues no cambia el where", () => {
    const ids = ["a"];
    const where = whereLugarEn(ids);
    ids.push("b");
    // SLT-48 R23: la forma es el `in` sobre el nodo.
    expect(where).toEqual({ nodoGeograficoId: { in: ["a"] } });
  });

  // SLT-48 R23: una sola rama, sobre el nodo.
  it("con la lista vacia no casa ninguna orden (in: [] sobre el nodo)", () => {
    expect(whereLugarEn([])).toEqual({ nodoGeograficoId: { in: [] } });
  });
});

// SLT-71 (T2.1; R1, R5; design §3.1) — la misma regla en SQL crudo y la profundidad de cada nivel.
// El resultado contra Postgres lo prueba `geo-analitica-lugar.test.ts`; aqui, la forma.

describe("SLT-71 — sqlLugarEn", () => {
  const texto = (s: Prisma.Sql) => s.text.replace(/\s+/g, " ").trim();

  // SLT-48 R23: la misma regla que `whereLugarEn`, ahora sobre el nodo de la orden.
  it("es `whereLugarEn` con `= ANY` sobre el alias `o`, sin COALESCE (SLT-48 R23: sobre el nodo)", () => {
    const s = sqlLugarEn(["a", "b"]);
    expect(texto(s)).toBe('o."nodo_geografico_id" = ANY($1::text[])');
    expect(s.sql).not.toMatch(/COALESCE/i);
    expect(s.sql).not.toMatch(/distrito_id|canton_id|provincia_id/);
  });

  // SLT-48 R23: con una sola rama, un solo parametro de array.
  it("los ids viajan como UN array, no como un parametro por id", () => {
    const s = sqlLugarEn(["a", "b", "c"]);
    expect(s.values).toEqual([["a", "b", "c"]]);
  });

  it("copia la lista: mutar la de entrada despues no cambia los parametros", () => {
    const ids = ["a"];
    const s = sqlLugarEn(ids);
    ids.push("b");
    // SLT-48 R23: una sola rama, un solo parametro.
    expect(s.values).toEqual([["a"]]);
  });

  // SLT-48 R23: una sola rama sobre el nodo, un solo parametro.
  it("compuesto dentro de otro fragmento, sigue siendo un solo parametro de array", () => {
    const where = Prisma.join([Prisma.sql`TRUE`, sqlLugarEn(["x", "y"])], " AND ");
    expect(where.values).toEqual([["x", "y"]]);
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
