import { describe, it, expect, vi, beforeEach } from "vitest";

import type { IDistritoZonaEspecialService } from "@/lib/interfaces/services/IDistritoZonaEspecialService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";

// SL-38 / T6 (design §3) — el borde de la marca de zona especial: sin sesion (R11), validacion de la
// entrada (R12) y el composition root.
//
// POR QUE EL COMPOSITION ROOT SE EJERCITA DE VERDAD. El servicio recibe el repositorio que escribe,
// y el unico sitio que se lo pasa es `buildDistritoZonaEspecialService()`. Comprobar que el modulo
// IMPORTA el repositorio no basta: hay que comprobar que alguien lo PASA. Se mockea `getPrismaClient`
// con un cliente falso que responde la transaccion, se llama a la accion SIN servicio inyectado y se
// exige el numero que solo el repositorio real puede sacar del cliente.

const deleteMany = vi.fn<(a: { where: { distritoId: { in: string[] } } }) => Promise<{ count: number }>>(
  async () => ({ count: 1 }),
);
const createMany = vi.fn<(a: { data: { distritoId: string }[]; skipDuplicates: boolean }) => Promise<{ count: number }>>(
  async () => ({ count: 2 }),
);
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({ distritoZonaEspecial: { deleteMany, createMany } }),
);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ $transaction: transaction }),
  PRISMA_OMIT: {},
}));

const { actualizarDistritosEspeciales } = await import("@/lib/actions/geografia");

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

function servicioDoble() {
  const actualizar = vi.fn<IDistritoZonaEspecialService["actualizar"]>(async () => ({
    status: "ok",
    actualizados: 9,
  }));
  return { service: { actualizar }, actualizar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SL-38 — actualizarDistritosEspeciales, el borde", () => {
  it("R11: sin sesion responde unauthenticated sin llamar al servicio", async () => {
    const { service, actualizar } = servicioDoble();
    const r = await actualizarDistritosEspeciales(
      { marcar: ["d1"], desmarcar: [] },
      { getActor: async () => null, distritoZonaEspecialService: service },
    );
    expect(r).toEqual({ status: "unauthenticated" });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it.each([
    ["un id vacio", { marcar: [""], desmarcar: [] }],
    ["una lista que no es lista", { marcar: "d1" }],
    ["una entrada que no es objeto", "d1"],
  ])("R12: %s responde validation_error sin llamar al servicio", async (_caso, entrada) => {
    const { service, actualizar } = servicioDoble();
    const r = await actualizarDistritosEspeciales(entrada, {
      getActor: async () => MAESTRO,
      distritoZonaEspecialService: service,
    });
    expect(r).toEqual({ status: "validation_error" });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("una entrada valida llega al servicio con el actor y las listas por defecto, y se devuelve su resultado", async () => {
    const { service, actualizar } = servicioDoble();
    const r = await actualizarDistritosEspeciales(
      { marcar: ["d1"] },
      { getActor: async () => MAESTRO, distritoZonaEspecialService: service },
    );
    expect(r).toEqual({ status: "ok", actualizados: 9 });
    expect(actualizar).toHaveBeenCalledWith({ marcar: ["d1"], desmarcar: [] }, MAESTRO);
  });

  it("composition root: sin servicio inyectado, el repositorio real escribe por el cliente en UNA transaccion", async () => {
    const r = await actualizarDistritosEspeciales(
      { marcar: ["d1", "d2"], desmarcar: ["d3"] },
      { getActor: async () => MAESTRO },
    );
    // 2 creadas + 1 borrada: el numero sale del cliente, asi que el repositorio llego y se uso.
    expect(r).toEqual({ status: "ok", actualizados: 3 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { distritoId: { in: ["d3"] } } });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ distritoId: "d1" }, { distritoId: "d2" }],
      skipDuplicates: true,
    });
  });

  it("composition root: el rol se decide en el servicio construido, sin abrir transaccion", async () => {
    const r = await actualizarDistritosEspeciales(
      { marcar: ["d1"], desmarcar: [] },
      { getActor: async () => ({ usuarioId: "u-2", rol: "adminSatelite" }) },
    );
    expect(r).toEqual({ status: "forbidden" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
