import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, PrecioPlan, VersionPlan } from "@/lib/types/planes";

// SLT-66 (design §4.2.1; R30) y SLT-99 (decisión del humano del 2026-11-10, modifica SLT-66 R28–R29): un plan
// sin costo concreto se asigna y sale en los asignables (sin costo por orden rige la tarifa global; sin costo
// base, cuota 0). Se mide con un repositorio doble: el servicio ya no frena nada antes de `repo.asignar`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const OTRO_PLAN = randomUUID();

/** 2026-10-29 12:00 en la plataforma (−06:00). Rango de inicio 2026-09-29 … 2026-11-29. */
const AHORA = new Date("2026-10-29T18:00:00.000Z");
const HOY = "2026-10-29";

const MONTO: PrecioPlan = { tipo: "monto", mensual: "1000.00", descuentos: {} };

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: { adminTienda: 2 }, apiKeys: null },
    modulos: ["analitica"],
    precio: MONTO,
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    archivado: false,
    ...extra,
  };
}

function version(extra: Partial<VersionPlan> = {}): VersionPlan {
  const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = plan();
  return { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual, ...extra };
}

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "ok", cambio: true })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true, avisos: [], pendiente: false })),
    cancelarCambioEmpresa: vi.fn<IPlanesRepository["cancelarCambioEmpresa"]>(async () => ({ estado: "ok" })),
    aplicarCambioDeEmpresa: vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(async () => ({ estado: "sin_pendiente" })),
    cambiosDeEmpresaVencidos: vi.fn<IPlanesRepository["cambiosDeEmpresaVencidos"]>(async () => []),
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(async () => ({ estado: "ok", planId: PLAN, avisos: [], pendiente: false })),
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => null),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "not_found" })),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(async () => ({ avisos: [] })),
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
    preciosQueRigenDesde: vi.fn<IPlanesRepository["preciosQueRigenDesde"]>(async () => []),
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
    pendiente: { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: v, recibidas: 0, total: 0 }, // SLT-128 (R11)
    empresas: [],
    rastro: [],
  });
}

const SIN_COSTO: [string, Partial<PlanDTO>][] = [
  ["sin precio", { precio: { tipo: "sin_precio" } }],
  ["monto sin costo por orden", { precio: MONTO, costoPorOrden: null }],
  ["sin precio y con costo por orden", { precio: { tipo: "sin_precio" }, costoPorOrden: "100.00" }],
  ["sin precio ni costo por orden", { precio: { tipo: "sin_precio" }, costoPorOrden: null }],
];

describe("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28) — asignar un plan sin costo concreto responde ok", () => {
  it.each(SIN_COSTO)("%s, cambio de plan con fecha de efecto → ok y repo.asignar se llama", async (_caso, extra) => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: OTRO_PLAN });
    repo.plan.mockResolvedValueOnce(plan(extra));
    expect(
      (await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: HOY })).estado,
    ).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it.each(SIN_COSTO)("%s, con fecha (primera asignación) → ok y repo.asignar se llama", async (_caso, extra) => {
    repo.plan.mockResolvedValueOnce(plan(extra));
    expect(
      (await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY, tipoCobro: "mensual" })).estado,
    ).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it("base 0.00 y costo 0.00: ok y se asigna, con fecha y sin ella", async () => {
    repo.plan.mockResolvedValue(plan({ precio: { tipo: "monto", mensual: "0.00", descuentos: {} }, costoPorOrden: "0.00" }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY, tipoCobro: "mensual" })).estado).toBe("ok");
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: OTRO_PLAN });
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: HOY })).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(2);
  });

  it("plan concreto sin pendiente → ok y se asigna", async () => {
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).toMatchObject({
      estado: "ok",
      cambio: true,
    });
    // SLT-86 (R2): sin fecha, la primera asignación rige desde hoy a las 00:00 de la plataforma.
    expect(repo.asignar).toHaveBeenCalledWith(
      EMPRESA,
      PLAN,
      "u-sa",
      { clase: "inicio", fecha: HOY, desde: new Date(`${HOY}T06:00:00.000Z`), elegida: false },
      "mensual",
      AHORA,
    );
  });

  it.each<[string, Partial<VersionPlan>]>([
    ["sin precio", { precio: { tipo: "sin_precio" } }],
    ["sin costo por orden", { costoPorOrden: null }],
  ])("con un cambio programado %s → ok, con fecha y sin ella, sin leer el pendiente", async (_caso, extra) => {
    conPendiente(version(extra));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).estado).toBe("ok");
    expect(
      (await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY, tipoCobro: "mensual" })).estado,
    ).toBe("ok");
    expect(repo.detalle).not.toHaveBeenCalled();
    expect(repo.asignar).toHaveBeenCalledTimes(2);
  });

  it("SL-24 R13, SLT-86 R19: el mismo plan ya asignado, aunque sin costo, no se frena: el repositorio decide sin cambio", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.plan.mockResolvedValueOnce(plan({ precio: { tipo: "sin_precio" }, costoPorOrden: null }));
    repo.asignar.mockResolvedValueOnce({ estado: "ok", cambio: false, avisos: [], pendiente: false });
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: HOY })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: false,
      avisos: [],
      vigenteDesde: null,
    });
    expect(repo.detalle).not.toHaveBeenCalled();
  });
});

