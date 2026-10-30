import { describe, expect, it } from "vitest";

import { estaDisponible } from "@/lib/repositories/_shared/geografia-activa";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
import {
  CatalogoGeograficoInconsistente,
  ancestros,
  crearAsignaciones,
  crearCatalogo,
  esZonaEspecial,
  estaActivo,
  nodo,
  nodosBajo,
  nodosDeProfundidad,
  tiposDelPais,
  zonaQueCubre,
  zonasCandidatas,
  type NodoDelCatalogo,
  type TipoDeNivel,
  type ZonaAsignada,
} from "@/lib/services/geografia-dominio";

// SLT-44 (T2.2; design §2, §10) — el dominio de la geografia, sin base de datos. Corre sin
// `DATABASE_URL`: si algun dia necesitara una conexion, este archivo dejaria de poder correr aqui.
//
// El catalogo es de cuatro niveles a mano, para que «N niveles» no se pruebe solo con tres:
//
//   P1 ─┬─ C1 ─┬─ D1 ─── B1
//       │      ├─ D2
//       │      └─ D3
//       └─ C2 ─── D4
//   P2 ─── C3 ─── D5

const TIPOS: TipoDeNivel[] = [1, 2, 3, 4].map((n) => ({
  id: `t${n}`,
  clave: `nivel_${n}`,
  nombreSingular: `Nivel ${n}`,
  nombrePlural: `Niveles ${n}`,
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
}));

function n(id: string, padreId: string | null, profundidad: number, activo = true): NodoDelCatalogo {
  return {
    id,
    padreId,
    profundidad,
    tipoId: `t${profundidad}`,
    nombre: `Nombre ${id}`,
    nombreNormalizado: `nombre ${id.toLowerCase()}`,
    codigoOficial: null,
    activo,
  };
}

// El orden de llegada es el del catalogo (por nombre en la base): se mezcla a proposito para que
// «en el orden del catalogo» no coincida con el orden de alta.
const NODOS: NodoDelCatalogo[] = [
  n("P2", null, 1),
  n("P1", null, 1),
  n("C3", "P2", 2),
  n("C1", "P1", 2),
  n("C2", "P1", 2),
  n("D5", "C3", 3),
  n("D3", "C1", 3),
  n("D1", "C1", 3),
  n("D4", "C2", 3),
  n("D2", "C1", 3),
  n("B1", "D1", 4),
];

const cat = crearCatalogo("XA", TIPOS, NODOS);
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

const Z: Record<string, ZonaAsignada> = {
  norte: { id: "z-norte", nombre: "Norte", esCentral: false },
  sur: { id: "z-sur", nombre: "Sur", esCentral: false },
  centro: { id: "z-centro", nombre: "Centro", esCentral: true },
};

describe("SLT-44 R2 — ancestros y descendientes", () => {
  it("los ancestros van del padre a la raiz", () => {
    expect(ids(ancestros(cat, "B1"))).toEqual(["D1", "C1", "P1"]);
    expect(ids(ancestros(cat, "D4"))).toEqual(["C2", "P1"]);
  });

  it("una raiz no tiene ancestros y una hoja no tiene descendientes", () => {
    expect(ancestros(cat, "P1")).toEqual([]);
    expect(nodosBajo(cat, "B1")).toEqual([]);
    expect(nodosBajo(cat, "D2")).toEqual([]);
  });

  it("los descendientes salen todos, en preorden y con los hermanos en el orden del catalogo", () => {
    expect(ids(nodosBajo(cat, "P1"))).toEqual(["C1", "D3", "D1", "B1", "D2", "C2", "D4"]);
    expect(ids(nodosBajo(cat, "C1"))).toEqual(["D3", "D1", "B1", "D2"]);
  });

  it("los nodos de una profundidad salen en el orden del catalogo", () => {
    expect(ids(nodosDeProfundidad(cat, 1))).toEqual(["P2", "P1"]);
    expect(ids(nodosDeProfundidad(cat, 3))).toEqual(["D5", "D3", "D1", "D4", "D2"]);
    expect(nodosDeProfundidad(cat, 5)).toEqual([]);
  });

  it("los hijos de cada padre conservan el orden del catalogo; `null` son las raices", () => {
    expect(ids(cat.hijos.get(null) ?? [])).toEqual(["P2", "P1"]);
    expect(ids(cat.hijos.get("C1") ?? [])).toEqual(["D3", "D1", "D2"]);
  });
});

