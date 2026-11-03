import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, TopeExcedido } from "@/lib/types/planes";

// Ajuste planes-custom (D2, D4, D6; 2026-10-31) — crear un custom con empresa es crear Y asignar en una
// sola operación, y cada asignación elige el tipo de cobro. Aquí, con un repositorio doble, el ORDEN del
// contrato (quién → zod → reglas → repositorio) y que ningún rechazo llegue a `crearYAsignar`. La
// atomicidad (un rechazo bajo cerrojo no deja nada) se mide contra Postgres en
// `tests/integration/db/planes-crear-custom-asigna.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-10-31 12:00 en la plataforma (−06:00). Rango de inicio: 2026-09-30 … 2026-11-30. */
const AHORA = new Date("2026-10-31T18:00:00.000Z");

const CUSTOM = {
  nombre: "Custom Uno",
  visibilidad: "custom",
  organizacionId: EMPRESA,
  topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "1000.00", anual: null },
  costoPorOrden: "100.00",
  tipoCobro: "anual",
} as const;

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "1000.00", anual: null },
    costoPorOrden: "100.00",
    archivado: false,
    ...extra,
  };
}

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(async () => ({ estado: "ok", planId: PLAN, avisos: [] })),
    editar: vi.fn<IPlanesRepository["editar"]>(),
    archivar: vi.fn<IPlanesRepository["archivar"]>(),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true })),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(),
    asignables: vi.fn<IPlanesRepository["asignables"]>(),
    publicos: vi.fn<IPlanesRepository["publicos"]>(),
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(),
    detalle: vi.fn<IPlanesRepository["detalle"]>(async () => null),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(),
  } satisfies IPlanesRepository;
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

describe("D2 — crear un custom con empresa lo asigna en la misma operación", () => {
  it("ok: una sola llamada a crearYAsignar con la entrada validada, el tipo de cobro y sin fecha; crear no se llama", async () => {
    expect(await servicio.crear(SUPERADMIN, CUSTOM)).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: null,
    });
    expect(repo.crearYAsignar).toHaveBeenCalledTimes(1);
    expect(repo.crearYAsignar).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Custom Uno", organizacionId: EMPRESA }), "u-sa", {
      tipoCobro: "anual",
    });
    expect(repo.crear).not.toHaveBeenCalled();
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("D4: empresa sin plan + inicio del ciclo → el ancla de la fecha elegida (las 00:00 de la plataforma)", async () => {
    await servicio.crear(SUPERADMIN, { ...CUSTOM, inicioCiclo: "2026-11-01" });
    expect(repo.crearYAsignar).toHaveBeenCalledWith(expect.anything(), "u-sa", {
      tipoCobro: "anual",
      inicio: { fecha: "2026-11-01", ancla: new Date("2026-11-01T06:00:00.000Z") },
    });
  });

  it("D4: con «hoy», el ancla es el instante de la asignación, como en asignar", async () => {
    await servicio.crear(SUPERADMIN, { ...CUSTOM, inicioCiclo: "2026-10-31" });
    expect(repo.crearYAsignar.mock.calls[0]?.[2]).toEqual({ tipoCobro: "anual", inicio: { fecha: "2026-10-31", ancla: "ahora" } });
  });

  it("los avisos de la primera asignación con fecha (topes ya pasados) vuelven en el ok", async () => {
    const aviso: TopeExcedido = { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "ordenes", usados: 120, maximo: 100 };
    repo.crearYAsignar.mockResolvedValueOnce({ estado: "ok", planId: PLAN, avisos: [aviso] });
    expect(await servicio.crear(SUPERADMIN, { ...CUSTOM, inicioCiclo: "2026-11-01" })).toMatchObject({
      estado: "ok",
      avisos: [aviso],
    });
  });

  it("un público se crea como siempre, sin asignar", async () => {
    const publico = { ...CUSTOM, visibilidad: "publico", organizacionId: null, tipoCobro: undefined };
    expect((await servicio.crear(SUPERADMIN, publico)).estado).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
    expect(repo.empresa).not.toHaveBeenCalled();
  });
});

