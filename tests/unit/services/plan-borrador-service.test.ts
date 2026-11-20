import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IPlanBorradorRepository } from "@/lib/interfaces/repositories/IPlanBorradorRepository";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { BorradorNoEncontrado } from "@/lib/planes/borrador";
import { PlanBorradorService } from "@/lib/services/PlanBorradorService";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-129 (design §5.2; R1, R3, R6, R8, R9, R10, R16, R19, R20) — el servicio del borrador con dobles: el orden quién → zod →
// existencia → repositorio, y confirmar por `PlanesService` sin reglas propias.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const NO_SUPERADMIN: (Actor | null)[] = [
  { usuarioId: "u-m", rol: "maestro", organizacionId: "org-a" },
  { usuarioId: "u-a", rol: "admin", organizacionId: "org-a" },
  null,
];
const BORRADOR = randomUUID();
const PLAN = randomUUID();
const EMPRESA = randomUUID();
const ACTUALIZADO = new Date("2026-11-17T15:00:00.000Z");

const GENERAL = { nombre: "Pro", visibilidad: "publico" as const, organizacionId: null };
const PRECIO = { precio: { tipo: "monto" as const, mensual: "50000", descuentos: [] } };
const ORDEN = { costoPorOrden: "100", costoPorOrdenPorcentual: null, periodicidadOrdenes: "quincenal" as const };
const TOPES = { topes: { porRol: { admin: 2 }, apiKeys: 3 } };
const MODULOS = { modulos: ["ranking" as const] };
// SLT-214 (R7): el paso «Beneficios», después de «Módulos».
const BENEFICIOS = { beneficios: [{ icono: "check" as const, texto: "Soporte por correo" }] };
// SLT-215 (R7): el paso «Niveles», después de «Beneficios».
const NIVELES = { niveles: [{ meta: 100, descuento: { tipo: "porcentaje" as const, porcentaje: "5" } }] };
const PASOS_DE_CREAR = {
  general: GENERAL,
  precio: PRECIO,
  orden: ORDEN,
  topes: TOPES,
  modulos: MODULOS,
  beneficios: BENEFICIOS,
  niveles: NIVELES,
};

function fila(planId: string | null, pasos: Record<string, unknown>) {
  return { id: BORRADOR, planId, pasos, iniciadoPorNombre: "Sara Admin", createdAt: ACTUALIZADO, updatedAt: ACTUALIZADO };
}

const repo = {
  plan: vi.fn(async (): Promise<PlanDTO | null> => ({ id: PLAN, archivado: false }) as PlanDTO),
  crearBorrador: vi.fn(async () => ({ borradorId: BORRADOR, pasos: ["general"], actualizadoAt: ACTUALIZADO })),
  guardarPasoDeCreacion: vi.fn(async () => ({ borradorId: BORRADOR, pasos: ["topes", "general"], actualizadoAt: ACTUALIZADO })),
  guardarPasoDeCambio: vi.fn(async () => ({
    estado: "ok" as const,
    borradorId: BORRADOR,
    pasos: ["vigencia", "general"],
    actualizadoAt: ACTUALIZADO,
  })),
  descartar: vi.fn(async () => true),
  borrador: vi.fn(async () => fila(null, PASOS_DE_CREAR)),
  borradorDelPlan: vi.fn(async () => fila(PLAN, { general: { nombre: "Pro 2" } })),
  borradores: vi.fn(async () => [
    { ...fila(null, { general: GENERAL }), nombreDelPlan: null },
    { ...fila(null, { precio: PRECIO }), id: "b-sin-general", nombreDelPlan: null },
    { ...fila(PLAN, { topes: TOPES }), id: "b-cambio", nombreDelPlan: "Plan de hoy" },
    { ...fila(PLAN, { general: { nombre: "Nuevo nombre" } }), id: "b-cambio-general", nombreDelPlan: "Plan de hoy" },
  ]),
} satisfies IPlanBorradorRepository;

