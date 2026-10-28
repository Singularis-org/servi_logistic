import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-40 T5 (design §5) — EL COMPOSITION ROOT PASA EL REPOSITORIO REAL, no solo lo importa (memoria
// «el composition root que no inyecta»: 2 de 7 notificadores muertos con la suite verde).
//
// Se mockea solo `getPrismaClient`, con un cliente falso que responde lo que el repositorio REAL le
// pide, y se llaman las actions reales sin `deps.service`: el servicio sale del root de verdad. Si el
// root construyera el servicio con otro repositorio, o con ninguno, el importe no llegaría y el
// cliente falso no vería las llamadas.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: "org-a" };

const tarifaFindUnique = vi.fn<(args: unknown) => Promise<{ monto: Prisma.Decimal }>>(async () => ({ monto: new Prisma.Decimal("500") }));
const tarifaUpsert = vi.fn<(args: unknown) => Promise<object>>(async () => ({}));
const organizacionFindUnique = vi.fn<(args: unknown) => Promise<{ id: string }>>(async () => ({ id: "org-b" }));
const organizacionUpdateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 }));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    cobroPlataformaTarifa: { findUnique: tarifaFindUnique, upsert: tarifaUpsert },
    organizacion: { findUnique: organizacionFindUnique, updateMany: organizacionUpdateMany },
  }),
  PRISMA_OMIT: {},
}));

const { verCobroGlobalAction, fijarCobroGlobalAction, fijarCobroEmpresaAction } = await import(
  "@/lib/actions/cobro-plataforma"
);

const comoSuperadmin = { getActor: async () => SUPERADMIN };

beforeEach(() => vi.clearAllMocks());

describe("SL-40 — el composition root de cobro-plataforma pasa CobroPlataformaTarifaRepository", () => {
  it("verCobroGlobalAction, sin deps.service, devuelve el global que lee el repositorio real con dos decimales", async () => {
    expect(await verCobroGlobalAction(comoSuperadmin)).toEqual({ status: "ok", cobroGlobal: { monto: "500.00" } });
    // Anti-vacuidad: el «500.00» solo puede salir del `toFixed(2)` del repositorio real sobre este cliente.
    expect(tarifaFindUnique).toHaveBeenCalledTimes(1);
  });

  it("fijarCobroGlobalAction llega al upsert de la fila única con el texto validado", async () => {
    expect(await fijarCobroGlobalAction({ monto: "600.00" }, comoSuperadmin)).toEqual({ status: "ok" });
    expect(tarifaUpsert).toHaveBeenCalledExactlyOnceWith({
      where: { id: true },
      create: { id: true, monto: "600.00" },
      update: { monto: "600.00" },
    });
  });

  it("fijarCobroEmpresaAction comprueba la empresa y escribe SOLO su fila", async () => {
    expect(await fijarCobroEmpresaAction({ organizacionId: "org-b", monto: null }, comoSuperadmin)).toEqual({ status: "ok" });
    expect(organizacionFindUnique).toHaveBeenCalledTimes(1);
    expect(organizacionUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "org-b" },
      data: { cobroPlataformaPorOrden: null },
    });
  });

  it("un maestro recibe forbidden y el cliente no se toca", async () => {
    const deps = { getActor: async () => MAESTRO };
    expect(await verCobroGlobalAction(deps)).toEqual({ status: "forbidden" });
    expect(await fijarCobroGlobalAction({ monto: "1.00" }, deps)).toEqual({ status: "forbidden" });
    expect(await fijarCobroEmpresaAction({ organizacionId: "org-b", monto: "1.00" }, deps)).toEqual({ status: "forbidden" });
    expect(tarifaFindUnique).not.toHaveBeenCalled();
    expect(tarifaUpsert).not.toHaveBeenCalled();
    expect(organizacionFindUnique).not.toHaveBeenCalled();
    expect(organizacionUpdateMany).not.toHaveBeenCalled();
  });
});
