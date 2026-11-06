import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import { cambiarTipoCobroSchema, previsualizarCustomSchema, type TopeExcedido, type TopesPlan } from "@/lib/types/planes";

// Ajuste planes-custom (D10, D13; 2026-11-03) — el borde de dos operaciones nuevas del superadmin, con un
// repositorio doble y el reloj fijo:
//   · D10: cambiar SOLO el tipo de cobro del plan actual (quién → zod → existe → tiene plan → repositorio);
//   · D13: la vista previa de SLT-58 R37 en el form del custom, con los topes del form (sin plan creado).
// Lo que se mide aquí es que ningún rechazo llegue al repositorio y que lo que el repositorio decide
// (mismo tipo, carrera) vuelva tal cual. El SQL se mide en `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`.
//
// SLT-86 (R16, R17): cambiar el tipo lleva fecha de efecto (`vigenteDesde`, de hoy a hoy + 12 meses); el
// repositorio recibe el `EfectoElegido` y el reloj. La vista previa ya no da el siguiente ciclo (R8).

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const PLAN = randomUUID();
const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-10-29 12:00 en la plataforma (−06:00). Hoy = 2026-10-29; rango 2026-09-29 … 2026-11-29. */
const AHORA = new Date("2026-10-29T18:00:00.000Z");

const TOPES: TopesPlan = { porRol: { adminTienda: 2 }, apiKeys: 1 };
const EFECTO = { clase: "cambio", fecha: "2026-11-01", desde: new Date("2026-11-01T06:00:00.000Z"), elegida: true } as const;
/** Lo que manda «Cambiar tipo de cobro»: empresa, tipo y fecha de efecto. */
const pedido = (tipoCobro: string, extra: Record<string, unknown> = {}) => ({ organizacionId: EMPRESA, tipoCobro, vigenteDesde: "2026-11-01", ...extra });
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
    vistaPreviaConTopes: vi.fn<IPlanesRepository["vistaPreviaConTopes"]>(async () => ({ avisos: [] })),
    cambiarTipoCobro: vi.fn<IPlanesRepository["cambiarTipoCobro"]>(async () => ({ estado: "ok", cambio: true, pendiente: true })),
    cancelarCambioEmpresa: vi.fn<IPlanesRepository["cancelarCambioEmpresa"]>(),
    aplicarCambioDeEmpresa: vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(),
    cambiosDeEmpresaVencidos: vi.fn<IPlanesRepository["cambiosDeEmpresaVencidos"]>(),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(),
    asignables: vi.fn<IPlanesRepository["asignables"]>(),
    preciosQueRigenDesde: vi.fn<IPlanesRepository["preciosQueRigenDesde"]>(async () => []),
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
  servicio = new PlanesService(repo, () => AHORA);
});

