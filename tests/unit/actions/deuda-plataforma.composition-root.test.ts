import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// SL-40 (design §5, §11.3) — EL COMPOSITION ROOT DE LA DEUDA, EJERCITADO DE VERDAD (memoria «el
// composition root que no inyecta»). Que `lib/actions/deuda-plataforma.ts` importe el repositorio no
// prueba que lo PASE: aquí se llama sin servicio inyectado y se exige que la lectura llegue al
// cliente de `getPrismaClient`, filtrada por la empresa del actor de la sesión, y que la cifra salga
// de lo que devolvió ese cliente.
//
// SL-45 (design §3, §12.3): el composition root pasa también el repositorio de pagos.
// SLT-60 (design §4.1, R7): la deuda resta solo los pagos CONFIRMADOS, que son la suma de las
// aplicaciones de la empresa. La cifra esperada (1.600 − 1.000 = 600) solo sale si esa suma se lee
// por el cliente real y se resta; el libro de la wallet (`walletMovimiento.findMany`, que devolvería
// 9.999) ya no se lee: un pago por confirmar no baja la deuda (R6).

const groupBy = vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [
  { tipo: "cargo", _sum: { monto: new Prisma.Decimal("2100") } },
  { tipo: "reverso", _sum: { monto: new Prisma.Decimal("500.00") } },
]);

/** Trampa: si la deuda volviera a leer los pagos del libro, restaría 9.999 en vez de 1.000. */
const findMany = vi.fn(async () => [{ id: "p-1", monto: new Prisma.Decimal("9999.00") }]);

/** Σ de las aplicaciones de la empresa = Σ de sus pagos confirmados (design §3.4). */
const aggregateAplicaciones = vi.fn<(args: unknown) => Promise<unknown>>(async () => ({
  _sum: { monto: new Prisma.Decimal("1000.00") },
}));

// SLT-118 (design §5; R18): la deuda suma también las cuotas de las facturas cerradas; aquí, ninguna.
const aggregate = vi.fn(async () => ({ _sum: { cuota: null, primeraCuota: null } }));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    cobroPlataformaMovimiento: { groupBy },
    walletMovimiento: { findMany },
    pagoPlataformaAplicacion: { aggregate: aggregateAplicaciones },
    facturaPlataforma: { aggregate },
  }),
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
  aggregateAplicaciones.mockClear();
  actorDeLaSesion = null;
});

describe("SL-40/SL-45 — verDeudaPlataformaAction cablea los repositorios reales (R13, R14, R24, R25; SLT-60 R7)", () => {
  it("con el actor de la sesión, lee cargos y pagos confirmados por el cliente real, filtrados por su empresa, y deriva la deuda", async () => {
    actorDeLaSesion = maestroA;
    const r = await verDeudaPlataformaAction();

    expect(r).toEqual({ status: "ok", deudaPlataforma: { deuda: "600.00", estado: "debe", importe: "600.00" } });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ["tipo"],
      where: { organizacionId: "org-a" },
      _sum: { monto: true },
    });
    expect(aggregateAplicaciones).toHaveBeenCalledTimes(1);
    expect(aggregateAplicaciones).toHaveBeenCalledWith({
      where: { organizacionId: "org-a" },
      _sum: { monto: true },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("sin sesión, forbidden y no se lee nada", async () => {
    expect(await verDeudaPlataformaAction()).toEqual({ status: "forbidden" });
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(aggregateAplicaciones).not.toHaveBeenCalled();
  });

  it.each([RolValue.mensajero, RolValue.adminTienda, RolValue.superadmin])(
    "el rol %s recibe forbidden y no se lee nada",
    async (rol) => {
      expect(await verDeudaPlataformaAction({ getActor: async () => ({ ...maestroA, rol }) })).toEqual({
        status: "forbidden",
      });
      expect(groupBy).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
      expect(aggregateAplicaciones).not.toHaveBeenCalled();
    },
  );
});
