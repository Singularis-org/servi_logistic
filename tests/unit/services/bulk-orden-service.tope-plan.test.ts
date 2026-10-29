import { describe, it, expect, vi } from "vitest";

import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import type {
  CreateOrdenData,
  IOrdenRepository,
  LoteContexto,
} from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  ITarifaVigenteRepository,
  TarifaVigenteResuelta,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { CupoOrdenes, ICupoPlanRepository } from "@/lib/interfaces/repositories/ICupoPlanRepository";
import { notificadorNoOp } from "@/lib/notificaciones/notificadores";
import { clavePar, type ParTarifa } from "@/lib/utils/cascada-tarifa";
import { TopeDelPlanAlcanzado } from "@/lib/planes/tope-error";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";

// SL-24 (design §6.1) — la comprobación previa del tope de órdenes en `BulkOrdenService` y la
// reclasificación cuando el trigger rechaza un lote.
//   R21 — la petición que pasa el tope se rechaza entera, sin persistir; la que deja el uso justo en
//         el tope se acepta. Vale en las dos vías.
//   R22 — en la carga por sesión (también en la vista previa) cada fila que se iba a crear sale como
//         error con el mensaje del tope; duplicadas y errores siguen igual.
//   R23 — en la API, `TopeDelPlanAlcanzado` (409 en el borde; la forma del cuerpo la prueba
//         `tests/unit/api/api-key-carga-tope-plan.test.ts`).

const TIENDA: Actor = { usuarioId: "store1", rol: "adminTienda" };
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

const tarifaRepo: ITarifaVigenteRepository = {
  resolveTarifa: vi.fn(async () => TARIFA),
  resolveTarifas: vi.fn(
    async (pares: readonly ParTarifa[]) =>
      new Map<string, TarifaVigenteResuelta | null>(pares.map((p) => [clavePar(p), TARIFA])),
  ),
};

/** El error con la forma real de una operación de modelo de Prisma 7.8 cuando salta el trigger. */
function errorDelTrigger(maximo: number, usados: number, pedidas: number): Error {
  const mensaje = `tope_plan {"tope": "ordenes", "maximo": ${maximo}, "usados": ${usados}, "pedidas": ${pedidas}}`;
  return Object.assign(new Error(mensaje), {
    name: "DriverAdapterError",
    cause: { kind: "postgres", code: "SL024", originalCode: "SL024", message: mensaje },
  });
}

/** Doble mínimo de `IOrdenRepository` con las dos rutas de lote; `EXISTE` es una remisión ya en la base. */
function buildRepo(overrides: Partial<IOrdenRepository> = {}): IOrdenRepository {
  return {
    findUsuarioFulfillment: vi.fn().mockResolvedValue(false),
    findEstatusIdByValue: vi.fn().mockResolvedValue("os-1"),
    findExistingRemisiones: vi.fn(async (nums: string[]) =>
      new Map(nums.filter((n) => n === "EXISTE").map((n) => [n, "en_reparto"] as const)),
    ),
    findAllProvincias: vi.fn().mockResolvedValue([{ id: "p1", nombre: "Pichincha", disponible: true }]),
    findCantonesByProvinciaIds: vi
      .fn()
      .mockResolvedValue([{ id: "c1", nombre: "Quito", provinciaId: "p1", disponible: true }]),
    findDistritosByCantonIds: vi
      .fn()
      .mockResolvedValue([
        { id: "d1", nombre: "Barrio Uno", cantonId: "c1", zonaId: "z1", esCentral: false, disponible: true },
      ]),
    createManyOrdenes: vi.fn(async (data: CreateOrdenData[], _b: number, _h: unknown, lote: LoteContexto) => ({
      inserted: data.length,
      cargaId: lote.cargaId ?? "carga-nueva",
      omitidas: [] as string[],
    })),
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
    ...overrides,
  } as unknown as IOrdenRepository;
}

