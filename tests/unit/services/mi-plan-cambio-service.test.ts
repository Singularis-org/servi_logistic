import { RolValue } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { primerPeriodoDelCambio } from "@/components/shared/tipo-cobro";
import type { EmpresaParaElMaestro, IPlanesDelMaestroRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { esPlanDisponible } from "@/lib/planes/costo-concreto";
import { mensajeTopesSobran } from "@/lib/planes/mensajes";
import { MiPlanCambioService } from "@/lib/services/MiPlanCambioService";
import type { PlanDTO, PrecioPlan, VersionPlan } from "@/lib/types/planes";

// SLT-99 (design §3 paso 3, §4; R1, R2, R5, R12, R13, R16, R18) — el servicio del cambio de plan del maestro
// con un repositorio espía, y la regla de «plan disponible» que comparten el carrusel y la escritura.

function planDTO(p: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "1000.00", descuentos: {} },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null,
    archivado: false,
    ...p,
  };
}

function version(p: Partial<VersionPlan> = {}): VersionPlan {
  const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = planDTO();
  return { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual, ...p };
}

describe("R5, R12 — esPlanDisponible: público, no archivado y con costo concreto, también en su versión programada", () => {
  it("un público con costo concreto (fijo, porcentual o «0.00») y sin versión programada está disponible", () => {
    expect(esPlanDisponible(planDTO(), null)).toBe(true);
    expect(esPlanDisponible(planDTO({ precio: { tipo: "monto", mensual: "0.00", descuentos: {} } }), null)).toBe(true);
    expect(
      esPlanDisponible(planDTO({ costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: null } }), null),
    ).toBe(true);
  });

  it("archivado no está disponible", () => {
    expect(esPlanDisponible(planDTO({ archivado: true }), null)).toBe(false);
  });

  it("custom no está disponible, sea de la empresa o de otra", () => {
    expect(esPlanDisponible(planDTO({ visibilidad: "custom", organizacionId: "org-a" }), null)).toBe(false);
  });

  it("sin precio o sin costo por orden no está disponible", () => {
    expect(esPlanDisponible(planDTO({ precio: { tipo: "sin_precio" } }), null)).toBe(false);
    expect(esPlanDisponible(planDTO({ costoPorOrden: null }), null)).toBe(false);
  });

  it("con una versión programada sin costo concreto no está disponible; con una concreta, sí", () => {
    expect(esPlanDisponible(planDTO(), version({ precio: { tipo: "sin_precio" } }))).toBe(false);
    expect(esPlanDisponible(planDTO(), version({ costoPorOrden: null }))).toBe(false);
    expect(esPlanDisponible(planDTO(), version({ precio: { tipo: "monto", mensual: "2000.00", descuentos: {} } }))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* El servicio con un repositorio espía                                        */
/* -------------------------------------------------------------------------- */

const ORG_A = "org-a";
const MAESTRO: Actor = { usuarioId: "maestro-a", rol: "maestro", organizacionId: ORG_A };
const ID_ACTIVO = "00000000-0000-4000-8000-0000000000a1";
const ID_OTRO = "00000000-0000-4000-8000-0000000000b2";
/** Mitad de noviembre de 2026 en la hora de la plataforma: corte el 1 de diciembre (mensual) o el 1 de enero (anual). */
const AHORA = new Date("2026-11-20T18:00:00.000Z");

function empresa(e: Partial<EmpresaParaElMaestro> = {}): EmpresaParaElMaestro {
  return { planId: ID_ACTIVO, planEsCustom: false, tipoCobro: "mensual", hayPendiente: false, ...e };
}

function repoEspia(p: { empresa?: EmpresaParaElMaestro | null; publicos?: PlanDTO[]; custom?: PlanDTO | null } = {}) {
  const publicos = p.publicos ?? [planDTO({ id: ID_ACTIVO, nombre: "Activo" }), planDTO({ id: ID_OTRO, nombre: "Otro" })];
  return {
    empresaParaElMaestro: vi.fn<IPlanesDelMaestroRepository["empresaParaElMaestro"]>(async () =>
      p.empresa === undefined ? empresa() : p.empresa,
    ),
    publicos: vi.fn<IPlanesDelMaestroRepository["publicos"]>(async () => publicos),
    plan: vi.fn<IPlanesDelMaestroRepository["plan"]>(async (id) => publicos.find((x) => x.id === id) ?? p.custom ?? null),
    preciosQueRigenDesde: vi.fn<IPlanesDelMaestroRepository["preciosQueRigenDesde"]>(async () => []),
    cambiarPlanPorLaEmpresa: vi.fn<IPlanesDelMaestroRepository["cambiarPlanPorLaEmpresa"]>(async () => ({
      estado: "ok",
      vigenteDesde: "2026-12-01",
    })),
    cancelarCambioPorLaEmpresa: vi.fn<IPlanesDelMaestroRepository["cancelarCambioPorLaEmpresa"]>(async () => ({ estado: "ok" })),
  } satisfies IPlanesDelMaestroRepository;
}

type Repo = ReturnType<typeof repoEspia>;

function servicio(repo: Repo) {
  return new MiPlanCambioService(repo, () => AHORA);
}

function llamadas(repo: Repo): number {
  return Object.values(repo).reduce((n, f) => n + f.mock.calls.length, 0);
}

const SIN_ACCESO: readonly RolValue[] = ["admin", "mensajero", "adminTienda", "adminSatelite", "apiKey", "superadmin"];

describe("R1 — solo el maestro, sin tocar el repositorio", () => {
  it("los siete roles están repartidos: el maestro entra y los demás no", () => {
    expect(["maestro", ...SIN_ACCESO].sort()).toEqual(Object.values(RolValue).sort());
  });

  const actores: [string, Actor | null][] = [
    ...SIN_ACCESO.map((rol): [string, Actor] => [rol, { usuarioId: `u-${rol}`, rol, organizacionId: rol === "superadmin" ? null : ORG_A }]),
    ["sin sesión (null)", null],
    ["un maestro sin empresa", { usuarioId: "m", rol: "maestro", organizacionId: null }],
  ];

  it.each(actores)("%s recibe forbidden en ver, cambiar y cancelar sin una sola llamada", async (_nombre, actor) => {
    const repo = repoEspia();
    const s = servicio(repo);
    expect(await s.verPlanes(actor)).toEqual({ estado: "forbidden" });
    expect(await s.cambiarPlan(actor, { planId: ID_OTRO })).toEqual({ estado: "forbidden" });
    expect(await s.cancelarCambio(actor, {})).toEqual({ estado: "forbidden" });
    expect(llamadas(repo)).toBe(0);
  });
});

describe("R2 — la empresa es la de la sesión y la entrada es estricta", () => {
  it("cambiar con `organizacionId` u otro campo de más, o sin `planId` válido, es validation_error sin escribir", async () => {
    const repo = repoEspia();
    const s = servicio(repo);
    for (const input of [
      { planId: ID_OTRO, organizacionId: "org-b" },
      { planId: ID_OTRO, vigenteDesde: "2026-11-21" },
      {},
      { planId: "no-es-uuid" },
      null,
    ]) {
      expect((await s.cambiarPlan(MAESTRO, input)).estado, JSON.stringify(input)).toBe("validation_error");
    }
    expect(llamadas(repo)).toBe(0);
  });

  it("cancelar con cualquier campo (`organizacionId`) es validation_error sin escribir", async () => {
    const repo = repoEspia();
    const r = await servicio(repo).cancelarCambio(MAESTRO, { organizacionId: "org-b" });
    expect(r.estado).toBe("validation_error");
    expect(llamadas(repo)).toBe(0);
  });

  it("el repositorio recibe la empresa, el usuario y el reloj del servicio, nunca lo que mande el cliente", async () => {
    const repo = repoEspia();
    const s = servicio(repo);
    expect(await s.cambiarPlan(MAESTRO, { planId: ID_OTRO })).toEqual({ estado: "ok", vigenteDesde: "2026-12-01" });
    expect(repo.cambiarPlanPorLaEmpresa).toHaveBeenCalledWith(ORG_A, ID_OTRO, "maestro-a", AHORA);
    expect(await s.cancelarCambio(MAESTRO, {})).toEqual({ estado: "ok" });
    expect(repo.cancelarCambioPorLaEmpresa).toHaveBeenCalledWith(ORG_A, "maestro-a");
    await s.verPlanes(MAESTRO);
    expect(repo.empresaParaElMaestro).toHaveBeenCalledWith(ORG_A);
  });
});

describe("R5, R10, R19 — verPlanes", () => {
  it("R5: solo los planes con costo concreto, en el orden del catálogo, sin `organizacionId` ni visibilidad", async () => {
    const publicos = [
      planDTO({ id: "p1", nombre: "Uno" }),
      planDTO({ id: "p2", nombre: "Sin precio", precio: { tipo: "sin_precio" } }),
      planDTO({ id: "p3", nombre: "Sin costo por orden", costoPorOrden: null }),
      planDTO({ id: "p4", nombre: "Cuatro", modulos: ["analitica"] }),
    ];
    const r = await servicio(repoEspia({ publicos, empresa: empresa({ planId: "p1" }) })).verPlanes(MAESTRO);
    if (r.estado !== "ok") throw new Error(r.estado);
    expect(r.planes.map((p) => p.id)).toEqual(["p1", "p4"]);
    expect(Object.keys(r.planes[0]).sort()).toEqual(
      ["costoPorOrden", "costoPorOrdenPorcentual", "id", "modulos", "nombre", "precio", "topes"].sort(),
    );
    expect(r.activoId).toBe("p1");
    expect(r.customActivo).toBeNull();
  });

  it("R10: el corte sale del tipo vigente (quincenal y mensual → 1 de diciembre; bimestral y anual → 1 de enero)", async () => {
    for (const [tipoCobro, corte] of [
      ["mensual", "2026-12-01"],
      ["quincenal", "2026-12-01"],
      ["bimestral", "2027-01-01"],
      ["anual", "2027-01-01"],
    ] as const) {
      const r = await servicio(repoEspia({ empresa: empresa({ tipoCobro }) })).verPlanes(MAESTRO);
      expect(r).toMatchObject({ estado: "ok", tipoCobro, corte, puedeCambiar: true });
    }
  });

  it("R19: el primer período de cada plan es completo y cuesta con el precio que rige en el corte, no con el de hoy", async () => {
    const hoy: PrecioPlan = { tipo: "monto", mensual: "1000.00", descuentos: {} };
    const enElCorte: PrecioPlan = { tipo: "monto", mensual: "1500.00", descuentos: {} };
    const repo = repoEspia({ publicos: [planDTO({ id: ID_ACTIVO, precio: hoy }), planDTO({ id: ID_OTRO, precio: hoy })] });
    repo.preciosQueRigenDesde.mockResolvedValue([
      { planId: ID_OTRO, desde: new Date("2026-11-25T06:00:00.000Z"), precio: enElCorte, programado: true },
      { planId: ID_OTRO, desde: null, precio: hoy, programado: false },
    ]);
    const r = await servicio(repo).verPlanes(MAESTRO);
    if (r.estado !== "ok") throw new Error(r.estado);
    expect(repo.preciosQueRigenDesde).toHaveBeenCalledWith([ID_ACTIVO, ID_OTRO], new Date("2026-12-01T06:00:00.000Z"));
    expect(r.primerPeriodo[ID_OTRO]).toEqual(primerPeriodoDelCambio(enElCorte, "mensual", "2026-12-01"));
    expect(r.primerPeriodo[ID_OTRO]).toEqual({ periodo: { desde: "2026-12-01", hasta: "2026-12-31", esTramo: false }, costo: "1500.00" });
    // Sin filas del historial, el precio vigente.
    expect(r.primerPeriodo[ID_ACTIVO]).toEqual({ periodo: { desde: "2026-12-01", hasta: "2026-12-31", esTramo: false }, costo: "1000.00" });
  });

  it("R16, R17, R19: `hayPendiente` y `activoEsCustom`; el custom activo va en `customActivo` (R7)", async () => {
    const custom = planDTO({ id: "c1", nombre: "A la medida", visibilidad: "custom", organizacionId: ORG_A });
    const repo = repoEspia({ empresa: empresa({ planId: "c1", planEsCustom: true, hayPendiente: true }), custom });
    const r = await servicio(repo).verPlanes(MAESTRO);
    expect(r).toMatchObject({ estado: "ok", activoId: "c1", hayPendiente: true, activoEsCustom: true, puedeCambiar: true });
    if (r.estado !== "ok") throw new Error(r.estado);
    expect(r.customActivo).toMatchObject({ id: "c1", nombre: "A la medida" });
    expect(r.planes.map((p) => p.id)).not.toContain("c1");
  });

  it("R18 (P5): sin plan ve los planes pero no puede cambiar: sin corte, sin primer período ni tipo", async () => {
    const repo = repoEspia({ empresa: empresa({ planId: null }) });
    const r = await servicio(repo).verPlanes(MAESTRO);
    expect(r).toMatchObject({ estado: "ok", activoId: null, tipoCobro: null, corte: null, primerPeriodo: {}, puedeCambiar: false });
    if (r.estado !== "ok") throw new Error(r.estado);
    expect(r.planes).toHaveLength(2);
    expect(repo.preciosQueRigenDesde).not.toHaveBeenCalled();
  });
});

describe("R12, R13, R15, R16, R18 — los rechazos del repositorio llegan tal cual; el de topes, con su texto", () => {
  it("R12, R18: no_disponible y sin_plan", async () => {
    for (const estado of ["no_disponible", "sin_plan"] as const) {
      const repo = repoEspia();
      repo.cambiarPlanPorLaEmpresa.mockResolvedValue({ estado });
      expect(await servicio(repo).cambiarPlan(MAESTRO, { planId: ID_OTRO })).toEqual({ estado });
    }
  });

  it("R13: tope_excedido lleva el aviso «sobra(n) N {rol}» con el nombre del plan pedido", async () => {
    const excedidos = [
      { organizacionId: ORG_A, empresa: "A", tope: "adminTienda" as const, usados: 3, maximo: 2 },
      { organizacionId: ORG_A, empresa: "A", tope: "api_keys" as const, usados: 5, maximo: 2 },
    ];
    const repo = repoEspia();
    repo.cambiarPlanPorLaEmpresa.mockResolvedValue({ estado: "tope_excedido", excedidos });
    const r = await servicio(repo).cambiarPlan(MAESTRO, { planId: ID_OTRO });
    expect(r).toEqual({ estado: "tope_excedido", excedidos, mensaje: mensajeTopesSobran("Otro", excedidos) });
    if (r.estado !== "tope_excedido") throw new Error(r.estado);
    expect(r.mensaje.split("\n")).toEqual([
      "No puedes cambiar a Otro:",
      "Otro permite 2 y tienes 3: sobra 1 admin de tienda.",
      "Otro permite 2 y tienes 5: sobran 3 API keys.",
    ]);
  });

  it("R15: pedir su plan activo vuelve ok sin fecha", async () => {
    const repo = repoEspia();
    repo.cambiarPlanPorLaEmpresa.mockResolvedValue({ estado: "ok", vigenteDesde: null });
    expect(await servicio(repo).cambiarPlan(MAESTRO, { planId: ID_ACTIVO })).toEqual({ estado: "ok", vigenteDesde: null });
  });

  it("R16: sin pendiente, sin_cambio_programado", async () => {
    const repo = repoEspia();
    repo.cancelarCambioPorLaEmpresa.mockResolvedValue({ estado: "sin_cambio_programado" });
    expect(await servicio(repo).cancelarCambio(MAESTRO, {})).toEqual({ estado: "sin_cambio_programado" });
  });

  it("R18 (P5, decisión 2026-11-10): sin plan no cancela la primera asignación; el sin_plan del repositorio llega tal cual", async () => {
    const repo = repoEspia({ empresa: empresa({ planId: null, hayPendiente: true }) });
    repo.cancelarCambioPorLaEmpresa.mockResolvedValue({ estado: "sin_plan" });
    expect(await servicio(repo).cancelarCambio(MAESTRO, {})).toEqual({ estado: "sin_plan" });
    expect(repo.cancelarCambioPorLaEmpresa).toHaveBeenCalledWith(ORG_A, MAESTRO.usuarioId);
  });

  it("m1 (decisión 2026-11-10): con pendiente, elegir su plan activo (aunque sea custom) va al repositorio, que lo cancela: ok sin fecha", async () => {
    const repo = repoEspia({ empresa: empresa({ planEsCustom: true, hayPendiente: true }) });
    repo.cambiarPlanPorLaEmpresa.mockResolvedValue({ estado: "ok", vigenteDesde: null });
    expect(await servicio(repo).cambiarPlan(MAESTRO, { planId: ID_ACTIVO })).toEqual({ estado: "ok", vigenteDesde: null });
    expect(repo.cambiarPlanPorLaEmpresa).toHaveBeenCalledWith(ORG_A, ID_ACTIVO, MAESTRO.usuarioId, AHORA);
    expect(repo.cancelarCambioPorLaEmpresa).not.toHaveBeenCalled();
  });
});
