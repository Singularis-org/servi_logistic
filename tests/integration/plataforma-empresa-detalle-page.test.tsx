// @vitest-environment jsdom
// SL-23 (design §7; R8, R14) — LA PÁGINA `/plataforma/empresas/[organizacionId]` AUTORIZA ANTES DE LEER.
//
// Se mide la frontera servidor→cliente, como en `empresas-page.test.tsx`: ningún rol de empresa ve
// la pantalla y la página ni siquiera pide los módulos de la empresa. Con el superadmin se monta el
// `ModulosEmpresa` REAL con lo que baja por props, y se lee lo que pinta: 8 interruptores y el núcleo,
// con sus 8 nombres y sin control.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RolValue } from "@prisma/client";

import { MODULOS_APAGABLES, NUCLEO, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { planConConsumo } from "@/lib/planes/consumo";
import type { VerModulosEmpresaResult } from "@/lib/types/modulos-empresa";
import type { PlanDeEmpresaResult, PlanDTO } from "@/lib/types/planes";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

const { verMock, fijarMock } = vi.hoisted(() => ({ verMock: vi.fn(), fijarMock: vi.fn() }));
vi.mock("@/lib/actions/_shared/modulos-empresa", () => ({
  verModulosEmpresa: (...a: unknown[]) => verMock(...a),
}));
vi.mock("@/lib/actions/modulos-empresa", () => ({
  fijarModuloEmpresaAction: (...a: unknown[]) => fijarMock(...a),
}));

// SLT-58 (design §6.3; R19): la lectura del plan de la empresa y las actions de planes, como dobles.
const { verPlanMock, verDetalleMock, asignablesMock, asignarMock, previsualizarMock, cancelarMock } = vi.hoisted(
  () => ({
    verPlanMock: vi.fn(),
    verDetalleMock: vi.fn(),
    asignablesMock: vi.fn(),
    asignarMock: vi.fn(),
    previsualizarMock: vi.fn(),
    cancelarMock: vi.fn(),
  }),
);
vi.mock("@/lib/actions/_shared/planes-plataforma", () => ({
  verPlanDeEmpresa: (...a: unknown[]) => verPlanMock(...a),
  verDetalleDePlan: (...a: unknown[]) => verDetalleMock(...a),
}));
vi.mock("@/lib/actions/planes", () => ({
  listarPlanesAsignablesAction: (...a: unknown[]) => asignablesMock(...a),
  asignarPlanAction: (...a: unknown[]) => asignarMock(...a),
  cambiarTipoCobroAction: vi.fn(),
  // SLT-86 (R19, R26): «Cancelar cambio» del detalle de empresa.
  cancelarCambioEmpresaAction: (...a: unknown[]) => cancelarMock(...a),
  previsualizarAsignacionPlanAction: (...a: unknown[]) => previsualizarMock(...a),
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { ToastProvider } from "@/providers/ToastProvider";
import EmpresaDetallePage from "@/app/(app)/plataforma/empresas/[organizacionId]/page";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const params = (organizacionId = ORG) => Promise.resolve({ organizacionId });

const ROLES_DE_EMPRESA: RolValue[] = [
  "maestro",
  "admin",
  "mensajero",
  "adminTienda",
  "adminSatelite",
  "apiKey",
];

const OK: VerModulosEmpresaResult = {
  estado: "ok",
  empresa: {
    organizacionId: ORG,
    nombre: "Envíos Norte",
    modulos: ORDEN_MODULOS.map((clave) => ({
      clave,
      nombre: MODULOS_APAGABLES[clave].nombre,
      activo: clave === "analitica" || clave === "monitoreo",
    })),
  },
};

const actorMock = vi.mocked(resolveActorFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  verMock.mockResolvedValue(OK);
  verPlanMock.mockResolvedValue({
    estado: "ok",
    vista: { organizacionId: ORG, plan: null, pendienteSinPlan: null, asignaciones: [] },
  } satisfies PlanDeEmpresaResult);
  asignablesMock.mockResolvedValue({ estado: "ok", planes: [] });
  verDetalleMock.mockResolvedValue({ estado: "not_found" });
  previsualizarMock.mockResolvedValue({ estado: "ok", avisos: [] });
  cancelarMock.mockResolvedValue({ estado: "ok" });
});

afterEach(() => cleanup());

describe("SL-23 (R14) — el detalle solo para la plataforma", () => {
  it.each(ROLES_DE_EMPRESA)("%s → notFound(), sin leer los módulos", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    await expect(EmpresaDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(verMock).not.toHaveBeenCalled();
  });

  it("sin sesión → notFound(), sin leer nada", async () => {
    actorMock.mockResolvedValue(null);

    await expect(EmpresaDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(verMock).not.toHaveBeenCalled();
  });
});

describe("SL-23 (R8) — con el superadmin, la página pinta los módulos", () => {
  const superadmin = { usuarioId: "sa-1", rol: "superadmin" as const };

  it("lee con su actor y la empresa de la URL; 8 interruptores con su estado y el núcleo sin control", async () => {
    actorMock.mockResolvedValue(superadmin);

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(verMock).toHaveBeenCalledWith(superadmin, { organizacionId: ORG });
    expect(screen.getByRole("heading", { level: 1, name: "Envíos Norte" })).toBeInTheDocument();

    const modulos = screen.getByRole("region", { name: "Módulos" });
    const switches = within(modulos).getAllByRole("switch");
    expect(switches).toHaveLength(3);
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual(
      ORDEN_MODULOS.map((c) => MODULOS_APAGABLES[c].nombre),
    );
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(
      ORDEN_MODULOS.map((c) => String(c === "analitica" || c === "monitoreo")),
    );

    const nucleo = screen.getByRole("region", { name: "Núcleo (siempre activo)" });
    expect(within(nucleo).getAllByRole("listitem").map((li) => li.textContent)).toEqual([...NUCLEO]);
    expect(NUCLEO).toHaveLength(13);
    expect(within(nucleo).queryByRole("switch")).toBeNull();
    expect(within(nucleo).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(3);

    expect(screen.getByRole("link", { name: "Volver a Empresas" })).toHaveAttribute(
      "href",
      "/plataforma/empresas",
    );
  });

  it.each<VerModulosEmpresaResult>([{ estado: "not_found" }, { estado: "validation_error" }])(
    "empresa inexistente o id inválido ($estado) → notFound()",
    async (respuesta) => {
      actorMock.mockResolvedValue(superadmin);
      verMock.mockResolvedValue(respuesta);

      await expect(EmpresaDetallePage({ params: params("no-existe") })).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );
});

describe("SLT-58 (R19) — el plan de la empresa en su detalle", () => {
  const superadmin = { usuarioId: "sa-1", rol: "superadmin" as const };

  const CON_PLAN: PlanDeEmpresaResult = {
    estado: "ok",
    vista: {
      organizacionId: ORG,
      plan: {
        ...planConConsumo(
          {
            vigente: {
              nombre: "Plan Crecer",
              topes: { porRol: { mensajero: 10 }, apiKeys: null },
              modulos: ["analitica"],
              precio: { tipo: "sin_precio" }, // Ajuste planes-custom (D1): sin «negociable».
              costoPorOrden: null, // SLT-66 R8: campo nuevo de la versión
              costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
            },
            // SLT-86 (R5, R15, R26): la entrada, el precio del período y el pendiente.
            entrada: new Date("2026-01-15T06:00:00.000Z"),
            precioDelPeriodo: { tipo: "sin_precio" },
            pendiente: null,
            uso: { ordenes: 1000, apiKeys: 0, porRol: { admin: 0, mensajero: 9, adminTienda: 0, adminSatelite: 0 } }, // SLT-66 R5: sin `maestro`
            cambio: null,
            costoVigente: { modo: "fijo", monto: "500.00", fuente: "global" }, // SLT-66 R18: campo nuevo de la lectura
            cobroCiclo: { cobrado: "0.00", pendientes: 0 }, // SLT-83: campo nuevo de la lectura
            tipoCobro: "anual", // Ajuste planes-custom (D6): campo nuevo de la lectura
          },
          new Date("2026-03-01T06:00:00.000Z"),
        ),
        planId: "11111111-1111-4111-8111-111111111111",
        archivado: false,
      },
      pendienteSinPlan: null,
      asignaciones: [],
    },
  };

  const ACTUAL_DTO: PlanDTO = {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Plan Crecer",
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: { mensajero: 10 }, apiKeys: null },
    modulos: ["analitica"],
    precio: { tipo: "sin_precio" }, // Ajuste planes-custom (D1): sin «negociable».
    costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    archivado: false,
  };

  it("R19: lee el plan con su actor y la empresa de la URL, y pinta plan y consumo antes de los módulos", async () => {
    actorMock.mockResolvedValue(superadmin);
    verPlanMock.mockResolvedValue(CON_PLAN);

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(verPlanMock).toHaveBeenCalledWith(superadmin, { organizacionId: ORG });
    expect(asignablesMock).toHaveBeenCalledWith({ organizacionId: ORG });

    const plan = screen.getByRole("region", { name: "Plan" });
    expect(within(plan).getByRole("heading", { name: "Plan Crecer" })).toBeInTheDocument();
    // SLT-86 (R7, R8): las órdenes del período, sin tope.
    expect(within(plan).getByText("Órdenes en el período: 1.000")).toBeInTheDocument();
    expect(within(plan).getByText("Cerca del tope")).toBeInTheDocument(); // 9 de 10 mensajeros
    // SLT-86 (R27): el tipo, el período en curso (un tramo desde la entrada) y, con el anual, el pago del
    // inicio del período y el siguiente, el 1 de enero.
    expect(
      within(within(plan).getByRole("list", { name: "Cobro del plan" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Tipo de cobro: Anual",
      "Período: 2026-01-15 – 2026-12-31 (tramo de 351 de 365 días)",
      "Pago anual: 2026-01-15",
      "Siguiente pago: 2027-01-01",
    ]);

    const modulos = screen.getByRole("region", { name: "Módulos" });
    // La sección del plan va antes que la de los módulos.
    expect(plan.compareDocumentPosition(modulos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R19: sin plan → «Sin plan: sin límites»", async () => {
    actorMock.mockResolvedValue(superadmin);

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(within(screen.getByRole("region", { name: "Plan" })).getByText("Sin plan: sin límites")).toBeInTheDocument();
  });

  it.each<[string, () => void]>([
    ["la lectura responde not_found", () => verPlanMock.mockResolvedValue({ estado: "not_found" })],
    ["la lectura lanza", () => verPlanMock.mockRejectedValue(new Error("db caída"))],
    ["los asignables lanzan", () => asignablesMock.mockRejectedValue(new Error("db caída"))],
  ])("R19: si %s, los módulos se pintan igual", async (_caso, preparar) => {
    actorMock.mockResolvedValue(superadmin);
    vi.spyOn(console, "error").mockImplementation(() => {});
    preparar();

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(screen.getByRole("heading", { level: 1, name: "Envíos Norte" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Módulos" })).getAllByRole("switch")).toHaveLength(3);
    expect(screen.getByRole("region", { name: "Núcleo (siempre activo)" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Plan" })).getByRole("alert")).toBeInTheDocument();
  });

  it("R20: si el plan actual está entre los asignables, la confirmación compara contra él sin otra lectura", async () => {
    actorMock.mockResolvedValue(superadmin);
    verPlanMock.mockResolvedValue(CON_PLAN);
    asignablesMock.mockResolvedValue({ estado: "ok", planes: [ACTUAL_DTO] });

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(verDetalleMock).not.toHaveBeenCalled();
  });

  it("R20: con el plan actual fuera de los asignables (archivado), lo lee con su detalle para la confirmación", async () => {
    actorMock.mockResolvedValue(superadmin);
    verPlanMock.mockResolvedValue(CON_PLAN);
    verDetalleMock.mockResolvedValue({
      estado: "ok",
      detalle: { plan: { ...ACTUAL_DTO, archivado: true }, empresaNombre: null, pendiente: null, empresas: [], rastro: [] },
    });

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(verDetalleMock).toHaveBeenCalledWith(superadmin, { planId: ACTUAL_DTO.id });
  });

  it("R20: si esa lectura falla, la página se pinta igual", async () => {
    actorMock.mockResolvedValue(superadmin);
    vi.spyOn(console, "error").mockImplementation(() => {});
    verPlanMock.mockResolvedValue(CON_PLAN);
    verDetalleMock.mockRejectedValue(new Error("db caída"));

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(within(screen.getByRole("region", { name: "Plan" })).getByRole("heading", { name: "Plan Crecer" })).toBeInTheDocument();
  });

  it("R20: la primera asignación confirma con el nombre de la empresa que la página ya leyó", async () => {
    actorMock.mockResolvedValue(superadmin);
    asignablesMock.mockResolvedValue({ estado: "ok", planes: [{ ...ACTUAL_DTO, nombre: "Básico" }] });
    const user = userEvent.setup();

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Básico (Público)" }));
    await user.click(screen.getByRole("button", { name: "Asignar plan" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Asignar Básico a Envíos Norte: desde ahora tendrá:");
    expect(asignarMock).not.toHaveBeenCalled();
  });

  it("§11.5 (R29, R37), D5: el modal de primera asignación trae el rango y MAÑANA del reloj del servidor y lee la vista previa con la action", async () => {
    // Solo `Date` es falso: 2026-10-29 12:00 en la hora de la plataforma (UTC−6).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T18:00:00.000Z"));
    try {
      actorMock.mockResolvedValue(superadmin);
      asignablesMock.mockResolvedValue({ estado: "ok", planes: [{ ...ACTUAL_DTO, nombre: "Básico" }] });
      const user = userEvent.setup();

      render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

      await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
      await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Básico (Público)" }));
      await user.click(screen.getByRole("button", { name: "Asignar plan" }));

      const campo = within(await screen.findByRole("dialog")).getByLabelText("Inicio del ciclo de órdenes");
      // Ajuste planes-custom (D5): por defecto mañana en la hora de la plataforma, no hoy.
      expect(campo).toHaveValue("2026-10-30");
      expect(campo).toHaveAttribute("min", "2026-09-29");
      expect(campo).toHaveAttribute("max", "2026-11-29");
      expect(previsualizarMock).toHaveBeenCalledWith({
        organizacionId: ORG,
        planId: ACTUAL_DTO.id,
        inicioCiclo: "2026-10-30",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("SLT-86 R26: sin plan y con una primera asignación pendiente, «Sin límites», qué plan entra y «Cancelar cambio» con la action", async () => {
    actorMock.mockResolvedValue(superadmin);
    verPlanMock.mockResolvedValue({
      estado: "ok",
      vista: {
        organizacionId: ORG,
        plan: null,
        pendienteSinPlan: { planNombre: "Plan Crecer", tipo: "quincenal", desde: "2026-12-01" },
        asignaciones: [],
      },
    } satisfies PlanDeEmpresaResult);
    const user = userEvent.setup();

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    const plan = screen.getByRole("region", { name: "Plan" });
    expect(within(plan).getByText("Sin límites")).toBeInTheDocument();
    expect(within(plan).getByText("Plan Crecer empieza a regir el 2026-12-01")).toBeInTheDocument();
    await user.click(within(plan).getByRole("button", { name: "Cancelar cambio" }));
    // Decisión del 2026-11-06: la action sale de la confirmación, no del botón de la sección.
    expect(cancelarMock).not.toHaveBeenCalled();
    const modal = await screen.findByRole("dialog", {
      name: "¿Cancelar el cambio a Plan Crecer programado para el 2026-12-01?",
    });
    await user.click(within(modal).getByRole("button", { name: "Cancelar cambio" }));
    await waitFor(() => expect(cancelarMock).toHaveBeenCalledWith({ organizacionId: ORG }));
  });

  it("R19: un rol de empresa no lee el plan (notFound antes de leer)", async () => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol: "maestro" });

    await expect(EmpresaDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(verPlanMock).not.toHaveBeenCalled();
    expect(asignablesMock).not.toHaveBeenCalled();
  });
});