function cupo(valor: CupoOrdenes | null): ICupoPlanRepository & { cupoOrdenes: ReturnType<typeof vi.fn> } {
  return { cupoOrdenes: vi.fn(async () => valor) };
}

function servicio(repo: IOrdenRepository, cupoPlan?: ICupoPlanRepository): BulkOrdenService {
  return cupoPlan === undefined
    ? new BulkOrdenService(repo, tarifaRepo)
    : new BulkOrdenService(repo, tarifaRepo, notificadorNoOp, cupoPlan);
}

/** Fila de la vía sesión (plantilla v3). */
function row(numRemision: string, over: Partial<RawRow> = {}): RawRow {
  return {
    num_remision: numRemision,
    destinatario: "Ana",
    telefono: "0991234567",
    provincia: "Pichincha",
    canton_distrito: "Quito (Barrio Uno)",
    direccion: "",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
    ...over,
  };
}

/** Fila de la vía API key (columnas separadas). */
function rowApi(numRemision: string): RawRow {
  return {
    num_remision: numRemision,
    destinatario: "Ana",
    telefono: "0991234567",
    provincia: "Pichincha",
    canton: "Quito",
    distrito: "Barrio Uno",
    direccion: "",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
  };
}

const MENSAJE_99_2 =
  "Tu plan permite 100 órdenes por ciclo. Llevas 99 y esta carga trae 2. Anula órdenes que no vayas a enviar o pide un cambio de plan.";

/** Dos nuevas (N1, N2), una duplicada contra la base (EXISTE) y una con error de provincia (MALA). */
const LOTE_MIXTO = [row("N1"), row("EXISTE"), row("MALA", { provincia: "" }), row("N2")];

function persistio(repo: IOrdenRepository): number {
  return (
    (repo.createManyOrdenes as unknown as ReturnType<typeof vi.fn>).mock.calls.length +
    (repo.createManyOrdenesConGuia as unknown as ReturnType<typeof vi.fn>).mock.calls.length
  );
}

describe("SL-24 — BulkOrdenService.cargarMasiva: comprobación previa del tope (R21, R22)", () => {
  for (const dryRun of [false, true]) {
    it(`${dryRun ? "vista previa" : "carga real"}: pasa el tope -> cada fila que se iba a crear es error; duplicada y error no cambian; nada se persiste`, async () => {
      const repo = buildRepo();
      const cupoPlan = cupo({ maximo: 100, usados: 99 });
      const r = await servicio(repo, cupoPlan).cargarMasiva(LOTE_MIXTO, TIENDA, { dryRun });

      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      expect(cupoPlan.cupoOrdenes).toHaveBeenCalledTimes(1);
      expect(persistio(repo)).toBe(0);
      expect(r.summary).toMatchObject({ total: 4, creadas: 0, duplicadas: 1, conError: 3, cargaId: null });
      expect(r.summary.filas).toEqual([
        { fila: 1, numRemision: "N1", resultado: "error", errores: { plan: [MENSAJE_99_2] } },
        { fila: 2, numRemision: "EXISTE", resultado: "duplicada", estatus: "en_reparto" },
        { fila: 3, numRemision: "MALA", resultado: "error", errores: { provincia: ["provincia es obligatoria"] } },
        { fila: 4, numRemision: "N2", resultado: "error", errores: { plan: [MENSAJE_99_2] } },
      ]);
    });
  }

  it("dejar el uso justo en el tope se acepta y persiste", async () => {
    const repo = buildRepo();
    const r = await servicio(repo, cupo({ maximo: 100, usados: 98 })).cargarMasiva(LOTE_MIXTO, TIENDA);
    expect(r.status === "ok" && r.summary.creadas).toBe(2);
    expect(persistio(repo)).toBe(1);
  });

  it("un tope de cero rechaza la primera orden", async () => {
    const repo = buildRepo();
    const r = await servicio(repo, cupo({ maximo: 0, usados: 0 })).cargarMasiva([row("N1")], TIENDA);
    expect(r.status === "ok" && r.summary.filas[0]?.errores).toEqual({
      plan: [
        "Tu plan permite 0 órdenes por ciclo. Llevas 0 y esta carga trae 1. Anula órdenes que no vayas a enviar o pide un cambio de plan.",
      ],
    });
    expect(persistio(repo)).toBe(0);
  });

  it("sin plan o sin tope de órdenes (cupo null) no hay límite (R14)", async () => {
    const repo = buildRepo();
    const r = await servicio(repo, cupo(null)).cargarMasiva(LOTE_MIXTO, TIENDA);
    expect(r.status === "ok" && r.summary.creadas).toBe(2);
    expect(persistio(repo)).toBe(1);
  });

  it("sin filas que crear no se lee el cupo", async () => {
    const cupoPlan = cupo({ maximo: 0, usados: 0 });
    const r = await servicio(buildRepo(), cupoPlan).cargarMasiva([row("EXISTE")], TIENDA);
    expect(r.status === "ok" && r.summary.duplicadas).toBe(1);
    expect(cupoPlan.cupoOrdenes).not.toHaveBeenCalled();
  });

  it("el constructor de tres parámetros (SIN_CUPO) no comprueba nada y persiste", async () => {
    const repo = buildRepo();
    const r = await servicio(repo).cargarMasiva(LOTE_MIXTO, TIENDA);
    expect(r.status === "ok" && r.summary.creadas).toBe(2);
    expect(persistio(repo)).toBe(1);
  });
});

