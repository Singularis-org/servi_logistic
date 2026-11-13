import { describe, expect, it, vi } from "vitest";

import { PlanesRepository } from "@/lib/repositories/PlanesRepository";

// Ajuste planes-custom (D16; 2026-11-03) — `PlanesRepository` con Prisma de dobles (sin base):
//   · `cambiarTipoCobro` escribe la acción PROPIA `plan_tipo_cobro_cambiado`, con el tipo de antes y el
//     nuevo, y ya no `plan_asignado`;
//   · `planDeEmpresa` lee el historial de asignaciones con las dos acciones y devuelve la de cada fila,
//     para que D14 siga distinguiendo la fila de solo el tipo.
// Lo mismo contra Postgres: `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`.
//
// SLT-86 (R16, R17, R30): el cambio lleva fecha de efecto; con la de hoy se aplica en el acto, y el
// `valor_nuevo` lleva la fecha delante del tipo. El pendiente con fecha futura se mide contra Postgres en
// `tests/integration/db/planes-cambio-empresa.test.ts`.

const ORG = "org-d16";
const PLAN = "plan-d16";
const ACTOR = "usuario-d16";

type Repo = ConstructorParameters<typeof PlanesRepository>[0];

/** «Hoy» del caso y la fecha de efecto de hoy: el cambio rige ya (R18). */
const AHORA = new Date("2026-11-03T15:00:00.000Z");
const HOY = { clase: "cambio", fecha: "2026-11-03", desde: new Date("2026-11-03T06:00:00.000Z"), elegida: true } as const;

/**
 * SLT-118 (R30, R31): mensual ↔ anual solo se aplica en el acto en un inicio del tipo de referencia (el
 * anual): «hoy» = 1 de enero. Con el 3 de noviembre quedaría pendiente hasta el próximo 1 de enero.
 */
const AHORA_1_ENERO = new Date("2027-01-01T15:00:00.000Z");
const HOY_1_ENERO = { clase: "cambio", fecha: "2027-01-01", desde: new Date("2027-01-01T06:00:00.000Z"), elegida: true } as const;

/** Una `tx` que contesta a `cambiarTipoCobro`: la empresa bajo cerrojo, su plan y el actor. */
function txDeCambio(tipoActual: string) {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce([
      {
        id: ORG,
        nombre: "Mensajería Uno",
        plan_id: PLAN,
        plan_tipo_cobro: tipoActual,
        plan_cambio_id: null,
        plan_cambio_plan_id: null,
        plan_cambio_tipo_cobro: null,
        plan_cambio_desde_at: null,
        plan_cambio_actor_id: null,
      },
    ])
    .mockResolvedValueOnce([{ id: PLAN }]);
  const executeRaw = vi.fn(async () => 1);
  const createMany = vi.fn(async () => ({ count: 1 }));
  const findUnique = vi.fn(async () => ({ nombre: "Ana", primerApellido: "Mora", rol: { value: "superadmin" } }));
  const plan = {
    findUnique: vi.fn(async () => ({
      id: PLAN,
      nombre: "Norte",
      visibilidad: "publico",
      organizacionExclusivaId: null,
      topeApiKeys: null,
      precioMensual: null,
      costoPorOrden: null,
      costoPorOrdenPct: null,
      costoPorOrdenMinimo: null,
      periodicidadOrdenes: "quincenal", // SLT-118 R35: la columna NOT NULL
      archivadoAt: null,
      topesPorRol: [],
      modulos: [],
      descuentos: [],
    })),
  };
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    usuario: { findUnique },
    plan,
    // SLT-128 (R19): el cambio de tipo busca una recepción del pendiente del plan que mover; aquí no hay pendiente.
    planCambioProgramado: { findUnique: vi.fn(async () => null) },
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
        planTipoCobro: "mensual",
        plan: null,
        // SLT-86 (R26): sin pendiente de empresa.
        planCambioTipoCobro: null,
        planCambioDesdeAt: null,
        planCambioPlanId: null,
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

    const r = await new PlanesRepository(prisma).cambiarTipoCobro(ORG, "anual", HOY_1_ENERO, ACTOR, AHORA_1_ENERO);

    expect(r).toEqual({ estado: "ok", cambio: true, pendiente: false });
    // SLT-118 (design §2.3; R15–R17, R28): dos escrituras, en este orden. Primero las facturas de la plataforma
    // toman el cambio (empresa, desde, plan, tipo) y DESPUÉS se actualiza la empresa: la función distingue una
    // primera asignación por `plan_id IS NULL`, que el UPDATE ya no dejaría ver.
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const llamadas = executeRaw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][];
    const [toma, ...valoresDeToma] = llamadas[0];
    expect(toma.join("?")).toContain("factura_plataforma_tomar_cambio(");
    expect(valoresDeToma).toEqual([ORG, "2027-01-01 06:00:00.000", PLAN, "anual"]);
    expect(llamadas[1][0].join("?")).toContain('UPDATE "organizacion"');
    expect(createMany).toHaveBeenCalledTimes(1);
    const { data } = (createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }])[0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      accion: "plan_tipo_cobro_cambiado",
      entidadTipo: "plan",
      entidadId: PLAN,
      entidadEtiqueta: "Plan «Norte»",
      valorAnterior: "mensual",
      // SLT-86 (R30): la fecha de efecto delante del tipo.
      valorNuevo: "2027-01-01 · anual",
      organizacionId: ORG,
    });
    expect(data[0].accion).not.toBe("plan_asignado");
  });

  it("de anual a mensual, lo mismo al revés", async () => {
    const { prisma, createMany } = txDeCambio("anual");

    await new PlanesRepository(prisma).cambiarTipoCobro(ORG, "mensual", HOY_1_ENERO, ACTOR, AHORA_1_ENERO);

    const { data } = (createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }])[0];
    expect(data[0]).toMatchObject({ accion: "plan_tipo_cobro_cambiado", valorAnterior: "anual", valorNuevo: "2027-01-01 · mensual" });
  });

  it("el mismo tipo sin pendiente no escribe nada (D10, SLT-86 R19), tampoco historial", async () => {
    const { prisma, executeRaw, createMany } = txDeCambio("anual");

    const r = await new PlanesRepository(prisma).cambiarTipoCobro(ORG, "anual", HOY, ACTOR, AHORA);

    expect(r).toEqual({ estado: "ok", cambio: false, pendiente: false });
    expect(executeRaw).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});

