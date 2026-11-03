import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeoRepository } from "@/lib/repositories/GeoRepository";

// SLT-75 (R14) — `listArbol` proyecta en cada distrito la lista COMPLETA de sus zonas, ordenada
// por nombre, y conserva el colapso 1/0/>1 de `zonaId`/`zonaNombre`.
//
// ⚠️ POR QUE CON UN DOBLE. Con el indice unico `(organizacion_id, distrito_id)` de `zona_distrito`,
// Postgres ya no deja sembrar dos zonas de la misma empresa en un distrito, asi que el ORDEN de la
// lista no se puede medir contra la base. Lo que depende de la base (que las zonas de otra empresa
// no lleguen) vive en `tests/integration/db/zona-distrito-unica.test.ts`.

//
// SLT-44 (design §10): `listArbol` sale del catalogo (`nodo_geografico`) y de las asignaciones de
// la empresa. Se reescribe EL DOBLE a ese modelo; las salidas esperadas no cambian.

function nodo(id: string, nombre: string, profundidad: number, padreId: string | null) {
  return {
    id,
    nombre,
    nombreNormalizado: nombre.toLowerCase(),
    profundidad,
    padreId,
    tipoId: `t${profundidad}`,
    codigoOficial: null,
    activo: true,
  };
}

function prismaConDistrito(zonas: { id: string; nombre: string }[]) {
  const prisma = {
    organizacion: { findFirst: vi.fn().mockResolvedValue({ paisId: "CR" }) },
    tipoNivelGeografico: { findMany: vi.fn().mockResolvedValue([]) },
    nodoGeografico: {
      findMany: vi.fn().mockResolvedValue([
        nodo("p1", "Provincia Sintetica", 1, null),
        nodo("c1", "Canton Sintetico", 2, "p1"),
        nodo("d1", "Distrito Sintetico", 3, "c1"),
      ]),
    },
    zonaDistrito: {
      findMany: vi
        .fn()
        .mockResolvedValue(zonas.map((z) => ({ distritoId: "d1", zona: { ...z, esCentral: false } }))),
    },
    distritoZonaEspecial: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

async function distritoDelArbol(zonas: { id: string; nombre: string }[]) {
  const repo = new GeoRepository(prismaConDistrito(zonas) as unknown as PrismaClient);
  const arbol = await repo.listArbol();
  return arbol[0].cantones[0].distritos[0];
}

describe("SLT-75 R14 — `listArbol` trae todas las zonas del distrito", () => {
  it("con varias zonas: la lista completa ordenada por nombre, y el colapso sigue dando `null`", async () => {
    const d = await distritoDelArbol([
      { id: "zN", nombre: "Zona Ñ" },
      { id: "zB", nombre: "Zona Bravo" },
      { id: "zA", nombre: "Zona Alfa" },
    ]);

    expect(d.zonas).toEqual([
      { id: "zA", nombre: "Zona Alfa" },
      { id: "zB", nombre: "Zona Bravo" },
      { id: "zN", nombre: "Zona Ñ" },
    ]);
    expect(d.zonaId).toBeNull();
    expect(d.zonaNombre).toBeNull();
  });

  it("con una zona: la lista la trae y el colapso tambien", async () => {
    const d = await distritoDelArbol([{ id: "zA", nombre: "Zona Alfa" }]);

    expect(d.zonas).toEqual([{ id: "zA", nombre: "Zona Alfa" }]);
    expect(d.zonaId).toBe("zA");
    expect(d.zonaNombre).toBe("Zona Alfa");
  });

  it("sin zonas: lista vacia, no `undefined`", async () => {
    const d = await distritoDelArbol([]);

    expect(d.zonas).toEqual([]);
    expect(d.zonaId).toBeNull();
  });
});