describe("SL-24 — BulkOrdenService.cargarMasiva: el trigger rechaza un lote (design §6.1)", () => {
  it("lo que entró en un lote anterior sigue creada con su estado real; el resto pasa a error", async () => {
    // EXISTE no estaba al clasificar (la lectura previa la da por nueva) y aparece después: entró
    // en un lote anterior de esta misma petición. N1 no entró.
    const findExistingRemisiones = vi
      .fn()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([["EXISTE", "por_recolectar_en_tienda"]]));
    const repo = buildRepo({
      findExistingRemisiones,
      createManyOrdenesConGuia: vi.fn().mockRejectedValue(errorDelTrigger(100, 99, 2)),
    });
    const r = await servicio(repo, cupo({ maximo: 100, usados: 0 })).cargarMasiva(
      [row("EXISTE"), row("N1")],
      TIENDA,
      { cargaId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    );

    expect(findExistingRemisiones).toHaveBeenLastCalledWith(["EXISTE", "N1"], TIENDA.usuarioId);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary.filas).toEqual([
      { fila: 1, numRemision: "EXISTE", resultado: "creada", estatus: "por_recolectar_en_tienda" },
      { fila: 2, numRemision: "N1", resultado: "error", errores: { plan: [MENSAJE_99_2] } },
    ]);
    expect(r.summary).toMatchObject({ creadas: 1, conError: 1, cargaId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  });

  it("también por la ruta sin guía (fulfillment)", async () => {
    const repo = buildRepo({
      findUsuarioFulfillment: vi.fn().mockResolvedValue(true),
      createManyOrdenes: vi.fn().mockRejectedValue(errorDelTrigger(100, 99, 2)),
    });
    const r = await servicio(repo).cargarMasiva([row("N1"), row("N2")], TIENDA);
    expect(r.status === "ok" && r.summary).toMatchObject({ creadas: 0, conError: 2, cargaId: null });
  });

  it("un error que no es del tope se propaga tal cual", async () => {
    const otro = new Error("se cayó la base");
    const repo = buildRepo({ createManyOrdenesConGuia: vi.fn().mockRejectedValue(otro) });
    await expect(servicio(repo).cargarMasiva([row("N1")], TIENDA)).rejects.toBe(otro);
  });
});

describe("SL-24 — BulkOrdenService.cargarViaApi (R21, R23)", () => {
  it("pasa el tope -> lanza TopeDelPlanAlcanzado con el detalle y no persiste", async () => {
    const repo = buildRepo();
    const err = await servicio(repo, cupo({ maximo: 100, usados: 99 }))
      .cargarViaApi([rowApi("N1"), rowApi("EXISTE"), rowApi("N2")], APIKEY)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TopeDelPlanAlcanzado);
    const tope = err as TopeDelPlanAlcanzado;
    expect(tope.code).toBe("CONFLICT");
    expect(tope.message).toBe(MENSAJE_99_2);
    expect(tope.details).toEqual({ codigo: "tope_plan", tope: "ordenes", maximo: 100, usados: 99, pedidas: 2 });
    expect(persistio(repo)).toBe(0);
  });

  it("solo cuenta lo que se va a insertar: las filas sin tarifa no suman", async () => {
    const repo = buildRepo({
      findDistritosByCantonIds: vi.fn().mockResolvedValue([
        { id: "d1", nombre: "Barrio Uno", cantonId: "c1", zonaId: "z1", esCentral: false, disponible: true },
        { id: "d2", nombre: "Barrio Dos", cantonId: "c1", zonaId: "z2", esCentral: false, disponible: true },
      ]),
    });
    const tarifaSoloZ1: ITarifaVigenteRepository = {
      resolveTarifa: vi.fn(async () => TARIFA),
      resolveTarifas: vi.fn(
        async (pares: readonly ParTarifa[]) =>
          new Map(pares.map((p) => [clavePar(p), p.zonaId === "z1" ? TARIFA : null])),
      ),
    };
    const sinTarifa = { ...rowApi("SIN"), distrito: "Barrio Dos" };
    const r = await new BulkOrdenService(repo, tarifaSoloZ1, notificadorNoOp, cupo({ maximo: 100, usados: 99 })).cargarViaApi(
      [rowApi("N1"), sinTarifa],
      APIKEY,
    );
    expect(r.status === "ok" && r.summary.creadas).toBe(1);
  });

  it("dejar el uso justo en el tope se acepta", async () => {
    const repo = buildRepo();
    const r = await servicio(repo, cupo({ maximo: 100, usados: 98 })).cargarViaApi([rowApi("N1"), rowApi("N2")], APIKEY);
    expect(r.status === "ok" && r.summary.creadas).toBe(2);
  });

  it("el trigger rechaza y no entró ninguna -> TopeDelPlanAlcanzado con las cifras del trigger", async () => {
    const repo = buildRepo({ createManyOrdenesConGuia: vi.fn().mockRejectedValue(errorDelTrigger(100, 99, 2)) });
    const err = await servicio(repo, cupo({ maximo: 100, usados: 0 }))
      .cargarViaApi([rowApi("N1"), rowApi("N2")], APIKEY)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TopeDelPlanAlcanzado);
    expect((err as TopeDelPlanAlcanzado).details).toEqual({
      codigo: "tope_plan",
      tope: "ordenes",
      maximo: 100,
      usados: 99,
      pedidas: 2,
    });
  });

  it("el trigger rechaza y entró alguna -> el resumen lo dice fila a fila", async () => {
    const findExistingRemisiones = vi
      .fn()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([["N1", "por_recolectar_en_tienda"]]));
    const repo = buildRepo({
      findExistingRemisiones,
      createManyOrdenesConGuia: vi.fn().mockRejectedValue(errorDelTrigger(100, 99, 2)),
    });
    const r = await servicio(repo).cargarViaApi([rowApi("N1"), rowApi("N2")], APIKEY);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary).toMatchObject({ creadas: 1, conError: 1 });
    expect(r.summary.filas.map((f) => [f.numRemision, f.resultado])).toEqual([["N1", "creada"]]);
    expect(r.summary.errores).toEqual([
      { fila: 2, numRemision: "N2", resultado: "error", errores: { plan: [MENSAJE_99_2] } },
    ]);
  });
});
