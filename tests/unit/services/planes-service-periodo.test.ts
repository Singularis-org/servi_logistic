import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, VersionPlan } from "@/lib/types/planes";

// SLT-86 · T9 (design §2, §5.1, §5.4; R3, R16, R22) — el borde del servicio con un repositorio doble y el
// reloj fijo: quién (R3), la fecha de efecto de un cambio de empresa (R16) y la de una edición de precio
// (R22). Lo que se mide es que ningún rechazo llegue al repositorio y que, cuando llega, lleve la fecha a
// las 00:00 de la plataforma. El SQL se mide en `planes-cambio-empresa` y `plan-precio-historial`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const OTRO = randomUUID();
const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-11-05 12:00 en la plataforma (−06:00). Hoy = 2026-11-05; hoy + 12 meses = 2027-11-05. */
const AHORA = new Date("2026-11-05T18:00:00.000Z");
const HOY = "2026-11-05";
const a0000 = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Pro",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "31000.00", descuentos: {} },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null,
    archivado: false,
    ...extra,
  };
}

/** La versión que deja el plan igual: cada caso le cambia lo que mide. */
function version(extra: Partial<VersionPlan> = {}): VersionPlan {
  const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = plan();
  return { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual, ...extra };
}

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: OTRO })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(async () => ({ estado: "ok", planId: PLAN, avisos: [], pendiente: true })),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "ok", cambio: true })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true, avisos: [], pendiente: true })),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(async () => ({ avisos: [] })),
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => ({ avisos: [] })),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "ok", cambio: true, pendiente: true })),
    cancelarCambioEmpresa: vi.fn<IPlanesRepository["cancelarCambioEmpresa"]>(async () => ({ estado: "ok" })),
    aplicarCambioDeEmpresa: vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(async () => ({ estado: "sin_pendiente" })),
    cambiosDeEmpresaVencidos: vi.fn<IPlanesRepository["cambiosDeEmpresaVencidos"]>(async () => []),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(async () => ({ estado: "ok" })),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(async () => ({ estado: "ok", cambio: true, avisos: [], cambioId: "c-1" })),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async () => ({ estado: "aplicado" })),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(async () => []),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(async () => ({ estado: "sin_pendiente" })),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => null),
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => []),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => []),
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(async () => []),
    detalle: vi.fn<IPlanesRepository["detalle"]>(async () => null),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(async () => null),
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

const CUSTOM = {
  nombre: "Custom Uno",
  visibilidad: "custom",
  organizacionId: EMPRESA,
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "31000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
  tipoCobro: "quincenal",
} as const;

describe("SLT-86 — R3: solo el superadmin, sin tocar el repositorio", () => {
  const OPERACIONES: [string, (s: PlanesService, a: Actor | null) => Promise<{ estado: string }>][] = [
    ["asignar con fecha de efecto", (s, a) => s.asignar(a, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "quincenal", vigenteDesde: "2026-11-16" })],
    ["programar la primera asignación", (s, a) => s.asignar(a, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "anual", inicioCiclo: "2026-11-20" })],
    ["cambiar el tipo de cobro", (s, a) => s.cambiarTipoCobro(a, { organizacionId: EMPRESA, tipoCobro: "bimestral", vigenteDesde: "2026-11-16" })],
    ["cancelar el cambio de una empresa", (s, a) => s.cancelarCambioEmpresa(a, { organizacionId: EMPRESA })],
    ["crear un custom con fecha de efecto", (s, a) => s.crear(a, { ...CUSTOM, vigenteDesde: "2026-11-16" })],
    ["editar el precio hoy", (s, a) => s.editar(a, { planId: PLAN, ...version({ precio: { tipo: "monto", mensual: "1.00", descuentos: {} } }), vigenteDesde: HOY })],
    ["programar el precio", (s, a) => s.editar(a, { planId: PLAN, ...version({ precio: { tipo: "monto", mensual: "1.00", descuentos: {} } }), vigenteDesde: "2026-12-01" })],
  ];

  for (const [nombre, op] of OPERACIONES) {
    it.each([null, ...ROLES_DE_EMPRESA])(`${nombre}: rol %s → forbidden con cero llamadas`, async (rol) => {
      const actor = rol === null ? null : { usuarioId: "u-1", rol, organizacionId: EMPRESA };
      expect(await op(servicio, actor)).toEqual({ estado: "forbidden" });
      expect(llamadasAlRepositorio()).toBe(0);
    });
  }
});