const OK = { estado: "ok" as const, planId: BORRADOR, cambio: true, avisos: [], vigenteDesde: null };
const planes = { crear: vi.fn(async () => OK), editar: vi.fn(async () => OK) };
const servicio = () => new PlanBorradorService(repo, planes as unknown as IPlanesService);

beforeEach(() => vi.clearAllMocks());

function nadieTocoLaBase() {
  for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
  expect(planes.crear).not.toHaveBeenCalled();
  expect(planes.editar).not.toHaveBeenCalled();
}

describe("R1 — cualquier rol que no es superadmin recibe forbidden y el repositorio no se llama", () => {
  const operaciones = {
    guardarPaso: { modo: "crear", borradorId: null, paso: "general", valores: GENERAL },
    descartar: { borradorId: BORRADOR },
    confirmar: { borradorId: BORRADOR },
    leer: { borradorId: BORRADOR },
    borradores: undefined,
  } as const;
  for (const [op, input] of Object.entries(operaciones)) {
    for (const actor of NO_SUPERADMIN) {
      it(`${op} con ${actor?.rol ?? "sin sesión"}`, async () => {
        const s = servicio();
        const r = await (s[op as keyof typeof operaciones] as (a: Actor | null, i: unknown) => Promise<unknown>).call(s, actor, input);
        expect(r).toEqual({ estado: "forbidden" });
        nadieTocoLaBase();
      });
    }
  }
});

describe("guardar un paso", () => {
  it("R3 — un plan nuevo empieza por General", async () => {
    const r = await servicio().guardarPaso(SUPERADMIN, { modo: "crear", borradorId: null, paso: "precio", valores: PRECIO });
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { paso: [expect.any(String)] } });
    nadieTocoLaBase();
  });

  it("R6 — un paso inválido no llega al repositorio, con la clave del campo sin `valores.`", async () => {
    const r = await servicio().guardarPaso(SUPERADMIN, {
      modo: "crear",
      borradorId: BORRADOR,
      paso: "topes",
      valores: { topes: { porRol: { admin: -1 }, apiKeys: 3 } },
    });
    if (r.estado !== "validation_error") throw new Error(r.estado);
    expect(Object.keys(r.fieldErrors)).toEqual(["topes.porRol.admin"]);
    nadieTocoLaBase();
  });

  it("R6 — una fecha fuera de rango se acepta al guardar General", async () => {
    const general = { nombre: "Custom A", visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "mensual", vigenteDesde: "2099-01-01" };
    const r = await servicio().guardarPaso(SUPERADMIN, { modo: "crear", borradorId: null, paso: "general", valores: general });
    expect(r).toEqual({ estado: "ok", borradorId: BORRADOR, pasosGuardados: ["general"], actualizadoAt: ACTUALIZADO.toISOString() });
    expect(repo.crearBorrador).toHaveBeenCalledWith(general, "u-sa");
  });

  it("R4 — en un borrador que existe guarda ese paso y devuelve los pasos en el orden del formulario", async () => {
    const r = await servicio().guardarPaso(SUPERADMIN, { modo: "crear", borradorId: BORRADOR, paso: "topes", valores: TOPES });
    expect(repo.guardarPasoDeCreacion).toHaveBeenCalledWith(BORRADOR, "topes", TOPES);
    expect(r).toMatchObject({ estado: "ok", pasosGuardados: ["general", "topes"] });
  });

  it("R5 — un paso del cambio va al borrador del plan, con quien guarda", async () => {
    const r = await servicio().guardarPaso(SUPERADMIN, { modo: "editar", planId: PLAN, paso: "vigencia", valores: { vigenteDesde: "2026-12-01" } });
    expect(repo.guardarPasoDeCambio).toHaveBeenCalledWith(PLAN, "vigencia", { vigenteDesde: "2026-12-01" }, "u-sa");
    expect(r).toMatchObject({ estado: "ok", pasosGuardados: ["general", "vigencia"] });
  });

  it("R8 — plan inexistente, plan archivado y borrador inexistente no escriben", async () => {
    const editar = { modo: "editar", planId: PLAN, paso: "general", valores: { nombre: "Otro" } };
    repo.plan.mockResolvedValueOnce(null);
    expect(await servicio().guardarPaso(SUPERADMIN, editar)).toEqual({ estado: "not_found" });
    repo.plan.mockResolvedValueOnce({ id: PLAN, archivado: true } as PlanDTO);
    expect(await servicio().guardarPaso(SUPERADMIN, editar)).toEqual({ estado: "archivado" });
    expect(repo.guardarPasoDeCambio).not.toHaveBeenCalled();
    repo.guardarPasoDeCreacion.mockResolvedValueOnce(null as never);
    const r = await servicio().guardarPaso(SUPERADMIN, { modo: "crear", borradorId: BORRADOR, paso: "topes", valores: TOPES });
    expect(r).toEqual({ estado: "borrador_no_encontrado" });
  });
});