describe("SLT-44 R3 — un id que no esta en el catalogo «no existe»", () => {
  const asig = crearAsignaciones([{ nodoId: "P1", zona: Z.norte }], ["P1"]);

  it("no existe es distinto de inactivo", () => {
    expect(nodo(cat, "ajeno")).toBeNull();
    expect(estaActivo(cat, "ajeno")).toBeNull();
    const retirado = crearCatalogo("XA", TIPOS, [n("R", null, 1, false)]);
    expect(estaActivo(retirado, "R")).toBe(false);
  });

  it("sin ancestros, descendientes, zona ni marca", () => {
    expect(ancestros(cat, "ajeno")).toEqual([]);
    expect(nodosBajo(cat, "ajeno")).toEqual([]);
    expect(zonasCandidatas(cat, asig, "ajeno")).toBeNull();
    expect(zonaQueCubre(cat, asig, "ajeno")).toBeNull();
    expect(esZonaEspecial(cat, asig, "ajeno")).toBe(false);
  });

  it("un `padreId` que no esta en el catalogo lanza `CatalogoGeograficoInconsistente` con el id", () => {
    const roto = crearCatalogo("XA", TIPOS, [n("C9", "P-fantasma", 2), n("D9", "C9", 3)]);
    expect(() => ancestros(roto, "D9")).toThrow(CatalogoGeograficoInconsistente);
    expect(() => ancestros(roto, "D9")).toThrow(/C9/);
    expect(() => estaActivo(roto, "D9")).toThrow(CatalogoGeograficoInconsistente);
  });

  it("un ciclo de padres no itera sin tope", () => {
    const ciclo = crearCatalogo("XA", TIPOS, [n("A", "B", 2), n("B", "A", 2)]);
    expect(() => ancestros(ciclo, "A")).toThrow(CatalogoGeograficoInconsistente);
    expect(() => nodosBajo(ciclo, "A")).toThrow(CatalogoGeograficoInconsistente);
  });
});

describe("SLT-44 R4 — los tipos de nivel del pais", () => {
  it("devuelve los tipos con su clave y sus nombres singular y plural", () => {
    const tipos = tiposDelPais(cat);
    expect(tipos.map((t) => [t.clave, t.nombreSingular, t.nombrePlural])).toEqual([
      ["nivel_1", "Nivel 1", "Niveles 1"],
      ["nivel_2", "Nivel 2", "Niveles 2"],
      ["nivel_3", "Nivel 3", "Niveles 3"],
      ["nivel_4", "Nivel 4", "Niveles 4"],
    ]);
  });
});

describe("SLT-44 R5 — activo en cascada", () => {
  const BOOLS = [true, false] as const;

  it("tres niveles: las 8 combinaciones coinciden con `estaDisponible`", () => {
    let casos = 0;
    for (const p of BOOLS)
      for (const c of BOOLS)
        for (const d of BOOLS) {
          const k = crearCatalogo("XA", TIPOS, [n("p", null, 1, p), n("c", "p", 2, c), n("d", "c", 3, d)]);
          expect(estaActivo(k, "d"), `p=${p} c=${c} d=${d}`).toBe(
            estaDisponible({ provincia: p, canton: c, distrito: d }),
          );
          casos++;
        }
    expect(casos).toBe(8);
  });

  it("dos niveles: las 4 combinaciones coinciden con `estaDisponible`", () => {
    let casos = 0;
    for (const p of BOOLS)
      for (const c of BOOLS) {
        const k = crearCatalogo("XA", TIPOS, [n("p", null, 1, p), n("c", "p", 2, c)]);
        expect(estaActivo(k, "c"), `p=${p} c=${c}`).toBe(estaDisponible({ provincia: p, canton: c }));
        casos++;
      }
    expect(casos).toBe(4);
  });

  it("un nodo de profundidad 4 con el bisabuelo retirado esta inactivo", () => {
    const k = crearCatalogo("XA", TIPOS, [
      n("p", null, 1, false),
      n("c", "p", 2),
      n("d", "c", 3),
      n("b", "d", 4),
    ]);
    expect(estaActivo(k, "b")).toBe(false);
    expect(estaActivo(cat, "B1")).toBe(true);
  });
});

