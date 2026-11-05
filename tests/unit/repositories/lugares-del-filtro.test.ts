import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@prisma/client";

import {
  condicionesDeLugar,
  lugaresDelFiltro,
  resolverLugaresDelFiltro,
  SIN_FACETAS_GEOGRAFICAS,
  tieneFacetasGeograficas,
} from "@/lib/repositories/_shared/lugares-del-filtro";
import { sqlLugarEn } from "@/lib/repositories/_shared/lugar-orden";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import {
  crearAsignaciones,
  crearCatalogo,
  type NodoDelCatalogo,
  type TipoDeNivel,
} from "@/lib/services/geografia-dominio";

// SLT-71 (T2.2; R1, R3, R5; design §3.2) — las facetas geograficas de analitica resueltas al lugar de
// la orden, sin base de datos.
//
// Catalogo de CUATRO niveles, para que «los nodos bajo» no se pruebe solo con tres (design §11):
//
//   P1 ─┬─ C1 ─┬─ D1 ─── B1
//       │      └─ D2
//       └─ C2 ─── D3
//   P2 ─── C3 ─── D4

const TIPOS: TipoDeNivel[] = [1, 2, 3, 4].map((n) => ({
  id: `t${n}`,
  clave: `nivel_${n}`,
  nombreSingular: `Nivel ${n}`,
  nombrePlural: `Niveles ${n}`,
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
}));

function n(id: string, padreId: string | null, profundidad: number): NodoDelCatalogo {
  return {
    id,
    padreId,
    profundidad,
    tipoId: `t${profundidad}`,
    nombre: `Nombre ${id}`,
    nombreNormalizado: `nombre ${id.toLowerCase()}`,
    codigoOficial: null,
    activo: true,
  };
}

// Llegan desordenados a proposito: la salida tiene que salir ordenada por id igual.
const cat = crearCatalogo("XA", TIPOS, [
  n("P2", null, 1),
  n("P1", null, 1),
  n("C3", "P2", 2),
  n("C2", "P1", 2),
  n("C1", "P1", 2),
  n("D4", "C3", 3),
  n("D3", "C2", 3),
  n("D2", "C1", 3),
  n("D1", "C1", 3),
  n("B1", "D1", 4),
]);

describe("SLT-71 — resolverLugaresDelFiltro (R1, R3)", () => {
  it("provincia → ella y sus tres niveles por debajo, ordenados por id", () => {
    expect(resolverLugaresDelFiltro(cat, { provincia_id: ["P1"] })).toEqual({
      provincia: ["B1", "C1", "C2", "D1", "D2", "D3", "P1"],
    });
  });

  it("canton → el y lo que cuelga, a cualquier profundidad", () => {
    expect(resolverLugaresDelFiltro(cat, { canton_id: ["C1"] })).toEqual({ canton: ["B1", "C1", "D1", "D2"] });
  });

  it("distrito → el y su nodo de nivel 4", () => {
    expect(resolverLugaresDelFiltro(cat, { distrito_id: ["D1", "D3"] })).toEqual({ distrito: ["B1", "D1", "D3"] });
  });

  it("varios ids de una faceta se unen sin duplicados", () => {
    expect(resolverLugaresDelFiltro(cat, { provincia_id: ["P2", "P1", "P2"] })).toEqual({
      provincia: ["B1", "C1", "C2", "C3", "D1", "D2", "D3", "D4", "P1", "P2"],
    });
  });

  it("R3: un id de otro nivel o ausente del catalogo no aporta", () => {
    expect(resolverLugaresDelFiltro(cat, { distrito_id: ["C3", "nope", "D4"] })).toEqual({ distrito: ["D4"] });
    expect(resolverLugaresDelFiltro(cat, { canton_id: ["P1", "C2"] })).toEqual({ canton: ["C2", "D3"] });
  });

  it("R3: si ningun id es valido, la faceta queda `[]` (cero ordenes), nunca omitida", () => {
    expect(resolverLugaresDelFiltro(cat, { distrito_id: ["C1"] })).toEqual({ distrito: [] });
    expect(resolverLugaresDelFiltro(cat, { provincia_id: ["otro-pais"] })).toEqual({ provincia: [] });
  });

  it("un nodo de nivel 4 pedido como distrito no casa (profundidad 4 ≠ 3)", () => {
    expect(resolverLugaresDelFiltro(cat, { distrito_id: ["B1"] })).toEqual({ distrito: [] });
  });

  it("varias facetas se resuelven cada una por su lado", () => {
    expect(resolverLugaresDelFiltro(cat, { provincia_id: ["P1"], canton_id: ["C2"] })).toEqual({
      provincia: ["B1", "C1", "C2", "D1", "D2", "D3", "P1"],
      canton: ["C2", "D3"],
    });
  });

  it("una faceta ausente o vacia no tiene clave", () => {
    expect(resolverLugaresDelFiltro(cat, {})).toEqual({});
    expect(resolverLugaresDelFiltro(cat, { canton_id: [] })).toEqual({});
  });
});

