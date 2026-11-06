import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-24 · T5 (design §5, §11) — EL COMPOSITION ROOT PASA EL REPOSITORIO REAL, no solo lo importa
// (precedente SL-23 y SL-40 §5). Se mockea solo `getPrismaClient`, con un cliente falso que responde lo
// que `PlanesRepository` le pide, y se llaman las actions reales sin servicio inyectado. Si el root
// montara el servicio con otro repositorio, o con ninguno, el cliente falso no vería las llamadas.
//
// SLT-86 (R10, R15, R16, R19): la fila del plan trae sus descuentos por período y no el anual ni el tope
// de órdenes; crear siembra el historial de precio; «Cambiar tipo de cobro» lleva fecha de efecto, y entra
// la action «Cancelar cambio» de una empresa.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: "org-a" };
const EMPRESA = randomUUID();
const PLAN = randomUUID();

const filaPlan = {
  id: PLAN,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionExclusivaId: null,
  topeApiKeys: null,
  // SLT-66 R28: solo se asigna un plan con costo concreto; la fila es de monto con costo por orden.
  precioMensual: new Prisma.Decimal("1000.00"),
  costoPorOrden: new Prisma.Decimal("100.00"),
  // SLT-83 (R1): la fila de un plan de costo fijo trae las dos columnas del porcentual en null.
  costoPorOrdenPct: null,
  costoPorOrdenMinimo: null,
  archivadoAt: null,
  topesPorRol: [{ rol: "adminTienda", maximo: 3 }],
  modulos: [{ modulo: "ranking" }],
  // SLT-86 (R10): un descuento del período anual en porcentaje.
  descuentos: [{ periodo: "anual", porcentaje: new Prisma.Decimal("10.00"), monto: null }],
};

const organizacionFindUnique = vi.fn(async () => ({ id: EMPRESA, nombre: "Mensajería Uno", planId: null }));
const planFindMany = vi.fn(async () => [filaPlan]);
const txPlanCreate = vi.fn(async () => ({ id: PLAN }));
const txRastroCreate = vi.fn(async () => ({ id: "r-1" }));
const txUsuarioFindUnique = vi.fn(async () => ({ nombre: "Sara", primerApellido: "Admin", rol: { value: "superadmin" } }));
const txDescuentosDeleteMany = vi.fn(async () => ({ count: 0 }));
const txExecuteRaw = vi.fn(async () => 1);
// La empresa bajo cerrojo de «Cancelar cambio»: ninguna fila = la empresa no existe.
const txQueryRaw = vi.fn(async () => []);
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    plan: { create: txPlanCreate },
    planRastro: { create: txRastroCreate },
    usuario: { findUnique: txUsuarioFindUnique },
    planDescuentoPeriodo: { deleteMany: txDescuentosDeleteMany },
    $executeRaw: txExecuteRaw,
    $queryRaw: txQueryRaw,
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
        topes: { porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        // SLT-66 R28; SLT-86 (R10): con el descuento de su fila de `plan_descuento_periodo`.
        precio: { tipo: "monto", mensual: "1000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
        costoPorOrden: "100.00", // SLT-66 R28
        costoPorOrdenPorcentual: null, // SLT-83 R1: plan de costo fijo
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
        topes: { porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "sin_precio" },
        costoPorOrden: null, // SLT-66 R8: costo por orden obligatorio; aquí, vacío.
        costoPorOrdenPorcentual: null, // SLT-83 R1, R2: también obligatorio; null = no es porcentual.
      },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toMatchObject({ estado: "ok", planId: PLAN, cambio: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txPlanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: "Básico",
          precioMensual: null, // D1 (ajuste planes-custom): «sin precio», sin columna «negociable».
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
    // SLT-86 (R11, R15): «sin precio» deja el plan sin descuentos y siembra su fila del historial de precio.
    expect(txDescuentosDeleteMany).toHaveBeenCalledWith({ where: { planId: PLAN } });
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    // `$executeRaw` es una plantilla etiquetada: su primer argumento son los trozos de texto del SQL.
    expect((txExecuteRaw.mock.calls[0] as unknown as [readonly string[]])[0].join("?")).toContain("plan_precio_historial");
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

  it("Ajuste planes-custom D10, D13: las dos actions nuevas existen y un maestro recibe forbidden sin tocar el cliente", async () => {
    const deps = { getActor: async () => MAESTRO };
    const resultados = await Promise.all([
      acciones.cambiarTipoCobroAction({ organizacionId: EMPRESA, tipoCobro: "anual", vigenteDesde: "2026-12-01" }, deps),
      acciones.previsualizarCustomAction({ organizacionId: EMPRESA, inicioCiclo: "2026-10-30", topes: {} }, deps),
      // SLT-86 (R3, R19): «Cancelar cambio» de una empresa.
      acciones.cancelarCambioEmpresaAction({ organizacionId: EMPRESA }, deps),
    ]);
    expect(resultados).toEqual([{ estado: "forbidden" }, { estado: "forbidden" }, { estado: "forbidden" }]);
    expect(organizacionFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("Ajuste planes-custom D10: cambiarTipoCobroAction, sin deps.service, lee la empresa por el repositorio real (sin plan → sin_plan)", async () => {
    const { fechaCalendarioCR } = await import("@/lib/utils/fecha-cr");
    const r = await acciones.cambiarTipoCobroAction(
      { organizacionId: EMPRESA, tipoCobro: "anual", vigenteDesde: fechaCalendarioCR(new Date()) },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toEqual({ estado: "sin_plan" });
    expect(organizacionFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: EMPRESA } }));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("Ajuste planes-custom D13: previsualizarCustomAction, sin deps.service, lee la empresa por el repositorio real (con plan → R31)", async () => {
    organizacionFindUnique.mockResolvedValueOnce({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN } as never);
    const { inicioDelCicloPorDefecto } = await import("@/lib/planes/ciclo");
    const r = await acciones.previsualizarCustomAction(
      {
        organizacionId: EMPRESA,
        inicioCiclo: inicioDelCicloPorDefecto(new Date()),
        topes: { porRol: {}, apiKeys: null },
      },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { inicioCiclo: [expect.any(String)] } });
    expect(organizacionFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: EMPRESA } }));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("editarPlanAction acepta vigenteDesde: una fecha pasada llega al servicio y es validation_error", async () => {
    const r = await acciones.editarPlanAction(
      {
        planId: PLAN,
        nombre: "Básico",
        topes: { porRol: {}, apiKeys: null },
        modulos: [],
        precio: { tipo: "sin_precio" },
        costoPorOrden: null, // SLT-66 R8: costo por orden obligatorio; aquí, vacío.
        costoPorOrdenPorcentual: null, // SLT-83 R1, R2: también obligatorio; null = no es porcentual.
        vigenteDesde: "2020-01-01",
      },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toEqual({ estado: "validation_error", fieldErrors: { vigenteDesde: [expect.any(String)] } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("SLT-86 (R19, R26): cancelarCambioEmpresaAction, sin deps.service, llega al repositorio real (empresa que no existe → not_found)", async () => {
    const r = await acciones.cancelarCambioEmpresaAction({ organizacionId: EMPRESA }, { getActor: async () => SUPERADMIN });
    expect(r).toEqual({ estado: "not_found" });
    // La empresa se pide bajo cerrojo en la transacción del repositorio real.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
  });
});
