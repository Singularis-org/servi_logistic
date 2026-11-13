import { describe, expect, it } from "vitest";

import { leerUbicacionCongelada, ubicacionSnapshotV1Schema } from "@/lib/types/ubicacion-snapshot";

// SLT-125 T2.2 (design §2.1, §4.4; R24, R25) — la lectura del `ubicacion_snapshot` de un cierre.
// Textos de Costa Rica literales a proposito (R42).

const COLUMNAS = { provinciaNombre: "San José", cantonNombre: "San José", distritoNombre: "Carmen" };

const SNAPSHOT = {
  v: 1,
  niveles: [
    { profundidad: 1, tipo: "Provincia", nombre: "San José (foto)", id: "p1" },
    { profundidad: 2, tipo: "Cantón", nombre: "San José (foto)", id: "c1" },
    { profundidad: 3, tipo: "Distrito", nombre: "Carmen (foto)", id: "d1" },
  ],
};

describe("R24: con un snapshot v1 valido, la ruta sale de niveles[].nombre", () => {
  it("en el orden del snapshot, con su id, y gana a las tres columnas", () => {
    expect(leerUbicacionCongelada({ ...COLUMNAS, ubicacionSnapshot: SNAPSHOT })).toEqual([
      { id: "p1", nombre: "San José (foto)" },
      { id: "c1", nombre: "San José (foto)" },
      { id: "d1", nombre: "Carmen (foto)" },
    ]);
  });

  it("respeta el orden del arreglo tal cual, sin reordenar", () => {
    const alReves = { ...SNAPSHOT, niveles: [...SNAPSHOT.niveles].reverse() };
    expect(leerUbicacionCongelada({ ...COLUMNAS, ubicacionSnapshot: alReves }).map((p) => p.nombre)).toEqual([
      "Carmen (foto)",
      "San José (foto)",
      "San José (foto)",
    ]);
  });

  it("admite un id nulo y no busca ningun nombre a partir del id", () => {
    const conIdNulo = { v: 1, niveles: [{ profundidad: 1, tipo: "Región", nombre: "Norte", id: null }] };
    expect(leerUbicacionCongelada({ ...COLUMNAS, ubicacionSnapshot: conIdNulo })).toEqual([
      { id: null, nombre: "Norte" },
    ]);
  });

  it("un pais de 4 niveles: tantos pasos como niveles traiga el snapshot", () => {
    const cuatro = {
      v: 1,
      niveles: [
        { profundidad: 1, tipo: "Región", nombre: "Metropolitana", id: "r1" },
        { profundidad: 2, tipo: "Comuna", nombre: "Providencia", id: "c1" },
        { profundidad: 3, tipo: "Barrio", nombre: "Bellavista", id: "b1" },
        { profundidad: 4, tipo: "Sector", nombre: "Sector Uno", id: "s1" },
      ],
    };
    expect(leerUbicacionCongelada({ ...COLUMNAS, ubicacionSnapshot: cuatro })).toHaveLength(4);
  });

  it("el esquema acepta la forma que escribe geo:backfill (CR sin distrito: dos niveles)", () => {
    const backfill = { v: 1, niveles: SNAPSHOT.niveles.slice(0, 2) };
    expect(ubicacionSnapshotV1Schema.safeParse(backfill).success).toBe(true);
  });
});

describe("R25: sin snapshot o con uno que no cumple la v1, las tres columnas como hoy", () => {
  it("sin snapshot (NULL): las tres columnas, con id nulo", () => {
    expect(leerUbicacionCongelada({ ...COLUMNAS, ubicacionSnapshot: null })).toEqual([
      { id: null, nombre: "San José" },
      { id: null, nombre: "San José" },
      { id: null, nombre: "Carmen" },
    ]);
  });

  it("sin distrito: dos pasos, sin tramo vacio", () => {
    expect(
      leerUbicacionCongelada({ ...COLUMNAS, distritoNombre: null, ubicacionSnapshot: undefined }).map((p) => p.nombre),
    ).toEqual(["San José", "San José"]);
  });

  it.each([
    ["otra version", { ...SNAPSHOT, v: 2 }],
    ["sin version", { niveles: SNAPSHOT.niveles }],
    ["niveles vacio", { v: 1, niveles: [] }],
    ["un nivel sin nombre", { v: 1, niveles: [{ profundidad: 1, tipo: "Provincia", id: "p1" }] }],
    ["un nombre que no es texto", { v: 1, niveles: [{ profundidad: 1, tipo: "Provincia", nombre: 7, id: "p1" }] }],
    ["profundidad no entera", { v: 1, niveles: [{ profundidad: 1.5, tipo: "Provincia", nombre: "X", id: "p1" }] }],
    ["un texto", "no es json"],
    ["un arreglo", [1, 2, 3]],
  ])("%s: no falla y lee las columnas", (_caso, snapshot) => {
    expect(leerUbicacionCongelada({ ...COLUMNAS, ubicacionSnapshot: snapshot }).map((p) => p.nombre)).toEqual([
      "San José",
      "San José",
      "Carmen",
    ]);
  });

  it("todas las columnas vacias y sin snapshot: ruta vacia", () => {
    expect(
      leerUbicacionCongelada({ provinciaNombre: null, cantonNombre: "", distritoNombre: null, ubicacionSnapshot: null }),
    ).toEqual([]);
  });
});
