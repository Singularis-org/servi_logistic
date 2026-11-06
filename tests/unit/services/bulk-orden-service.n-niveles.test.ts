import { describe, expect, it, vi } from "vitest";

import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import {
  geoInputDesdeColumnasDeNivel,
  msgColumnaObligatoria,
  msgColumnaObligatoriaSiSeIndica,
} from "@/lib/services/geo-resolucion";
import {
  MSG_PAIS_NO_HABILITADO,
  msgNivelNoEncontrado,
  msgNivelRetirado,
  msgSinZona,
} from "@/lib/services/geo-ubicacion";
import {
  crearAsignaciones,
  crearCatalogo,
  type CatalogoGeografico,
  type ZonaAsignada,
} from "@/lib/services/geografia-dominio";
import { columnasGeoDePlantilla } from "@/lib/utils/plantilla-geo";
import type { CreateOrdenData, IOrdenRepository, LoteContexto } from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  CatalogoYAsignaciones,
  ICatalogoGeograficoRepository,
} from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import { notificadorNoOp } from "@/lib/notificaciones/notificadores";
import { SIN_CUPO } from "@/lib/interfaces/repositories/ICupoPlanRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { catalogoEnMemoria, type NodoEnMemoria } from "../../fixtures/doble-catalogo-geografico";

// SLT-45 (T6.2; design §2.3, §5, §8) — la carga masiva por SESION de un pais que no es de forma CR:
//   R31 — la ruta son las columnas de nivel desde la profundidad 1 hasta la primera vacia; un valor
//         despues de una vacia deja la fila en error bajo la columna vacia.
//   R13, R15, R16 — los aplica el motor de N niveles: no encontrado/retirado, pais no habilitado y
//         sin zona, con los mensajes de §5.
//   R29/R32 — un pais de forma CR (o sin catalogo) sigue con `provincia` + `canton_distrito`.
//   §8 — las cabeceras que lee el servidor son las de `columnasGeoDePlantilla`.

const TIENDA: Actor = { usuarioId: "tienda-1", rol: "adminTienda" };
const ZONA: ZonaAsignada = { id: "z1", nombre: "Zona uno", esCentral: false };

/** La geografia de v1 del doble: la que lee `resolveGeo` (forma CR). */
function buildRepo(): IOrdenRepository {
  return {
    findUsuarioFulfillment: vi.fn().mockResolvedValue(false),
    findEstatusIdByValue: vi.fn().mockResolvedValue("os-1"),
    findExistingRemisiones: vi.fn(async () => new Map()),
    findAllProvincias: vi.fn().mockResolvedValue([{ id: "p1", nombre: "Alta", disponible: true }]),
    findCantonesByProvinciaIds: vi
      .fn()
      .mockResolvedValue([{ id: "c1", nombre: "Media", provinciaId: "p1", disponible: true }]),
    findDistritosByCantonIds: vi
      .fn()
      .mockResolvedValue([
        { id: "d1", nombre: "Baja", cantonId: "c1", zonaId: "z1", esCentral: false, disponible: true },
      ]),
    createManyOrdenes: vi.fn(),
    createManyOrdenesConGuia: vi.fn(
      async (data: CreateOrdenData[], _b: number, _h: unknown, lote: LoteContexto) => ({
        creadas: data.map((d, i) => ({
          ordenId: `o${i + 1}`,
          numRemision: d.numRemision,
          numGuia: 1000 + i,
          estatusValue: "por_recolectar_en_tienda",
        })),
        cargaId: lote.cargaId ?? "carga-nueva",
        omitidas: [] as string[],
      }),
    ),
  } as unknown as IOrdenRepository;
}

const sinTarifa = { resolveTarifa: vi.fn(), resolveTarifas: vi.fn() } as unknown as ITarifaVigenteRepository;

