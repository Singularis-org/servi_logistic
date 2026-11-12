import { randomUUID } from "node:crypto";

import type { RolValue } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, PrecioPlan, VersionPlan } from "@/lib/types/planes";

// SLT-83 (design §4.2, §5; R3, R5) — el servicio de planes con el modo porcentual. El orden no cambia:
// quién (R3) → zod (R1, R2) → existe → reglas (R5, `plan_sin_costo`) → repositorio. Se mide con un
// repositorio doble: lo que importa es qué llega (o no) al repositorio.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const OTRO_PLAN = randomUUID();
/** 2026-10-29 12:00 en la plataforma (−06:00). */
const AHORA = new Date("2026-10-29T18:00:00.000Z");
const HOY = "2026-10-29";

const MONTO: PrecioPlan = { tipo: "monto", mensual: "1000.00", descuentos: {} };
const PORCENTUAL = { porcentaje: "2.00", minimo: "500.00" };
const SIN_MINIMO = { porcentaje: "2.00", minimo: null };

const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Porcentual",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: MONTO,
    costoPorOrden: null,
    costoPorOrdenPorcentual: PORCENTUAL,
    archivado: false,
    ...extra,
  };
}

function version(extra: Partial<VersionPlan> = {}): VersionPlan {
  const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = plan();
  return { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual, ...extra };
}

const CREAR = {
  nombre: "Porcentual",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: MONTO,
  costoPorOrden: null,
  costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" },
};

const CUSTOM = { ...CREAR, visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "mensual" };

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "ok", cambio: true })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true, avisos: [], pendiente: false })),
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(async () => ({ estado: "ok", planId: PLAN, avisos: [], pendiente: false })),
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => null),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "not_found" })),
    cancelarCambioEmpresa: vi.fn<IPlanesRepository["cancelarCambioEmpresa"]>(),
    aplicarCambioDeEmpresa: vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(),
    cambiosDeEmpresaVencidos: vi.fn<IPlanesRepository["cambiosDeEmpresaVencidos"]>(),
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

/** Ninguna escritura ni lectura del repositorio. */
function sinRepositorio() {
  for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
}

describe("SLT-83 R3 — solo el superadmin configura el modo porcentual", () => {
  const ACTORES: [string, Actor | null][] = [
    ["sin sesión", null],
    ...ROLES_DE_EMPRESA.map((rol): [string, Actor] => [rol, { usuarioId: `u-${rol}`, rol, organizacionId: EMPRESA }]),
  ];

  it.each(ACTORES)("%s: crear un plan porcentual → forbidden sin llamar al repositorio", async (_caso, actor) => {
    expect(await servicio.crear(actor, CREAR)).toEqual({ estado: "forbidden" });
    expect(await servicio.crear(actor, CUSTOM)).toEqual({ estado: "forbidden" });
    sinRepositorio();
  });

  it.each(ACTORES)("%s: editar de inmediato o programar el porcentual → forbidden sin llamar al repositorio", async (_caso, actor) => {
    const v = version({ costoPorOrdenPorcentual: { porcentaje: "5", minimo: null } });
    expect(await servicio.editar(actor, { planId: PLAN, ...v, vigenteDesde: null })).toEqual({ estado: "forbidden" });
    expect(await servicio.editar(actor, { planId: PLAN, ...v, vigenteDesde: "2026-12-01" })).toEqual({ estado: "forbidden" });
    sinRepositorio();
  });

  it("forbidden va antes que zod: una entrada inválida de un rol de empresa no da validation_error", async () => {
    const maestro: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: EMPRESA };
    const mala = { ...CREAR, costoPorOrden: "100", costoPorOrdenPorcentual: { porcentaje: "0", minimo: "-1" } };
    expect(await servicio.crear(maestro, mala)).toEqual({ estado: "forbidden" });
    sinRepositorio();
  });

  it("el superadmin sí crea, edita y programa, y la versión llega entera al repositorio", async () => {
    expect((await servicio.crear(SUPERADMIN, CREAR)).estado).toBe("ok");
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2", minimo: "500" } }),
      "u-sa",
    );
    const v = version({ costoPorOrdenPorcentual: { porcentaje: "5", minimo: null } });
    expect((await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: null })).estado).toBe("ok");
    expect(repo.editar).toHaveBeenCalledWith(PLAN, v, "u-sa", new Date("2026-10-29T06:00:00.000Z"));
    expect((await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: "2026-12-01" })).estado).toBe("ok");
    expect(repo.programarCambio.mock.calls[0]?.[1]).toEqual(v);
  });
});