describe("SLT-44 R6 — la zona que cubre un nodo sale de la asignacion mas especifica", () => {
  it("asignacion en el propio nodo", () => {
    const asig = crearAsignaciones([{ nodoId: "B1", zona: Z.norte }], []);
    expect(zonasCandidatas(cat, asig, "B1")).toEqual({ nodoId: "B1", zonas: [Z.norte] });
    expect(zonaQueCubre(cat, asig, "B1")).toEqual(Z.norte);
  });

  it("asignacion heredada del padre y del abuelo", () => {
    const delPadre = crearAsignaciones([{ nodoId: "D1", zona: Z.sur }], []);
    expect(zonaQueCubre(cat, delPadre, "B1")).toEqual(Z.sur);
    expect(zonasCandidatas(cat, delPadre, "B1")?.nodoId).toBe("D1");

    const delAbuelo = crearAsignaciones([{ nodoId: "C1", zona: Z.centro }], []);
    expect(zonaQueCubre(cat, delAbuelo, "B1")).toEqual(Z.centro);
    expect(zonaQueCubre(cat, delAbuelo, "D2")).toEqual(Z.centro);
    expect(zonaQueCubre(cat, delAbuelo, "D4")).toBeNull();
  });

  it("dos zonas en el nodo mas cercano y una sola en el abuelo da `null`: no sube", () => {
    const asig = crearAsignaciones(
      [
        { nodoId: "D1", zona: Z.norte },
        { nodoId: "D1", zona: Z.sur },
        { nodoId: "C1", zona: Z.centro },
      ],
      [],
    );
    expect(zonasCandidatas(cat, asig, "B1")).toEqual({ nodoId: "D1", zonas: [Z.norte, Z.sur] });
    expect(zonaQueCubre(cat, asig, "B1")).toBeNull();
  });

  it("sin asignacion en ninguna parte de la cadena, ninguna", () => {
    const asig = crearAsignaciones([{ nodoId: "P2", zona: Z.norte }], []);
    expect(zonasCandidatas(cat, asig, "B1")).toBeNull();
    expect(zonaQueCubre(cat, asig, "B1")).toBeNull();
  });

  it("la mas especifica gana a la del ancestro", () => {
    const asig = crearAsignaciones(
      [
        { nodoId: "P1", zona: Z.centro },
        { nodoId: "D1", zona: Z.sur },
      ],
      [],
    );
    expect(zonaQueCubre(cat, asig, "B1")).toEqual(Z.sur);
    expect(zonaQueCubre(cat, asig, "D2")).toEqual(Z.centro);
  });
});

describe("SLT-44 R7 — la marca especial se hereda de los ancestros", () => {
  it("marca propia", () => {
    expect(esZonaEspecial(cat, crearAsignaciones([], ["D2"]), "D2")).toBe(true);
  });

  it("marca heredada del canton y de la provincia", () => {
    expect(esZonaEspecial(cat, crearAsignaciones([], ["C1"]), "B1")).toBe(true);
    expect(esZonaEspecial(cat, crearAsignaciones([], ["P1"]), "D4")).toBe(true);
  });

  it("sin marca en la cadena, ninguna; la de un descendiente no sube", () => {
    expect(esZonaEspecial(cat, crearAsignaciones([], ["D5"]), "D4")).toBe(false);
    expect(esZonaEspecial(cat, crearAsignaciones([], ["B1"]), "D1")).toBe(false);
  });
});

describe("SLT-44 R8 — con asignaciones solo a distritos, el dominio da lo de hoy", () => {
  // «Hoy» (ficha 374 y SL-38): las zonas candidatas de un distrito son SUS filas de `zona_distrito`,
  // la zona es el colapso 1/0/>1 de esas filas y la marca es su fila de marcas. Provincias y
  // cantones no tienen ni zona ni marca.
  const TRES_NIVELES = crearCatalogo(
    "CR",
    TIPOS.slice(0, 3),
    NODOS.filter((x) => x.profundidad <= 3),
  );
  const filasDeHoy: Record<string, ZonaAsignada[]> = {
    D1: [Z.norte],
    D2: [Z.norte, Z.sur],
    D3: [],
    D4: [Z.centro],
    D5: [],
  };
  const marcasDeHoy = new Set(["D2", "D5"]);
  const asig = crearAsignaciones(
    Object.entries(filasDeHoy).flatMap(([nodoId, zonas]) => zonas.map((zona) => ({ nodoId, zona }))),
    marcasDeHoy,
  );

  it("cada distrito: mismas zonas candidatas, misma zona resuelta y misma marca", () => {
    for (const d of nodosDeProfundidad(TRES_NIVELES, 3)) {
      const deHoy = filasDeHoy[d.id];
      expect(zonasCandidatas(TRES_NIVELES, asig, d.id)?.zonas ?? [], d.id).toEqual(deHoy);
      expect(zonaQueCubre(TRES_NIVELES, asig, d.id), d.id).toEqual(zonaUnicaDeDistrito(deHoy));
      expect(esZonaEspecial(TRES_NIVELES, asig, d.id), d.id).toBe(marcasDeHoy.has(d.id));
    }
  });

  it("cada provincia y cada canton: ninguna zona y ninguna marca", () => {
    for (const x of [...nodosDeProfundidad(TRES_NIVELES, 1), ...nodosDeProfundidad(TRES_NIVELES, 2)]) {
      expect(zonasCandidatas(TRES_NIVELES, asig, x.id), x.id).toBeNull();
      expect(zonaQueCubre(TRES_NIVELES, asig, x.id), x.id).toBeNull();
      expect(esZonaEspecial(TRES_NIVELES, asig, x.id), x.id).toBe(false);
    }
  });
});
