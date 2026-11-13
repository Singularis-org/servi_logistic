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
//
// SLT-86 (R5, R7, R8, R12, R15, R26, R27): la lectura trae la entrada, el precio del período y el
// pendiente de la empresa; sin fila de órdenes con tope, y el período de calendario con su tramo.

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
    topes: { porRol: { mensajero: 5 }, apiKeys: null },
    modulos: ["ranking", "analitica"],
    precio: { tipo: "monto", mensual: "25000.00", descuentos: {} },
    costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    archivado: false,
    ...extra,
  };
}

const PENDIENTE: VersionPlan = {
  // SLT-86 (R8): el pendiente cambiaba el tope de órdenes; ahora cambia el nombre.
  nombre: "Básico plus",
  topes: { porRol: { mensajero: 5 }, apiKeys: null },
  modulos: ["ranking", "analitica"],
  precio: { tipo: "monto", mensual: "25000.00", descuentos: {} },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
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
    pendiente: { vigenteDesde: RIGE, version: PENDIENTE, recibidas: 0, total: 1 }, // SLT-128 (R11): 0 de su única empresa
    noAplicadas: [],
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
      vigente: { nombre: dto.nombre, topes: dto.topes, modulos: dto.modulos, precio: dto.precio, costoPorOrden: dto.costoPorOrden, costoPorOrdenPorcentual: null },
      // SLT-86 (R5): la entrada, las 00:00 de la plataforma del 15 de septiembre.
      entrada: new Date("2026-09-15T06:00:00.000Z"),
      // SLT-86 (R15): el precio al empezar el período en curso; aquí, el vigente.
      precioDelPeriodo: dto.precio,
      pendiente: null,
      // SLT-66 R5: el uso ya no trae al maestro.
      uso: { ordenes: 85, apiKeys: 2, porRol: { admin: 0, mensajero: 5, adminTienda: 0, adminSatelite: 0 } },
      cambio: { vigenteDesde: RIGE, version: PENDIENTE },
      // SLT-66 R18: la lectura trae el costo vigente (el plan no fija costo por orden: el global).
      costoVigente: { modo: "fijo", monto: "500.00", fuente: "global" },
      cobroCiclo: { cobrado: "0.00", pendientes: 0 }, // SLT-83: campo nuevo de la lectura
      // Ajuste planes-custom (D6): la empresa paga en anual.
      tipoCobro: "anual",
    },
    pendienteSinPlan: null,
    asignaciones: [
      // Ajuste planes-custom (D14, D16): un cambio de solo el tipo (D10, con su acción propia), una
      // asignación con fecha y una fila anterior al ajuste (sin tipo).
      {
        creadoAt: new Date("2026-10-20T09:00:00.000Z"),
        actorNombre: "Ana Pérez",
        planNombre: "Plan «Básico»",
        accion: "plan_tipo_cobro_cambiado",
        valorAnterior: "mensual",
        valorNuevo: "anual",
      },
      {
        creadoAt: new Date("2026-10-02T09:00:00.000Z"),
        actorNombre: "Ana Pérez",
        planNombre: "Plan «Básico»",
        accion: "plan_asignado",
        valorAnterior: null,
        valorNuevo: "2026-10-02 · mensual",
      },
      {
        creadoAt: new Date("2026-09-15T12:00:00.000Z"),
        actorNombre: null,
        planNombre: "Plan «Inicial»",
        accion: "plan_asignado",
        valorAnterior: null,
        valorNuevo: null,
      },
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
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(async () => ({ estado: "not_found" })),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(async () => ({ estado: "not_found" })),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(async () => ({ estado: "not_found" })),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async () => ({ estado: "sin_pendiente" })),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(async () => []),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(async () => ({ estado: "sin_pendiente" })),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => null),
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => []),
    preciosQueRigenDesde: vi.fn<IPlanesRepository["preciosQueRigenDesde"]>(async () => []),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => []),
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => null),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "not_found" })),
    cancelarCambioEmpresa: vi.fn<IPlanesRepository["cancelarCambioEmpresa"]>(),
    aplicarCambioDeEmpresa: vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(),
    cambiosDeEmpresaVencidos: vi.fn<IPlanesRepository["cambiosDeEmpresaVencidos"]>(),
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
    // SLT-86 (R15, R25; review m4): los precios que regirán, para la vista previa del cambio.
    ["preciosQueRigen", (a) => servicio.preciosQueRigen(a, { planIds: [PLAN] })],
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
    // SLT-42 (decisión del humano tras T5.5): el catálogo no es de una empresa; la fecha va en UTC y lo dice.
    expect(r.planes[0]).toEqual({ ...plan(), empresaNombre: null, empresas: 3, vigenteDesdePendiente: "2026-11-15 UTC" });
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

