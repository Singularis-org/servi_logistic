import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { CoberturaService } from "@/lib/services/CoberturaService";
import type { AsignacionesDeLaEmpresa, ZonaAsignada } from "@/lib/services/geografia-dominio";
import { catalogoEnMemoria, type NodoEnMemoria } from "@/tests/fixtures/doble-catalogo-geografico";
import {
  columnasDescargaCobertura,
  filaCobertura,
  motivoSinCoberturaLabel,
} from "@/app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { etiquetasDePais } from "@/lib/types/pais";
import { ETIQUETAS_CR, NIVELES_CR } from "@/tests/fabricas/etiquetas-geograficas";

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

// ─── T3.1 — PARTE DE CLIENTE: columnas de lugar y texto del motivo por el tipo del nivel ────────────

const nivelesDe = (...singulares: string[]): NivelDeFiltroDTO[] =>
  singulares.map((singular, i) => ({ profundidad: i + 1, singular, plural: singular }));

describe("R6 (cliente) — el archivo de cobertura de un pais de 4 niveles", () => {
  const NODOS: NodoEnMemoria[] = [
    { id: "r1", nombre: "Region" },
    { id: "c1", padreId: "r1", nombre: "Comuna" },
    { id: "b1", padreId: "c1", nombre: "Barrio Uno" },
    { id: "b2", padreId: "c1", nombre: "Barrio Dos", activo: false },
    { id: "s1", padreId: "b1", nombre: "Sector A" },
    { id: "s2", padreId: "b1", nombre: "Sector B", activo: false },
    { id: "s3", padreId: "b2", nombre: "Sector C" },
  ];
  const NIVELES = nivelesDe("Región", "Comuna", "Barrio", "Sector");
  const ETIQUETAS = etiquetasDePais({
    nivel1Singular: "Región",
    nivel1Plural: "Regiones",
    nivel2Singular: "Comuna",
    nivel2Plural: "Comunas",
    nivel3Singular: "Barrio",
    nivel3Plural: "Barrios",
  });

  it("cuatro columnas de lugar al principio, con el tipo de cada nivel, y una fila por sector", async () => {
    expect(columnasDescargaCobertura(ETIQUETAS, NIVELES).slice(0, 5)).toEqual([
      { clave: "provincia", encabezado: "Región" },
      { clave: "canton", encabezado: "Comuna" },
      { clave: "distrito", encabezado: "Barrio" },
      { clave: "nivel_4", encabezado: "Sector" },
      { clave: "activo", encabezado: "Activo" },
    ]);
    const items = await listar(conCatalogo(NODOS, { zonasPorNodo: new Map([["r1", [ZONA]]]) }));
    const filas = items.map(filaCobertura(ETIQUETAS, NIVELES));
    expect(filas.map((f) => [f.provincia, f.canton, f.distrito, f.nivel_4])).toEqual([
      ["Region", "Comuna", "Barrio Dos", "Sector C"],
      ["Region", "Comuna", "Barrio Uno", "Sector A"],
      ["Region", "Comuna", "Barrio Uno", "Sector B"],
    ]);
  });

  it("el motivo del nivel 4 retirado nombra su tipo; el del nivel 3, el de hoy con el tipo del país", async () => {
    const items = await listar(conCatalogo(NODOS, { zonasPorNodo: new Map([["r1", [ZONA]]]) }));
    const motivos = items.map(filaCobertura(ETIQUETAS, NIVELES)).map((f) => [f.nivel_4, f.motivo]);
    expect(motivos).toEqual([
      ["Sector C", "Barrio retirado del catálogo"],
      ["Sector A", null],
      ["Sector B", "Sector retirado del catálogo"],
    ]);
  });

  it("R42: el texto sale del tipo del país, no de un literal (otro nombre, otro texto)", () => {
    const otros = nivelesDe("Región", "Comuna", "Barrio", "Manzana", "Lote");
    const textos = motivoSinCoberturaLabel(ETIQUETAS, otros);
    expect(textos.nivel_4_retirado).toBe("Manzana retirado del catálogo");
    expect(textos.nivel_5_retirado).toBe("Lote retirado del catálogo");
  });
});

describe("R6 (cliente) — el archivo de cobertura de un pais de 2 niveles", () => {
  const NODOS: NodoEnMemoria[] = [
    { id: "e1", nombre: "Estado" },
    { id: "m1", padreId: "e1", nombre: "Municipio Uno" },
    { id: "m2", padreId: "e1", nombre: "Municipio Dos", activo: false },
  ];
  const NIVELES = nivelesDe("Estado", "Municipio");
  const ETIQUETAS = etiquetasDePais({
    nivel1Singular: "Estado",
    nivel1Plural: "Estados",
    nivel2Singular: "Municipio",
    nivel2Plural: "Municipios",
    nivel3Singular: "",
    nivel3Plural: "",
  });

  it("dos columnas de lugar (sin una tercera vacía) y el motivo del nivel 2 con su tipo", async () => {
    const columnas = columnasDescargaCobertura(ETIQUETAS, NIVELES);
    expect(columnas.slice(0, 3).map((c) => c.clave)).toEqual(["provincia", "canton", "activo"]);
    expect(columnas.slice(0, 2).map((c) => c.encabezado)).toEqual(["Estado", "Municipio"]);

    const items = await listar(conCatalogo(NODOS, { zonasPorNodo: new Map([["e1", [ZONA]]]) }));
    const filas = items.map(filaCobertura(ETIQUETAS, NIVELES));
    expect(filas.map((f) => [f.provincia, f.canton, f.motivo])).toEqual([
      ["Estado", "Municipio Dos", "Municipio retirado del catálogo"],
      ["Estado", "Municipio Uno", null],
    ]);
    expect(filas.every((f) => !("distrito" in f))).toBe(true);
  });
});

describe("R6 (cliente) — Costa Rica (P = 3): columnas y textos de hoy", () => {
  it("las tres columnas de hoy y los tres motivos de nivel con sus textos de hoy, sin motivos de nivel ≥ 4", () => {
    expect(columnasDescargaCobertura(ETIQUETAS_CR, NIVELES_CR)).toEqual(columnasDescargaCobertura(ETIQUETAS_CR));
    expect(motivoSinCoberturaLabel(ETIQUETAS_CR, NIVELES_CR)).toEqual({
      provincia_retirada: "Provincia retirada del catálogo",
      canton_retirado: "Cantón retirado del catálogo",
      distrito_retirado: "Distrito retirado del catálogo",
      sin_zona: "Sin zona asignada",
      varias_zonas: "Asignado a varias zonas",
    });
  });
});