/** El catalogo del doble con los nombres singulares indicados en sus tipos (`t1`, `t2`, …). */
function conTipos(nombres: string[], nodos: NodoEnMemoria[]): CatalogoGeografico {
  const base = catalogoEnMemoria(nodos);
  const tipos = base.tipos.map((t, i) => ({ ...t, nombreSingular: nombres[i] }));
  return crearCatalogo(base.paisId, tipos, base.nodos);
}

/** 3 niveles que NO son de forma CR: departamento, municipio, barrio. */
const TRES_NO_CR = conTipos(
  ["Departamento", "Municipio", "Barrio"],
  [
    { id: "A", nombre: "Alfa" },
    { id: "A1", padreId: "A", nombre: "Uno" },
    { id: "A1x", padreId: "A1", nombre: "Centro" },
    { id: "A2", padreId: "A", nombre: "Dos" },
    { id: "A3", padreId: "A", nombre: "Viejo", activo: false },
  ],
);

/** El mismo arbol que la geografia de v1 del doble, con los tipos de Costa Rica. */
const TRES_CR = conTipos(
  ["Provincia", "Cantón", "Distrito"],
  [
    { id: "p1", nombre: "Alta" },
    { id: "c1", padreId: "p1", nombre: "Media" },
    { id: "d1", padreId: "c1", nombre: "Baja" },
  ],
);

const DOS = conTipos(
  ["Departamento", "Municipio"],
  [
    { id: "B", nombre: "Beta" },
    { id: "B1", padreId: "B", nombre: "Uno" },
  ],
);

const CUATRO = conTipos(
  ["Region", "Provincia", "Comuna", "Sector"],
  [
    { id: "X", nombre: "Equis" },
    { id: "X1", padreId: "X", nombre: "Uno" },
    { id: "X2", padreId: "X1", nombre: "Dos" },
    { id: "X3", padreId: "X2", nombre: "Tres" },
  ],
);

function catalogoRepo(
  catalogo: CatalogoGeografico,
  zonas: { nodoId: string; zona: ZonaAsignada }[],
): ICatalogoGeograficoRepository & { deLaEmpresa: ReturnType<typeof vi.fn> } {
  const geo: CatalogoYAsignaciones = { catalogo, asignaciones: crearAsignaciones(zonas, []) };
  return { deLaEmpresa: vi.fn(async () => geo), dePais: vi.fn(async () => catalogo) };
}

function bulk(repo: IOrdenRepository, cat?: ICatalogoGeograficoRepository) {
  return new BulkOrdenService(repo, sinTarifa, notificadorNoOp, SIN_CUPO, cat);
}

function fila(numRemision: string, geo: Record<string, string>): RawRow {
  return {
    num_remision: numRemision,
    destinatario: "Ana",
    telefono: "88887777",
    direccion: "Calle 1",
    producto: "Caja",
    monto_cobrar: "",
    notas: "",
    ...geo,
  };
}

async function cargar(cat: ICatalogoGeograficoRepository | undefined, filas: RawRow[]) {
  const repo = buildRepo();
  const r = await bulk(repo, cat).cargarMasiva(filas, TIENDA);
  if (r.status !== "ok") throw new Error(`status ${r.status}`);
  const creadas = vi.mocked(repo.createManyOrdenesConGuia).mock.calls[0]?.[0] ?? [];
  const errores = r.summary.filas.filter((f) => f.resultado === "error");
  return { summary: r.summary, errores, creadas };
}

