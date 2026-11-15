// @vitest-environment jsdom
// SLT-58 (design §3.1; R8), SLT-91 (R2, R3, R4), SLT-99 (R1) — LA PÁGINA `/mi-plan` RESPONDE «NO ENCONTRADO» A QUIEN
// NO ES MAESTRO.
//
// Se monta la cadena real página → `verMiPlan` / `verPlanesDeMiPlan` → `MiPlanService` / `MiPlanCambioService`; solo
// se sustituyen los repositorios (y el cliente de base, para no abrir conexión). Así se mide lo que pide R8: la
// decisión la toma el servicio, la página la convierte en `notFound()` y la base no se lee para ningún rol sin acceso.
// SLT-99 (R1): `forbidden` en cualquiera de las dos lecturas es «no encontrado».
// SLT-119 (design §6.2; R1, R17): la sección «Facturas de la empresa» por la cadena real página → `verFacturasDeMiPlan`
// → `FacturaPlataformaService`, con el repositorio de facturas como doble; su fallo no tumba la página.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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

// SLT-119: el repositorio de las facturas de la plataforma (la lista la lee la página; el detalle, el panel).
const { deLaEmpresaMock } = vi.hoisted(() => ({ deLaEmpresaMock: vi.fn() }));
vi.mock("@/lib/repositories/FacturaPlataformaRepository", () => ({
  FacturaPlataformaRepository: class {
    deLaEmpresa = deLaEmpresaMock;
  },
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";
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
  deLaEmpresaMock.mockResolvedValue([]);
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

describe("SLT-119 R1, R17 — «Facturas de la empresa» en «Mi plan»", () => {
  /** Las 00:00 de la hora de la plataforma (−06:00) del día `fecha`. */
  const dia = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00.000Z`) + 6 * 3_600_000);
  const facturaBase = (extra: Partial<FacturaPlataformaDTO>): FacturaPlataformaDTO => ({
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    estado: "cerrada",
    numero: 1,
    desde: dia("2026-11-01"),
    hasta: dia("2026-11-16"),
    hastaPrevisto: false,
    periodicidad: "quincenal",
    plan: null,
    cargos: "0.00",
    reversos: "0.00",
    movimientos: 0,
    totalOrdenes: "0.00",
    cuota: null,
    primeraCuota: null,
    total: "0.00",
    cerradaAt: dia("2026-11-16"),
    ...extra,
  });
  // El repositorio las da por `desde` ascendente, con la no cerrada al final (design §4).
  const DEL_REPOSITORIO: FacturaPlataformaDTO[] = [
    facturaBase({}),
    facturaBase({
      id: "aaaaaaaa-0000-4000-8000-000000000002",
      estado: "en_curso",
      numero: null,
      desde: dia("2026-11-16"),
      hasta: dia("2026-12-01"),
      hastaPrevisto: true,
      plan: { planId: "p-1", planNombre: "Crecer", tipoCobro: "mensual" },
      totalOrdenes: "300.00",
      total: "300.00",
      cerradaAt: null,
    }),
  ];

  it("R1: el maestro ve la sección al final, con todas las facturas de su empresa de la más reciente a la más antigua", async () => {
    actorMock.mockResolvedValue(MAESTRO);
    deLaEmpresaMock.mockResolvedValue(DEL_REPOSITORIO);

    render(<ToastProvider>{await MiPlanPage()}</ToastProvider>);

    expect(deLaEmpresaMock).toHaveBeenCalledTimes(1);
    const seccion = screen.getByRole("region", { name: "Facturas de la empresa" });
    const [, ...filas] = within(seccion).getAllByRole("row");
    expect(filas.map((f) => within(f).getAllByRole("cell").slice(0, 3).map((c) => c.textContent))).toEqual([
      ["—", "16 nov 2026 – 30 nov 2026", "Crecer"],
      ["N.º 1", "1 nov 2026 – 15 nov 2026", "Sin plan"],
    ]);
    // Al final: después de los planes disponibles.
    const planes = screen.getByRole("heading", { name: "Planes disponibles" });
    expect(planes.compareDocumentPosition(seccion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R1: la empresa sin facturas ve «Aún no hay facturas de la empresa»", async () => {
    actorMock.mockResolvedValue(MAESTRO);

    render(<ToastProvider>{await MiPlanPage()}</ToastProvider>);

    const seccion = screen.getByRole("region", { name: "Facturas de la empresa" });
    expect(within(seccion).getByText("Aún no hay facturas de la empresa")).toBeInTheDocument();
  });

  it("R17: si la lectura de las facturas lanza, la sección lo dice y el plan, el consumo y el cambio de plan se pintan igual", async () => {
    actorMock.mockResolvedValue(MAESTRO);
    vi.spyOn(console, "error").mockImplementation(() => {});
    deLaEmpresaMock.mockRejectedValue(new Error("db caída"));

    render(<ToastProvider>{await MiPlanPage()}</ToastProvider>);

    const seccion = screen.getByRole("region", { name: "Facturas de la empresa" });
    expect(within(seccion).getByRole("alert")).toHaveTextContent("No se pudieron cargar las facturas");
    expect(screen.getByRole("heading", { level: 1, name: "Mi plan" })).toBeInTheDocument();
    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planes disponibles" })).toBeInTheDocument();
  });

  it.each(ROLES_SIN_ACCESO)("R1 (SLT-91): %s no llega a leer las facturas", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol, organizacionId: "org-1" });

    await expect(MiPlanPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deLaEmpresaMock).not.toHaveBeenCalled();
  });
});
