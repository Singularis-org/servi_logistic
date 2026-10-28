import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, TopeExcedido } from "@/lib/types/planes";

// SL-24 (design §5; R2, R5, R6, R12, R13, R16, R37) — el servicio con un repositorio doble. Lo que se
// mide aquí es el ORDEN del contrato (quién → zod → existe → reglas → repositorio) y que ningún
// rechazo llegue a escribir. El SQL y los cerrojos se miden contra Postgres (planes-asignacion,
// planes-edicion-en-uso, planes-historial).

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const OTRA = randomUUID();
const PLAN = randomUUID();

const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 2 }, apiKeys: null },
    modulos: ["analitica"],
    precio: { tipo: "sin_precio" },
    archivado: false,
    ...extra,
  };
}

const VERSION = {
  nombre: "Básico 2",
  topes: { ordenesPorCiclo: 50, porRol: { adminTienda: 2 }, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "negociable" },
};

const CREAR = {
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" },
};

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "ok", cambio: true })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true })),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(async () => ({ estado: "ok" })),
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => [plan()]),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => [plan()]),
  };
}

let repo: ReturnType<typeof doble>;
/** 2026-10-28 12:00 UTC. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
let servicio: PlanesService;

function llamadasAlRepositorio(): number {
  return Object.values(repo).reduce((n, f) => n + f.mock.calls.length, 0);
}

beforeEach(() => {
  repo = doble();
  servicio = new PlanesService(repo, () => AHORA);
});

describe("SL-24 — R5: solo el superadmin, sin leer ni escribir nada", () => {
  const operaciones: [string, (s: PlanesService, a: Actor | null) => Promise<{ estado: string }>][] = [
    ["crear", (s, a) => s.crear(a, CREAR)],
    ["editar de inmediato", (s, a) => s.editar(a, { planId: PLAN, ...VERSION, vigenteDesde: null })],
    ["editar programado", (s, a) => s.editar(a, { planId: PLAN, ...VERSION, vigenteDesde: "2026-12-01" })],
    ["archivar", (s, a) => s.archivar(a, { planId: PLAN })],
    ["asignar", (s, a) => s.asignar(a, { organizacionId: EMPRESA, planId: PLAN })],
    ["cancelar un cambio programado", (s, a) => s.cancelarCambio(a, { planId: PLAN })],
    ["listar asignables", (s, a) => s.asignables(a, { organizacionId: EMPRESA })],
  ];

  for (const [nombre, op] of operaciones) {
    it.each(ROLES_DE_EMPRESA)(`${nombre}: el rol %s de la empresa afectada recibe forbidden con cero llamadas`, async (rol) => {
      const actor: Actor = { usuarioId: "u-1", rol, organizacionId: EMPRESA };
      expect(await op(servicio, actor)).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });

    it(`${nombre}: sin sesión, forbidden y cero llamadas; también con la entrada inválida`, async () => {
      expect(await op(servicio, null)).toEqual({ estado: "forbidden" });
      const maestro: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: EMPRESA };
      expect(await servicio.crear(maestro, { basura: true })).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });
  }
});

describe("SL-24 — crear (R1, R2)", () => {
  it("R1: el superadmin crea y recibe el id; el repositorio recibe la entrada validada", async () => {
    expect(await servicio.crear(SUPERADMIN, { ...CREAR, nombre: "  Básico  " })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: null,
    });
    expect(repo.crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Básico" }), "u-sa");
  });

  it("R2: un custom de una empresa que no existe se rechaza sin escribir", async () => {
    repo.empresa.mockResolvedValueOnce(null);
    expect(await servicio.crear(SUPERADMIN, { ...CREAR, visibilidad: "custom", organizacionId: EMPRESA })).toEqual({
      estado: "not_found",
    });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("R2/R3: validation_error con el campo, sin tocar el repositorio", async () => {
    const r = await servicio.crear(SUPERADMIN, { ...CREAR, visibilidad: "custom" });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toContain("organizacionId");
    const p = await servicio.crear(SUPERADMIN, { ...CREAR, precio: { tipo: "negociable", mensual: "10" } });
    expect(p.estado).toBe("validation_error");
    expect(llamadasAlRepositorio()).toBe(0);
  });
});

describe("SL-24 — editar (R2, R6, R15, R16, R37)", () => {
  it("R2: cambiar la visibilidad o la empresa en una edición es validation_error sin llamadas", async () => {
    for (const extra of [{ visibilidad: "custom" }, { organizacionId: OTRA }]) {
      const r = await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null, ...extra });
      expect(r.estado).toBe("validation_error");
    }
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("R6: editar un archivado se rechaza sin escribir", async () => {
    repo.plan.mockResolvedValueOnce(plan({ archivado: true }));
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({
      estado: "archivado",
    });
    expect(repo.editar).not.toHaveBeenCalled();
  });

  it("editar un plan que no existe es not_found sin escribir", async () => {
    repo.plan.mockResolvedValueOnce(null);
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({
      estado: "not_found",
    });
    expect(repo.editar).not.toHaveBeenCalled();
  });

  it("R16: con una empresa por encima del tope nuevo la edición se guarda y devuelve el aviso", async () => {
    const aviso: TopeExcedido = { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "adminTienda", usados: 3, maximo: 2 };
    repo.editar.mockResolvedValueOnce({ estado: "ok", cambio: true, avisos: [aviso] });
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [aviso],
      vigenteDesde: null,
    });
    expect(repo.editar).toHaveBeenCalledWith(PLAN, VERSION, "u-sa");
  });

  it("R15: un estado del repositorio bajo cerrojo (archivado entre lectura y escritura) se devuelve tal cual", async () => {
    repo.editar.mockResolvedValueOnce({ estado: "archivado" });
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({
      estado: "archivado",
    });
  });

  it.each([
    ["ayer", "2026-10-27"],
    ["hoy: sus 00:00 ya pasaron", "2026-10-28"],
  ])("R37: vigenteDesde de %s es validation_error sin llamadas", async (_caso, fecha) => {
    const r = await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: fecha });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["vigenteDesde"]);
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("R37: hoy cuenta desde las 00:00 a −06:00, no desde la medianoche UTC", async () => {
    // 2026-10-28 05:59 UTC = 2026-10-27 23:59 en la plataforma: «mañana» (28) todavía es futuro.
    const s = new PlanesService(repo, () => new Date("2026-10-28T05:59:00.000Z"));
    await expect(s.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-10-28" })).rejects.toThrow(/T11/);
    expect(repo.editar).not.toHaveBeenCalled();
  });
});

describe("SL-24 — archivar (R6)", () => {
  it("archiva por el repositorio y devuelve si cambió", async () => {
    repo.archivar.mockResolvedValueOnce({ estado: "ok", cambio: false });
    expect(await servicio.archivar(SUPERADMIN, { planId: PLAN })).toMatchObject({ estado: "ok", cambio: false });
    expect(repo.archivar).toHaveBeenCalledWith(PLAN, "u-sa");
  });

  it("un plan que no existe es not_found sin escribir", async () => {
    repo.plan.mockResolvedValueOnce(null);
    expect(await servicio.archivar(SUPERADMIN, { planId: PLAN })).toEqual({ estado: "not_found" });
    expect(repo.archivar).not.toHaveBeenCalled();
  });
});

describe("SL-24 — asignar (R6, R12, R13)", () => {
  it("asigna por el repositorio", async () => {
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: null,
    });
    expect(repo.asignar).toHaveBeenCalledWith(EMPRESA, PLAN, "u-sa");
  });

  it.each([
    ["la empresa no existe", () => repo.empresa.mockResolvedValueOnce(null), { estado: "not_found" }],
    ["el plan no existe", () => repo.plan.mockResolvedValueOnce(null), { estado: "not_found" }],
    ["R6: el plan está archivado", () => repo.plan.mockResolvedValueOnce(plan({ archivado: true })), { estado: "archivado" }],
    [
      "R13: el plan es custom de otra empresa",
      () => repo.plan.mockResolvedValueOnce(plan({ visibilidad: "custom", organizacionId: OTRA })),
      { estado: "custom_de_otra_empresa" },
    ],
  ])("%s → se rechaza sin escribir", async (_caso, preparar, esperado) => {
    preparar();
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toEqual(esperado);
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("R13: el custom de la propia empresa sí se asigna", async () => {
    repo.plan.mockResolvedValueOnce(plan({ visibilidad: "custom", organizacionId: EMPRESA }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it("R13: el plan que ya tiene responde ok sin cambio y sin escribir", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toMatchObject({
      estado: "ok",
      cambio: false,
    });
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("R12: el rechazo por tope dice qué tope se pasa, con el uso y el tope", async () => {
    const excedidos: TopeExcedido[] = [
      { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "adminTienda", usados: 3, maximo: 2 },
      { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "api_keys", usados: 4, maximo: 1 },
    ];
    repo.asignar.mockResolvedValueOnce({ estado: "tope_excedido", excedidos });
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN })).toEqual({
      estado: "tope_excedido",
      excedidos,
      mensaje:
        "Mensajería Uno ya tiene 3 usuarios activos con el rol Admin de tienda y el plan permite 2.\n" +
        "Mensajería Uno ya tiene 4 API keys activas y el plan permite 1.",
    });
  });
});

describe("SL-24 — cancelar un cambio programado y listar (R7, R39)", () => {
  it("sin pendiente responde sin_cambio_programado", async () => {
    repo.cancelarCambio.mockResolvedValueOnce({ estado: "sin_cambio_programado" });
    expect(await servicio.cancelarCambio(SUPERADMIN, { planId: PLAN })).toEqual({ estado: "sin_cambio_programado" });
  });

  it("con pendiente lo cancela por el repositorio", async () => {
    expect(await servicio.cancelarCambio(SUPERADMIN, { planId: PLAN })).toMatchObject({ estado: "ok", planId: PLAN });
    expect(repo.cancelarCambio).toHaveBeenCalledWith(PLAN, "u-sa");
  });

  it("asignables de una empresa que no existe es not_found sin listar", async () => {
    repo.empresa.mockResolvedValueOnce(null);
    expect(await servicio.asignables(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "not_found" });
    expect(repo.asignables).not.toHaveBeenCalled();
  });

  it("asignables devuelve lo del repositorio; planesPublicos no pide actor", async () => {
    expect(await servicio.asignables(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "ok", planes: [plan()] });
    expect(await servicio.planesPublicos()).toEqual([plan()]);
  });
});
