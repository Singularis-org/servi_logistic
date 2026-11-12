import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@prisma/client";

import {
  condicionesDeLugar,
  lugaresDelFiltro,
  resolverLugar,
  SIN_LUGAR,
  tieneLugar,
  whereDeLugares,
} from "@/lib/repositories/_shared/lugares-del-filtro";
import { sqlLugarEn, whereLugarEn } from "@/lib/repositories/_shared/lugar-orden";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import {
  crearAsignaciones,
  crearCatalogo,
  type NodoDelCatalogo,
  type TipoDeNivel,
} from "@/lib/services/geografia-dominio";

// SLT-71 (T2.2; design §3.2) y SLT-47 (T2.1; R11, R12; design §3.1) — el filtro de lugar resuelto al lugar de
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

describe("SLT-47 — resolverLugar (R11, R12; antes resolverLugaresDelFiltro de SLT-71)", () => {
  it("provincia → ella y sus tres niveles por debajo, ordenados por id", () => {
    expect(resolverLugar(cat, ["P1"])).toEqual(["B1", "C1", "C2", "D1", "D2", "D3", "P1"]);
  });

  it("canton → el y lo que cuelga, a cualquier profundidad", () => {
    expect(resolverLugar(cat, ["C1"])).toEqual(["B1", "C1", "D1", "D2"]);
  });

  it("distrito → el y su nodo de nivel 4", () => {
    expect(resolverLugar(cat, ["D1", "D3"])).toEqual(["B1", "D1", "D3"]);
  });

  it("varios ids se unen sin duplicados", () => {
    expect(resolverLugar(cat, ["P2", "P1", "P2"])).toEqual(["B1", "C1", "C2", "C3", "D1", "D2", "D3", "D4", "P1", "P2"]);
  });

  it("R11: un id de cualquier profundidad es el lugar elegido (tambien el nivel 4)", () => {
    expect(resolverLugar(cat, ["B1"])).toEqual(["B1"]);
    expect(resolverLugar(cat, ["C3", "D4"])).toEqual(["C3", "D4"]);
  });

  it("R11: un id ausente del catalogo no aporta", () => {
    expect(resolverLugar(cat, ["nope", "D4"])).toEqual(["D4"]);
  });

  it("R12: si ningun id esta en el catalogo, `[]` (cero ordenes)", () => {
    expect(resolverLugar(cat, ["otro-pais"])).toEqual([]);
    expect(resolverLugar(cat, [])).toEqual([]);
  });

  it("R27: una combinacion coherente de dos niveles (provincia y canton bajo ella) es el canton", () => {
    // Hoy: provincia_id ∈ {P1} AND canton_id ∈ {C2}. La traduccion lleva solo el nivel mas profundo.
    const deHoy = new Set(resolverLugar(cat, ["P1"]).filter((id) => resolverLugar(cat, ["C2"]).includes(id)));
    expect(resolverLugar(cat, ["C2"])).toEqual([...deHoy].sort());
  });
});

describe("SLT-47 — condicionesDeLugar (R11, R12)", () => {
  it("con ids, una sola condicion: `sqlLugarEn`", () => {
    const c = condicionesDeLugar({ lugar: ["C1", "D1"] });
    expect(c).toHaveLength(1);
    expect(c[0].text).toBe(sqlLugarEn(["x"]).text);
    expect(c[0].values).toEqual(sqlLugarEn(["C1", "D1"]).values);
  });

  it("R12: `[]` es `FALSE`, sin array vacio", () => {
    const [c] = condicionesDeLugar({ lugar: [] });
    expect(c.text).toBe("FALSE");
    expect(c.values).toEqual([]);
  });

  it("sin lugar, ninguna condicion", () => {
    expect(condicionesDeLugar(SIN_LUGAR)).toEqual([]);
  });

  it("R11: un parametro de array por rama, nunca uno por id", () => {
    const where = Prisma.join(condicionesDeLugar({ lugar: ["a", "b", "c"] }), " AND ");
    expect(where.values).toEqual([
      ["a", "b", "c"],
      ["a", "b", "c"],
    ]);
  });
});

describe("SLT-47 — lugaresDelFiltro (R37)", () => {
  const catalogoRepo = () => {
    const deLaEmpresa = vi.fn(async () => ({ catalogo: cat, asignaciones: crearAsignaciones([], []) }));
    return { deLaEmpresa };
  };

  it("sin lugar_id no crea ni carga el catalogo", async () => {
    const fabrica = vi.fn(catalogoRepo);
    expect(await lugaresDelFiltro(fabrica, { zona_id: ["z"] } as never)).toBe(SIN_LUGAR);
    expect(await lugaresDelFiltro(fabrica, { lugar_id: [] })).toBe(SIN_LUGAR);
    expect(fabrica).not.toHaveBeenCalled();
  });

  it("con lugar_id, carga una vez y resuelve", async () => {
    const repo = catalogoRepo();
    expect(await lugaresDelFiltro(() => repo, { lugar_id: ["C3"] })).toEqual({ lugar: ["C3", "D4"] });
    expect(repo.deLaEmpresa).toHaveBeenCalledTimes(1);
  });

  it("R37: el rechazo del catalogo (plataforma) sube tal cual, sin lugares", async () => {
    const rechazo = new EmpresaNoResuelta("CatalogoGeografico", "deLaEmpresa");
    const repo = { deLaEmpresa: vi.fn(async () => Promise.reject(rechazo)) };
    await expect(lugaresDelFiltro(() => repo, { lugar_id: ["D1"] })).rejects.toBe(rechazo);
  });

  it("tieneLugar solo mira lugar_id", () => {
    expect(tieneLugar({})).toBe(false);
    expect(tieneLugar({ lugar_id: [] })).toBe(false);
    expect(tieneLugar({ lugar_id: ["x"] })).toBe(true);
  });
});

describe("SLT-47 — whereDeLugares (R11, R12)", () => {
  it("con ids, `AND` de `whereLugarEn`; con `[]`, cero filas; sin lugar, nada", () => {
    expect(whereDeLugares({ lugar: ["C1", "D1"] })).toEqual({ AND: [whereLugarEn(["C1", "D1"])] });
    expect(whereDeLugares({ lugar: [] })).toEqual({ id: { in: [] } });
    expect(whereDeLugares(SIN_LUGAR)).toEqual({});
  });
});
