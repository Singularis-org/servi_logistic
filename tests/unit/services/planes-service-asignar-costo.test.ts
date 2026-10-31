import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, PrecioPlan, VersionPlan } from "@/lib/types/planes";

// SLT-66 (design §4.2.1; R28, R29, R30) — solo se asignan planes con costo concreto: base de forma
// «monto» y costo por orden no nulo. La regla vive en el servicio, así que se mide con un repositorio
// doble: lo que importa es que un rechazo no llegue a `repo.asignar` ni a `repo.vistaPreviaAsignacion`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const OTRO_PLAN = randomUUID();

/** 2026-10-29 12:00 en la plataforma (−06:00). Rango de inicio 2026-09-29 … 2026-11-29. */
const AHORA = new Date("2026-10-29T18:00:00.000Z");
const HOY = "2026-10-29";

const MONTO: PrecioPlan = { tipo: "monto", mensual: "1000.00", anual: null };

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 2 }, apiKeys: null },
    modulos: ["analitica"],
    precio: MONTO,
    costoPorOrden: "100.00",
    archivado: false,
    ...extra,
  };
}

function version(extra: Partial<VersionPlan> = {}): VersionPlan {
  const { nombre, topes, modulos, precio, costoPorOrden } = plan();
  return { nombre, topes, modulos, precio, costoPorOrden, ...extra };
}

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "ok", cambio: true })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(async () => ({
      avisos: [],
      siguienteCiclo: new Date("2026-11-29T18:00:00.000Z"),
    })),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(async () => ({ estado: "ok" })),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(async () => ({
      estado: "ok",
      cambio: true,
      avisos: [],
      cambioId: "cambio-1",
    })),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async () => ({ estado: "aplicado" })),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(async () => []),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(async () => ({ estado: "sin_pendiente" })),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => null),
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => []),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => []),
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(async () => []),
    // Sin pendiente por defecto; cada caso de pendiente lo cambia.
    detalle: vi.fn<IPlanesRepository["detalle"]>(async () => ({
      plan: plan(),
      empresaNombre: null,
      pendiente: null,
      empresas: [],
      rastro: [],
    })),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(async () => null),
  } satisfies IPlanesRepository;
}

let repo: ReturnType<typeof doble>;
let servicio: PlanesService;

beforeEach(() => {
  repo = doble();
  servicio = new PlanesService(repo, () => AHORA);
});

function conPendiente(v: VersionPlan) {
  repo.detalle.mockResolvedValue({
    plan: plan(),
    empresaNombre: null,
    pendiente: { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: v },
    empresas: [],
    rastro: [],
  });
}

const SIN_COSTO: [string, Partial<PlanDTO>][] = [
  ["sin precio", { precio: { tipo: "sin_precio" } }],
  ["negociable", { precio: { tipo: "negociable" } }],
  ["monto sin costo por orden", { precio: MONTO, costoPorOrden: null }],
  ["sin precio y con costo por orden", { precio: { tipo: "sin_precio" }, costoPorOrden: "100.00" }],
  ["negociable y con costo por orden", { precio: { tipo: "negociable" }, costoPorOrden: "100.00" }],
];

describe("SLT-66 — R28: asignar un plan sin costo concreto", () => {
  it.each(SIN_COSTO)("%s, sin fecha → plan_sin_costo y repo.asignar no se llama", async (_caso, extra) => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: OTRO_PLAN });
    repo.plan.mockResolvedValueOnce(plan(extra));
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toEqual({
      estado: "plan_sin_costo",
    });
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it.each(SIN_COSTO)("%s, con fecha (primera asignación) → plan_sin_costo y repo.asignar no se llama", async (_caso, extra) => {
    repo.plan.mockResolvedValueOnce(plan(extra));
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY })).toEqual({
      estado: "plan_sin_costo",
    });
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("base 0.00 y costo 0.00 son concretos: ok y se asigna, con fecha y sin ella", async () => {
    repo.plan.mockResolvedValue(plan({ precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "0.00" }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY })).estado).toBe("ok");
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: OTRO_PLAN });
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(2);
  });

  it("plan concreto sin pendiente → ok y se asigna", async () => {
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toMatchObject({
      estado: "ok",
      cambio: true,
    });
    expect(repo.asignar).toHaveBeenCalledWith(EMPRESA, PLAN, "u-sa");
  });

  it.each<[string, Partial<VersionPlan>]>([
    ["negociable", { precio: { tipo: "negociable" } }],
    ["sin precio", { precio: { tipo: "sin_precio" } }],
    ["sin costo por orden", { costoPorOrden: null }],
  ])("plan concreto con pendiente %s → plan_sin_costo, con fecha y sin ella", async (_caso, extra) => {
    conPendiente(version(extra));
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toEqual({
      estado: "plan_sin_costo",
    });
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY })).toEqual({
      estado: "plan_sin_costo",
    });
    expect(repo.detalle).toHaveBeenCalledWith(PLAN);
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("plan concreto con pendiente concreto (base 0.00) → ok", async () => {
    conPendiente(version({ precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "0.00" }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it("SL-24 R13 sigue primero: el mismo plan ya asignado, aunque sin costo, responde ok sin cambio", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.plan.mockResolvedValueOnce(plan({ precio: { tipo: "negociable" }, costoPorOrden: null }));
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: false,
      avisos: [],
      vigenteDesde: null,
    });
    expect(repo.asignar).not.toHaveBeenCalled();
  });
});

