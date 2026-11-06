import { describe, it, expect, vi } from "vitest";

import {
  BulkOrdenService,
  MSG_MOTOR_SIN_CATALOGO,
  type EntradaDelMotor,
} from "@/lib/services/BulkOrdenService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import { MSG_PAIS_NO_HABILITADO, type EntradaUbicacion } from "@/lib/services/geo-ubicacion";
import { crearAsignaciones, type CatalogoGeografico, type ZonaAsignada } from "@/lib/services/geografia-dominio";
import type {
  CreateOrdenData,
  IOrdenRepository,
  LoteContexto,
} from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  CatalogoYAsignaciones,
  ICatalogoGeograficoRepository,
} from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import type {
  ITarifaVigenteRepository,
  TarifaVigenteResuelta,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import { notificadorNoOp } from "@/lib/notificaciones/notificadores";
import { SIN_CUPO } from "@/lib/interfaces/repositories/ICupoPlanRepository";
import { clavePar, type ParTarifa } from "@/lib/utils/cascada-tarifa";
import type { TarifaTienda } from "@/lib/types/tarifa-flexible";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { tarifaVieja } from "../../fixtures/tarifa-tienda";
import { catalogoEnMemoria } from "../../fixtures/doble-catalogo-geografico";

// SLT-45 (T4.2, design §2.1 y §2.3):
//   R5  — la carga y la cotizacion de v1 rechazan cada fila con «pais no habilitado» bajo `ubicacion`
//         si el pais de la empresa no es de 3 niveles, sin crear nada; con 3 niveles, nada cambia.
//   R25 — la rama del motor de `resolveFila` guarda el nodo resuelto con las 3 FK de `fksDeNodo`.
//   §2.3 — una via del motor sin catalogo es un error de configuracion, no una caida a `resolveGeo`.

const APIKEY: Actor = { usuarioId: "key-user-1", rol: "apiKey" };

const TARIFA: TarifaVigenteResuelta = {
  tarifaId: "t-stub",
  fulfillment: "0.00",
  valorFlete: "3.50",
  valorFleteGam: "5.00",
  valorFleteDevuelto: "1.00",
  valorFleteDevueltoGam: "2.00",
  comisionCod: "5.00",
  ivaFlete: "12.00",
  ivaComisionCod: "12.00",
  tarifaEspecial: null,
  tarifaEspecialDevuelta: null,
};

function tarifaRepo(): ITarifaVigenteRepository & { resolveTarifas: ReturnType<typeof vi.fn> } {
  return {
    resolveTarifa: vi.fn(async () => tarifaVieja(TARIFA)),
    resolveTarifas: vi.fn(
      async (pares: readonly ParTarifa[]) =>
        new Map<string, TarifaTienda | null>(pares.map((p) => [clavePar(p), tarifaVieja(TARIFA)])),
    ),
  };
}

/** La geografia de v1 del doble (un distrito con zona), la misma en las lecturas por profundidad. */
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

const ZONA: ZonaAsignada = { id: "z1", nombre: "Zona uno", esCentral: true };

// Catalogos de prueba: 2, 3 y 4 niveles. El de 3 tiene los mismos ids que la geografia de v1 del doble.
const DOS = catalogoEnMemoria([
  { id: "A", nombre: "Alfa" },
  { id: "A1", padreId: "A", nombre: "Uno" },
]);
const TRES = catalogoEnMemoria([
  { id: "p1", nombre: "Alta", codigoOficial: "1" },
  { id: "c1", padreId: "p1", nombre: "Media", codigoOficial: "101" },
  { id: "d1", padreId: "c1", nombre: "Baja", codigoOficial: "10101" },
  { id: "c2", padreId: "p1", nombre: "Sola", codigoOficial: "102" },
]);
const CUATRO = catalogoEnMemoria([
  { id: "X", nombre: "Equis" },
  { id: "X1", padreId: "X", nombre: "Uno" },
  { id: "X2", padreId: "X1", nombre: "Dos" },
  { id: "X3", padreId: "X2", nombre: "Tres" },
]);

function catalogoRepo(
  catalogo: CatalogoGeografico,
  zonas: { nodoId: string; zona: ZonaAsignada }[] = [{ nodoId: "d1", zona: ZONA }],
): ICatalogoGeograficoRepository & { deLaEmpresa: ReturnType<typeof vi.fn> } {
  const geo: CatalogoYAsignaciones = { catalogo, asignaciones: crearAsignaciones(zonas, []) };
  return { deLaEmpresa: vi.fn(async () => geo), dePais: vi.fn(async () => catalogo) };
}

function bulk(repo: IOrdenRepository, tarifas: ITarifaVigenteRepository, cat?: ICatalogoGeograficoRepository) {
  return new BulkOrdenService(repo, tarifas, notificadorNoOp, SIN_CUPO, cat);
}

/** Fila de v1 (columnas separadas). */
function filaV1(numRemision: string, over: Partial<RawRow> = {}): RawRow {
  return {
    num_remision: numRemision,
    destinatario: "Ana",
    telefono: "0991234567",
    provincia: "Alta",
    canton: "Media",
    distrito: "Baja",
    direccion: "Calle 1",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
    ...over,
  };
}

describe("R5 — carga v1: la forma del pais se comprueba antes de resolver las filas", () => {
  it.each([
    ["2 niveles", DOS],
    ["4 niveles", CUATRO],
  ])("pais de %s: cada fila sale con «pais no habilitado» bajo `ubicacion` y no se crea nada", async (_n, cat) => {
    const repo = buildRepo();
    const tarifas = tarifaRepo();
    const r = await bulk(repo, tarifas, catalogoRepo(cat)).cargarViaApi(
      [filaV1("R-1"), filaV1(" R-2 "), filaV1("")],
      APIKEY,
    );

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary).toEqual({
      total: 3,
      creadas: 0,
      duplicadas: 0,
      conError: 3,
      filas: [],
      errores: [
        { fila: 1, numRemision: "R-1", resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
        { fila: 2, numRemision: "R-2", resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
        { fila: 3, numRemision: "", resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
      ],
      ordenes: [],
      cargaId: null,
    });
    expect(r.manifiestoOrdenIds).toEqual([]);
    // Ni orden, ni lote, ni tarifa, ni lectura de la geografia de v1.
    expect(repo.createManyOrdenesConGuia).not.toHaveBeenCalled();
    expect(repo.createManyOrdenes).not.toHaveBeenCalled();
    expect(tarifas.resolveTarifas).not.toHaveBeenCalled();
    expect(repo.findAllProvincias).not.toHaveBeenCalled();
  });

  it("pais de 3 niveles: la comprobacion pasa y la carga es la de siempre", async () => {
    const repo = buildRepo();
    const cat = catalogoRepo(TRES);
    const r = await bulk(repo, tarifaRepo(), cat).cargarViaApi([filaV1("R-1")], APIKEY);

    expect(cat.deLaEmpresa).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary.creadas).toBe(1);
    expect(r.summary.errores).toEqual([]);
    const creadas = vi.mocked(repo.createManyOrdenesConGuia).mock.calls[0][0];
    // La via de `resolveGeo`: nodo = distrito (R25).
    expect(creadas[0]).toMatchObject({ provinciaId: "p1", cantonId: "c1", distritoId: "d1", nodoGeograficoId: "d1" });
  });

  it("sin catalogo inyectado (dobles anteriores) no se comprueba nada", async () => {
    const repo = buildRepo();
    const r = await bulk(repo, tarifaRepo()).cargarViaApi([filaV1("R-1")], APIKEY);
    expect(r.status === "ok" && r.summary.creadas).toBe(1);
  });
});

describe("R5 — cotizacion v1: la forma del pais se comprueba antes de resolver las filas", () => {
  it.each([
    ["2 niveles", DOS],
    ["4 niveles", CUATRO],
  ])("pais de %s: cada fila sale con «pais no habilitado», sin importes ni tarifa", async (_n, cat) => {
    const repo = buildRepo();
    const tarifas = tarifaRepo();
    const r = await new CotizacionOrdenService(repo, tarifas, catalogoRepo(cat)).cotizar(
      [filaV1("R-1"), filaV1("")],
      APIKEY,
    );

    expect(r).toEqual({
      status: "ok",
      resumen: {
        total: 2,
        cotizadas: 0,
        conError: 2,
        filas: [],
        errores: [
          { fila: 1, numRemision: "R-1", resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
          { fila: 2, numRemision: null, resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
        ],
      },
    });
    expect(tarifas.resolveTarifas).not.toHaveBeenCalled();
    expect(repo.findAllProvincias).not.toHaveBeenCalled();
  });

  it("pais de 3 niveles: la comprobacion pasa y la fila se cotiza como siempre", async () => {
    const r = await new CotizacionOrdenService(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cotizar(
      [filaV1("R-1")],
      APIKEY,
    );
    expect(r.status === "ok" && r.resumen.cotizadas).toBe(1);
  });

  it("otro rol sigue saliendo `forbidden` sin leer el catalogo", async () => {
    const cat = catalogoRepo(DOS);
    const r = await new CotizacionOrdenService(buildRepo(), tarifaRepo(), cat).cotizar([filaV1("R-1")], {
      usuarioId: "u1",
      rol: "adminTienda",
    });
    expect(r).toEqual({ status: "forbidden" });
    expect(cat.deLaEmpresa).not.toHaveBeenCalled();
  });
});

describe("§2.3 / R25 — la rama del motor de `resolveFila`", () => {
  const extractor =
    (entrada: EntradaUbicacion) =>
    (): EntradaDelMotor => ({ ok: true, entrada, direccion: "Calle 9" });

  function ctx(geografia?: CatalogoYAsignaciones) {
    return {
      existingMap: new Map<string, string>(),
      provinciaIndex: new Map(),
      cantonIndex: new Map(),
      distritoIndex: new Map(),
      estatusId: "os-1",
      estatusInicialValue: "por_recolectar_en_tienda",
      ...(geografia ? { geografia } : {}),
    };
  }

  const filaV2: RawRow = {
    num_remision: "R-9",
    destinatario: "Ana",
    telefono: "0991234567",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
  };

  function resolver(geografia: CatalogoYAsignaciones | undefined, entrada: EntradaUbicacion) {
    const service = bulk(buildRepo(), tarifaRepo());
    return service["resolveFila"](filaV2, ctx(geografia), new Map(), extractor(entrada));
  }

  it("profundidad 3 por ruta: nodo = distrito y las 3 FK de su ruta, con la zona del motor", () => {
    const geo = { catalogo: TRES, asignaciones: crearAsignaciones([{ nodoId: "d1", zona: ZONA }], ["d1"]) };
    const r = resolver(geo, { tipo: "ruta", nombres: ["Alta", "Media", "Baja"] });

    expect(r.status).toBe("creada");
    if (r.status !== "creada") return;
    expect(r.createData).toMatchObject({
      provinciaId: "p1",
      cantonId: "c1",
      distritoId: "d1",
      nodoGeograficoId: "d1",
      zonaId: "z1",
      direccion: "Calle 9",
    });
    expect(r.esCentral).toBe(true);
    expect(r.esZonaEspecial).toBe(true);
  });

  it("profundidad 2 por codigo (con zona): nodo = canton, distrito vacio", () => {
    const geo = { catalogo: TRES, asignaciones: crearAsignaciones([{ nodoId: "c2", zona: ZONA }], []) };
    const r = resolver(geo, { tipo: "codigo", codigo: "102" });

    expect(r.status).toBe("creada");
    if (r.status !== "creada") return;
    expect(r.createData).toMatchObject({
      provinciaId: "p1",
      cantonId: "c2",
      distritoId: null,
      nodoGeograficoId: "c2",
      zonaId: "z1",
    });
  });

  it("un fallo del motor deja la fila en error bajo `ubicacion`", () => {
    const geo = { catalogo: DOS, asignaciones: crearAsignaciones([{ nodoId: "A1", zona: ZONA }], []) };
    const r = resolver(geo, { tipo: "ruta", nombres: ["Alfa", "Uno"] });
    expect(r).toEqual({ status: "error", numRemision: "R-9", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } });
  });

  it("sin catalogo, la rama del motor lanza un error de configuracion (nunca cae a `resolveGeo`)", () => {
    expect(() => resolver(undefined, { tipo: "codigo", codigo: "10101" })).toThrow(MSG_MOTOR_SIN_CATALOGO);
  });
});
