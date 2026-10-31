import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-24 · T5 (design §5, §11) — EL COMPOSITION ROOT PASA EL REPOSITORIO REAL, no solo lo importa
// (precedente SL-23 y SL-40 §5). Se mockea solo `getPrismaClient`, con un cliente falso que responde lo
// que `PlanesRepository` le pide, y se llaman las actions reales sin servicio inyectado. Si el root
// montara el servicio con otro repositorio, o con ninguno, el cliente falso no vería las llamadas.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: "org-a" };
const EMPRESA = randomUUID();
const PLAN = randomUUID();

const filaPlan = {
  id: PLAN,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionExclusivaId: null,
  topeOrdenesCiclo: 100,
  topeApiKeys: null,
  precioNegociable: true,
  precioMensual: null,
  precioAnual: null,
  descuentoAnualPct: null,
  costoPorOrden: null, // SLT-66 R8: costo por orden obligatorio; aquí, vacío.
  archivadoAt: null,
  topesPorRol: [{ rol: "adminTienda", maximo: 3 }],
  modulos: [{ modulo: "ranking" }],
};

const organizacionFindUnique = vi.fn(async () => ({ id: EMPRESA, nombre: "Mensajería Uno", planId: null }));
const planFindMany = vi.fn(async () => [filaPlan]);
const txPlanCreate = vi.fn(async () => ({ id: PLAN }));
const txRastroCreate = vi.fn(async () => ({ id: "r-1" }));
const txUsuarioFindUnique = vi.fn(async () => ({ nombre: "Sara", primerApellido: "Admin", rol: { value: "superadmin" } }));
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    plan: { create: txPlanCreate },
    planRastro: { create: txRastroCreate },
    usuario: { findUnique: txUsuarioFindUnique },
  }),
);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    organizacion: { findUnique: organizacionFindUnique },
    plan: { findMany: planFindMany },
    $transaction: transaction,
  }),
  PRISMA_OMIT: {},
}));

const acciones = await import("@/lib/actions/planes");

beforeEach(() => vi.clearAllMocks());

describe("SL-24 — el composition root de planes pasa PlanesRepository", () => {
  it("listarPlanesAsignablesAction, sin deps.service, lee por el repositorio real (públicos y custom de esa empresa)", async () => {
    const r = await acciones.listarPlanesAsignablesAction({ organizacionId: EMPRESA }, { getActor: async () => SUPERADMIN });
    if (r.estado !== "ok") throw new Error(`se esperaba ok: ${r.estado}`);
    // Anti-vacuidad: el DTO solo puede salir del mapeo del repositorio real.
    expect(r.planes).toEqual([
      {
        id: PLAN,
        nombre: "Básico",
        visibilidad: "publico",
        organizacionId: null,
        topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "negociable" },
        costoPorOrden: null, // SLT-66 R8: costo por orden obligatorio; aquí, vacío.
        archivado: false,
      },
    ]);
    expect(planFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivadoAt: null,
          OR: [{ visibilidad: "publico" }, { visibilidad: "custom", organizacionExclusivaId: EMPRESA }],
        },
      }),
    );
  });

  it("crearPlanAction, sin deps.service, crea por el repositorio real con su fila de plan_rastro", async () => {
    const r = await acciones.crearPlanAction(
      {
        nombre: "Básico",
        visibilidad: "publico",
        organizacionId: null,
        topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "negociable" },
        costoPorOrden: null, // SLT-66 R8: costo por orden obligatorio; aquí, vacío.
      },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toMatchObject({ estado: "ok", planId: PLAN, cambio: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txPlanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: "Básico",
          precioNegociable: true,
          topesPorRol: { create: [{ rol: "adminTienda", maximo: 3 }] },
          modulos: { create: [{ modulo: "ranking" }] },
        }),
      }),
    );
    expect(txRastroCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ planId: PLAN, accion: "creado", actorUsuarioId: "u-sa", actorNombre: "Sara Admin" }),
      }),
    );
  });

  it("las seis actions existen y un maestro recibe forbidden en todas sin tocar el cliente", async () => {
    const deps = { getActor: async () => MAESTRO };
    const resultados = await Promise.all([
      acciones.crearPlanAction({}, deps),
      acciones.editarPlanAction({}, deps),
      acciones.archivarPlanAction({}, deps),
      acciones.asignarPlanAction({}, deps),
      acciones.listarPlanesAsignablesAction({}, deps),
      acciones.cancelarCambioPlanAction({}, deps),
    ]);
    expect(resultados).toEqual(Array(6).fill({ estado: "forbidden" }));
    expect(organizacionFindUnique).not.toHaveBeenCalled();
    expect(planFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("editarPlanAction acepta vigenteDesde: una fecha pasada llega al servicio y es validation_error", async () => {
    const r = await acciones.editarPlanAction(
      {
        planId: PLAN,
        nombre: "Básico",
        topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null },
        modulos: [],
        precio: { tipo: "sin_precio" },
        costoPorOrden: null, // SLT-66 R8: costo por orden obligatorio; aquí, vacío.
        vigenteDesde: "2020-01-01",
      },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { vigenteDesde: [expect.any(String)] } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
