import { describe, it, expect, vi } from "vitest";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import type { CreateOrdenData, IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  ITarifaVigenteRepository,
  TarifaVigenteResuelta,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { ICupoPlanRepository } from "@/lib/interfaces/repositories/ICupoPlanRepository";
import type { IEtiquetasDescargaService } from "@/lib/interfaces/services/IEtiquetasDescargaService";
import type { IManifiestoService } from "@/lib/interfaces/services/IManifiestoService";
import type { ApiKeyAuthResult } from "@/lib/interfaces/services/IApiKeyAuthService";
import { notificadorNoOp } from "@/lib/notificaciones/notificadores";
import { clavePar, type ParTarifa } from "@/lib/utils/cascada-tarifa";

// SL-24 (R23, design §6.1) — una carga por API key que pasa el tope del plan responde 409 con
// `code: "CONFLICT"` y `details.codigo = "tope_plan"`, sin crear ninguna orden. Se ejercita el borde
// real con el `BulkOrdenService` real: lo único doble es lo que toca la base.

const AUTH: ApiKeyAuthResult = { status: "ok", actor: { usuarioId: "key-user-1", rol: "apiKey" }, apiKeyId: "k1" };

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

function buildRepo(createManyOrdenesConGuia: IOrdenRepository["createManyOrdenesConGuia"]): IOrdenRepository {
  return {
    findUsuarioFulfillment: vi.fn().mockResolvedValue(false),
    findEstatusIdByValue: vi.fn().mockResolvedValue("os-1"),
    findExistingRemisiones: vi.fn().mockResolvedValue(new Map()),
    findAllProvincias: vi.fn().mockResolvedValue([{ id: "p1", nombre: "Pichincha", disponible: true }]),
    findCantonesByProvinciaIds: vi
      .fn()
      .mockResolvedValue([{ id: "c1", nombre: "Quito", provinciaId: "p1", disponible: true }]),
    findDistritosByCantonIds: vi
      .fn()
      .mockResolvedValue([
        { id: "d1", nombre: "Barrio Uno", cantonId: "c1", zonaId: "z1", esCentral: false, disponible: true },
      ]),
    createManyOrdenesConGuia,
  } as unknown as IOrdenRepository;
}

function fila(numRemision: string): Record<string, string> {
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

function peticion(): Request {
  return new Request("http://localhost/api/ordenes/api-key/carga", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer svl_secretovivo1234567890" },
    body: JSON.stringify({ ordenes: [fila("N1"), fila("N2")] }),
  });
}

async function cargar(repo: IOrdenRepository, cupoPlan: ICupoPlanRepository) {
  const descargaService = { generarYPersistir: vi.fn() } as unknown as IEtiquetasDescargaService;
  const manifiestoService = { armar: vi.fn() } as unknown as IManifiestoService;
  const res = await handleCargaApi(peticion(), {
    autenticar: async () => AUTH,
    bulkService: new BulkOrdenService(repo, tarifaRepo, notificadorNoOp, cupoPlan),
    descargaService,
    manifiestoService,
  });
  return { res, descargaService, manifiestoService };
}

describe("SL-24 — POST /api/ordenes/api-key/carga ante el tope del plan (R23)", () => {
  it("la comprobación previa: 409 con la forma del cuerpo de design §6.1 y ninguna orden creada", async () => {
    const createManyOrdenesConGuia = vi.fn();
    const { res, descargaService, manifiestoService } = await cargar(
      buildRepo(createManyOrdenesConGuia),
      { cupoOrdenes: async () => ({ maximo: 100, usados: 99 }) },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      code: "CONFLICT",
      message:
        "Tu plan permite 100 órdenes por ciclo. Llevas 99 y esta carga trae 2. Anula órdenes que no vayas a enviar o pide un cambio de plan.",
      details: { codigo: "tope_plan", tope: "ordenes", maximo: 100, usados: 99, pedidas: 2 },
    });
    expect(createManyOrdenesConGuia).not.toHaveBeenCalled();
    expect(descargaService.generarYPersistir).not.toHaveBeenCalled();
    expect(manifiestoService.armar).not.toHaveBeenCalled();
  });

  it("el trigger rechaza y no entró ninguna: el mismo 409 con las cifras del trigger", async () => {
    const mensaje = 'tope_plan {"tope": "ordenes", "maximo": 5, "usados": 4, "pedidas": 2}';
    const delTrigger = Object.assign(new Error(mensaje), {
      name: "DriverAdapterError",
      cause: { kind: "postgres", code: "SL024", originalCode: "SL024", message: mensaje },
    });
    const { res } = await cargar(
      buildRepo(vi.fn().mockRejectedValue(delTrigger)),
      { cupoOrdenes: async () => ({ maximo: 5, usados: 0 }) },
    );

    expect(res.status).toBe(409);
    const cuerpo = (await res.json()) as { code: string; details: unknown };
    expect(cuerpo.code).toBe("CONFLICT");
    expect(cuerpo.details).toEqual({ codigo: "tope_plan", tope: "ordenes", maximo: 5, usados: 4, pedidas: 2 });
  });

  it("dentro del cupo responde 200 y crea (control)", async () => {
    const createManyOrdenesConGuia = vi.fn(async (data: CreateOrdenData[]) => ({
      creadas: data.map((d, i) => ({
        ordenId: `o${i + 1}`,
        numRemision: d.numRemision,
        numGuia: 1000 + i,
        estatusValue: "en_preparacion",
      })),
      cargaId: "carga-1",
      omitidas: [] as string[],
    }));
    const { res } = await cargar(buildRepo(createManyOrdenesConGuia as never), {
      cupoOrdenes: async () => ({ maximo: 100, usados: 98 }),
    });
    expect(res.status).toBe(200);
    expect(createManyOrdenesConGuia).toHaveBeenCalledTimes(1);
  });
});
