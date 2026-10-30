// @vitest-environment jsdom
// SLT-51 (T6) — la página Tarifas sin zonas. Sustituye a `TarifasPage.cobertura.test.tsx` (ficha
// 465): el bloque «Cobertura» se mudó a `/configuracion/zonas` y su montaje lo prueba
// `tests/unit/app/zonas/ZonasPage.test.tsx`.
//
// R12: Tarifas no muestra «Cobertura». R13: ni «Costos por zona» ni «Crear zona», y sigue
// montando las tarifas por tienda con las zonas pre-cargadas. El `page.tsx` (Server Component
// real) se ejercita sin mockear; se doblan la sesión, la pre-carga y `TiendasModule`.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import type { ZonaDTO } from "@/lib/types/zona";

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

const { resolveActorMock, listarZonasMock, listarArbolMock, tiendasModuleMock } = vi.hoisted(
  () => ({
    resolveActorMock: vi.fn(),
    listarZonasMock: vi.fn(),
    listarArbolMock: vi.fn(),
    tiendasModuleMock: vi.fn(),
  }),
);
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: () => resolveActorMock(),
}));
vi.mock("@/lib/actions/zonas", () => ({
  listarZonas: (...a: unknown[]) => listarZonasMock(...a),
}));
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: (...a: unknown[]) => listarArbolMock(...a),
}));
vi.mock("@/app/(app)/configuracion/tarifas/_components/TiendasModule", () => ({
  TiendasModule: (props: { zonas?: ZonaDTO[] }) => {
    tiendasModuleMock(props);
    return <div data-testid="tiendas-module-stub" />;
  },
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const ZONAS: ZonaDTO[] = [
  { id: "z1", nombre: "Norte", cobroVehiculo: false, distritosCount: 2, esCentral: true },
  { id: "z2", nombre: "Sur", cobroVehiculo: true, distritosCount: 1, esCentral: false },
];

async function importPage() {
  const mod = await import("@/app/(app)/configuracion/tarifas/page");
  return mod.default;
}

// La primera importación del árbol de la página tarda más que el timeout de un caso en frío.
beforeAll(async () => {
  await importPage();
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  listarZonasMock.mockResolvedValue({ status: "ok", items: ZONAS, total: 2 });
});

afterEach(() => {
  cleanup();
});

describe("SLT-51 — Tarifas solo con las tarifas por tienda", () => {
  it("R12/R13: sin «Cobertura», sin «Costos por zona» y sin «Crear zona»", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m1", rol: "maestro" });
    const TarifasPage = await importPage();
    render(await TarifasPage());

    expect(screen.getByRole("heading", { level: 1, name: "Tarifas" })).toBeInTheDocument();
    expect(screen.queryByText("Cobertura")).toBeNull();
    expect(screen.queryByRole("button", { name: /Descargar cobertura/ })).toBeNull();
    expect(screen.queryByText(/Costos por zona/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Crear zona" })).toBeNull();
    // Ya no carga el catálogo geográfico: solo lo usaba el formulario de zona.
    expect(listarArbolMock).not.toHaveBeenCalled();
  });

  it("R13: monta TiendasModule con las zonas pre-cargadas", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m1", rol: "maestro" });
    const TarifasPage = await importPage();
    render(await TarifasPage());

    expect(screen.getByTestId("tiendas-module-stub")).toBeInTheDocument();
    expect(listarZonasMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
    expect(tiendasModuleMock).toHaveBeenCalledTimes(1);
    expect(tiendasModuleMock.mock.calls[0][0]).toEqual({ zonas: ZONAS });
  });

  it("si las zonas no cargan, TiendasModule recibe una lista vacía", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m1", rol: "maestro" });
    listarZonasMock.mockResolvedValue({ status: "forbidden" });
    const TarifasPage = await importPage();
    render(await TarifasPage());

    expect(tiendasModuleMock.mock.calls[0][0]).toEqual({ zonas: [] });
  });

  it("otro rol o sin sesión: solo el aviso de permiso", async () => {
    const otros: (RolValue | null)[] = ["admin", "adminTienda", "adminSatelite", "mensajero", null];
    for (const rol of otros) {
      resolveActorMock.mockResolvedValue(rol ? { usuarioId: "x", rol } : null);
      const TarifasPage = await importPage();
      render(await TarifasPage());
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No tienes permiso para acceder a esta sección.",
      );
      expect(screen.queryByTestId("tiendas-module-stub")).toBeNull();
      cleanup();
    }
    expect(listarZonasMock).not.toHaveBeenCalled();
  });
});
