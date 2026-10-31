import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type {
  DetallePlanLeido,
  IPlanesRepository,
  PlanDeEmpresaLeida,
  PlanDelCatalogoLeido,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, VersionPlan } from "@/lib/types/planes";

// SLT-58 · T4 (design §3.2; R13, R16, R19, R22) — las lecturas del superadmin con un repositorio doble.
// Se mide el contrato (quién → zod → existe → repositorio) y la forma de lo que llega a la pantalla:
// fechas de calendario en la hora de la plataforma, instantes en ISO, las líneas de «qué cambia» y el
// consumo con las mismas filas que «Mi plan». El SQL se mide en
// `tests/integration/db/planes-lecturas-plataforma.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-10-28 12:00 UTC (06:00 en la plataforma). */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
/** Las 00:00 de la plataforma del 2026-11-15 (−06:00). */
const RIGE = new Date("2026-11-15T06:00:00.000Z");

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: 100, porRol: { mensajero: 5 }, apiKeys: null },
    modulos: ["ranking", "analitica"],
    precio: { tipo: "monto", mensual: "25000.00", anual: null },
    costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
    archivado: false,
    ...extra,
  };
}

const PENDIENTE: VersionPlan = {
  nombre: "Básico",
  topes: { ordenesPorCiclo: 200, porRol: { mensajero: 5 }, apiKeys: null },
  modulos: ["ranking", "analitica"],
  precio: { tipo: "monto", mensual: "25000.00", anual: null },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
};

function catalogoLeido(): PlanDelCatalogoLeido[] {
  return [
    { plan: plan(), empresaNombre: null, empresas: 3, vigenteDesdePendiente: RIGE },
    {
      plan: plan({ id: randomUUID(), nombre: "Custom", visibilidad: "custom", organizacionId: EMPRESA, archivado: true }),
      empresaNombre: "Mensajería Uno",
      empresas: 0,
      vigenteDesdePendiente: null,
    },
  ];
}

function detalleLeido(): DetallePlanLeido {
  return {
    plan: plan(),
    empresaNombre: null,
    pendiente: { vigenteDesde: RIGE, version: PENDIENTE },
    empresas: [{ id: EMPRESA, nombre: "Mensajería Uno" }],
    rastro: [
      {
        id: "r2",
        accion: "editado",
        cambios: { nombre: { antes: "Inicial", despues: "Básico" } },
        actorNombre: "Ana Pérez",
        creadoAt: new Date("2026-10-20T10:00:00.000Z"),
      },
      {
        id: "r1",
        accion: "creado",
        cambios: { nombre: { antes: null, despues: "Inicial" } },
        actorNombre: "Ana Pérez",
        creadoAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    ],
  };
}

function planDeEmpresaLeida(): PlanDeEmpresaLeida {
  const dto = plan();
  return {
    organizacionId: EMPRESA,
    plan: {
      dto,
      // SLT-66 R7: la versión vigente lleva el costo por orden del plan.
      vigente: { nombre: dto.nombre, topes: dto.topes, modulos: dto.modulos, precio: dto.precio, costoPorOrden: dto.costoPorOrden },
      // Ancla el 15 a las 12:00 UTC: el ciclo siguiente empieza el 2026-11-15 12:00 UTC.
      ancla: new Date("2026-09-15T12:00:00.000Z"),
      // SLT-66 R5: el uso ya no trae al maestro.
      uso: { ordenes: 85, apiKeys: 2, porRol: { admin: 0, mensajero: 5, adminTienda: 0, adminSatelite: 0 } },
      cambio: { vigenteDesde: RIGE, version: PENDIENTE },
    },
    asignaciones: [
      { creadoAt: new Date("2026-10-02T09:00:00.000Z"), actorNombre: "Ana Pérez", planNombre: "Plan «Básico»" },
      { creadoAt: new Date("2026-09-15T12:00:00.000Z"), actorNombre: null, planNombre: "Plan «Inicial»" },
    ],
  };
}

function doble() {
  return {
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(async () => catalogoLeido()),
    detalle: vi.fn<IPlanesRepository["detalle"]>(async () => detalleLeido()),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(async () => planDeEmpresaLeida()),
    empresa: vi.fn<IPlanesRepository["empresa"]>(async () => null),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => null),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "not_found" })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "not_found" })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "not_found" })),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(async () => ({ estado: "not_found" })),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(async () => ({ estado: "not_found" })),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async () => ({ estado: "sin_pendiente" })),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(async () => []),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(async () => ({ estado: "sin_pendiente" })),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => null),
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => []),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => []),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(async () => null),
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

describe("SLT-58 — lecturas del superadmin: autorización (R22)", () => {
  const LECTURAS: [string, (actor: Actor | null) => Promise<{ estado: string }>][] = [
    ["catalogo", (a) => servicio.catalogo(a)],
    ["detallePlan", (a) => servicio.detallePlan(a, { planId: PLAN })],
    ["planDeEmpresa", (a) => servicio.planDeEmpresa(a, { organizacionId: EMPRESA })],
  ];

  for (const [nombre, leer] of LECTURAS) {
    it.each(ROLES_DE_EMPRESA)(`R22 ${nombre}: el rol %s de empresa recibe forbidden con cero llamadas al repositorio`, async (rol) => {
      const r = await leer({ usuarioId: "u-1", rol, organizacionId: EMPRESA });
      expect(r).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });

    it(`R22 ${nombre}: sin sesión recibe forbidden con cero llamadas al repositorio`, async () => {
      expect(await leer(null)).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });
  }

  it("R22 detallePlan: un planId que no es uuid es validation_error sin llamar al repositorio", async () => {
    const r = await servicio.detallePlan(SUPERADMIN, { planId: "no-es-uuid" });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["planId"]);
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("R22 detallePlan: un plan que no existe es not_found", async () => {
    repo.detalle.mockResolvedValueOnce(null);
    const otro = randomUUID();
    expect(await servicio.detallePlan(SUPERADMIN, { planId: otro })).toEqual({ estado: "not_found" });
    expect(repo.detalle).toHaveBeenCalledWith(otro);
  });

  it("R22 planDeEmpresa: un organizacionId que no es uuid es validation_error y una empresa inexistente not_found", async () => {
    const malo = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: "x" });
    expect(malo.estado).toBe("validation_error");
    expect(llamadasAlRepositorio()).toBe(0);
    repo.planDeEmpresa.mockResolvedValueOnce(null);
    expect(await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "not_found" });
  });
});