describe("R31 — `geoInputDesdeColumnasDeNivel`: la ruta hasta la primera columna vacia", () => {
  const columnas = [{ key: "departamento" }, { key: "municipio" }, { key: "barrio" }];
  const extraer = geoInputDesdeColumnasDeNivel(columnas);

  it("todas llenas → la ruta entera, recortada; la direccion literal aparte", () => {
    expect(extraer({ departamento: " Alfa ", municipio: "Uno", barrio: "Centro", direccion: " Calle 1 " })).toEqual({
      ok: true,
      entrada: { tipo: "ruta", nombres: ["Alfa", "Uno", "Centro"] },
      direccion: "Calle 1",
    });
  });

  it("la ultima vacia (o ausente) → la ruta se corta ahi", () => {
    expect(extraer({ departamento: "Alfa", municipio: "Uno", barrio: "  " })).toMatchObject({
      ok: true,
      entrada: { tipo: "ruta", nombres: ["Alfa", "Uno"] },
    });
    expect(extraer({ departamento: "Alfa" })).toMatchObject({ ok: true, entrada: { nombres: ["Alfa"] } });
  });

  it("un valor despues de una vacia → error bajo la columna vacia, que nombra la siguiente con valor", () => {
    expect(extraer({ departamento: "Alfa", municipio: "", barrio: "Centro" })).toEqual({
      ok: false,
      fieldErrors: { municipio: ["municipio es obligatoria si se indica barrio"] },
    });
    expect(extraer({ departamento: "", municipio: "", barrio: "Centro" })).toEqual({
      ok: false,
      fieldErrors: { departamento: [msgColumnaObligatoriaSiSeIndica("departamento", "barrio")] },
    });
  });

  it("todas vacias → error bajo la primera columna", () => {
    expect(extraer({ departamento: "", municipio: "" })).toEqual({
      ok: false,
      fieldErrors: { departamento: [msgColumnaObligatoria("departamento")] },
    });
  });
});

describe("R31 + R13/R16 — carga por sesion de un pais de 3 niveles que no es de forma CR", () => {
  it("las cabeceras que lee el servidor son las de `columnasGeoDePlantilla`", () => {
    expect(columnasGeoDePlantilla(TRES_NO_CR)?.map((c) => c.key)).toEqual(["departamento", "municipio", "barrio"]);
  });

  it("ruta completa → crea con el nodo de profundidad 3 y sus 3 FK", async () => {
    const { summary, errores, creadas } = await cargar(catalogoRepo(TRES_NO_CR, [{ nodoId: "A1x", zona: ZONA }]), [
      fila("R-1", { departamento: "alfa", municipio: "UNO", barrio: "Centro" }),
    ]);
    expect(errores).toEqual([]);
    expect(summary.creadas).toBe(1);
    expect(creadas[0]).toMatchObject({
      numRemision: "R-1",
      provinciaId: "A",
      cantonId: "A1",
      distritoId: "A1x",
      nodoGeograficoId: "A1x",
      zonaId: "z1",
      direccion: "Calle 1",
    });
  });

  it("ruta hasta la primera vacia → resuelve el nodo de profundidad 2 (distrito vacio)", async () => {
    const { errores, creadas } = await cargar(catalogoRepo(TRES_NO_CR, [{ nodoId: "A2", zona: ZONA }]), [
      fila("R-1", { departamento: "Alfa", municipio: "Dos", barrio: "" }),
    ]);
    expect(errores).toEqual([]);
    expect(creadas[0]).toMatchObject({ provinciaId: "A", cantonId: "A2", distritoId: null, nodoGeograficoId: "A2" });
  });

  it("hueco → error de esa columna, sin llegar al motor ni crear nada", async () => {
    const { errores, creadas } = await cargar(catalogoRepo(TRES_NO_CR, [{ nodoId: "A1x", zona: ZONA }]), [
      fila("R-1", { departamento: "Alfa", municipio: "", barrio: "Centro" }),
    ]);
    expect(creadas).toEqual([]);
    expect(errores).toEqual([
      {
        fila: 1,
        numRemision: "R-1",
        resultado: "error",
        errores: { municipio: ["municipio es obligatoria si se indica barrio"] },
      },
    ]);
  });

  it("R13: no encontrado y retirado, con nivel y nombre bajo `ubicacion`", async () => {
    const { errores } = await cargar(catalogoRepo(TRES_NO_CR, [{ nodoId: "A", zona: ZONA }]), [
      fila("R-1", { departamento: "Alfa", municipio: "Nadie" }),
      fila("R-2", { departamento: "Alfa", municipio: "Viejo" }),
    ]);
    expect(errores.map((e) => e.errores)).toEqual([
      { ubicacion: [msgNivelNoEncontrado(2, "Nadie", "Alfa")] },
      { ubicacion: [msgNivelRetirado(2, "Viejo")] },
    ]);
  });

  it("R16: sin zona que cubra el nodo → «sin zona» y no se crea", async () => {
    const { errores, creadas } = await cargar(catalogoRepo(TRES_NO_CR, []), [
      fila("R-1", { departamento: "Alfa", municipio: "Uno", barrio: "Centro" }),
    ]);
    expect(creadas).toEqual([]);
    expect(errores[0].errores).toEqual({ ubicacion: [msgSinZona("Centro")] });
    expect(errores[0].errores).toEqual({ ubicacion: ["la ubicacion 'Centro' no tiene zona asignada"] });
  });

  it("R15 antes que R16: la profundidad 1 no se guarda aunque tenga zona", async () => {
    const { errores } = await cargar(catalogoRepo(TRES_NO_CR, [{ nodoId: "A", zona: ZONA }]), [
      fila("R-1", { departamento: "Alfa" }),
    ]);
    expect(errores[0].errores).toEqual({ ubicacion: [MSG_PAIS_NO_HABILITADO] });
  });
});

