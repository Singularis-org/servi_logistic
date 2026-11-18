import { describe, it, expect, vi } from "vitest";
import { GuiaAsignacionService } from "@/lib/services/GuiaAsignacionService";
import { fakeIntentosEnLote } from "@/tests/fixtures/intentos-entrega";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IAsignabilidadCoordenadasService } from "@/lib/interfaces/services/IAsignabilidadCoordenadasService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-197 «Retirar paquetes de una bodega satelite a la central» — servicio con dobles.
// El `WHERE` del repositorio se prueba contra Postgres real en
// `tests/integration/db/retiro-satelite-central.int.test.ts`; aqui solo la decision del servicio.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };

function fila(id: string, estatusValue: string, zonaId: string, deletedAt: Date | null = null) {
  return {
    id,
    estatusValue,
    numGuia: 100,
    deletedAt,
    zonaId,
    zonaEsGam: false,
    tiendaId: "store-1",
    fechaReparto: null,
  };
}

function fakeRepo(overrides: Partial<IOrdenRepository> = {}): IOrdenRepository {
  return {
    findByIdsForTransicion: vi.fn(async () => [
      fila("o1", "en_bodega_satelite", "z-cartago"),
      fila("o2", "en_bodega_satelite", "z-limon"),
    ]),
    findEstatusIdByValue: vi.fn(async (v: string) =>
      v === "en_ruta_bodega_central" ? "os-ruta-central" : null,
    ),
    retirarSateliteLote: vi.fn(async () => "ok" as const),
    ...overrides,
  } as unknown as IOrdenRepository;
}

function fakeZonaRepo(): IZonaRepository {
  return { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository;
}

function newService(repo: IOrdenRepository) {
  return new GuiaAsignacionService(
    repo,
    fakeZonaRepo(),
    {} as IAsignabilidadCoordenadasService,
    fakeIntentosEnLote(),
    reglasPaisFijas(),
  );
}

describe("SLT-197 R975: solo maestro y admin retiran", () => {
  it.each([
    ["adminSatelite", { usuarioId: "u-sat", rol: "adminSatelite" }],
    ["adminTienda", { usuarioId: "u-tienda", rol: "adminTienda" }],
    ["mensajero", { usuarioId: "u-msg", rol: "mensajero" }],
  ] as const)("%s -> forbidden sin leer ni escribir", async (_n, actor) => {
    const repo = fakeRepo();
    const r = await newService(repo).retirarABodegaCentral(
      { ordenIds: ["o1"] },
      actor as unknown as Actor,
    );
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.findByIdsForTransicion).not.toHaveBeenCalled();
    expect(repo.retirarSateliteLote).not.toHaveBeenCalled();
  });
});

describe("SLT-197 R971/R985: lote valido", () => {
  it("R971: llama al repo una vez con el destino, el actor y la familia ajuste_estado", async () => {
    const repo = fakeRepo();
    const r = await newService(repo).retirarABodegaCentral({ ordenIds: ["o1", "o2"] }, MAESTRO);
    expect(r).toEqual({
      status: "ok",
      resultados: [
        { ordenId: "o1", estado: "en_ruta_bodega_central" },
        { ordenId: "o2", estado: "en_ruta_bodega_central" },
      ],
    });
    expect(repo.retirarSateliteLote).toHaveBeenCalledTimes(1);
    expect(repo.retirarSateliteLote).toHaveBeenCalledWith(["o1", "o2"], "os-ruta-central", {
      actorUsuarioId: "u-maestro",
      origenTipo: "ajuste_estado",
    });
  });

  it("R985: un lote de dos zonas satelite distintas sale entero (no se filtra por zona)", async () => {
    const repo = fakeRepo();
    const r = await newService(repo).retirarABodegaCentral({ ordenIds: ["o1", "o2"] }, ADMIN);
    expect(r.status).toBe("ok");
    expect(repo.retirarSateliteLote).toHaveBeenCalledWith(
      ["o1", "o2"],
      "os-ruta-central",
      { actorUsuarioId: "u-admin", origenTipo: "ajuste_estado" },
    );
  });

  it("ids repetidos se retiran una sola vez", async () => {
    const repo = fakeRepo();
    await newService(repo).retirarABodegaCentral({ ordenIds: ["o1", "o1", "o2"] }, MAESTRO);
    expect(vi.mocked(repo.retirarSateliteLote).mock.calls[0]![0]).toEqual(["o1", "o2"]);
  });
});

