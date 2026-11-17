import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-129 · T5 (design §4; R1) — el borde del borrador: el actor sale de la sesión y el composition root pasa el
// repositorio real. Se mockean solo la sesión y `getPrismaClient`; si el root montara el servicio con otro
// repositorio, el cliente falso no vería las llamadas.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: "org-a" };
const BORRADOR = randomUUID();

const sesion = vi.fn(async (): Promise<Actor | null> => SUPERADMIN);
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: () => sesion() }));

const deleteMany = vi.fn(async () => ({ count: 1 }));
const findUnique = vi.fn(async () => null);
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ planBorrador: { deleteMany, findUnique } }));
vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ $transaction: transaction }),
  PRISMA_OMIT: {},
}));

const acciones = await import("@/lib/actions/plan-borrador");

beforeEach(() => vi.clearAllMocks());

describe("SLT-129 — el borde del borrador de planes", () => {
  it("R14 — descartar, con el actor de la sesión, borra por PlanesRepository", async () => {
    expect(await acciones.descartarBorradorAction({ borradorId: BORRADOR })).toEqual({ estado: "ok" });
    expect(sesion).toHaveBeenCalledOnce();
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: BORRADOR } });
  });

  it("R20 — confirmar lee el borrador por el repositorio real: sin fila, borrador_no_encontrado", async () => {
    expect(await acciones.confirmarBorradorAction({ borradorId: BORRADOR })).toEqual({ estado: "borrador_no_encontrado" });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: BORRADOR } });
  });

  it("R1 — con la sesión de un maestro, forbidden en las tres y la base no se toca", async () => {
    sesion.mockResolvedValue(MAESTRO);
    const guardar = { modo: "crear", borradorId: null, paso: "general", valores: { nombre: "X" } };
    expect(await acciones.guardarPasoBorradorAction(guardar)).toEqual({ estado: "forbidden" });
    expect(await acciones.descartarBorradorAction({ borradorId: BORRADOR })).toEqual({ estado: "forbidden" });
    expect(await acciones.confirmarBorradorAction({ borradorId: BORRADOR })).toEqual({ estado: "forbidden" });
    expect(transaction).not.toHaveBeenCalled();
    sesion.mockResolvedValue(SUPERADMIN);
  });

  it("el cliente no elige el actor: un servicio inyectado recibe el de getActor", async () => {
    const descartar = vi.fn(async () => ({ estado: "ok" as const }));
    const service = { guardarPaso: vi.fn(), descartar, confirmar: vi.fn() };
    await acciones.descartarBorradorAction({ borradorId: BORRADOR, actor: SUPERADMIN }, { service, getActor: async () => MAESTRO });
    expect(descartar).toHaveBeenCalledWith(MAESTRO, { borradorId: BORRADOR, actor: SUPERADMIN });
  });
});