describe("SLT-42 — catálogo del superadmin: la fecha del pendiente, en UTC y con su etiqueta", () => {
  it("un instante que en Costa Rica aún es el 14 sale como el 15 UTC", async () => {
    const s = new PlanesService(repo, () => AHORA);
    // 2026-11-15T03:00Z: las 21:00 del 14 en Costa Rica, el 15 en UTC.
    repo.catalogo.mockResolvedValue([
      { plan: plan(), empresaNombre: null, empresas: 2, vigenteDesdePendiente: new Date("2026-11-15T03:00:00.000Z") },
    ]);
    const r = await s.catalogo(SUPERADMIN);
    if (r.estado !== "ok") throw new Error("se esperaba ok");
    expect(r.planes[0].vigenteDesdePendiente).toBe("2026-11-15 UTC");
  });
});

describe("SLT-58 — detalle de un plan (R16)", () => {
  it("R16: versión vigente, pendiente con su fecha y una línea por cosa que cambia, empresas y rastro con instantes ISO", async () => {
    const r = await servicio.detallePlan(SUPERADMIN, { planId: PLAN });
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.detalle.plan).toEqual(plan());
    expect(r.detalle.empresaNombre).toBeNull();
    // SLT-128 (R11): con el conteo de recepciones tal cual lo lee el repositorio.
    expect(r.detalle.pendiente).toEqual({
      vigenteDesde: "2026-11-15",
      lineas: ["Nombre del plan: Básico → Básico plus"],
      recibidas: 0,
      total: 1,
    });
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
    expect(p.precioTexto).toBe("25000.00 / mes");
    expect(p.modulos.map((m) => m.clave)).toEqual(["analitica", "ranking"]);
    const porClave = Object.fromEntries(p.filas.map((f) => [f.clave, f]));
    // SLT-86 (R7, R8): las órdenes del período, sin fila ni tope.
    expect(p.ordenesDelPeriodo).toBe(85);
    expect(porClave.mensajero).toMatchObject({ usados: 5, maximo: 5, estado: "lleno" });
    expect(porClave.api_keys).toMatchObject({ usados: 2, maximo: null, estado: "sin_limite" });
    // SLT-66 R5: ninguna fila de maestro.
    expect(p.filas.map((f) => f.clave)).toEqual(["admin", "mensajero", "adminTienda", "adminSatelite", "api_keys"]);
    // SLT-86 (R27): anual; del 2026-10-28 12:00 UTC al 2027-01-01 06:00 UTC: 64,75 días → 65.
    expect(p.reinicio).toEqual({ dias: 65, fecha: "2027-01-01" });
    expect(p.cambioPendiente).toEqual({ vigenteDesde: "2026-11-15", lineas: ["Nombre del plan: Básico → Básico plus"] });
  });

  it("D9, SLT-86 R12/R27: el detalle trae el tipo, el tramo desde la entrada, su costo y el siguiente cobro", async () => {
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    if (r.estado !== "ok" || r.vista.plan === null) throw new Error("se esperaba un plan");
    // Anual sin descuento: 25000.00 × 12 = 300000.00. Entrada el 15 de septiembre: tramo hasta el 31 de
    // diciembre, 108 de 365 días → 30000000 × 108 ÷ 365 = 8876712,33 céntimos → 88767.12.
    expect(r.vista.plan.cobro).toEqual({
      tipo: "anual",
      periodo: { desde: "2026-09-15", hasta: "2026-12-31", esTramo: true },
      costo: "88767.12",
      siguienteCobro: "2027-01-01",
      pendiente: null,
    });
  });

  it("R19: sin plan, plan es null (la pantalla dice «Sin plan: sin límites»)", async () => {
    repo.planDeEmpresa.mockResolvedValueOnce({ organizacionId: EMPRESA, plan: null, pendienteSinPlan: null, asignaciones: [] });
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r).toEqual({ estado: "ok", vista: { organizacionId: EMPRESA, plan: null, pendienteSinPlan: null, asignaciones: [] } });
  });

  it("SLT-86 R26: sin plan y con su primera asignación pendiente, la vista la trae para «Cancelar cambio»", async () => {
    const pendiente = { planNombre: "Pro", tipo: "bimestral" as const, desde: "2026-11-20" };
    repo.planDeEmpresa.mockResolvedValueOnce({ organizacionId: EMPRESA, plan: null, pendienteSinPlan: pendiente, asignaciones: [] });
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r).toEqual({ estado: "ok", vista: { organizacionId: EMPRESA, plan: null, pendienteSinPlan: pendiente, asignaciones: [] } });
  });

  it("R21: las asignaciones llegan en el orden del repositorio, con el instante en ISO y el actor no resuelto como ''", async () => {
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r.estado === "ok" && r.vista.asignaciones.map(({ creadoAt, actorNombre, planNombre }) => ({ creadoAt, actorNombre, planNombre }))).toEqual([
      { creadoAt: "2026-10-20T09:00:00.000Z", actorNombre: "Ana Pérez", planNombre: "Plan «Básico»" },
      { creadoAt: "2026-10-02T09:00:00.000Z", actorNombre: "Ana Pérez", planNombre: "Plan «Básico»" },
      { creadoAt: "2026-09-15T12:00:00.000Z", actorNombre: "", planNombre: "Plan «Inicial»" },
    ]);
    expect(repo.planDeEmpresa).toHaveBeenCalledWith(EMPRESA);
  });

  it("Ajuste planes-custom D14, D16: cada fila trae su tipo de cobro; el cambio de solo el tipo (D10, `plan_tipo_cobro_cambiado`) es una fila propia", async () => {
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r.estado === "ok" && r.vista.asignaciones.map(({ tipo, tipoCobro, tipoCobroAnterior }) => ({ tipo, tipoCobro, tipoCobroAnterior }))).toEqual([
      { tipo: "cambio_tipo_cobro", tipoCobro: "anual", tipoCobroAnterior: "mensual" },
      { tipo: "asignacion", tipoCobro: "mensual", tipoCobroAnterior: null },
      // Anterior al ajuste: no guardaba el tipo.
      { tipo: "asignacion", tipoCobro: null, tipoCobroAnterior: null },
    ]);
    // Los valores crudos del historial no salen de la lectura.
    expect(r.estado === "ok" && Object.keys(r.vista.asignaciones[0]).sort()).toEqual(
      ["actorNombre", "creadoAt", "desde", "planNombre", "tipo", "tipoCobro", "tipoCobroAnterior"],
    );
  });

  it("Ajuste planes-custom D16: la acción de la fila manda; el mismo valor en `plan_asignado` es una asignación", async () => {
    const fila = { creadoAt: new Date("2026-10-20T09:00:00.000Z"), actorNombre: "Ana", planNombre: "Plan «Básico»", valorAnterior: null, valorNuevo: "anual" };
    repo.planDeEmpresa.mockResolvedValueOnce({
      organizacionId: EMPRESA,
      plan: null,
      pendienteSinPlan: null,
      asignaciones: [
        { ...fila, accion: "plan_tipo_cobro_cambiado" },
        { ...fila, accion: "plan_asignado" },
      ],
    });
    const r = await servicio.planDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r.estado === "ok" && r.vista.asignaciones.map(({ tipo, tipoCobro }) => ({ tipo, tipoCobro }))).toEqual([
      { tipo: "cambio_tipo_cobro", tipoCobro: "anual" },
      { tipo: "asignacion", tipoCobro: "anual" },
    ]);
  });
});

