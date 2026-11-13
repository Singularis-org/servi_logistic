import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { CoberturaService } from "@/lib/services/CoberturaService";
import type { AsignacionesDeLaEmpresa, ZonaAsignada } from "@/lib/services/geografia-dominio";
import { catalogoEnMemoria, type NodoEnMemoria } from "@/tests/fixtures/doble-catalogo-geografico";

// SLT-125 (R6; design §4.2 fila Cobertura, P5) — la descarga de cobertura en un pais de P niveles.
//
// PARTE DE SERVIDOR (T2.3): una fila por nodo de profundidad P, activo o no; los motivos «retirado del
// catalogo» de los niveles 1-3 con sus claves de hoy y desde el 4 `nivel_<k>_retirado`; Costa Rica
// (P = 3) igual que hoy. La parte de columnas (P columnas de lugar y el texto del motivo por el tipo del
// nivel) es de T3.1 (`cobertura-descarga-columnas.ts`, cliente) y se anade a este archivo alli.
//
// El catalogo es el doble en memoria: el repositorio solo lee `deLaEmpresa()` para las filas.

const MAESTRO = { rol: "maestro", usuarioId: "u-1" } as const;
const ZONA: ZonaAsignada = { id: "z-1", nombre: "Zona Uno", esCentral: false };

