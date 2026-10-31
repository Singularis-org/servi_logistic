// @vitest-environment jsdom
// SLT-58 (design §3.1; R8) — LA PÁGINA `/mi-plan` RESPONDE «NO ENCONTRADO» A QUIEN NO ES MAESTRO NI ADMIN.
//
// Se monta la cadena real página → `verMiPlan` → `MiPlanService`; solo se sustituye el repositorio
// (y el cliente de base, para no abrir conexión). Así se mide lo que pide R8: la decisión la toma el
// servicio, la página la convierte en `notFound()` y la base no se lee para ningún rol sin acceso.
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

const { planDeLaEmpresaMock } = vi.hoisted(() => ({ planDeLaEmpresaMock: vi.fn() }));
vi.mock("@/lib/repositories/MiPlanRepository", () => ({
  MiPlanRepository: class {
    planDeLaEmpresa = planDeLaEmpresaMock;
  },
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { ToastProvider } from "@/providers/ToastProvider";
import MiPlanPage from "@/app/(app)/mi-plan/page";

const actorMock = vi.mocked(resolveActorFromSession);

const ROLES_SIN_ACCESO: RolValue[] = ["mensajero", "adminTienda", "adminSatelite", "apiKey", "superadmin"];

beforeEach(() => {
  vi.clearAllMocks();
  planDeLaEmpresaMock.mockResolvedValue(null);
});

afterEach(() => cleanup());

describe("SLT-58 R8 — `/mi-plan` solo para maestro y admin", () => {
  it.each(ROLES_SIN_ACCESO)("%s → «no encontrado», sin leer la base", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    await expect(MiPlanPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(planDeLaEmpresaMock).not.toHaveBeenCalled();
  });

  it("sin sesión → «no encontrado», sin leer la base", async () => {
    actorMock.mockResolvedValue(null);

    await expect(MiPlanPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(planDeLaEmpresaMock).not.toHaveBeenCalled();
  });

  it.each<RolValue>(["maestro", "admin"])("%s → ve la pantalla «Mi plan»", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    render(<ToastProvider>{await MiPlanPage()}</ToastProvider>);

    expect(planDeLaEmpresaMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Mi plan" })).toBeInTheDocument();
    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toBeInTheDocument();
  });
});
