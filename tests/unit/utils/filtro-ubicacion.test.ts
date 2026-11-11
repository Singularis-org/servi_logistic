import { describe, expect, it } from "vitest";

import type { FilterDef } from "@/components/shared/FilterComponent";
import type { CatalogoFiltrosOrdenesDTO, NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import {
  claveDeNivel,
  declararNiveles,
  lugarElegido,
  PARAM_LUGAR,
  seleccionALugar,
  traductorPorId,
  traductorPorNombre,
  type OpcionesDeLugar,
} from "@/lib/utils/filtro-ubicacion";

// SLT-47 (T3.1; R1, R2, R4, R6, R9, R17–R21; design §4) — el FiltroUbicacion, sin React.

type Lugar = OpcionesDeLugar["lugares"][number];

function nivelesDe(n: number): NivelDeFiltroDTO[] {
  return Array.from({ length: n }, (_, i) => ({ profundidad: i + 1, singular: `Tipo${i + 1}`, plural: `Tipos${i + 1}` }));
}

/** Una cadena por nivel (A1 → A2 → … → An) y una rama hermana en el nivel 1 (B1 → B2). */
function catalogo(n: number): OpcionesDeLugar {
  const lugares: Lugar[] = [];
  for (let k = 1; k <= n; k++) lugares.push({ id: `A${k}`, nombre: `Lugar A${k}`, padreId: k === 1 ? null : `A${k - 1}`, profundidad: k });
  lugares.push({ id: "B1", nombre: "Lugar B1", padreId: null, profundidad: 1 });
  lugares.push({ id: "B2", nombre: "Lugar B2", padreId: "B1", profundidad: 2 });
  return { niveles: nivelesDe(n), lugares };
}

const params = (q: string) => new URLSearchParams(q);
const comoObjeto = (p: { entries(): IterableIterator<[string, string]> }) => Object.fromEntries([...p.entries()]);

describe("R1, R2 — una lista por nivel, en orden y rotulada con su tipo", () => {
  it.each([2, 3, 4, 10])("pais de %i niveles: %i listas, nivel_1..nivel_P, con su singular", (n) => {
    const defs = declararNiveles(catalogo(n));
    expect(defs.map((d) => d.key)).toEqual(Array.from({ length: n }, (_, i) => claveDeNivel(i + 1)));
    expect(defs.map((d) => d.label)).toEqual(nivelesDe(n).map((x) => x.singular));
    expect(defs.every((d) => d.kind === "multi")).toBe(true);
    // Encadenadas: cada una depende de la anterior; la primera de ninguna.
    expect(defs[0].dependsOn).toBeUndefined();
    for (let k = 1; k < n; k++) expect(defs[k].dependsOn).toBe(claveDeNivel(k));
    // Cada lista ofrece su nivel, con el padre como `parentValue`.
    expect(defs[n - 1].options).toContainEqual({ value: `A${n}`, label: `Lugar A${n}`, parentValue: `A${n - 1}` });
  });

  it("R2: con 2 niveles no hay tercera lista ni una que repita el rotulo del nivel 2", () => {
    const defs = declararNiveles(catalogo(2));
    expect(defs).toHaveLength(2);
    expect(defs.filter((d) => d.label === "Tipo2")).toHaveLength(1);
  });

  it("los rotulos salen de los tipos: cambiar el nombre del tipo cambia el rotulo y la busqueda", () => {
    const op = catalogo(2);
    const defs = declararNiveles({ ...op, niveles: [{ profundidad: 1, singular: "Región", plural: "Regiones" }, op.niveles[1]] });
    expect(defs[0].label).toBe("Región");
    expect(defs[0].searchPlaceholder).toBe("Buscar región…");
  });

  it("P2: desde el nivel 2 y con el padre entre parentesis en la primera lista (mis-asignaciones)", () => {
    const defs = declararNiveles(catalogo(4), { desde: 2, etiquetaConPadre: true });
    expect(defs.map((d) => d.key)).toEqual(["nivel_2", "nivel_3", "nivel_4"]);
    expect(defs[0].dependsOn).toBeUndefined();
    expect(defs[0].options).toContainEqual({ value: "A2", label: "Lugar A2 (Lugar A1)" });
    expect(defs[1].dependsOn).toBe("nivel_2");
  });
});

describe("R6 — en Costa Rica, los mismos controles de lugar que hoy, campo a campo salvo la clave", () => {
  const cat: CatalogoFiltrosOrdenesDTO = {
    zonas: [],
    tiendas: [],
    mensajeros: [],
    provincias: [
      { id: "p1", nombre: "Alajuela", disponible: true },
      { id: "p2", nombre: "San José", disponible: true },
    ],
    cantones: [
      { id: "c1", nombre: "Central", padreId: "p1", disponible: true },
      { id: "c2", nombre: "Escazú", padreId: "p2", disponible: true },
    ],
    distritos: [
      { id: "d1", nombre: "San Rafael", padreId: "c2", disponible: true },
      { id: "d2", nombre: "Carmen", padreId: "c1", disponible: true },
    ],
  };
  const etiquetas = {
    provincia: { singular: "Provincia", plural: "Provincias" },
    canton: { singular: "Cantón", plural: "Cantones" },
    distrito: { singular: "Distrito", plural: "Distritos" },
  };
  // Copia CONGELADA de las tres listas de lugar que declaraba `construirFiltrosOrdenes` ANTES de
  // SLT-47 / T4.1: `git show 1806e3a1:"app/(app)/ordenes/_components/ordenes-filtros-def.ts"`, lineas
  // ~357-387 (`provincia_id` / `canton_id` / `distrito_id`), con los datos `cat` y `etiquetas` de
  // arriba. No se calcula con el codigo de hoy a proposito: `construirFiltrosOrdenes` ya usa
  // `declararNiveles`, y compararlo consigo mismo no probaria R6.
  const deHoy: FilterDef[] = [
    {
      key: "provincia_id",
      label: etiquetas.provincia.singular,
      kind: "multi",
      searchPlaceholder: `Buscar ${etiquetas.provincia.singular.toLowerCase()}…`,
      options: cat.provincias.map((p) => ({ value: p.id, label: p.nombre })),
    },
    {
      key: "canton_id",
      label: etiquetas.canton.singular,
      kind: "multi",
      dependsOn: "provincia_id",
      searchPlaceholder: `Buscar ${etiquetas.canton.singular.toLowerCase()}…`,
      options: cat.cantones.map((c) => ({ value: c.id, label: c.nombre, parentValue: c.padreId })),
    },
    {
      key: "distrito_id",
      label: etiquetas.distrito.singular,
      kind: "multi",
      dependsOn: "canton_id",
      searchPlaceholder: `Buscar ${etiquetas.distrito.singular.toLowerCase()}…`,
      options: cat.distritos.map((d) => ({ value: d.id, label: d.nombre, parentValue: d.padreId })),
    },
  ];
  const nuevos = declararNiveles({
    niveles: [1, 2, 3].map((k) => ({ profundidad: k, singular: [etiquetas.provincia, etiquetas.canton, etiquetas.distrito][k - 1].singular, plural: "" })),
    lugares: [
      ...cat.provincias.map((p) => ({ id: p.id, nombre: p.nombre, padreId: null, profundidad: 1 })),
      ...cat.cantones.map((c) => ({ id: c.id, nombre: c.nombre, padreId: c.padreId, profundidad: 2 })),
      ...cat.distritos.map((d) => ({ id: d.id, nombre: d.nombre, padreId: d.padreId, profundidad: 3 })),
    ],
  });
  const sinClaves = (d: FilterDef) => {
    const { key: _k, dependsOn: _d, ...resto } = d;
    return resto;
  };

  it("mismos rotulos, orden, textos de busqueda y opciones (con su padre)", () => {
    expect(deHoy).toHaveLength(3);
    expect(nuevos.map(sinClaves)).toEqual(deHoy.map(sinClaves));
  });

  it("el mismo encadenado: cada lista depende de la del nivel de arriba", () => {
    // Las claves viejas de la copia congelada, en las de hoy.
    const traduccion: Record<string, string> = { provincia_id: "nivel_1", canton_id: "nivel_2", distrito_id: "nivel_3" };
    expect(nuevos.map((d) => d.dependsOn)).toEqual(deHoy.map((d) => (d.dependsOn === undefined ? undefined : traduccion[d.dependsOn])));
  });
});

describe("R4, R9 — el lugar elegido es la lista mas honda con eleccion, en un solo parametro", () => {
  it("se para en cualquier nivel", () => {
    expect(lugarElegido({})).toEqual([]);
    expect(lugarElegido({ nivel_1: ["A1"] })).toEqual(["A1"]);
    expect(lugarElegido({ nivel_1: ["A1"], nivel_2: ["A2", "X2"] })).toEqual(["A2", "X2"]);
    expect(lugarElegido({ nivel_1: ["A1"], nivel_3: [] })).toEqual(["A1"]);
    expect(lugarElegido({ nivel_10: ["A10"], nivel_9: ["A9"], zona_id: ["z"] })).toEqual(["A10"]);
  });

  it("viaja como `lugar_id` y nunca con las claves viejas ni con nombres", () => {
    expect(seleccionALugar({ nivel_1: ["A1"], nivel_2: ["A2"] })).toEqual({ [PARAM_LUGAR]: ["A2"] });
    expect(seleccionALugar({ zona_id: ["z"] })).toEqual({});
  });
});

describe("R17, R18, R20, R21 — la URL al entrar (`traductorPorId`)", () => {
  const filtros = declararNiveles(catalogo(4));
  const t = traductorPorId();

  it("R17: `lugar_id` del nivel 4 rearma las listas subiendo hasta el nivel 1", () => {
    expect(comoObjeto(t.traducir(params("lugar_id=A4&q=x"), filtros))).toEqual({
      q: "x",
      nivel_4: "A4",
      nivel_3: "A3",
      nivel_2: "A2",
      nivel_1: "A1",
    });
  });

  it("R17: varios ids, y un id que ninguna lista ofrece se descarta sin error", () => {
    const r = comoObjeto(t.traducir(params("lugar_id=A2,B2,nope"), filtros));
    expect(r.nivel_2?.split(",").sort()).toEqual(["A2", "B2"]);
    expect(r.nivel_1?.split(",").sort()).toEqual(["A1", "B1"]);
    expect(comoObjeto(t.traducir(params("lugar_id=nope"), filtros))).toEqual({});
  });

  it("R18: los enlaces viejos se renombran tal cual (comas y repeticiones), y la barra los valida", () => {
    expect(comoObjeto(t.traducir(params("provincia_id=A1&canton_id=A2,B2&canton_id=X"), filtros))).toEqual({
      nivel_1: "A1",
      nivel_2: "A2,B2,X",
    });
    expect(comoObjeto(t.traducir(params("distrito_id=A3"), filtros))).toEqual({ nivel_3: "A3" });
  });

  it("R18: en un pais de 2 niveles, `distrito_id` no tiene lista y la barra lo descarta", () => {
    const dos = declararNiveles(catalogo(2));
    const r = t.traducir(params("distrito_id=A3"), dos);
    // El renombre deja `nivel_3`, que ninguna FilterDef montada declara: la barra lo ignora.
    expect(dos.some((d) => d.key === "nivel_3")).toBe(false);
    expect(comoObjeto(r)).toEqual({ nivel_3: "A3" });
  });

  it("si llegan `lugar_id` y un enlace viejo, gana `lugar_id`", () => {
    expect(comoObjeto(t.traducir(params("lugar_id=B2&provincia_id=A1"), filtros))).toEqual({ nivel_2: "B2", nivel_1: "B1" });
  });

  it("R21: una clave interna `nivel_<k>` en la URL se ignora", () => {
    expect(comoObjeto(t.traducir(params("nivel_2=A2&zona_id=z"), filtros))).toEqual({ zona_id: "z" });
  });

  it("R20: «Limpiar todo» borra `lugar_id` y las claves viejas de la pantalla", () => {
    expect(t.claves).toEqual(["lugar_id", "provincia_id", "canton_id", "distrito_id"]);
    expect(traductorPorNombre().claves).toEqual(["lugar_id", "provincia", "canton"]);
  });
});

describe("R19 — los enlaces viejos de novedades, por nombre (`traductorPorNombre`)", () => {
  const op: OpcionesDeLugar = {
    niveles: nivelesDe(3),
    lugares: [
      { id: "p1", nombre: "San José", padreId: null, profundidad: 1 },
      { id: "p2", nombre: "Alajuela", padreId: null, profundidad: 1 },
      { id: "c1", nombre: "Central", padreId: "p1", profundidad: 2 },
      { id: "c2", nombre: "Central", padreId: "p2", profundidad: 2 },
      { id: "c3", nombre: "Escazú", padreId: "p1", profundidad: 2 },
    ],
  };
  const filtros = declararNiveles(op);
  const t = traductorPorNombre();

  it("cada provincia pasa a los lugares de nivel 1 con ese nombre exacto", () => {
    expect(comoObjeto(t.traducir(params("provincia=San José"), filtros))).toEqual({ nivel_1: "p1" });
  });

  it("el canton se busca solo entre los hijos de las provincias traducidas", () => {
    expect(comoObjeto(t.traducir(params("provincia=San José&canton=Central"), filtros))).toEqual({ nivel_1: "p1", nivel_2: "c1" });
  });

  it("sin provincia, el canton casa con todos los de ese nombre (dos «Central»)", () => {
    expect(comoObjeto(t.traducir(params("canton=Central"), filtros)).nivel_2?.split(",").sort()).toEqual(["c1", "c2"]);
  });

  it("un nombre sin coincidencia se descarta", () => {
    expect(comoObjeto(t.traducir(params("provincia=Limón&canton=Nada"), filtros))).toEqual({});
  });
});