describe("SLT-86 — R16: la fecha de efecto de un cambio de empresa, de hoy a hoy + 12 meses", () => {
  const RANGO = ["Elige una fecha entre el 2026-11-05 y el 2027-11-05."];

  it.each([
    ["ayer", "2026-11-04"],
    ["un día después de hoy + 12 meses", "2027-11-06"],
  ])("%s → validation_error en vigenteDesde, sin tocar el repositorio (asignar, crear un custom y cambiar el tipo)", async (_c, fecha) => {
    const esperado = { estado: "validation_error", fieldErrors: { vigenteDesde: RANGO } };
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: fecha })).toEqual(esperado);
    expect(await servicio.crear(SUPERADMIN, { ...CUSTOM, vigenteDesde: fecha })).toEqual(esperado);
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual", vigenteDesde: fecha })).toEqual(esperado);
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it.each([
    ["hoy", HOY],
    ["hoy + 12 meses", "2027-11-05"],
  ])("%s entra, y el repositorio recibe la fecha como un cambio a sus 00:00 y el reloj", async (_c, fecha) => {
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "quincenal", vigenteDesde: fecha });
    expect(r).toEqual({ estado: "ok", planId: PLAN, cambio: true, avisos: [], vigenteDesde: fecha });
    expect(repo.asignar).toHaveBeenCalledExactlyOnceWith(
      EMPRESA,
      PLAN,
      "u-sa",
      { clase: "cambio", fecha, desde: a0000(fecha), elegida: true },
      "quincenal",
      AHORA,
    );
  });

  it("«hoy» es el de la plataforma: a las 23:30 del 5 en la plataforma (05:30 UTC del 6), el 5 todavía entra", async () => {
    const noche = new Date("2026-11-06T05:30:00.000Z");
    const r = await new PlanesService(repo, () => noche).asignar(SUPERADMIN, {
      organizacionId: EMPRESA,
      planId: PLAN,
      tipoCobro: "mensual",
      vigenteDesde: HOY,
    });
    expect(r.estado).toBe("ok");
  });

  it("a una empresa con plan, sin fecha de efecto → validation_error en vigenteDesde (asignar y crear un custom)", async () => {
    const OBLIGATORIA = { estado: "validation_error", fieldErrors: { vigenteDesde: ["Elige desde qué fecha rige el cambio."] } };
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual" })).toEqual(OBLIGATORIA);
    expect(await servicio.crear(SUPERADMIN, CUSTOM)).toEqual(OBLIGATORIA);
    expect(repo.asignar).not.toHaveBeenCalled();
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
  });

  it("a una empresa sin plan la fecha de efecto no se admite: la primera asignación lleva fecha de inicio (R2)", async () => {
    repo.empresa.mockResolvedValue({ id: EMPRESA, nombre: "Mensajería Uno", planId: null });
    expect(await servicio.asignar(SUPERADMIN, { organizacionId: EMPRESA, planId: PLAN, tipoCobro: "mensual", vigenteDesde: "2026-11-16" })).toEqual({
      estado: "validation_error",
      fieldErrors: {
        vigenteDesde: ["La fecha de efecto es de un cambio a una empresa con plan; la primera asignación lleva fecha de inicio."],
      },
    });
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("las dos fechas a la vez son validation_error del esquema, sin llamadas", async () => {
    const r = await servicio.asignar(SUPERADMIN, {
      organizacionId: EMPRESA,
      planId: PLAN,
      tipoCobro: "mensual",
      inicioCiclo: HOY,
      vigenteDesde: HOY,
    });
    expect(r).toMatchObject({ estado: "validation_error", fieldErrors: { vigenteDesde: expect.any(Array) } });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("un custom para una empresa con plan llega a crearYAsignar como un cambio, y con fecha futura vuelve la fecha", async () => {
    const r = await servicio.crear(SUPERADMIN, { ...CUSTOM, vigenteDesde: "2026-11-16" });
    expect(r).toEqual({ estado: "ok", planId: PLAN, cambio: true, avisos: [], vigenteDesde: "2026-11-16" });
    expect(repo.crearYAsignar.mock.calls[0]?.[2]).toEqual({
      tipoCobro: "quincenal",
      efecto: { clase: "cambio", fecha: "2026-11-16", desde: a0000("2026-11-16"), elegida: true },
    });
  });

  it("R19, R26: «Cancelar cambio» valida la empresa y devuelve lo que decide el repositorio", async () => {
    const malo = await servicio.cancelarCambioEmpresa(SUPERADMIN, { organizacionId: "no-uuid" });
    expect(malo).toMatchObject({ estado: "validation_error", fieldErrors: { organizacionId: expect.any(Array) } });
    expect(llamadasAlRepositorio()).toBe(0);
    expect(await servicio.cancelarCambioEmpresa(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "ok" });
    repo.cancelarCambioEmpresa.mockResolvedValueOnce({ estado: "sin_cambio_programado" });
    expect(await servicio.cancelarCambioEmpresa(SUPERADMIN, { organizacionId: EMPRESA })).toEqual({ estado: "sin_cambio_programado" });
    expect(repo.cancelarCambioEmpresa).toHaveBeenCalledWith(EMPRESA);
  });
});

describe("SLT-86 — R22: editar el costo base o un descuento lleva fecha de efecto ≥ hoy", () => {
  const PRECIO_NUEVO = version({ precio: { tipo: "monto", mensual: "35000.00", descuentos: {} } });
  const DESCUENTO_NUEVO = version({ precio: { tipo: "monto", mensual: "31000.00", descuentos: { anual: { tipo: "monto", monto: "5000" } } } });

  it.each([
    ["el costo base", PRECIO_NUEVO],
    ["un descuento", DESCUENTO_NUEVO],
    ["pasar a «sin precio»", version({ precio: { tipo: "sin_precio" } })],
  ])("cambiar %s sin fecha → validation_error en vigenteDesde, sin escribir", async (_c, v) => {
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: null })).toEqual({
      estado: "validation_error",
      fieldErrors: { vigenteDesde: ["Elige desde qué fecha rige el cambio."] },
    });
    expect(repo.editar).not.toHaveBeenCalled();
    expect(repo.programarCambio).not.toHaveBeenCalled();
  });

  it("con una fecha anterior a hoy → validation_error en vigenteDesde, sin leer el plan", async () => {
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...PRECIO_NUEVO, vigenteDesde: "2026-11-04" })).toEqual({
      estado: "validation_error",
      fieldErrors: { vigenteDesde: ["La fecha de efecto no puede ser anterior a hoy."] },
    });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it.each([
    ["el costo base", PRECIO_NUEVO],
    ["un descuento", DESCUENTO_NUEVO],
  ])("cambiar %s con la fecha de hoy se aplica en el acto, con el precio desde las 00:00 de hoy", async (_c, v) => {
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: HOY })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: null,
    });
    expect(repo.editar).toHaveBeenCalledExactlyOnceWith(PLAN, v, "u-sa", a0000(HOY));
    expect(repo.programarCambio).not.toHaveBeenCalled();
  });

  it("cambiar el costo base con fecha futura es el cambio programado de SLT-58 (a sus 00:00, con el reloj)", async () => {
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...PRECIO_NUEVO, vigenteDesde: "2026-11-06" })).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: [],
      vigenteDesde: "2026-11-06",
    });
    expect(repo.programarCambio).toHaveBeenCalledExactlyOnceWith(PLAN, PRECIO_NUEVO, a0000("2026-11-06"), "u-sa", AHORA);
    expect(repo.editar).not.toHaveBeenCalled();
  });

  it("«10» y «10.00» son el mismo descuento: no es un cambio de precio y sigue la regla de SLT-58 (sin fecha, inmediata)", async () => {
    repo.plan.mockResolvedValueOnce(plan({ precio: { tipo: "monto", mensual: "31000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } } }));
    const v = version({ nombre: "Pro 2", precio: { tipo: "monto", mensual: "31000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } } });
    expect((await servicio.editar(SUPERADMIN, { planId: PLAN, ...v, vigenteDesde: null })).estado).toBe("ok");
    expect(repo.editar).toHaveBeenCalledTimes(1);
  });

  it("una edición que no toca el precio sigue como en SLT-58: sin fecha, inmediata; con la de hoy, rechazada (R37)", async () => {
    const soloNombre = version({ nombre: "Pro renombrado" });
    expect((await servicio.editar(SUPERADMIN, { planId: PLAN, ...soloNombre, vigenteDesde: null })).estado).toBe("ok");
    expect(repo.editar).toHaveBeenCalledWith(PLAN, soloNombre, "u-sa", a0000(HOY));
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...soloNombre, vigenteDesde: HOY })).toEqual({
      estado: "validation_error",
      fieldErrors: { vigenteDesde: ["La fecha de vigencia tiene que ser posterior a hoy."] },
    });
    expect(repo.editar).toHaveBeenCalledTimes(1);
  });

  it("archivado o inexistente se responde antes de mirar la fecha del precio", async () => {
    repo.plan.mockResolvedValueOnce(null);
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...PRECIO_NUEVO, vigenteDesde: null })).toEqual({ estado: "not_found" });
    repo.plan.mockResolvedValueOnce(plan({ archivado: true }));
    expect(await servicio.editar(SUPERADMIN, { planId: PLAN, ...PRECIO_NUEVO, vigenteDesde: null })).toEqual({ estado: "archivado" });
    expect(repo.editar).not.toHaveBeenCalled();
  });
});