describe("leer y listar", () => {
  it("R9 — por id devuelve los pasos tal como se guardaron, en el orden del formulario, con quién y cuándo", async () => {
    const precio = { precio: { tipo: "monto", mensual: "50000", descuentos: [
      { periodo: "anual", tipo: "porcentaje", valor: "10" },
      { periodo: "bimestral", tipo: "monto", valor: "1000" },
    ] } };
    repo.borrador.mockResolvedValueOnce(fila(null, { topes: TOPES, precio, general: GENERAL }));
    const r = await servicio().leer(SUPERADMIN, { borradorId: BORRADOR });
    expect(repo.borrador).toHaveBeenCalledWith(BORRADOR);
    expect(r).toEqual({
      estado: "ok",
      borrador: {
        id: BORRADOR,
        modo: "crear",
        planId: null,
        pasos: { general: GENERAL, precio, topes: TOPES },
        pasosGuardados: ["general", "precio", "topes"],
        iniciadoPor: "Sara Admin",
        iniciadoAt: ACTUALIZADO.toISOString(),
        actualizadoAt: ACTUALIZADO.toISOString(),
      },
    });
  });

  it("R9 — por plan lee el borrador de cambio; sin él, borrador null; una entrada mala no llega al repositorio", async () => {
    expect(await servicio().leer(SUPERADMIN, { planId: PLAN })).toMatchObject({
      estado: "ok",
      borrador: { modo: "editar", planId: PLAN, pasosGuardados: ["general"] },
    });
    expect(repo.borradorDelPlan).toHaveBeenCalledWith(PLAN);
    repo.borradorDelPlan.mockResolvedValueOnce(null as never);
    expect(await servicio().leer(SUPERADMIN, { planId: PLAN })).toEqual({ estado: "ok", borrador: null });
    vi.clearAllMocks();
    expect(await servicio().leer(SUPERADMIN, { planId: PLAN, borradorId: BORRADOR })).toMatchObject({ estado: "validation_error" });
    nadieTocoLaBase();
  });

  it("R9 — lectura defensiva: un paso que ya no valida no sale en pasos ni en pasosGuardados", async () => {
    repo.borrador.mockResolvedValueOnce(fila(null, { general: GENERAL, orden: { costoPorOrden: "abc" } }));
    const r = await servicio().leer(SUPERADMIN, { borradorId: BORRADOR });
    expect(r).toMatchObject({ estado: "ok", borrador: { pasos: { general: GENERAL }, pasosGuardados: ["general"] } });
  });

  it("R10 — la lista trae creación y cambio con su nombre: el de General, si no el del plan, si no ninguno", async () => {
    const r = await servicio().borradores(SUPERADMIN);
    if (r.estado !== "ok") throw new Error(r.estado);
    expect(r.borradores.map((b) => [b.id, b.modo, b.planId, b.nombre])).toEqual([
      [BORRADOR, "crear", null, "Pro"],
      ["b-sin-general", "crear", null, null],
      ["b-cambio", "editar", PLAN, "Plan de hoy"],
      ["b-cambio-general", "editar", PLAN, "Nuevo nombre"],
    ]);
    expect(r.borradores[0]).toEqual({
      id: BORRADOR,
      modo: "crear",
      planId: null,
      nombre: "Pro",
      iniciadoPor: "Sara Admin",
      iniciadoAt: ACTUALIZADO.toISOString(),
      actualizadoAt: ACTUALIZADO.toISOString(),
    });
  });
});

