import { describe, expect, it, vi } from "vitest";

import { PlanesRepository } from "@/lib/repositories/PlanesRepository";

// Ajuste planes-custom (D16; 2026-11-03) — `PlanesRepository` con Prisma de dobles (sin base):
//   · `cambiarTipoCobro` escribe la acción PROPIA `plan_tipo_cobro_cambiado`, con el tipo de antes y el
//     nuevo, y ya no `plan_asignado`;
//   · `planDeEmpresa` lee el historial de asignaciones con las dos acciones y devuelve la de cada fila,
//     para que D14 siga distinguiendo la fila de solo el tipo.
// Lo mismo contra Postgres: `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`.

const ORG = "org-d16";
const PLAN = "plan-d16";
const ACTOR = "usuario-d16";

type Repo = ConstructorParameters<typeof PlanesRepository>[0];

/** Una `tx` que contesta a `cambiarTipoCobro`: la empresa, su plan y el actor. */
function txDeCambio(tipoActual: string) {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce([{ plan_id: PLAN, plan_tipo_cobro: tipoActual }])
    .mockResolvedValueOnce([{ nombre: "Norte" }]);
  const executeRaw = vi.fn(async () => 1);
  const createMany = vi.fn(async () => ({ count: 1 }));
  const findUnique = vi.fn(async () => ({ nombre: "Ana", primerApellido: "Mora", rol: { value: "superadmin" } }));
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    usuario: { findUnique },
    historialAccion: { createMany },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } as unknown as Repo;
  return { prisma, executeRaw, createMany };
}

/** Una `tx` que contesta a `planDeEmpresa` de una empresa SIN plan (corta tras leer el historial). */
function txDeLectura(filas: unknown[]) {
  const findMany = vi.fn(async () => filas);
  const tx = {
    organizacion: {
      findUnique: vi.fn(async () => ({
        planCicloAnclaAt: null,
        planCicloCortoDesdeAt: null,
        planTipoCobro: "mensual",
        plan: null,
      })),
    },
    historialAccion: { findMany },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } as unknown as Repo;
  return { prisma, findMany };
}

describe("D16 — cambiarTipoCobro deja su acción propia en el historial", () => {
  it("escribe `plan_tipo_cobro_cambiado` con el tipo de antes y el nuevo, sobre el plan de la empresa", async () => {
    const { prisma, executeRaw, createMany } = txDeCambio("mensual");

    const r = await new PlanesRepository(prisma).cambiarTipoCobro(ORG, "anual", ACTOR);

    expect(r).toEqual({ estado: "ok", cambio: true });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    const { data } = (createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }])[0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      accion: "plan_tipo_cobro_cambiado",
      entidadTipo: "plan",
      entidadId: PLAN,
      entidadEtiqueta: "Plan «Norte»",
      valorAnterior: "mensual",
      valorNuevo: "anual",
      organizacionId: ORG,
    });
    expect(data[0].accion).not.toBe("plan_asignado");
  });

  it("de anual a mensual, lo mismo al revés", async () => {
    const { prisma, createMany } = txDeCambio("anual");

    await new PlanesRepository(prisma).cambiarTipoCobro(ORG, "mensual", ACTOR);

    const { data } = (createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }])[0];
    expect(data[0]).toMatchObject({ accion: "plan_tipo_cobro_cambiado", valorAnterior: "anual", valorNuevo: "mensual" });
  });

  it("el mismo tipo no escribe nada (D10), tampoco historial", async () => {
    const { prisma, executeRaw, createMany } = txDeCambio("anual");

    const r = await new PlanesRepository(prisma).cambiarTipoCobro(ORG, "anual", ACTOR);

    expect(r).toEqual({ estado: "ok", cambio: false });
    expect(executeRaw).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("D14, D16 — planDeEmpresa lee las dos acciones del historial de asignaciones", () => {
  const creadoAt = new Date("2026-11-03T15:00:00.000Z");

  it("filtra por `plan_asignado` y `plan_tipo_cobro_cambiado` de la empresa y devuelve la acción de cada fila", async () => {
    const { prisma, findMany } = txDeLectura([
      { createdAt: creadoAt, actorNombre: "Ana", entidadEtiqueta: "Plan «Norte»", accion: "plan_tipo_cobro_cambiado", valorAnterior: "mensual", valorNuevo: "anual" },
      { createdAt: creadoAt, actorNombre: "Ana", entidadEtiqueta: "Plan «Norte»", accion: "plan_asignado", valorAnterior: null, valorNuevo: "mensual" },
    ]);

    const r = await new PlanesRepository(prisma).planDeEmpresa(ORG);

    const arg = (findMany.mock.calls[0] as unknown as [{ where: unknown; orderBy: unknown; select: Record<string, boolean> }])[0];
    expect(arg.where).toEqual({ organizacionId: ORG, accion: { in: ["plan_asignado", "plan_tipo_cobro_cambiado"] } });
    // Orden total y estable: `created_at` es TIMESTAMP(3) y puede empatar; `id` (único) desempata siempre igual.
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.select.accion).toBe(true);
    expect(r).toEqual({
      organizacionId: ORG,
      plan: null,
      asignaciones: [
        { creadoAt, actorNombre: "Ana", planNombre: "Plan «Norte»", accion: "plan_tipo_cobro_cambiado", valorAnterior: "mensual", valorNuevo: "anual" },
        { creadoAt, actorNombre: "Ana", planNombre: "Plan «Norte»", accion: "plan_asignado", valorAnterior: null, valorNuevo: "mensual" },
      ],
    });
  });

  it("una fila con otra acción es un error ruidoso, no una asignación inventada", async () => {
    const { prisma } = txDeLectura([
      { createdAt: creadoAt, actorNombre: "Ana", entidadEtiqueta: "Plan «Norte»", accion: "modulo_activado", valorAnterior: null, valorNuevo: null },
    ]);

    await expect(new PlanesRepository(prisma).planDeEmpresa(ORG)).rejects.toThrow(/modulo_activado/);
  });
});