describe("SLT-86 — los precios que regirán a los planes de un cambio (R15, R25; review m4)", () => {
  const OTRO = randomUUID();
  const P31 = { tipo: "monto", mensual: "31000.00", descuentos: {} } as const;
  const P35 = { tipo: "monto", mensual: "35000.00", descuentos: {} } as const;

  it("R25: un id que no es uuid es validation_error sin llamar al repositorio", async () => {
    const r = await servicio.preciosQueRigen(SUPERADMIN, { planIds: ["no-es-uuid"] });
    expect(r.estado).toBe("validation_error");
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("R15: lee desde las 00:00 de HOY en la plataforma, sin ids repetidos", async () => {
    await servicio.preciosQueRigen(SUPERADMIN, { planIds: [PLAN, OTRO, PLAN] });
    // AHORA = 2026-10-28 06:00 en la plataforma → las 00:00 de ese día son las 06:00 UTC.
    expect(repo.preciosQueRigenDesde).toHaveBeenCalledWith([PLAN, OTRO], new Date("2026-10-28T06:00:00.000Z"));
  });

  it("R15: agrupa por plan, de menor a mayor `desde` (siempre primero), en ISO; en un empate el programado va detrás", async () => {
    repo.preciosQueRigenDesde.mockResolvedValue([
      { planId: PLAN, desde: RIGE, precio: P35, programado: true },
      { planId: OTRO, desde: null, precio: P35, programado: false },
      { planId: PLAN, desde: RIGE, precio: P31, programado: false },
      { planId: PLAN, desde: null, precio: P31, programado: false },
    ]);
    const r = await servicio.preciosQueRigen(SUPERADMIN, { planIds: [PLAN, OTRO] });
    expect(r).toEqual({
      estado: "ok",
      precios: {
        [PLAN]: [
          { desde: null, precio: P31 },
          { desde: "2026-11-15T06:00:00.000Z", precio: P31 },
          { desde: "2026-11-15T06:00:00.000Z", precio: P35 },
        ],
        [OTRO]: [{ desde: null, precio: P35 }],
      },
    });
  });

  it("R15: sin planes pedidos, ok y vacío", async () => {
    expect(await servicio.preciosQueRigen(SUPERADMIN, { planIds: [] })).toEqual({ estado: "ok", precios: {} });
  });
});
