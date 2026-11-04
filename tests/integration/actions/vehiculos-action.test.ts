import { describe, it, expect, vi } from "vitest";
import { listarVehiculos } from "@/lib/actions/vehiculos";
import type { Actor, IVehiculoService } from "@/lib/interfaces/services/IVehiculoService";
import type { VehiculoDTO } from "@/lib/types/vehiculos";

// T10 (borde): la Server Action resuelve el actor y traduce sin sesion ->
// unauthenticated ANTES de tocar el service. La autz por rol la cubre
// vehiculo-service.test.ts. Deps inyectadas para no depender de next/headers.

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };

const getActor = (actor: Actor) => async (): Promise<Actor | null> => actor;
const noActor = async (): Promise<Actor | null> => null;

const SEED: VehiculoDTO[] = [
  { id: "veh-1", name: "camion", activo: true },
  { id: "veh-2", name: "carro", activo: true },
  { id: "veh-3", name: "moto", activo: true },
];

// SL-42 (design §4.4): `lib/actions/vehiculos.ts` se queda solo con `listarVehiculos`, la lectura
// de empresa (R17). Las escrituras del superadmin se prueban en
// `tests/unit/actions/vehiculos-plataforma-action.test.ts`.
function fakeService(overrides: Partial<IVehiculoService> = {}): IVehiculoService {
  return {
    listar: vi.fn().mockResolvedValue({ status: "ok", items: SEED }),
    listarTodos: vi.fn().mockResolvedValue({ status: "ok", items: SEED }),
    crear: vi.fn().mockResolvedValue({ status: "ok", vehiculo: SEED[0] }),
    renombrar: vi.fn().mockResolvedValue({ status: "ok", vehiculo: SEED[0] }),
    cambiarActivacion: vi.fn().mockResolvedValue({ status: "ok", vehiculo: SEED[0] }),
    ...overrides,
  };
}

describe("SL-42 (R14) — el archivo de empresa ya no exporta escrituras", () => {
  it("solo `listarVehiculos`", async () => {
    const modulo = await import("@/lib/actions/vehiculos");
    expect(Object.keys(modulo).filter((k) => typeof (modulo as Record<string, unknown>)[k] === "function")).toEqual([
      "listarVehiculos",
    ]);
  });
});

describe("R10: sin sesion valida -> unauthenticated sin tocar el service", () => {
  it("listarVehiculos", async () => {
    const service = fakeService();
    const r = await listarVehiculos({ vehiculoService: service, getActor: noActor });
    expect(r.status).toBe("unauthenticated");
    expect(service.listar).not.toHaveBeenCalled();
  });
});

describe("R9/R11: maestro autenticado -> delega en el service y devuelve ok", () => {
  it("listarVehiculos devuelve las 3 filas", async () => {
    const service = fakeService();
    const r = await listarVehiculos({ vehiculoService: service, getActor: getActor(MAESTRO) });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.items).toHaveLength(3);
    expect(service.listar).toHaveBeenCalledWith(MAESTRO);
  });
});
