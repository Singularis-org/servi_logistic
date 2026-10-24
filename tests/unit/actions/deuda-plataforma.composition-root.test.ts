import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-40 (design §5, §11.3) — EL COMPOSITION ROOT DE LA DEUDA, EJERCITADO DE VERDAD (memoria «el
// composition root que no inyecta»). Que `lib/actions/deuda-plataforma.ts` importe el repositorio no
// prueba que lo PASE: aquí se llama sin servicio inyectado y se exige que la lectura llegue al
// cliente de `getPrismaClient`, filtrada por la empresa del actor de la sesión, y que la cifra salga
// de lo que devolvió ese cliente.
//
// SL-45 (design §3, §12.3): el composition root pasa también el repositorio de pagos. La cifra
// esperada (1.600 − 1.000 = 600) solo sale si los pagos del libro se leen y se restan, y si el pago
// con contra-asiento (250) queda fuera.

const groupBy = vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [
  { tipo: "cargo", _sum: { monto: new Prisma.Decimal("2100") } },
  { tipo: "reverso", _sum: { monto: new Prisma.Decimal("500.00") } },
]);

/** Dos pagos en el libro; el de 250 tiene contra-asiento (anulado) y no cuenta. */
const findMany = vi.fn<(args: { where: { categoria?: string } }) => Promise<unknown[]>>(async (args) =>
  args.where.categoria === "egreso_pago_plataforma"
    ? [
        { id: "p-1", monto: new Prisma.Decimal("1000.00") },
        { id: "p-2", monto: new Prisma.Decimal("250.00") },
      ]
    : [{ origenId: "p-2" }],
);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ cobroPlataformaMovimiento: { groupBy }, walletMovimiento: { findMany } }),
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
  findMany.mockClear();
  actorDeLaSesion = null;
});

describe("SL-40/SL-45 — verDeudaPlataformaAction cablea los repositorios reales (R13, R14, R24, R25)", () => {
  it("con el actor de la sesión, lee cargos y pagos por el cliente real, filtrados por su empresa, y deriva la deuda", async () => {
    actorDeLaSesion = maestroA;
    const r = await verDeudaPlataformaAction();

    expect(r).toEqual({ status: "ok", deudaPlataforma: { deuda: "600.00", estado: "debe", importe: "600.00" } });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ["tipo"],
      where: { organizacionId: "org-a" },
      _sum: { monto: true },
    });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0]).toEqual({
      where: { organizacionId: "org-a", tipo: "egreso", categoria: "egreso_pago_plataforma" },
      select: { id: true, monto: true },
    });
    expect(findMany.mock.calls[1][0]).toEqual({
      where: {
        organizacionId: "org-a",
        tipo: "ingreso",
        categoria: "ingreso_ajuste",
        origenTipo: "gasto",
        origenId: { in: ["p-1", "p-2"] },
      },
      select: { origenId: true },
    });
  });

  it("sin sesión, forbidden y no se lee nada", async () => {
    expect(await verDeudaPlataformaAction()).toEqual({ status: "forbidden" });
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([RolValue.mensajero, RolValue.adminTienda, RolValue.superadmin])(
    "el rol %s recibe forbidden y no se lee nada",
    async (rol) => {
      expect(await verDeudaPlataformaAction({ getActor: async () => ({ ...maestroA, rol }) })).toEqual({
        status: "forbidden",
      });
      expect(groupBy).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});
