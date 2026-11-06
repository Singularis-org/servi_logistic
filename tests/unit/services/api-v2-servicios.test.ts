import { describe, it, expect, vi } from "vitest";

import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import {
  MSG_MOTOR_SIN_CATALOGO,
  MSG_PAIS_NO_HABILITADO,
  MSG_UBICACION_UNA_DE_LAS_DOS,
  msgCodigoNoEncontrado,
  msgNivelNoEncontrado,
  msgNivelVacio,
  msgSinZona,
} from "@/lib/services/geo-ubicacion";
import { crearAsignaciones, type CatalogoGeografico, type ZonaAsignada } from "@/lib/services/geografia-dominio";
import {
  aFilaInterna,
  cargaV2BodySchema,
  cotizacionV2BodySchema,
  crearOrdenV2BodySchema,
  filaV2Schema,
  MAX_NIVELES_UBICACION,
  type FilaV2,
  type UbicacionDTO,
} from "@/lib/types/api-v2";
import type { CreateOrdenData, IOrdenRepository, LoteContexto } from "@/lib/interfaces/repositories/IOrdenRepository";
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

// SLT-45 (T4.3, design §4.2 y §4.3) — las dos firmas nuevas con dobles:
//   `cargarViaApiV2` (R12–R17) y `cotizarV2` (R12–R16, R19), con `ubicacion` en la salida (R21),
//   y los cuerpos zod de `lib/types/api-v2.ts`.

const APIKEY: Actor = { usuarioId: "key-user-1", rol: "apiKey" };
const ADMIN: Actor = { usuarioId: "u1", rol: "adminTienda" };

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

function tarifaRepo(conTarifa = true): ITarifaVigenteRepository & { resolveTarifas: ReturnType<typeof vi.fn> } {
  return {
    resolveTarifa: vi.fn(async () => (conTarifa ? tarifaVieja(TARIFA) : null)),
    resolveTarifas: vi.fn(
      async (pares: readonly ParTarifa[]) =>
        new Map<string, TarifaTienda | null>(pares.map((p) => [clavePar(p), conTarifa ? tarifaVieja(TARIFA) : null])),
    ),
  };
}

/** La geografia de v1 del doble: los mismos ids y la misma zona (no central) que el catalogo `TRES`. */
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

const ZONA: ZonaAsignada = { id: "z1", nombre: "Zona uno", esCentral: false };