describe("R15 — pais de 2 o 4 niveles: cada fila resuelta sale con «pais no habilitado»", () => {
  it.each([
    ["2 niveles", DOS, { departamento: "Beta", municipio: "Uno" }, "B1"],
    ["4 niveles", CUATRO, { region: "Equis", provincia: "Uno", comuna: "Dos", sector: "Tres" }, "X3"],
  ])("pais de %s", async (_n, cat, geo, nodoConZona) => {
    const { errores, creadas } = await cargar(catalogoRepo(cat, [{ nodoId: nodoConZona, zona: ZONA }]), [
      fila("R-1", geo),
    ]);
    expect(creadas).toEqual([]);
    expect(errores).toEqual([
      { fila: 1, numRemision: "R-1", resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
    ]);
  });

  it("4 niveles: la columna `provincia` es la profundidad 2 del pais, no la de forma CR", async () => {
    const { errores } = await cargar(catalogoRepo(CUATRO, [{ nodoId: "X1", zona: ZONA }]), [
      fila("R-1", { region: "Equis", provincia: "Nadie" }),
    ]);
    expect(errores[0].errores).toEqual({ ubicacion: [msgNivelNoEncontrado(2, "Nadie", "Equis")] });
  });
});

describe("R29/R32 — un pais de forma CR sigue con `provincia` + `canton_distrito`", () => {
  it("con catalogo de forma CR: `resolveGeo` y el nodo = distrito, como hoy", async () => {
    const { errores, creadas } = await cargar(catalogoRepo(TRES_CR, [{ nodoId: "d1", zona: ZONA }]), [
      fila("R-1", { provincia: "Alta", canton_distrito: "Media (Baja)" }),
    ]);
    expect(errores).toEqual([]);
    expect(creadas[0]).toMatchObject({ provinciaId: "p1", cantonId: "c1", distritoId: "d1", nodoGeograficoId: "d1" });
  });

  it("con catalogo de forma CR: los mensajes de la plantilla de hoy no cambian", async () => {
    const { errores } = await cargar(catalogoRepo(TRES_CR, [{ nodoId: "d1", zona: ZONA }]), [
      fila("R-1", { provincia: "", canton_distrito: "Media (Baja)" }),
    ]);
    expect(errores[0].errores).toEqual({ provincia: ["provincia es obligatoria"] });
  });

  it("sin catalogo inyectado (dobles anteriores): el camino de hoy", async () => {
    const { errores, creadas } = await cargar(undefined, [
      fila("R-1", { provincia: "Alta", canton_distrito: "Media (Baja)" }),
    ]);
    expect(errores).toEqual([]);
    expect(creadas[0]).toMatchObject({ distritoId: "d1", nodoGeograficoId: "d1" });
  });
});
