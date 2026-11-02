import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-66 (design §4.2, §5; R1, R8, R11) — el costo por orden por el servicio de planes, con un
// repositorio doble: solo el superadmin lo escribe, la entrada inválida no llega al repositorio y la
// válida llega entera (crear, editar de inmediato y programar).

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();

const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-10-31 12:00 UTC. */
const AHORA = new Date("2026-10-31T12:00:00.000Z");

const PLAN_DTO: PlanDTO = {
  id: PLAN,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 100, porRol: { admin: 2 }, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" },
  costoPorOrden: null,
  archivado: false,
};

const CREAR = {
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000", anual: null },
  costoPorOrden: "100",
};

const VERSION = {
  nombre: "Básico",
  topes: { ordenesPorCiclo: 100, porRol: { admin: 2 }, apiKeys: null },
  modulos: [],
  precio: { tipo: "negociable" },
  costoPorOrden: "150.50",
};

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => PLAN_DTO),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(),
    asignar: vi.fn<IPlanesRepository["asignar"]>(),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(async () => ({
      estado: "ok",
      cambio: true,
      avisos: [],
      cambioId: "cambio-1",
    })),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(),
    asignables: vi.fn<IPlanesRepository["asignables"]>(),
    publicos: vi.fn<IPlanesRepository["publicos"]>(),
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(),
    detalle: vi.fn<IPlanesRepository["detalle"]>(),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(),
  };
}

let repo: ReturnType<typeof doble>;
let servicio: PlanesService;

function llamadasAlRepositorio(): number {
  return Object.values(repo).reduce((n, f) => n + f.mock.calls.length, 0);
}

beforeEach(() => {
  repo = doble();
  servicio = new PlanesService(repo, () => AHORA);
});

const OPERACIONES: [string, (s: PlanesService, a: Actor | null, extra?: Record<string, unknown>) => Promise<unknown>][] = [
  ["crear", (s, a, extra = {}) => s.crear(a, { ...CREAR, ...extra })],
  ["editar de inmediato", (s, a, extra = {}) => s.editar(a, { planId: PLAN, ...VERSION, vigenteDesde: null, ...extra })],
  [
    "programar un cambio",
    (s, a, extra = {}) => s.editar(a, { planId: PLAN, ...VERSION, vigenteDesde: "2026-12-01", ...extra }),
  ],
];

describe("SLT-66 R11 — solo el superadmin escribe el costo por orden", () => {
  for (const [nombre, op] of OPERACIONES) {
    it.each(ROLES_DE_EMPRESA)(`${nombre}: el rol %s recibe forbidden con cero llamadas al repositorio`, async (rol) => {
      const actor: Actor = { usuarioId: "u-1", rol, organizacionId: EMPRESA };
      expect(await op(servicio, actor)).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });

    it(`${nombre}: sin sesión, forbidden con cero llamadas`, async () => {
      expect(await op(servicio, null)).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });
  }
});

describe("SLT-66 R1, R8 — la entrada inválida es validation_error sin llamar al repositorio", () => {
  for (const [nombre, op] of OPERACIONES) {
    it(`${nombre}: un tope de maestro (R1)`, async () => {
      const r = await op(servicio, SUPERADMIN, { topes: { ordenesPorCiclo: 10, porRol: { maestro: 3 }, apiKeys: null } });
      expect(r).toMatchObject({ estado: "validation_error" });
      expect(Object.keys((r as { fieldErrors: Record<string, string[]> }).fieldErrors).join(" ")).toMatch(/topes/);
      expect(llamadasAlRepositorio()).toBe(0);
    });

    it.each([["-1"], ["1.005"], [100], [""]])(`${nombre}: costoPorOrden %o (R8)`, async (costoPorOrden) => {
      const r = await op(servicio, SUPERADMIN, { costoPorOrden });
      expect(r).toMatchObject({ estado: "validation_error", fieldErrors: { costoPorOrden: expect.any(Array) } });
      expect(llamadasAlRepositorio()).toBe(0);
    });
  }
});

describe("SLT-66 R11 — el costo por orden llega al repositorio con la versión", () => {
  it("crear", async () => {
    expect(await servicio.crear(SUPERADMIN, CREAR)).toMatchObject({ estado: "ok", planId: PLAN });
    expect(repo.crear).toHaveBeenCalledWith(expect.objectContaining({ costoPorOrden: "100" }), "u-sa");
  });

  it("editar de inmediato, también para vaciarlo", async () => {
    await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null });
    await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, costoPorOrden: null, vigenteDesde: null });
    expect(repo.editar.mock.calls.map((c) => c[1].costoPorOrden)).toEqual(["150.50", null]);
  });

  it("programar un cambio", async () => {
    await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-12-01" });
    expect(repo.programarCambio).toHaveBeenCalledTimes(1);
    expect(repo.programarCambio.mock.calls[0][1]).toEqual(VERSION);
  });
});