describe("descartar", () => {
  it("R14 — borra el borrador; si no existe, borrador_no_encontrado", async () => {
    expect(await servicio().descartar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "ok" });
    repo.descartar.mockResolvedValueOnce(false);
    expect(await servicio().descartar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "borrador_no_encontrado" });
    expect(await servicio().descartar(SUPERADMIN, { borradorId: "x" })).toMatchObject({ estado: "validation_error" });
  });
});

describe("confirmar", () => {
  it("R16 — crear sin Topes y programar sin Cuándo rige dan pasos_pendientes", async () => {
    repo.borrador.mockResolvedValueOnce(fila(null, { ...PASOS_DE_CREAR, topes: undefined }));
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "pasos_pendientes", pasos: ["topes"] });
    repo.borrador.mockResolvedValueOnce(fila(PLAN, { ...PASOS_DE_CREAR, general: { nombre: "Pro" } }));
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "pasos_pendientes", pasos: ["vigencia"] });
    expect(planes.crear).not.toHaveBeenCalled();
    expect(planes.editar).not.toHaveBeenCalled();
  });

  it("lectura defensiva — un paso guardado que ya no valida cuenta como pendiente", async () => {
    repo.borrador.mockResolvedValueOnce(fila(null, { ...PASOS_DE_CREAR, orden: { costoPorOrden: "abc" } }));
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "pasos_pendientes", pasos: ["orden"] });
  });

  it("R17 — un borrador de creación completo se crea por PlanesService con su borradorId", async () => {
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual(OK);
    expect(planes.crear).toHaveBeenCalledWith(SUPERADMIN, expect.objectContaining({ nombre: "Pro", topes: TOPES.topes }), {
      borradorId: BORRADOR,
    });
  });

  it("R18 — un borrador de cambio completo se edita por PlanesService con su borradorId", async () => {
    repo.borrador.mockResolvedValueOnce(fila(PLAN, { ...PASOS_DE_CREAR, general: { nombre: "Pro" }, vigencia: { vigenteDesde: "2026-12-01" } }));
    await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR });
    expect(planes.editar).toHaveBeenCalledWith(SUPERADMIN, expect.objectContaining({ planId: PLAN, vigenteDesde: "2026-12-01" }), {
      borradorId: BORRADOR,
    });
  });

  it("R19 — el rechazo de crear pasa tal cual", async () => {
    const rechazo = { estado: "validation_error" as const, fieldErrors: { tipoCobro: ["no"] } };
    planes.crear.mockResolvedValueOnce(rechazo as never);
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual(rechazo);
  });

  it("R20 — sin borrador, o si desaparece dentro de la transacción, borrador_no_encontrado", async () => {
    repo.borrador.mockResolvedValueOnce(null as never);
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "borrador_no_encontrado" });
    expect(planes.crear).not.toHaveBeenCalled();
    planes.crear.mockRejectedValueOnce(new BorradorNoEncontrado(BORRADOR));
    expect(await servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).toEqual({ estado: "borrador_no_encontrado" });
  });

  it("otro error del repositorio no se traga", async () => {
    planes.crear.mockRejectedValueOnce(new Error("se cayó la base"));
    await expect(servicio().confirmar(SUPERADMIN, { borradorId: BORRADOR })).rejects.toThrow("se cayó la base");
  });
});
