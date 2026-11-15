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
    topes: { porRol: { adminTienda: 2 }, apiKeys: null },
    modulos: ["analitica"],
    // SLT-66 R28: el plan que se asigna tiene costo concreto (design §9.3); lo que se afirma no cambia.
    precio: { tipo: "monto", mensual: "1000.00", descuentos: {} },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    archivado: false,
    ...extra,
  };
}

const VERSION = {
  nombre: "Básico 2",
  topes: { porRol: { adminTienda: 2 }, apiKeys: null },
  modulos: ["analitica"],
  // SLT-86 (R22): el mismo costo base que `plan()`, para que la edición siga la regla de SLT-58; un
  // cambio de precio lleva fecha de efecto y lo mide `planes-service-periodo.test.ts`.
  precio: { tipo: "monto", mensual: "1000.00", descuentos: {} },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del esquema
};

const CREAR = {
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del esquema
};

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(async () => ({ estado: "ok", planId: PLAN, avisos: [], pendiente: false })),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "ok", cambio: true })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true, avisos: [], pendiente: false })),
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
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => [plan()]),
    preciosQueRigenDesde: vi.fn<IPlanesRepository["preciosQueRigenDesde"]>(async () => []),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => [plan()]),
    // SLT-58: excepción mecánica a R25 decidida por el humano.
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(),
    detalle: vi.fn<IPlanesRepository["detalle"]>(),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(),
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => null),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "not_found" })),
    cancelarCambioEmpresa: vi.fn<IPlanesRepository["cancelarCambioEmpresa"]>(),
    aplicarCambioDeEmpresa: vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(),
    cambiosDeEmpresaVencidos: vi.fn<IPlanesRepository["cambiosDeEmpresaVencidos"]>(),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(),
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
    ["asignar", (s, a) => s.asignar(a, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })],
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
    expect(
      await servicio.crear(SUPERADMIN, { ...CREAR, visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "mensual" }),
    ).toEqual({ estado: "not_found" });
    expect(repo.crear).not.toHaveBeenCalled();
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
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
    // SLT-86 (R15): con las 00:00 de hoy, desde cuándo regiría un precio nuevo (aquí no cambia).
    expect(repo.editar).toHaveBeenCalledWith(PLAN, VERSION, "u-sa", new Date("2026-10-28T06:00:00.000Z"));
  });

  it("R15: un estado del repositorio bajo cerrojo (archivado entre lectura y escritura) se devuelve tal cual", async () => {
    repo.editar.mockResolvedValueOnce({ estado: "archivado" });
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({
      estado: "archivado",
    });
  });

  it("R37, SLT-86 R22: vigenteDesde de ayer es validation_error sin llamadas", async () => {
    const r = await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-10-27" });
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { vigenteDesde: ["La fecha de efecto no puede ser anterior a hoy."] } });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("R37: sin cambio de precio, vigenteDesde de hoy (sus 00:00 ya pasaron) es validation_error sin escribir", async () => {
    const r = await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-10-28" });
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { vigenteDesde: ["La fecha de vigencia tiene que ser posterior a hoy."] } });
    // SLT-86 (R22): para saber si cambia el precio hay que leer el plan; no se escribe nada.
    expect(repo.plan).toHaveBeenCalledTimes(1);
    expect(repo.editar).not.toHaveBeenCalled();
    expect(repo.programarCambio).not.toHaveBeenCalled();
  });

  it("R37: hoy cuenta desde las 00:00 a −06:00, no desde la medianoche UTC", async () => {
    // 2026-10-28 05:59 UTC = 2026-10-27 23:59 en la plataforma: «mañana» (28) todavía es futuro.
    const s = new PlanesService(repo, () => new Date("2026-10-28T05:59:00.000Z"));
    expect(await s.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-10-28" })).toMatchObject({
      estado: "ok",
      vigenteDesde: "2026-10-28",
    });
    expect(repo.programarCambio).toHaveBeenCalledWith(PLAN, VERSION, new Date("2026-10-28T06:00:00.000Z"), "u-sa", new Date("2026-10-28T05:59:00.000Z"));
    expect(repo.editar).not.toHaveBeenCalled();
  });

  it("R37: con fecha futura programa (no edita la vigente) y devuelve la fecha elegida", async () => {
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-11-15" })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: "2026-11-15",
    });
    expect(repo.programarCambio).toHaveBeenCalledWith(PLAN, VERSION, new Date("2026-11-15T06:00:00.000Z"), "u-sa", AHORA);
    expect(repo.editar).not.toHaveBeenCalled();
  });

  it("R16: programada con una empresa por encima del tope nuevo, se guarda y devuelve el aviso", async () => {
    const aviso: TopeExcedido = { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "api_keys", usados: 80, maximo: 50 };
    repo.programarCambio.mockResolvedValueOnce({ estado: "ok", cambio: true, avisos: [aviso], cambioId: "c" });
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-11-15" })).toMatchObject({
      estado: "ok",
      avisos: [aviso],
    });
  });

  it("programada sin nada que programar: ok sin cambio y sin fecha", async () => {
    repo.programarCambio.mockResolvedValueOnce({ estado: "ok", cambio: false, avisos: [], cambioId: null });
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-11-15" })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: false,
      avisos: [],
      vigenteDesde: null,
    });
  });

  it.each([
    ["not_found", { estado: "not_found" as const }],
    ["archivado", { estado: "archivado" as const }],
  ])("programada: %s bajo cerrojo se devuelve tal cual", async (_caso, r) => {
    repo.programarCambio.mockResolvedValueOnce(r);
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-11-15" })).toEqual(r);
  });

  it("R6: programar sobre un archivado se rechaza sin escribir", async () => {
    repo.plan.mockResolvedValueOnce(plan({ archivado: true }));
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: "2026-11-15" })).toEqual({
      estado: "archivado",
    });
    expect(repo.programarCambio).not.toHaveBeenCalled();
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
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: null,
    });
    // SLT-86 (R2): sin fecha, la primera asignación rige desde hoy a las 00:00 de la plataforma.
    expect(repo.asignar).toHaveBeenCalledWith(
      EMPRESA,
      PLAN,
      "u-sa",
      { clase: "inicio", fecha: "2026-10-28", desde: new Date("2026-10-28T06:00:00.000Z"), elegida: false },
      "mensual",
      AHORA,
    );
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
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).toEqual(esperado);
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("R13: el custom de la propia empresa sí se asigna", async () => {
    repo.plan.mockResolvedValueOnce(plan({ visibilidad: "custom", organizacionId: EMPRESA }));
    expect((await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it("R13, SLT-86 R19: el plan que ya tiene, con el mismo tipo, lo decide el repositorio bajo cerrojo: ok sin cambio", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.asignar.mockResolvedValueOnce({ estado: "ok", cambio: false, avisos: [], pendiente: false });
    expect(
      await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: "2026-10-28" }),
    ).toMatchObject({ estado: "ok", cambio: false, vigenteDesde: null });
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it("R12: el rechazo por tope dice qué tope se pasa, con el uso y el tope", async () => {
    const excedidos: TopeExcedido[] = [
      { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "adminTienda", usados: 3, maximo: 2 },
      { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "api_keys", usados: 4, maximo: 1 },
    ];
    repo.asignar.mockResolvedValueOnce({ estado: "tope_excedido", excedidos });
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).toEqual({
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

// SLT-128 (design §7; R14–R16): el rechazo `cambio_a_medias` lo decide el repositorio bajo el cerrojo del plan; el
// servicio no lo traduce ni le añade reglas. El SQL (quién ya lo recibió, plan partido) lo mide
// `tests/integration/db/planes-cambio-por-empresa.test.ts`.
describe("SLT-128 — cambio_a_medias pasa tal cual (R14, R15, R16)", () => {
  it("R14: «Cancelar cambio» con alguna empresa que ya lo recibió devuelve cambio_a_medias, una sola llamada", async () => {
    repo.cancelarCambio.mockResolvedValueOnce({ estado: "cambio_a_medias" });
    expect(await servicio.cancelarCambio(SUPERADMIN, { planId: PLAN })).toEqual({ estado: "cambio_a_medias" });
    expect(repo.cancelarCambio).toHaveBeenCalledWith(PLAN, "u-sa");
    expect(llamadasAlRepositorio()).toBe(1);
  });

  it("R15: archivar con el cambio a medias devuelve cambio_a_medias", async () => {
    repo.archivar.mockResolvedValueOnce({ estado: "cambio_a_medias" });
    expect(await servicio.archivar(SUPERADMIN, { planId: PLAN })).toEqual({ estado: "cambio_a_medias" });
    expect(repo.archivar).toHaveBeenCalledWith(PLAN, "u-sa");
  });

  it("R16: la edición «De inmediato» con el plan partido devuelve cambio_a_medias y no programa nada", async () => {
    repo.editar.mockResolvedValueOnce({ estado: "cambio_a_medias" });
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({ estado: "cambio_a_medias" });
    expect(repo.editar).toHaveBeenCalledTimes(1);
    expect(repo.programarCambio).not.toHaveBeenCalled();
  });

  it.each(ROLES_DE_EMPRESA)("R14: el rol %s de una empresa no llega al repositorio al cancelar, archivar ni editar", async (rol) => {
    const actor: Actor = { usuarioId: "u-1", rol, organizacionId: EMPRESA };
    repo.cancelarCambio.mockResolvedValue({ estado: "cambio_a_medias" });
    expect(await servicio.cancelarCambio(actor, { planId: PLAN })).toEqual({ estado: "forbidden" });
    expect(await servicio.archivar(actor, { planId: PLAN })).toEqual({ estado: "forbidden" });
    expect(await servicio.editar(actor, { planId: PLAN, ...VERSION, vigenteDesde: null })).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });
});