describe("SLT-66 — R28: la vista previa de la primera asignación", () => {
  it.each(SIN_COSTO)("%s → plan_sin_costo sin repo.vistaPreviaAsignacion", async (_caso, extra) => {
    repo.plan.mockResolvedValueOnce(plan(extra));
    expect(
      await servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY }),
    ).toEqual({ estado: "plan_sin_costo" });
    expect(repo.vistaPreviaAsignacion).not.toHaveBeenCalled();
  });

  it("plan concreto con pendiente sin costo → plan_sin_costo sin repo.vistaPreviaAsignacion", async () => {
    conPendiente(version({ costoPorOrden: null }));
    expect(
      await servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY }),
    ).toEqual({ estado: "plan_sin_costo" });
    expect(repo.vistaPreviaAsignacion).not.toHaveBeenCalled();
  });

  it("plan concreto (base 0.00) → ok por el repositorio", async () => {
    repo.plan.mockResolvedValueOnce(plan({ precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "0.00" }));
    expect(
      (await servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY })).estado,
    ).toBe("ok");
    expect(repo.vistaPreviaAsignacion).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-66 — R29: asignables solo trae planes con costo concreto", () => {
  it("filtra los sin precio, negociables y sin costo por orden; conserva los de base 0.00", async () => {
    const concreto = plan({ id: "concreto" });
    const cero = plan({ id: "cero", precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "0.00" });
    repo.asignables.mockResolvedValueOnce([
      plan({ id: "sin-precio", precio: { tipo: "sin_precio" }, costoPorOrden: "100.00" }),
      concreto,
      plan({ id: "negociable", precio: { tipo: "negociable" }, costoPorOrden: "100.00" }),
      plan({ id: "sin-costo", costoPorOrden: null }),
      cero,
    ]);
    expect(await servicio.asignables(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({
      estado: "ok",
      planes: [concreto, cero],
    });
  });

  it("si ninguno tiene costo concreto, la lista queda vacía", async () => {
    repo.asignables.mockResolvedValueOnce([plan({ precio: { tipo: "negociable" } })]);
    expect(await servicio.asignables(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "ok", planes: [] });
  });
});

describe("SLT-66 — R30: editar, programar y archivar no se frenan", () => {
  const SIN_COSTO_VERSION: [string, Partial<VersionPlan>][] = [
    ["a negociable", { precio: { tipo: "negociable" } }],
    ["vaciando el costo por orden", { costoPorOrden: null }],
  ];

  it.each(SIN_COSTO_VERSION)("editar de inmediato %s un plan con empresas → ok y se llama al repositorio", async (_caso, extra) => {
    const v = version(extra);
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: null })).toMatchObject({ estado: "ok" });
    expect(repo.editar).toHaveBeenCalledWith(PLAN, v, "u-sa");
  });

  it.each(SIN_COSTO_VERSION)("programar %s un plan con empresas → ok y se llama al repositorio", async (_caso, extra) => {
    const v = version(extra);
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: "2026-12-01" })).toMatchObject({
      estado: "ok",
    });
    expect(repo.programarCambio).toHaveBeenCalledTimes(1);
    expect(repo.programarCambio.mock.calls[0]?.[1]).toEqual(v);
  });

  it("archivar un plan sin costo concreto → ok y se llama al repositorio", async () => {
    repo.plan.mockResolvedValueOnce(plan({ precio: { tipo: "negociable" }, costoPorOrden: null }));
    expect((await servicio.archivar(SUPERADMIN, { planId: PLAN })).estado).toBe("ok");
    expect(repo.archivar).toHaveBeenCalledWith(PLAN, "u-sa");
  });
});