describe("SLT-71 — condicionesDeLugar (R1, R2, R3)", () => {
  it("una condicion por faceta, en el orden provincia, canton, distrito", () => {
    const c = condicionesDeLugar({ distrito: ["D1"], provincia: ["P1", "C1"], canton: ["C1"] });
    expect(c).toHaveLength(3);
    expect(c.map((s) => s.values)).toEqual([
      sqlLugarEn(["P1", "C1"]).values,
      sqlLugarEn(["C1"]).values,
      sqlLugarEn(["D1"]).values,
    ]);
    for (const s of c) expect(s.text).toBe(sqlLugarEn(["x"]).text);
  });

  it("R3: una faceta `[]` es `FALSE`, sin array vacio", () => {
    const [c] = condicionesDeLugar({ canton: [] });
    expect(c.text).toBe("FALSE");
    expect(c.values).toEqual([]);
  });

  it("R5: sin facetas, ninguna condicion", () => {
    expect(condicionesDeLugar(SIN_FACETAS_GEOGRAFICAS)).toEqual([]);
  });

  it("cada condicion es un parametro de array por rama, nunca uno por id", () => {
    const where = Prisma.join(condicionesDeLugar({ provincia: ["a", "b", "c"] }), " AND ");
    expect(where.values).toEqual([
      ["a", "b", "c"],
      ["a", "b", "c"],
    ]);
  });
});

describe("SLT-71 — lugaresDelFiltro (R5, R13)", () => {
  const catalogoRepo = () => {
    const deLaEmpresa = vi.fn(async () => ({ catalogo: cat, asignaciones: crearAsignaciones([], []) }));
    return { deLaEmpresa };
  };

  it("R5: sin faceta geografica no crea ni carga el catalogo", async () => {
    const fabrica = vi.fn(catalogoRepo);
    expect(await lugaresDelFiltro(fabrica, { zona_id: ["z"] } as never)).toBe(SIN_FACETAS_GEOGRAFICAS);
    expect(await lugaresDelFiltro(fabrica, { provincia_id: [] })).toBe(SIN_FACETAS_GEOGRAFICAS);
    expect(fabrica).not.toHaveBeenCalled();
  });

  it("con faceta, carga una vez y resuelve", async () => {
    const repo = catalogoRepo();
    expect(await lugaresDelFiltro(() => repo, { canton_id: ["C3"] })).toEqual({ canton: ["C3", "D4"] });
    expect(repo.deLaEmpresa).toHaveBeenCalledTimes(1);
  });

  it("R13: el rechazo del catalogo (plataforma) sube tal cual, sin lugares", async () => {
    const rechazo = new EmpresaNoResuelta("CatalogoGeografico", "deLaEmpresa");
    const repo = { deLaEmpresa: vi.fn(async () => Promise.reject(rechazo)) };
    await expect(lugaresDelFiltro(() => repo, { distrito_id: ["D1"] })).rejects.toBe(rechazo);
  });

  it("tieneFacetasGeograficas solo mira las tres facetas", () => {
    expect(tieneFacetasGeograficas({})).toBe(false);
    expect(tieneFacetasGeograficas({ distrito_id: ["x"] })).toBe(true);
  });
});
