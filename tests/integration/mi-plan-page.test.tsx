// @vitest-environment jsdom
// SLT-58 (design §3.1; R8), SLT-91 (R2, R3, R4), SLT-99 (R1) — LA PÁGINA `/mi-plan` RESPONDE «NO ENCONTRADO» A QUIEN
// NO ES MAESTRO.
//
// Se monta la cadena real página → `verMiPlan` / `verPlanesDeMiPlan` → `MiPlanService` / `MiPlanCambioService`; solo
// se sustituyen los repositorios (y el cliente de base, para no abrir conexión). Así se mide lo que pide R8: la
// decisión la toma el servicio, la página la convierte en `notFound()` y la base no se lee para ningún rol sin acceso.
// SLT-99 (R1): `forbidden` en cualquiera de las dos lecturas es «no encontrado».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mi-plan",
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));

const { planDeLaEmpresaMock, empresaParaElMaestroMock, publicosMock } = vi.hoisted(() => ({
  planDeLaEmpresaMock: vi.fn(),
  empresaParaElMaestroMock: vi.fn(),
  publicosMock: vi.fn(),
}));
vi.mock("@/lib/repositories/MiPlanRepository", () => ({
  MiPlanRepository: class {
    planDeLaEmpresa = planDeLaEmpresaMock;
  },
}));
vi.mock("@/lib/repositories/PlanesRepository", () => ({
  PlanesRepository: class {
    empresaParaElMaestro = empresaParaElMaestroMock;
    publicos = publicosMock;
    plan = vi.fn().mockResolvedValue(null);
    preciosQueRigenDesde = vi.fn().mockResolvedValue([]);
  },
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { ToastProvider } from "@/providers/ToastProvider";
import MiPlanPage from "@/app/(app)/mi-plan/page";

const actorMock = vi.mocked(resolveActorFromSession);

const ROLES_SIN_ACCESO: RolValue[] = ["admin", "mensajero", "adminTienda", "adminSatelite", "apiKey", "superadmin"];
const MAESTRO = { usuarioId: "u-1", rol: "maestro" as const, organizacionId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  planDeLaEmpresaMock.mockResolvedValue(null);
  empresaParaElMaestroMock.mockResolvedValue({ planId: null, planEsCustom: false, tipoCobro: "mensual", hayPendiente: false });
  publicosMock.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("SLT-91 R2, R3, R4 — `/mi-plan` solo para el maestro", () => {
  it.each(ROLES_SIN_ACCESO)("%s → «no encontrado», sin leer la base", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol, organizacionId: "org-1" });

    await expect(MiPlanPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(planDeLaEmpresaMock).not.toHaveBeenCalled();
    expect(empresaParaElMaestroMock).not.toHaveBeenCalled();
    expect(publicosMock).not.toHaveBeenCalled();
  });

  it("sin sesión → «no encontrado», sin leer la base", async () => {
    actorMock.mockResolvedValue(null);

    await expect(MiPlanPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(planDeLaEmpresaMock).not.toHaveBeenCalled();
    expect(empresaParaElMaestroMock).not.toHaveBeenCalled();
  });

  it("maestro → ve la pantalla «Mi plan» con los planes disponibles", async () => {
    actorMock.mockResolvedValue(MAESTRO);

    render(<ToastProvider>{await MiPlanPage()}</ToastProvider>);

    expect(planDeLaEmpresaMock).toHaveBeenCalledTimes(1);
    expect(empresaParaElMaestroMock).toHaveBeenCalledWith("org-1");
    expect(screen.getByRole("heading", { level: 1, name: "Mi plan" })).toBeInTheDocument();
    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planes disponibles" })).toBeInTheDocument();
  });

  it("SLT-86 R26: sin plan y con una primera asignación pendiente, la página baja el pendiente a la pantalla", async () => {
    actorMock.mockResolvedValue(MAESTRO);
    planDeLaEmpresaMock.mockResolvedValue({
      sinPlan: true,
      pendiente: { planNombre: "Pro", tipo: "quincenal", desde: "2026-12-01" },
    });

    render(<ToastProvider>{await MiPlanPage()}</ToastProvider>);

    expect(screen.getByText("Sin límites")).toBeInTheDocument();
    expect(screen.getByText("Pro empieza a regir el 2026-12-01")).toBeInTheDocument();
    expect(screen.queryByText("Tu empresa no tiene plan asignado: sin límites")).toBeNull();
  });
});

describe("SLT-99 R1 — `forbidden` en cualquiera de las dos lecturas es «no encontrado»", () => {
  it("un maestro sin empresa: el servicio del cambio de plan responde `forbidden` sin leer y la página no se muestra", async () => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol: "maestro" });

    await expect(MiPlanPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(empresaParaElMaestroMock).not.toHaveBeenCalled();
    expect(publicosMock).not.toHaveBeenCalled();
  });
});