describe("SLT-99 (modifica SLT-66 R28) — la vista previa de la primera asignación", () => {
  it.each(SIN_COSTO)("%s → ok por el repositorio", async (_caso, extra) => {
    repo.plan.mockResolvedValueOnce(plan(extra));
    expect(
      await servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY }),
    ).toEqual({ estado: "ok", avisos: [] });
    expect(repo.vistaPreviaAsignacion).toHaveBeenCalledTimes(1);
  });

  it("con un cambio programado sin costo → ok por el repositorio", async () => {
    conPendiente(version({ costoPorOrden: null }));
    expect(
      (await servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY })).estado,
    ).toBe("ok");
    expect(repo.vistaPreviaAsignacion).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-99 (modifica SLT-66 R29) — asignables trae también los planes sin costo concreto", () => {
  it("no filtra: sin precio, sin costo por orden y base 0.00 salen en el orden del repositorio", async () => {
    const lista = [
      plan({ id: "sin-precio", precio: { tipo: "sin_precio" }, costoPorOrden: "100.00" }),
      plan({ id: "concreto" }),
      plan({ id: "sin-costo", costoPorOrden: null }),
      plan({ id: "sin-nada", precio: { tipo: "sin_precio" }, costoPorOrden: null }),
      plan({ id: "cero", precio: { tipo: "monto", mensual: "0.00", descuentos: {} }, costoPorOrden: "0.00" }),
    ];
    repo.asignables.mockResolvedValueOnce(lista);
    expect(await servicio.asignables(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "ok", planes: lista });
  });
});

describe("SLT-66 — R30: editar, programar y archivar no se frenan", () => {
  const SIN_COSTO_VERSION: [string, Partial<VersionPlan>][] = [
    ["a sin precio", { precio: { tipo: "sin_precio" } }],
    ["vaciando el costo por orden", { costoPorOrden: null }],
  ];

  it.each(SIN_COSTO_VERSION)("editar de inmediato %s un plan con empresas → ok y se llama al repositorio", async (_caso, extra) => {
    const v = version(extra);
    // SLT-86 (R22): pasar a «sin precio» cambia el precio, así que lleva fecha de efecto: la de hoy es inmediata.
    // Vaciar el costo por orden no toca el precio: sigue siendo inmediata sin fecha.
    const vigenteDesde = "precio" in extra ? HOY : null;
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde })).toMatchObject({ estado: "ok" });
    expect(repo.editar).toHaveBeenCalledWith(PLAN, v, "u-sa", new Date(`${HOY}T06:00:00.000Z`));
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
    repo.plan.mockResolvedValueOnce(plan({ precio: { tipo: "sin_precio" }, costoPorOrden: null }));
    expect((await servicio.archivar(SUPERADMIN, { planId: PLAN })).estado).toBe("ok");
    expect(repo.archivar).toHaveBeenCalledWith(PLAN, "u-sa");
  });
});