const TRES = catalogoEnMemoria([
  { id: "p1", nombre: "Alta", codigoOficial: "1" },
  { id: "c1", padreId: "p1", nombre: "Media", codigoOficial: "101" },
  { id: "d1", padreId: "c1", nombre: "Baja", codigoOficial: "10101" },
  { id: "d2", padreId: "c1", nombre: "Sin Zona", codigoOficial: "10102" },
  { id: "c2", padreId: "p1", nombre: "Sola", codigoOficial: "102" },
]);
const DOS = catalogoEnMemoria([
  { id: "A", nombre: "Alfa", codigoOficial: "9" },
  { id: "A1", padreId: "A", nombre: "Uno", codigoOficial: "91" },
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

const CAMPOS = { destinatario: "Ana", telefono: "0991234567", direccion: "Calle 1", producto: "Caja", notas: "" };

function filaV2(numRemision: string, ubic: Pick<FilaV2, "ubicacion" | "ubicacion_codigo">, over: Partial<RawRow> = {}) {
  return aFilaInterna({ num_remision: numRemision, ...CAMPOS, monto_cobrar: "", ...over, ...ubic });
}

function filaV1(numRemision: string): RawRow {
  return { num_remision: numRemision, ...CAMPOS, monto_cobrar: "", provincia: "Alta", canton: "Media", distrito: "Baja" };
}

const RUTA_D1: UbicacionDTO[] = [
  { profundidad: 1, id: "p1", nombre: "Alta", codigoOficial: "1", tipo: { clave: "nivel_1", nombre: "Nivel 1" } },
  { profundidad: 2, id: "c1", nombre: "Media", codigoOficial: "101", tipo: { clave: "nivel_2", nombre: "Nivel 2" } },
  { profundidad: 3, id: "d1", nombre: "Baja", codigoOficial: "10101", tipo: { clave: "nivel_3", nombre: "Nivel 3" } },
];

// ── Cuerpos (§4.2) ──────────────────────────────────────────────────────────────────────────────

describe("§4.2 — cuerpos zod de v2", () => {
  it("una fila con `ubicacion` o con `ubicacion_codigo` es valida; las demas claves son texto", () => {
    expect(filaV2Schema.safeParse({ num_remision: "R-1", ubicacion: ["Alta", "Media"] }).success).toBe(true);
    expect(filaV2Schema.safeParse({ num_remision: "R-1", ubicacion_codigo: "10101" }).success).toBe(true);
  });

  it.each([
    ["`ubicacion` que no es lista", { ubicacion: "Alta" }],
    ["`ubicacion` con un elemento que no es texto", { ubicacion: ["Alta", 3] }],
    ["`ubicacion` vacia", { ubicacion: [] }],
    ["`ubicacion` con mas niveles que el tope", { ubicacion: Array(MAX_NIVELES_UBICACION + 1).fill("x") }],
    ["un nombre de mas de 200 caracteres", { ubicacion: ["x".repeat(201)] }],
    ["`ubicacion_codigo` vacio", { ubicacion_codigo: "" }],
    ["`ubicacion_codigo` de mas de 64 caracteres", { ubicacion_codigo: "9".repeat(65) }],
    ["un valor que no es texto (como en v1)", { ubicacion_codigo: "1", monto_cobrar: 10 }],
  ])("%s es 422 del lote", (_caso, fila) => {
    expect(cargaV2BodySchema.safeParse({ ordenes: [fila] }).success).toBe(false);
  });

  it("lote: vacio es 422; `download_type` por defecto `consolidate`, como v1", () => {
    expect(cargaV2BodySchema.safeParse({ ordenes: [] }).success).toBe(false);
    const ok = cargaV2BodySchema.parse({ ordenes: [{ ubicacion_codigo: "1" }], name: " Lote " });
    expect(ok).toMatchObject({ name: "Lote", download_type: "consolidate" });
    expect(cotizacionV2BodySchema.safeParse({ ordenes: [] }).success).toBe(false);
  });

  it("crear una orden recibe `orden` (una sola fila)", () => {
    expect(crearOrdenV2BodySchema.safeParse({ orden: { ubicacion_codigo: "1" } }).success).toBe(true);
    expect(crearOrdenV2BodySchema.safeParse({ ordenes: [{ ubicacion_codigo: "1" }] }).success).toBe(false);
  });
});

describe("R12 — `aFilaInterna`: exactamente una de las dos formas", () => {
  it.each([
    ["ninguna", {}],
    ["las dos", { ubicacion: ["Alta"], ubicacion_codigo: "1" }],
  ])("%s → error de fila bajo `ubicacion`", (_caso, ubic) => {
    expect(aFilaInterna({ num_remision: "R-1", ...ubic }).ubicacion).toEqual({
      tipo: "error",
      fieldErrors: { ubicacion: [MSG_UBICACION_UNA_DE_LAS_DOS] },
    });
  });

  it("ruta y codigo se separan de los campos de texto", () => {
    expect(aFilaInterna({ num_remision: "R-1", ubicacion: ["Alta", "Media"] })).toEqual({
      campos: { num_remision: "R-1" },
      ubicacion: { tipo: "ruta", nombres: ["Alta", "Media"] },
    });
    // La salida del schema entra tal cual (es lo que hara el borde).
    expect(aFilaInterna(filaV2Schema.parse({ num_remision: "R-1", ubicacion_codigo: "101" }))).toEqual({
      campos: { num_remision: "R-1" },
      ubicacion: { tipo: "codigo", codigo: "101" },
    });
  });
});

// ── cargarViaApiV2 (R12–R17, R21) ───────────────────────────────────────────────────────────────

describe("cargarViaApiV2", () => {
  it("R11 — otro rol sale `forbidden` sin leer el catalogo", async () => {
    const cat = catalogoRepo(TRES);
    const r = await bulk(buildRepo(), tarifaRepo(), cat).cargarViaApiV2([filaV2("R-1", { ubicacion_codigo: "10101" })], ADMIN);
    expect(r).toEqual({ status: "forbidden" });
    expect(cat.deLaEmpresa).not.toHaveBeenCalled();
  });

  it("§2.3 — sin catalogo inyectado lanza el error de configuracion (nunca resuelve como v1)", async () => {
    await expect(
      bulk(buildRepo(), tarifaRepo()).cargarViaApiV2([filaV2("R-1", { ubicacion_codigo: "10101" })], APIKEY),
    ).rejects.toThrow(MSG_MOTOR_SIN_CATALOGO);
  });

  it("R17/R21 — misma respuesta que v1 para la misma ubicacion, mas `ordenes[].ubicacion`", async () => {
    const v1 = await bulk(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cargarViaApi([filaV1("R-1")], APIKEY);
    const repo = buildRepo();
    const v2 = await bulk(repo, tarifaRepo(), catalogoRepo(TRES)).cargarViaApiV2(
      [filaV2("R-1", { ubicacion: ["alta", " MEDIA ", "Baja"] })],
      APIKEY,
      { name: "Lote" },
    );

    expect(v1.status).toBe("ok");
    expect(v2.status).toBe("ok");
    if (v1.status !== "ok" || v2.status !== "ok") return;
    const { ordenes: ordenesV2, ...restoV2 } = v2.summary;
    const { ordenes: ordenesV1, ...restoV1 } = v1.summary;
    expect(restoV2).toEqual(restoV1);
    expect(ordenesV2).toEqual(ordenesV1.map((o) => ({ ...o, ubicacion: RUTA_D1 })));
    expect(Object.keys(ordenesV2[0])).toEqual([...Object.keys(ordenesV1[0]), "ubicacion"]);
    expect(v2.manifiestoOrdenIds).toEqual(v1.manifiestoOrdenIds);

    const [creadas, , , lote] = vi.mocked(repo.createManyOrdenesConGuia).mock.calls[0];
    expect(creadas[0]).toMatchObject({ provinciaId: "p1", cantonId: "c1", distritoId: "d1", nodoGeograficoId: "d1", zonaId: "z1" });
    expect(lote).toMatchObject({ name: "Lote", totalFiles: 1 });
  });

  it("R14 — por codigo: la orden lleva la ruta de su nodo", async () => {
    const r = await bulk(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cargarViaApiV2(
      [filaV2("R-1", { ubicacion_codigo: " 10101 " })],
      APIKEY,
    );
    expect(r.status === "ok" && r.summary.ordenes.map((o) => o.ubicacion)).toEqual([RUTA_D1]);
  });

  it("R12–R16 — cada fila mala sale en `errores[].errores.ubicacion` y la buena se crea (el lote sigue)", async () => {
    const repo = buildRepo();
    const r = await bulk(repo, tarifaRepo(), catalogoRepo(TRES)).cargarViaApiV2(
      [
        filaV2("R-1", { ubicacion: ["Alta", "Media", "Baja"] }),
        filaV2("R-2", {}),
        filaV2("R-3", { ubicacion: ["Alta", "Nada"] }),
        filaV2("R-4", { ubicacion: ["Alta", " "] }),
        filaV2("R-5", { ubicacion_codigo: "000" }),
        filaV2("R-6", { ubicacion: ["Alta", "Media", "Sin Zona"] }),
        // Un canton (profundidad 2) pasa la regla de guardado y cae en «sin zona» (design §2.2).
        filaV2("R-7", { ubicacion: ["Alta", "Sola"] }),
        // Una provincia (profundidad 1) no se puede guardar (R15).
        filaV2("R-8", { ubicacion_codigo: "1" }),
      ],
      APIKEY,
    );

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary).toMatchObject({ total: 8, creadas: 1, conError: 7 });
    expect(r.summary.ordenes.map((o) => o.numRemision)).toEqual(["R-1"]);
    expect(r.summary.errores.map((e) => [e.numRemision, e.errores])).toEqual([
      ["R-2", { ubicacion: [MSG_UBICACION_UNA_DE_LAS_DOS] }],
      ["R-3", { ubicacion: [msgNivelNoEncontrado(2, "Nada", "Alta")] }],
      ["R-4", { ubicacion: [msgNivelVacio(2)] }],
      ["R-5", { ubicacion: [msgCodigoNoEncontrado("000")] }],
      ["R-6", { ubicacion: [msgSinZona("Sin Zona")] }],
      ["R-7", { ubicacion: [msgSinZona("Sola")] }],
      ["R-8", { ubicacion: [MSG_PAIS_NO_HABILITADO] }],
    ]);
    expect(vi.mocked(repo.createManyOrdenesConGuia).mock.calls[0][0]).toHaveLength(1);
  });

  it("R15 — pais de 2 niveles: «pais no habilitado» y no se crea nada", async () => {
    const repo = buildRepo();
    const r = await bulk(repo, tarifaRepo(), catalogoRepo(DOS, [{ nodoId: "A1", zona: ZONA }])).cargarViaApiV2(
      [filaV2("R-1", { ubicacion: ["Alfa", "Uno"] }), filaV2("R-2", { ubicacion_codigo: "91" })],
      APIKEY,
    );
    expect(r.status === "ok" && r.summary.errores.map((e) => e.errores)).toEqual([
      { ubicacion: [MSG_PAIS_NO_HABILITADO] },
      { ubicacion: [MSG_PAIS_NO_HABILITADO] },
    ]);
    expect(r.status === "ok" && r.summary.cargaId).toBeNull();
    expect(repo.createManyOrdenesConGuia).not.toHaveBeenCalled();
  });

  it("R17 — los campos de v1 se validan igual (destinatario obligatorio) y los duplicados del lote tambien", async () => {
    const r = await bulk(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cargarViaApiV2(
      [
        filaV2("R-1", { ubicacion_codigo: "10101" }, { destinatario: "" }),
        filaV2("R-2", { ubicacion_codigo: "10101" }),
        filaV2("R-2", { ubicacion_codigo: "10101" }),
      ],
      APIKEY,
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary).toMatchObject({ creadas: 1, duplicadas: 1, conError: 1 });
    expect(Object.keys(r.summary.errores[0].errores)).toEqual(["destinatario"]);
  });
});

// ── cotizarV2 (R12–R16, R19, R21) ───────────────────────────────────────────────────────────────

describe("cotizarV2", () => {
  it("R11 — otro rol sale `forbidden` sin leer el catalogo ni la tarifa", async () => {
    const cat = catalogoRepo(TRES);
    const tarifas = tarifaRepo();
    const r = await new CotizacionOrdenService(buildRepo(), tarifas, cat).cotizarV2(
      [filaV2("R-1", { ubicacion_codigo: "10101" })],
      ADMIN,
    );
    expect(r).toEqual({ status: "forbidden" });
    expect(cat.deLaEmpresa).not.toHaveBeenCalled();
    expect(tarifas.resolveTarifas).not.toHaveBeenCalled();
  });

  it("§2.3 — sin catalogo inyectado lanza el error de configuracion", async () => {
    await expect(
      new CotizacionOrdenService(buildRepo(), tarifaRepo()).cotizarV2([filaV2("R-1", { ubicacion_codigo: "1" })], APIKEY),
    ).rejects.toThrow(MSG_MOTOR_SIN_CATALOGO);
  });

  it("R19/R21 — mismos importes y forma que v1 para la misma ubicacion, mas `filas[].ubicacion`", async () => {
    const v1 = await new CotizacionOrdenService(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cotizar(
      [{ ...filaV1("R-1"), monto_cobrar: "11898.81" }],
      APIKEY,
    );
    const tarifas = tarifaRepo();
    const v2 = await new CotizacionOrdenService(buildRepo(), tarifas, catalogoRepo(TRES)).cotizarV2(
      [filaV2("R-1", { ubicacion: ["Alta", "Media", "Baja"] }, { monto_cobrar: "11898.81" })],
      APIKEY,
    );

    expect(v1.status).toBe("ok");
    expect(v2.status).toBe("ok");
    if (v1.status !== "ok" || v2.status !== "ok") return;
    expect(v2.resumen).toEqual({
      ...v1.resumen,
      filas: v1.resumen.filas.map((f) => ({ ...f, ubicacion: RUTA_D1 })),
    });
    // La tarifa se pide con el mismo par (tienda, zona, distrito) que en v1.
    expect(tarifas.resolveTarifas).toHaveBeenCalledWith([{ tiendaId: "key-user-1", zonaId: "z1", distritoId: "d1" }]);
  });

  it("la fila de v2 no necesita la terna de v1 (su schema la omite)", async () => {
    const r = await new CotizacionOrdenService(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cotizarV2(
      [aFilaInterna({ ubicacion_codigo: "10101" })],
      APIKEY,
    );
    expect(r.status === "ok" && r.resumen.cotizadas).toBe(1);
  });

  it("R12–R16 — errores de ubicacion en `errores[]`, con las mismas claves y mensajes que la carga", async () => {
    const r = await new CotizacionOrdenService(buildRepo(), tarifaRepo(), catalogoRepo(TRES)).cotizarV2(
      [
        filaV2("R-1", { ubicacion: ["Alta", "Media", "Baja"] }),
        filaV2("", { ubicacion: ["Alta"], ubicacion_codigo: "1" }),
        filaV2("R-3", { ubicacion: ["Nada"] }),
        filaV2("R-4", { ubicacion_codigo: "1" }),
        filaV2("R-5", { ubicacion: ["Alta", "Media", "Sin Zona"] }),
      ],
      APIKEY,
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.resumen).toMatchObject({ total: 5, cotizadas: 1, conError: 4 });
    expect(r.resumen.errores).toEqual([
      { fila: 2, numRemision: null, resultado: "error", errores: { ubicacion: [MSG_UBICACION_UNA_DE_LAS_DOS] } },
      { fila: 3, numRemision: "R-3", resultado: "error", errores: { ubicacion: [msgNivelNoEncontrado(1, "Nada", null)] } },
      { fila: 4, numRemision: "R-4", resultado: "error", errores: { ubicacion: [MSG_PAIS_NO_HABILITADO] } },
      { fila: 5, numRemision: "R-5", resultado: "error", errores: { ubicacion: [msgSinZona("Sin Zona")] } },
    ]);
  });

  it("R19 — sin tarifa para ninguna fila resuelta: `sin_tarifa` (el 409 de v1)", async () => {
    const r = await new CotizacionOrdenService(buildRepo(), tarifaRepo(false), catalogoRepo(TRES)).cotizarV2(
      [filaV2("R-1", { ubicacion_codigo: "10101" })],
      APIKEY,
    );
    expect(r).toEqual({ status: "sin_tarifa" });
  });
});