function conCatalogo(nodos: NodoEnMemoria[], asignaciones: Partial<AsignacionesDeLaEmpresa> = {}) {
  vi.spyOn(CatalogoGeograficoRepository.prototype, "deLaEmpresa").mockResolvedValue({
    catalogo: catalogoEnMemoria(nodos),
    asignaciones: {
      zonasPorNodo: asignaciones.zonasPorNodo ?? new Map(),
      nodosConMarca: asignaciones.nodosConMarca ?? new Set(),
    },
  } as Awaited<ReturnType<CatalogoGeograficoRepository["deLaEmpresa"]>>);
  const prisma = {
    // `listZonaIdsConTarifaGeneral`: modelo viejo y ninguna tarifa general.
    tarifaActivacion: { findFirst: vi.fn().mockResolvedValue(null) },
    tarifa: { findMany: vi.fn().mockResolvedValue([]) },
    tarifaValor: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return new CoberturaRepository(prisma as unknown as PrismaClient);
}

async function listar(repo: CoberturaRepository) {
  const r = await new CoberturaService(repo).listar(MAESTRO as never);
  if (r.status !== "ok") throw new Error(`cobertura: ${r.status}`);
  return r.items;
}

afterEach(() => vi.restoreAllMocks());

describe("R6 — cobertura en un pais de 4 niveles", () => {
  // Region > Comuna > Barrio > Sector. Dos sectores bajo B1 y uno bajo B2; B2 retirado.
  const NODOS: NodoEnMemoria[] = [
    { id: "r1", nombre: "Region" },
    { id: "c1", padreId: "r1", nombre: "Comuna" },
    { id: "b1", padreId: "c1", nombre: "Barrio Uno" },
    { id: "b2", padreId: "c1", nombre: "Barrio Dos", activo: false },
    { id: "s1", padreId: "b1", nombre: "Sector A" },
    { id: "s2", padreId: "b1", nombre: "Sector B", activo: false },
    { id: "s3", padreId: "b2", nombre: "Sector C" },
  ];

  it("una fila por nodo de profundidad 4, activos e inactivos, con su ruta de 4 pasos", async () => {
    const filas = await conCatalogo(NODOS).listDistritos();

    expect(filas.map((f) => f.ruta?.at(-1)?.id).sort()).toEqual(["s1", "s2", "s3"]);
    const s2 = filas.find((f) => f.ruta?.at(-1)?.id === "s2")!;
    expect(s2.ruta).toEqual([
      { id: "r1", nombre: "Region", activo: true },
      { id: "c1", nombre: "Comuna", activo: true },
      { id: "b1", nombre: "Barrio Uno", activo: true },
      { id: "s2", nombre: "Sector B", activo: false },
    ]);
    // Los campos de hoy son los niveles 1-3 de la ruta (R37).
    expect([s2.provincia.nombre, s2.canton.nombre, s2.distrito.nombre]).toEqual(["Region", "Comuna", "Barrio Uno"]);
    expect(s2.disponible).toBe(false);
  });

  it("zona y marca de la hoja por la herencia del catalogo (SLT-44), como hoy para un distrito", async () => {
    const filas = await conCatalogo(NODOS, {
      zonasPorNodo: new Map([["b1", [ZONA]]]),
      nodosConMarca: new Set(["c1"]),
    }).listDistritos();
    const s1 = filas.find((f) => f.ruta?.at(-1)?.id === "s1")!;
    expect(s1.zonas).toEqual([ZONA]);
    expect(s1.distrito.zonaEspecial).toBe(true);
    expect(filas.find((f) => f.ruta?.at(-1)?.id === "s3")!.zonas).toEqual([]);
  });

  it("motivos: el nivel 3 retirado conserva `distrito_retirado`; el 4, `nivel_4_retirado`", async () => {
    const items = await listar(conCatalogo(NODOS, { zonasPorNodo: new Map([["r1", [ZONA]]]) }));
    const motivo = (hoja: string) => items.find((d) => d.ruta?.at(-1)?.nombre === hoja)?.motivo;
    expect(motivo("Sector A")).toBeNull();
    expect(motivo("Sector B")).toBe("nivel_4_retirado");
    expect(motivo("Sector C")).toBe("distrito_retirado");
    // La ruta del DTO: ids y nombres, sin el flag (las columnas por nivel, T3.1).
    expect(items.find((d) => d.ruta?.at(-1)?.nombre === "Sector A")?.ruta).toEqual([
      { id: "r1", nombre: "Region" },
      { id: "c1", nombre: "Comuna" },
      { id: "b1", nombre: "Barrio Uno" },
      { id: "s1", nombre: "Sector A" },
    ]);
  });

  it("los niveles 1 y 2 retirados conservan `provincia_retirada` y `canton_retirado`", async () => {
    const nodos = [
      { id: "r1", nombre: "R1", activo: false },
      { id: "c1", padreId: "r1", nombre: "C1" },
      { id: "b1", padreId: "c1", nombre: "B1" },
      { id: "s1", padreId: "b1", nombre: "S1" },
      { id: "r2", nombre: "R2" },
      { id: "c2", padreId: "r2", nombre: "C2", activo: false },
      { id: "b2", padreId: "c2", nombre: "B2" },
      { id: "s2", padreId: "b2", nombre: "S2" },
    ];
    const items = await listar(conCatalogo(nodos, { zonasPorNodo: new Map([["r1", [ZONA]], ["r2", [ZONA]]]) }));
    expect(items.map((d) => [d.ruta?.at(-1)?.nombre, d.motivo])).toEqual([
      ["S1", "provincia_retirada"],
      ["S2", "canton_retirado"],
    ]);
  });

  it("orden nivel por nivel de la ruta, hasta el 4", async () => {
    const items = await listar(conCatalogo(NODOS));
    expect(items.map((d) => d.ruta!.map((p) => p.nombre).join("/"))).toEqual([
      "Region/Comuna/Barrio Dos/Sector C",
      "Region/Comuna/Barrio Uno/Sector A",
      "Region/Comuna/Barrio Uno/Sector B",
    ]);
  });
});

describe("R6 — cobertura en un pais de 2 niveles", () => {
  const NODOS: NodoEnMemoria[] = [
    { id: "e1", nombre: "Estado" },
    { id: "m1", padreId: "e1", nombre: "Municipio Uno" },
    { id: "m2", padreId: "e1", nombre: "Municipio Dos", activo: false },
  ];

  it("una fila por nodo de profundidad 2, activos e inactivos; sin nivel 3, su campo vacio", async () => {
    const filas = await conCatalogo(NODOS).listDistritos();
    expect(filas.map((f) => f.ruta?.map((p) => p.id))).toEqual([
      ["e1", "m1"],
      ["e1", "m2"],
    ]);
    expect(filas[0]).toMatchObject({
      provincia: { nombre: "Estado", activo: true },
      canton: { nombre: "Municipio Uno", activo: true },
      distrito: { nombre: "", activo: true },
    });
  });

  it("el nivel 2 retirado da `canton_retirado` (clave de hoy en todo pais)", async () => {
    const items = await listar(conCatalogo(NODOS, { zonasPorNodo: new Map([["e1", [ZONA]]]) }));
    expect(items.map((d) => [d.ruta?.at(-1)?.nombre, d.cobertura, d.motivo])).toEqual([
      ["Municipio Dos", false, "canton_retirado"],
      ["Municipio Uno", true, null],
    ]);
  });
});

describe("R6 — Costa Rica (P = 3) como hoy", () => {
  const NODOS: NodoEnMemoria[] = [
    { id: "p1", nombre: "San José" },
    { id: "c1", padreId: "p1", nombre: "Escazú" },
    { id: "d1", padreId: "c1", nombre: "San Rafael" },
    { id: "d2", padreId: "c1", nombre: "Bello Horizonte", activo: false },
  ];

  it("una fila por distrito; solo los distritos (no cantones ni provincias)", async () => {
    const filas = await conCatalogo(NODOS).listDistritos();
    expect(filas.map((f) => f.distrito.nombre).sort()).toEqual(["Bello Horizonte", "San Rafael"]);
  });

  it("los campos de hoy y el motivo de hoy; la ruta solo se añade", async () => {
    const items = await listar(conCatalogo(NODOS, { zonasPorNodo: new Map([["c1", [ZONA]]]) }));
    const { ruta, ...deHoy } = items[0]!;
    expect(deHoy).toEqual({
      provincia: "San José",
      canton: "Escazú",
      distrito: "Bello Horizonte",
      disponible: false,
      cobertura: false,
      motivo: "distrito_retirado",
      zonas: ["Zona Uno"],
      zonaUnica: { nombre: "Zona Uno", esCentral: false, tieneTarifaGeneral: false },
      zonaEspecial: false,
    });
    expect(ruta?.map((p) => p.nombre)).toEqual(["San José", "Escazú", "Bello Horizonte"]);
    expect(items[1]).toMatchObject({ distrito: "San Rafael", cobertura: true, motivo: null });
  });
});