describe("SLT-58 — catálogo (R13)", () => {
  it("R13: todos los planes, archivados incluidos, con la empresa del custom, el nº de empresas y la fecha del pendiente", async () => {
    const r = await servicio.catalogo(SUPERADMIN);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.planes).toHaveLength(2);
    expect(r.planes[0]).toEqual({ ...plan(), empresaNombre: null, empresas: 3, vigenteDesdePendiente: "2026-11-15" });
    expect(r.planes[1]).toMatchObject({
      nombre: "Custom",
      visibilidad: "custom",
      archivado: true,
      empresaNombre: "Mensajería Uno",
      empresas: 0,
      vigenteDesdePendiente: null,
    });
    expect(repo.catalogo).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-58 — detalle de un plan (R16)", () => {
  it("R16: versión vigente, pendiente con su fecha y una línea por cosa que cambia, empresas y rastro con instantes ISO", async () => {
    const r = await servicio.detallePlan(SUPERADMIN, { planId: PLAN });
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.detalle.plan).toEqual(plan());
    expect(r.detalle.empresaNombre).toBeNull();
    expect(r.detalle.pendiente).toEqual({ vigenteDesde: "2026-11-15", lineas: ["Órdenes por ciclo: 100 → 200"] });
    expect(r.detalle.empresas).toEqual([{ id: EMPRESA, nombre: "Mensajería Uno" }]);
    expect(r.detalle.rastro).toEqual([
      { id: "r2", accion: "editado", cambios: { nombre: { antes: "Inicial", despues: "Básico" } }, actorNombre: "Ana Pérez", creadoAt: "2026-10-20T10:00:00.000Z" },
      { id: "r1", accion: "creado", cambios: { nombre: { antes: null, despues: "Inicial" } }, actorNombre: "Ana Pérez", creadoAt: "2026-10-01T10:00:00.000Z" },
    ]);
  });

  it("R16: sin pendiente, pendiente es null", async () => {
    repo.detalle.mockResolvedValueOnce({ ...detalleLeido(), pendiente: null });
    const r = await servicio.detallePlan(SUPERADMIN, { planId: PLAN });
    expect(r.estado === "ok" && r.detalle.pendiente).toBeNull();
  });
});

describe("SLT-58 — plan de una empresa (R19)", () => {
  it("R19: nombre, precio sin moneda, módulos en el orden del catálogo, filas de consumo con marcas, reinicio y pendiente", async () => {
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    const { vista } = r;
    expect(vista.organizacionId).toBe(EMPRESA);
    expect(vista.plan).not.toBeNull();
    const p = vista.plan!;
    expect(p.planId).toBe(PLAN);
    expect(p.archivado).toBe(false);
    expect(p.nombre).toBe("Básico");
    expect(p.precioTexto).toBe("25000.00 al mes");
    expect(p.modulos.map((m) => m.clave)).toEqual(["analitica", "ranking"]);
    const porClave = Object.fromEntries(p.filas.map((f) => [f.clave, f]));
    expect(porClave.ordenes).toMatchObject({ usados: 85, maximo: 100, estado: "cerca", texto: "85 de 100 órdenes del ciclo" });
    expect(porClave.mensajero).toMatchObject({ usados: 5, maximo: 5, estado: "lleno" });
    expect(porClave.api_keys).toMatchObject({ usados: 2, maximo: null, estado: "sin_limite" });
    // SLT-66 R5: ninguna fila de maestro.
    expect(p.filas.map((f) => f.clave)).toEqual(["ordenes", "admin", "mensajero", "adminTienda", "adminSatelite", "api_keys"]);
    // Del 2026-10-28 12:00 al 2026-11-15 12:00 UTC: 18 días; la fecha, en la hora de la plataforma.
    expect(p.reinicio).toEqual({ dias: 18, fecha: "2026-11-15" });
    expect(p.cambioPendiente).toEqual({ vigenteDesde: "2026-11-15", lineas: ["Órdenes por ciclo: 100 → 200"] });
  });

  it("R19: sin plan, plan es null (la pantalla dice «Sin plan: sin límites»)", async () => {
    repo.planDeEmpresa.mockResolvedValueOnce({ organizacionId: EMPRESA, plan: null, asignaciones: [] });
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r).toEqual({ estado: "ok", vista: { organizacionId: EMPRESA, plan: null, asignaciones: [] } });
  });

  it("R21: las asignaciones llegan en el orden del repositorio, con el instante en ISO y el actor no resuelto como ''", async () => {
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r.estado === "ok" && r.vista.asignaciones).toEqual([
      { creadoAt: "2026-10-02T09:00:00.000Z", actorNombre: "Ana Pérez", planNombre: "Plan «Básico»" },
      { creadoAt: "2026-09-15T12:00:00.000Z", actorNombre: "", planNombre: "Plan «Inicial»" },
    ]);
    expect(repo.planDeEmpresa).toHaveBeenCalledWith(EMPRESA);
  });
});
