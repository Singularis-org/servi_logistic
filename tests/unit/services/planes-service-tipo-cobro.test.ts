import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import { cambiarTipoCobroSchema, previsualizarCustomSchema, type TopeExcedido, type TopesPlan } from "@/lib/types/planes";

import { ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";
// Ajuste planes-custom (D10, D13; 2026-11-03) — el borde de dos operaciones nuevas del superadmin, con un
// repositorio doble y el reloj fijo:
//   · D10: cambiar SOLO el tipo de cobro del plan actual (quién → zod → existe → tiene plan → repositorio);
//   · D13: la vista previa de SLT-58 R37 en el form del custom, con los topes del form (sin plan creado).
// Lo que se mide aquí es que ningún rechazo llegue al repositorio y que lo que el repositorio decide
// (mismo tipo, carrera) vuelva tal cual. El SQL se mide en `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-10-29 12:00 en la plataforma (−06:00). Hoy = 2026-10-29; rango 2026-09-29 … 2026-11-29. */
const AHORA = new Date("2026-10-29T18:00:00.000Z");

const TOPES: TopesPlan = { ordenesPorCiclo: 2, porRol: { adminTienda: 2 }, apiKeys: 1 };
const AVISO: TopeExcedido = { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "adminTienda", usados: 3, maximo: 2 };

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => null),
    crear: vi.fn<IPlanesRepository["crear"]>(),
    crearYAsignar: vi.fn<IPlanesRepository["crearYAsignar"]>(),
    editar: vi.fn<IPlanesRepository["editar"]>(),
    archivar: vi.fn<IPlanesRepository["archivar"]>(),
    asignar: vi.fn<IPlanesRepository["asignar"]>(),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(),
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => ({
      avisos: [],
      siguienteCiclo: new Date("2026-11-29T18:00:00.000Z"),
    })),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "ok", cambio: true })),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(),
    asignables: vi.fn<IPlanesRepository["asignables"]>(),
    publicos: vi.fn<IPlanesRepository["publicos"]>(),
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(),
    detalle: vi.fn<IPlanesRepository["detalle"]>(),
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
  servicio = new PlanesService(repo, () => AHORA, async () => ZONA_DE_CR);
});

describe("Ajuste planes-custom D10 — cambiar solo el tipo de cobro del plan actual", () => {
  it("ok: guarda el tipo por el repositorio con el actor de la sesión y devuelve su resultado", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    const r = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual" });
    expect(r).toEqual({ estado: "ok", cambio: true });
    expect(repo.cambiarTipoCobro).toHaveBeenCalledExactlyOnceWith(EMPRESA, "anual", "u-sa");
    // Ni asigna, ni crea, ni toca el plan: solo el tipo.
    expect(repo.asignar).not.toHaveBeenCalled();
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
  });

  it("mismo tipo: el repositorio decide bajo cerrojo y el `cambio: false` vuelve tal cual", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.cambiarTipoCobro.mockResolvedValueOnce({ estado: "ok", cambio: false });
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "mensual" })).toEqual({
      estado: "ok",
      cambio: false,
    });
  });

  it("empresa sin plan → sin_plan, sin llegar a escribir", async () => {
    const r = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual" });
    expect(r).toEqual({ estado: "sin_plan" });
    expect(repo.cambiarTipoCobro).not.toHaveBeenCalled();
  });

  it("carrera: si el repositorio ve la empresa sin plan bajo el cerrojo, vuelve sin_plan", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.cambiarTipoCobro.mockResolvedValueOnce({ estado: "sin_plan" });
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual" })).toEqual({
      estado: "sin_plan",
    });
  });

  it("empresa inexistente → not_found sin escribir", async () => {
    repo.empresa.mockResolvedValueOnce(null);
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual" })).toEqual({
      estado: "not_found",
    });
    expect(repo.cambiarTipoCobro).not.toHaveBeenCalled();
  });

  it("entrada inválida → validation_error por campo, sin tocar el repositorio", async () => {
    const r = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: "no-uuid", tipoCobro: "trimestral" });
    expect(r).toMatchObject({ estado: "validation_error", fieldErrors: { organizacionId: expect.any(Array), tipoCobro: expect.any(Array) } });
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual", planId: PLAN })).toMatchObject({
      estado: "validation_error",
    });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it.each([null, ...ROLES_DE_EMPRESA])("rol %s → forbidden sin llamar al repositorio (SL-24 R5)", async (rol) => {
    const actor = rol === null ? null : { usuarioId: "u", rol, organizacionId: EMPRESA };
    expect(await servicio.cambiarTipoCobro(actor, { organizacionId: EMPRESA, tipoCobro: "anual" })).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });
});