describe("Ajuste planes-custom D10 — cambiar solo el tipo de cobro del plan actual", () => {
  it("ok: guarda el tipo por el repositorio con el actor de la sesión y devuelve su resultado", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    const r = await servicio.cambiarTipoCobro(SUPERADMIN, pedido("anual"));
    expect(r).toEqual({ estado: "ok", cambio: true });
    expect(repo.cambiarTipoCobro).toHaveBeenCalledExactlyOnceWith(EMPRESA, "anual", EFECTO, "u-sa", AHORA);
    // Ni asigna, ni crea, ni toca el plan: solo el tipo.
    expect(repo.asignar).not.toHaveBeenCalled();
    expect(repo.crearYAsignar).not.toHaveBeenCalled();
  });

  it("mismo tipo: el repositorio decide bajo cerrojo y el `cambio: false` vuelve tal cual", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.cambiarTipoCobro.mockResolvedValueOnce({ estado: "ok", cambio: false, pendiente: false });
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, pedido("mensual"))).toEqual({
      estado: "ok",
      cambio: false,
    });
  });

  it("empresa sin plan → sin_plan, sin llegar a escribir", async () => {
    const r = await servicio.cambiarTipoCobro(SUPERADMIN, pedido("anual"));
    expect(r).toEqual({ estado: "sin_plan" });
    expect(repo.cambiarTipoCobro).not.toHaveBeenCalled();
  });

  it("carrera: si el repositorio ve la empresa sin plan bajo el cerrojo, vuelve sin_plan", async () => {
    repo.empresa.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    repo.cambiarTipoCobro.mockResolvedValueOnce({ estado: "sin_plan" });
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, pedido("anual"))).toEqual({
      estado: "sin_plan",
    });
  });

  it("empresa inexistente → not_found sin escribir", async () => {
    repo.empresa.mockResolvedValueOnce(null);
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, pedido("anual"))).toEqual({
      estado: "not_found",
    });
    expect(repo.cambiarTipoCobro).not.toHaveBeenCalled();
  });

  it("entrada inválida → validation_error por campo, sin tocar el repositorio", async () => {
    const r = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: "no-uuid", tipoCobro: "trimestral", vigenteDesde: "2026-11-01" });
    expect(r).toMatchObject({ estado: "validation_error", fieldErrors: { organizacionId: expect.any(Array), tipoCobro: expect.any(Array) } });
    expect(await servicio.cambiarTipoCobro(SUPERADMIN, pedido("anual", { planId: PLAN }))).toMatchObject({
      estado: "validation_error",
    });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("SLT-86 R16: sin fecha de efecto, con una pasada o a más de 12 meses → validation_error en vigenteDesde, sin tocar el repositorio", async () => {
    for (const vigenteDesde of [undefined, "2026-10-28", "2027-10-30", "2026-02-30"]) {
      const r = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: EMPRESA, tipoCobro: "anual", vigenteDesde });
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["vigenteDesde"]);
    }
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("SLT-86 R16: hoy y hoy + 12 meses entran", async () => {
    repo.empresa.mockResolvedValue({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    for (const vigenteDesde of ["2026-10-29", "2027-10-29"]) {
      expect((await servicio.cambiarTipoCobro(SUPERADMIN, pedido("anual", { vigenteDesde }))).estado).toBe("ok");
    }
    expect(repo.cambiarTipoCobro).toHaveBeenCalledTimes(2);
  });

  it.each([null, ...ROLES_DE_EMPRESA])("rol %s → forbidden sin llamar al repositorio (SL-24 R5)", async (rol) => {
    const actor = rol === null ? null : { usuarioId: "u", rol, organizacionId: EMPRESA };
    expect(await servicio.cambiarTipoCobro(actor, pedido("anual"))).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });
});

describe("Ajuste planes-custom D13 — vista previa de topes en el form del custom (SLT-58 R37)", () => {
  it("ok: lee con los topes del form; SLT-86 (R8): sin siguiente ciclo, los topes que quedan no dependen de la fecha", async () => {
    repo.vistaPreviaConTopes.mockResolvedValueOnce({ avisos: [AVISO] });
    const r = await servicio.previsualizarCustom(SUPERADMIN, { organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: TOPES });
    expect(r).toEqual({ estado: "ok", avisos: [AVISO] });
    expect(repo.vistaPreviaConTopes).toHaveBeenCalledExactlyOnceWith(EMPRESA, TOPES);
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
      topes: { porRol: { maestro: 1 }, apiKeys: -1 },
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
  it("cambiarTipoCobroSchema: empresa uuid, tipo cerrado y fecha de efecto (SLT-86 R16); nada más", () => {
    expect(cambiarTipoCobroSchema.safeParse(pedido("anual")).success).toBe(true);
    expect(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, tipoCobro: "anual" }).success).toBe(false);
    expect(cambiarTipoCobroSchema.safeParse({ organizacionId: EMPRESA, vigenteDesde: "2026-11-01" }).success).toBe(false);
    expect(cambiarTipoCobroSchema.safeParse(pedido("trimestral")).success).toBe(false);
    // Sin plan ni fecha de inicio: el plan no se toca por esta vía.
    expect(cambiarTipoCobroSchema.safeParse(pedido("anual", { inicioCiclo: "2026-10-30" })).success).toBe(false);
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
