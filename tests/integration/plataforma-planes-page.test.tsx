// @vitest-environment jsdom
// SLT-58 (design §4.2; R22) — LAS PÁGINAS `/plataforma/planes` Y `/plataforma/planes/[planId]` AUTORIZAN
// ANTES DE LEER.
//
// Se mide la frontera servidor→cliente, como en `plataforma-empresa-detalle-page.test.tsx`: ningún rol
// de empresa ve las pantallas y las páginas ni siquiera piden el catálogo ni el detalle. Un `planId` que
// no es uuid o que no existe responde «no encontrado». Con el superadmin se monta el módulo REAL con
// lo que baja por props.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RolValue } from "@prisma/client";

import type { CatalogoResult, DetallePlanResult } from "@/lib/types/planes";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

const { catalogoMock, detalleMock, empresasMock } = vi.hoisted(() => ({
  catalogoMock: vi.fn(),
  detalleMock: vi.fn(),
  empresasMock: vi.fn(),
}));
vi.mock("@/lib/actions/_shared/planes-plataforma", () => ({
  verCatalogoDePlanes: (...a: unknown[]) => catalogoMock(...a),
  verDetalleDePlan: (...a: unknown[]) => detalleMock(...a),
}));
vi.mock("@/lib/actions/_shared/empresas-plataforma", () => ({
  listarEmpresasPlataforma: (...a: unknown[]) => empresasMock(...a),
}));
vi.mock("@/lib/actions/planes", () => ({
  crearPlanAction: vi.fn(),
  editarPlanAction: vi.fn(),
  archivarPlanAction: vi.fn(),
  cancelarCambioPlanAction: vi.fn(),
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { ToastProvider } from "@/providers/ToastProvider";
import PlanesPage from "@/app/(app)/plataforma/planes/page";
import PlanDetallePage from "@/app/(app)/plataforma/planes/[planId]/page";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const params = (planId = PLAN_ID) => Promise.resolve({ planId });

const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

const PLAN = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico" as const,
  organizacionId: null,
  topes: { ordenesPorCiclo: 3000, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "negociable" as const },
  archivado: false,
};

const CATALOGO: CatalogoResult = {
  estado: "ok",
  planes: [{ ...PLAN, empresaNombre: null, empresas: 2, vigenteDesdePendiente: null }],
};

const DETALLE: DetallePlanResult = {
  estado: "ok",
  detalle: { plan: PLAN, empresaNombre: null, pendiente: null, empresas: [], rastro: [] },
};

const actorMock = vi.mocked(resolveActorFromSession);
const superadmin = { usuarioId: "sa-1", rol: "superadmin" as const };

beforeEach(() => {
  vi.clearAllMocks();
  catalogoMock.mockResolvedValue(CATALOGO);
  detalleMock.mockResolvedValue(DETALLE);
  empresasMock.mockResolvedValue({ status: "ok", empresas: [] });
});

afterEach(() => cleanup());

describe("SLT-58 R22 — «Planes» solo para la plataforma", () => {
  it.each(ROLES_DE_EMPRESA)("R22: %s → notFound() en el catálogo, sin leer nada", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    await expect(PlanesPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(catalogoMock).not.toHaveBeenCalled();
    expect(empresasMock).not.toHaveBeenCalled();
  });

  it.each(ROLES_DE_EMPRESA)("R22: %s → notFound() en el detalle, sin leer nada", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    await expect(PlanDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(detalleMock).not.toHaveBeenCalled();
  });

  it("R22: sin sesión → notFound() en las dos, sin leer nada", async () => {
    actorMock.mockResolvedValue(null);

    await expect(PlanesPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PlanDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(catalogoMock).not.toHaveBeenCalled();
    expect(detalleMock).not.toHaveBeenCalled();
  });

  it.each<DetallePlanResult>([
    { estado: "not_found" },
    { estado: "validation_error", fieldErrors: { planId: ["Invalid UUID"] } },
  ])("R22: plan inexistente o segmento que no es uuid ($estado) → notFound()", async (respuesta) => {
    actorMock.mockResolvedValue(superadmin);
    detalleMock.mockResolvedValue(respuesta);

    await expect(PlanDetallePage({ params: params("no-es-uuid") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(detalleMock).toHaveBeenCalledWith(superadmin, { planId: "no-es-uuid" });
  });
});

describe("SLT-58 R13, R16 — con el superadmin, las páginas pintan", () => {
  it("el catálogo lee con su actor y monta la tabla", async () => {
    actorMock.mockResolvedValue(superadmin);

    render(<ToastProvider>{await PlanesPage()}</ToastProvider>);

    expect(catalogoMock).toHaveBeenCalledWith(superadmin);
    expect(screen.getByRole("heading", { level: 1, name: "Planes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver el plan Básico" })).toBeInTheDocument();
  });

  it("si el catálogo no se pudo leer, lo dice y NO pinta a la vez el estado vacío ni la tabla", async () => {
    actorMock.mockResolvedValue(superadmin);
    catalogoMock.mockResolvedValue({ estado: "forbidden" } satisfies CatalogoResult);

    render(<ToastProvider>{await PlanesPage()}</ToastProvider>);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo de planes.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay planes.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("si las empresas no se pudieron leer, el formulario lo dice junto al campo «Empresa»", async () => {
    const user = userEvent.setup();
    actorMock.mockResolvedValue(superadmin);
    empresasMock.mockResolvedValue({ status: "forbidden" });

    render(<ToastProvider>{await PlanesPage()}</ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("radio", { name: "Custom" }));

    expect(within(panel).getByRole("combobox", { name: "Empresa" })).toHaveAccessibleDescription(
      "No se pudieron cargar las empresas.",
    );
  });

  it("el detalle lee con su actor y el plan de la URL, y titula con el nombre", async () => {
    actorMock.mockResolvedValue(superadmin);

    render(<ToastProvider>{await PlanDetallePage({ params: params() })}</ToastProvider>);

    expect(detalleMock).toHaveBeenCalledWith(superadmin, { planId: PLAN_ID });
    expect(screen.getByRole("heading", { level: 1, name: "Básico" })).toBeInTheDocument();
  });
});