describe("Ajuste planes-custom D13 — vista previa de topes en el form del custom (SLT-58 R37)", () => {
  it("ok: lee con los topes del form y la fecha elegida; siguienteCiclo en AAAA-MM-DD de la plataforma", async () => {
    repo.vistaPreviaConTopes.mockResolvedValueOnce({ avisos: [AVISO], siguienteCiclo: new Date("2026-11-30T06:00:00.000Z") });
    const r = await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES });
    expect(r).toEqual({ estado: "ok", avisos: [AVISO], siguienteCiclo: "2026-11-30" });
    // Mañana: ancla a las 00:00 de la plataforma (06:00 UTC), como la primera asignación (SLT-58 R32).
    expect(repo.vistaPreviaConTopes).toHaveBeenCalledExactlyOnceWith(EMPRESA, TOPES, {
      fecha: "2026-10-30",
      ancla: new Date("2026-10-30T06:00:00.000Z"),
    });
  });

  it("hoy: el ancla es el instante (SLT-58 P9), igual que en la asignación", async () => {
    await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo: "2026-10-29", topes: TOPES });
    expect(repo.vistaPreviaConTopes).toHaveBeenCalledWith(EMPRESA, TOPES, { fecha: "2026-10-29", ancla: "ahora" });
  });

  it("la empresa ya tiene plan → validation_error en inicioCiclo (SLT-58 R31), sin leer el uso", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    const r = await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES });
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { inicioCiclo: [expect.any(String)] } });
    expect(repo.vistaPreviaConTopes).not.toHaveBeenCalled();
  });

  it("fecha fuera de hoy ± 1 mes → validation_error en inicioCiclo (SLT-58 R30), sin tocar el repositorio", async () => {
    for (const inicioCiclo of ["2026-09-28", "2026-11-30"]) {
      const r = await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo, topes: TOPES });
      expect(r).toEqual({ estado: "validation_error", fieldErrors: { inicioCiclo: [expect.any(String)] } });
    }
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("empresa inexistente → not_found (también si desaparece entre la lectura y la vista previa)", async () => {
    repo.empresa.mockResolvedValueOnce(null);
    expect(await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES })).toEqual({
      estado: "not_found",
    });
    repo.vistaPreviaConTopes.mockResolvedValueOnce(null);
    expect(await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES })).toEqual({
      estado: "not_found",
    });
  });

  it("topes inválidos (rol sin tope, negativo) → validation_error, sin tocar el repositorio", async () => {
    const r = await servicio.previsualizarCustom(SUPERADMIN, {
      organizacionId: EMPRESA,
      inicioCiclo: "2026-10-30",
      topes: { ordenesPorCiclo: -1, porRol: { maestro: 1 }, apiKeys: null },
    });
    expect(r).toMatchObject({ estado: "validation_error" });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it.each([null, ...ROLES_DE_EMPRESA])("rol %s → forbidden sin llamar al repositorio", async (rol) => {
    const actor = rol === null ? null : { usuarioId: "u", rol, organizacionId: EMPRESA };
    expect(await servicio.previsualizarCustom(actor, { organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES })).toEqual({
      estado: "forbidden",
    });
    expect(llamadasAlRepositorio()).toBe(0);
  });
});

describe("Ajuste planes-custom D10, D13 — los esquemas del borde", () => {
  it("cambiarTipoCobroSchema: empresa uuid y tipo cerrado; nada más", () => {
    expect(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro: "anual" }).success).toBe(true);
    expect(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA }).success).toBe(false);
    expect(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro: "trimestral" }).success).toBe(false);
    // Sin plan ni fecha: el ancla y el plan no se tocan por esta vía.
    expect(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro: "anual", inicioCiclo: "2026-10-30" }).success).toBe(false);
  });

  it("previsualizarCustomSchema: fecha obligatoria y topes con la forma de crear un plan", () => {
    expect(previsualizarCustomSchema.safeParse({ organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES }).success).toBe(true);
    expect(previsualizarCustomSchema.safeParse({ organizacionId: EMPRESA, topes: TOPES }).success).toBe(false);
    expect(previsualizarCustomSchema.safeParse({ organizacionId: EMPRESA, inicioCiclo: "2026-02-30", topes: TOPES }).success).toBe(false);
    expect(
      previsualizarCustomSchema.safeParse({ organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: { ...TOPES, porRol: { apiKey: 1 } } })
        .success,
    ).toBe(false);
    expect(
      previsualizarCustomSchema.safeParse({ organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES, planId: PLAN }).success,
    ).toBe(false);
  });
});
