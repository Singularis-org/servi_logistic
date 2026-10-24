import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-40 (design §5, §11.3) — EL COMPOSITION ROOT DE LA DEUDA, EJERCITADO DE VERDAD (memoria «el
// composition root que no inyecta»). Que `lib/actions/deuda-plataforma.ts` importe el repositorio no
// prueba que lo PASE: aquí se llama sin servicio inyectado y se exige que la lectura llegue al
// cliente de `getPrismaClient`, filtrada por la empresa del actor de la sesión, y que la cifra salga
// de lo que devolvió ese cliente.

const groupBy = vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [
  { tipo: "cargo", _sum: { monto: new Prisma.Decimal("2100") } },
  { tipo: "reverso", _sum: { monto: new Prisma.Decimal("500.00") } },
]);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ cobroPlataformaMovimiento: { groupBy } }),
  PRISMA_OMIT: {},
}));

let actorDeLaSesion: Actor | null = null;
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: async () => actorDeLaSesion,
}));

const { verDeudaPlataformaAction } = await import("@/lib/actions/deuda-plataforma");

const maestroA: Actor = { usuarioId: "u-a", rol: RolValue.maestro, organizacionId: "org-a" };

beforeEach(() => {
  groupBy.mockClear();
  actorDeLaSesion = null;
});

describe("SL-40 — verDeudaPlataformaAction cablea el repositorio real (R24, R25, R26)", () => {
  it("con el actor de la sesión, lee por el cliente real, filtrado por su empresa, y deriva la deuda", async () => {
    actorDeLaSesion = maestroA;
    const r = await verDeudaPlataformaAction();

    expect(r).toEqual({ status: "ok", deudaPlataforma: { deuda: "1600.00" } });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ["tipo"],
      where: { organizacionId: "org-a" },
      _sum: { monto: true },
    });
  });

  it("sin sesión, forbidden y no se lee nada", async () => {
    expect(await verDeudaPlataformaAction()).toEqual({ status: "forbidden" });
    expect(groupBy).not.toHaveBeenCalled();
  });

  it.each([RolValue.mensajero, RolValue.adminTienda, RolValue.superadmin])(
    "el rol %s recibe forbidden y no se lee nada",
    async (rol) => {
      expect(await verDeudaPlataformaAction({ getActor: async () => ({ ...maestroA, rol }) })).toEqual({
        status: "forbidden",
      });
      expect(groupBy).not.toHaveBeenCalled();
    },
  );
});