describe("SLT-197 R973: el lote entero se rechaza con el motivo de cada orden", () => {
  it("inexistente, borrada y en otro estado -> conflict con detalle, sin escribir", async () => {
    const repo = fakeRepo({
      findByIdsForTransicion: vi.fn(async () => [
        fila("o1", "en_bodega_satelite", "z-cartago"),
        fila("o2", "en_bodega_satelite", "z-cartago", new Date("2026-11-01T00:00:00Z")),
        fila("o3", "mensajero_recogiendo_en_bodega", "z-cartago"),
      ]),
    });
    const r = await newService(repo).retirarABodegaCentral(
      { ordenIds: ["o1", "o2", "o3", "o-fantasma"] },
      MAESTRO,
    );
    expect(r).toEqual({
      status: "conflict",
      detalle: [
        { ordenId: "o2", motivo: "orden borrada" },
        { ordenId: "o3", motivo: "estado de origen no permitido: mensajero_recogiendo_en_bodega" },
        { ordenId: "o-fantasma", motivo: "orden no existe" },
      ],
    });
    expect(repo.retirarSateliteLote).not.toHaveBeenCalled();
  });

  it("R970: una orden ya en en_bodega_central no se retira (no hay salida directa)", async () => {
    const repo = fakeRepo({
      findByIdsForTransicion: vi.fn(async () => [fila("o1", "en_bodega_central", "z-cartago")]),
    });
    const r = await newService(repo).retirarABodegaCentral({ ordenIds: ["o1"] }, MAESTRO);
    expect(r).toEqual({
      status: "conflict",
      detalle: [{ ordenId: "o1", motivo: "estado de origen no permitido: en_bodega_central" }],
    });
    expect(repo.retirarSateliteLote).not.toHaveBeenCalled();
  });
});

describe("SLT-197 R974: cambio de estado entre validar y escribir", () => {
  it("el repo devuelve conflicto -> conflict para todo el lote", async () => {
    const repo = fakeRepo({ retirarSateliteLote: vi.fn(async () => "conflicto" as const) });
    const r = await newService(repo).retirarABodegaCentral({ ordenIds: ["o1", "o2"] }, MAESTRO);
    expect(r).toEqual({
      status: "conflict",
      detalle: [
        { ordenId: "o1", motivo: "la orden cambió de estado; recarga" },
        { ordenId: "o2", motivo: "la orden cambió de estado; recarga" },
      ],
    });
  });
});

describe("SLT-197: bordes del servicio", () => {
  it("catalogo sin en_ruta_bodega_central -> validation_error sin escribir", async () => {
    const repo = fakeRepo({ findEstatusIdByValue: vi.fn(async () => null) });
    const r = await newService(repo).retirarABodegaCentral({ ordenIds: ["o1"] }, MAESTRO);
    expect(r.status).toBe("validation_error");
    expect(repo.retirarSateliteLote).not.toHaveBeenCalled();
  });

  it("lote vacio -> ok sin resultados ni escritura (defensa; la action exige min 1)", async () => {
    const repo = fakeRepo();
    const r = await newService(repo).retirarABodegaCentral({ ordenIds: [] }, MAESTRO);
    expect(r).toEqual({ status: "ok", resultados: [] });
    expect(repo.findByIdsForTransicion).not.toHaveBeenCalled();
  });
});