// SLT-86 (R19, R26): con la cancelación de un cambio pendiente, el historial de asignaciones lee tres acciones.
describe("D14, D16, SLT-86 R26 — planDeEmpresa lee las tres acciones del historial de asignaciones", () => {
  const creadoAt = new Date("2026-11-03T15:00:00.000Z");

  it("filtra por `plan_asignado`, `plan_tipo_cobro_cambiado` y `plan_cambio_empresa_cancelado` de la empresa y devuelve la acción de cada fila", async () => {
    const { prisma, findMany } = txDeLectura([
      { createdAt: creadoAt, actorNombre: "Ana", entidadEtiqueta: "Plan «Norte»", accion: "plan_cambio_empresa_cancelado", valorAnterior: null, valorNuevo: "2026-12-01 · anual" },
      { createdAt: creadoAt, actorNombre: "Ana", entidadEtiqueta: "Plan «Norte»", accion: "plan_tipo_cobro_cambiado", valorAnterior: "mensual", valorNuevo: "anual" },
      { createdAt: creadoAt, actorNombre: "Ana", entidadEtiqueta: "Plan «Norte»", accion: "plan_asignado", valorAnterior: null, valorNuevo: "mensual" },
    ]);

    const r = await new PlanesRepository(prisma).planDeEmpresa(ORG);

    const arg = (findMany.mock.calls[0] as unknown as [{ where: unknown; orderBy: unknown; select: Record<string, boolean> }])[0];
    expect(arg.where).toEqual({
      organizacionId: ORG,
      accion: { in: ["plan_asignado", "plan_tipo_cobro_cambiado", "plan_cambio_empresa_cancelado"] },
    });
    // Orden total y estable: `created_at` es TIMESTAMP(3) y puede empatar; `id` (único) desempata siempre igual.
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.select.accion).toBe(true);
    expect(r).toEqual({
      organizacionId: ORG,
      plan: null,
      pendienteSinPlan: null,
      asignaciones: [
        { creadoAt, actorNombre: "Ana", planNombre: "Plan «Norte»", accion: "plan_cambio_empresa_cancelado", valorAnterior: null, valorNuevo: "2026-12-01 · anual" },
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