describe("D2, SL-24 R5 — solo el superadmin, sin tocar el repositorio", () => {
  it.each(ROLES_DE_EMPRESA)("el rol %s de la empresa recibe forbidden con cero llamadas", async (rol) => {
    expect(await servicio.crear({ usuarioId: "u", rol, organizacionId: EMPRESA }, CUSTOM)).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("sin sesión, forbidden y cero llamadas", async () => {
    expect(await servicio.crear(null, CUSTOM)).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });
});

describe("D2 — un rechazo de la asignación no crea nada (no llega a crearYAsignar)", () => {
  it("SLT-66 R28: sin costo concreto → plan_sin_costo", async () => {
    for (const extra of [{ precio: { tipo: "sin_precio" } }, { costoPorOrden: null }] as const) {
      expect(await servicio.crear(SUPERADMIN, { ...CUSTOM, ...extra })).toEqual({ estado: "plan_sin_costo" });
    }
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("SL-24 R2: la empresa no existe → not_found", async () => {
    repo.empresa.mockResolvedValueOnce(null);
    expect(await servicio.crear(SUPERADMIN, CUSTOM)).toEqual({ estado: "not_found" });
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
  });

  it("D4, SLT-58 R31: la empresa ya tiene plan → el inicio del ciclo no se elige (validation_error en inicioCiclo)", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: randomUUID() });
    expect(await servicio.crear(SUPERADMIN, { ...CUSTOM, inicioCiclo: "2026-11-01" })).toEqual({
      estado: "validation_error",
      fieldErrors: { inicioCiclo: ["La fecha de inicio solo se elige en la primera asignación."] },
    });
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
  });

  it("D4: la empresa ya tiene plan y no se manda fecha → se crea y asigna conservando su ancla (como un cambio)", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: randomUUID() });
    expect((await servicio.crear(SUPERADMIN, CUSTOM)).estado).toBe("ok");
    expect(repo.crearYAsignar.mock.calls[0]?.[2]).toEqual({ tipoCobro: "anual" });
  });

  it("SLT-58 R30: la fecha fuera de hoy ±1 mes → validation_error antes de leer nada", async () => {
    expect(await servicio.crear(SUPERADMIN, { ...CUSTOM, inicioCiclo: "2026-12-01" })).toEqual({
      estado: "validation_error",
      fieldErrors: { inicioCiclo: ["Elige una fecha entre el 2026-09-30 y el 2026-11-30."] },
    });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("SL-24 R12: el rechazo por tope bajo cerrojo vuelve con su texto, sin nada creado", async () => {
    const excedidos: TopeExcedido[] = [{ organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "api_keys", usados: 4, maximo: 1 }];
    repo.crearYAsignar.mockResolvedValueOnce({ estado: "tope_excedido", excedidos });
    expect(await servicio.crear(SUPERADMIN, CUSTOM)).toEqual({
      estado: "tope_excedido",
      excedidos,
      mensaje: "Mensajería Uno ya tiene 4 API keys activas y el plan permite 1.",
    });
  });

  it("carrera R31 bajo cerrojo: el validation_error del repositorio llega tal cual", async () => {
    const r = { estado: "validation_error" as const, fieldErrors: { inicioCiclo: ["x"] } };
    repo.crearYAsignar.mockResolvedValueOnce(r);
    expect(await servicio.crear(SUPERADMIN, { ...CUSTOM, inicioCiclo: "2026-11-01" })).toEqual(r);
  });
});

describe("D6 — el tipo de cobro en el borde", () => {
  it("crear un custom sin tipo de cobro, o un público con él, es validation_error en tipoCobro sin llamadas", async () => {
    const { tipoCobro: _t, ...sinTipo } = CUSTOM;
    void _t;
    for (const entrada of [
      sinTipo,
      { ...CUSTOM, tipoCobro: "trimestral" },
      { ...CUSTOM, visibilidad: "publico", organizacionId: null },
    ]) {
      const r = await servicio.crear(SUPERADMIN, entrada);
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toContain("tipoCobro");
    }
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("un público con inicio del ciclo es validation_error en inicioCiclo", async () => {
    const r = await servicio.crear(SUPERADMIN, {
      ...CUSTOM,
      visibilidad: "publico",
      organizacionId: null,
      tipoCobro: undefined,
      inicioCiclo: "2026-11-01",
    });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["inicioCiclo"]);
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("asignar sin tipo de cobro (o con uno desconocido) es validation_error en tipoCobro sin llamadas", async () => {
    for (const tipoCobro of [undefined, "semanal"]) {
      const r = await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro });
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["tipoCobro"]);
    }
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("asignar pasa el tipo elegido al repositorio: primera asignación con fecha y cambio de plan", async () => {
    await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo: "2026-11-01", tipoCobro: "anual" });
    expect(repo.asignar).toHaveBeenLastCalledWith(
      EMPRESA,
      PLAN,
      "u-sa",
      { fecha: "2026-11-01", ancla: new Date("2026-11-01T06:00:00.000Z") },
      "anual",
    );
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: randomUUID() });
    await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" });
    expect(repo.asignar).toHaveBeenLastCalledWith(EMPRESA, PLAN, "u-sa", undefined, "mensual");
  });
});