describe("SLT-83 R1, R2 — el borde del servicio, antes de leer nada", () => {
  it.each([
    ["fijo y porcentual a la vez", { costoPorOrden: "100", costoPorOrdenPorcentual: SIN_MINIMO }, "costoPorOrdenPorcentual"],
    ["porcentaje 0", { costoPorOrdenPorcentual: { porcentaje: "0", minimo: null } }, "costoPorOrdenPorcentual.porcentaje"],
    ["porcentaje 100.01", { costoPorOrdenPorcentual: { porcentaje: "100.01", minimo: null } }, "costoPorOrdenPorcentual.porcentaje"],
    ["mínimo negativo", { costoPorOrdenPorcentual: { porcentaje: "2", minimo: "-1" } }, "costoPorOrdenPorcentual.minimo"],
  ])("%s → validation_error en %s, al crear y al editar, sin llamar al repositorio", async (_caso, extra, campo) => {
    const creado = await servicio.crear(SUPERADMIN, { ...CREAR, ...extra });
    const editado = await servicio.editar(SUPERADMIN, { planId: PLAN, ...version(), ...extra, vigenteDesde: null });
    for (const r of [creado, editado]) {
      expect(r).toMatchObject({ estado: "validation_error", fieldErrors: { [campo]: expect.any(Array) } });
    }
    sinRepositorio();
  });
});

describe("SLT-83 R5 — costo concreto con el modo porcentual (asignar, vista previa, asignables, crear un custom)", () => {
  it.each([
    ["con mínimo", PORCENTUAL],
    ["sin mínimo", SIN_MINIMO],
  ])("base monto y porcentaje %s → ok y se asigna, con fecha y sin ella", async (_caso, costoPorOrdenPorcentual) => {
    repo.plan.mockResolvedValue(plan({ costoPorOrdenPorcentual }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY, tipoCobro: "mensual" })).estado).toBe(
      "ok",
    );
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: OTRO_PLAN });
    // SLT-86 (R16): un cambio de plan lleva fecha de efecto.
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: HOY })).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(2);
  });

  it("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28): base «sin precio» y porcentaje → ok, asigna y previsualiza", async () => {
    repo.plan.mockResolvedValue(plan({ precio: { tipo: "sin_precio" } }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).estado).toBe("ok");
    expect(
      (await servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: HOY })).estado,
    ).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
    expect(repo.vistaPreviaAsignacion).toHaveBeenCalledTimes(1);
  });

  it("SLT-99 (modifica SLT-66 R28): un pendiente que pasa a porcentual, con base monto o «sin precio», no frena la asignación", async () => {
    repo.plan.mockResolvedValue(plan({ costoPorOrden: "100.00", costoPorOrdenPorcentual: null }));
    repo.detalle.mockResolvedValue({
      plan: plan(),
      empresaNombre: null,
      pendiente: {
        vigenteDesde: new Date("2026-12-01T06:00:00.000Z"),
        version: version({ costoPorOrdenPorcentual: SIN_MINIMO }),
        recibidas: 0, // SLT-128 (R11)
        total: 0,
      },
      empresas: [],
      rastro: [],
    });
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).estado).toBe("ok");
    repo.detalle.mockResolvedValue({
      plan: plan(),
      empresaNombre: null,
      pendiente: {
        vigenteDesde: new Date("2026-12-01T06:00:00.000Z"),
        version: version({ precio: { tipo: "sin_precio" }, costoPorOrdenPorcentual: SIN_MINIMO }),
        recibidas: 0, // SLT-128 (R11)
        total: 0,
      },
      empresas: [],
      rastro: [],
    });
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).estado).toBe("ok");
  });

  it("SLT-99 (modifica SLT-66 R29): asignables conserva todos los porcentuales, también los de base «sin precio»", async () => {
    const lista = [
      plan({ id: "con-minimo" }),
      plan({ id: "sin-precio", precio: { tipo: "sin_precio" } }),
      plan({ id: "sin-minimo", costoPorOrdenPorcentual: SIN_MINIMO }),
      plan({ id: "vacio", costoPorOrdenPorcentual: null }),
    ];
    repo.asignables.mockResolvedValueOnce(lista);
    expect(await servicio.asignables(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "ok", planes: lista });
  });

  it("crear un custom porcentual: base monto o «sin precio» (SLT-99, modifica SLT-66 R28) → se crea y asigna", async () => {
    expect((await servicio.crear(SUPERADMIN, CUSTOM)).estado).toBe("ok");
    expect((await servicio.crear(SUPERADMIN, { ...CUSTOM, precio: { tipo: "sin_precio" } })).estado).toBe("ok");
    expect(repo.crearYAsignar).toHaveBeenCalledTimes(2);
  });
});
