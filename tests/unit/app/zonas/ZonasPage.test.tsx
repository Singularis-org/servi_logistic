// @vitest-environment jsdom
// SLT-51 (T5) — la página `/configuracion/zonas`. El `page.tsx` (Server Component real) se
// ejercita sin mockear; se doblan el resolver de sesión, las lecturas de pre-carga y el módulo
// cliente de zonas, que tiene sus propios tests de componente.
//
// R2: sin sesión o con un rol distinto de `maestro`, solo el aviso de permiso.
// R12: el bloque «Cobertura» va antes del listado.
// R16: el árbol que devuelve `listarArbolGeografico` (catálogo global, SL-20) llega tal cual al
// módulo, que es quien lo pasa al selector de distritos.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";
import type { ZonaDTO } from "@/lib/types/zona";

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

const {
  resolveActorMock,
  listarArbolMock,
  listarZonasMock,
  listarCoberturaMock,
  zonasModuleMock,
} = vi.hoisted(() => ({
  resolveActorMock: vi.fn(),
  listarArbolMock: vi.fn(),
  listarZonasMock: vi.fn(),
  listarCoberturaMock: vi.fn(),
  zonasModuleMock: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: () => resolveActorMock(),
}));
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: (...a: unknown[]) => listarArbolMock(...a),
}));
vi.mock("@/lib/actions/zonas", () => ({
  listarZonas: (...a: unknown[]) => listarZonasMock(...a),
}));
vi.mock("@/lib/actions/cobertura", () => ({
  listarCoberturaDistritos: (...a: unknown[]) => listarCoberturaMock(...a),
}));
vi.mock("@/app/(app)/configuracion/zonas/_components/ZonasModule", () => ({
  ZonasModule: (props: { initialZonas: ZonaDTO[]; provincias: ProvinciaArbolDTO[] }) => {
    zonasModuleMock(props);
    return <div data-testid="zonas-module-stub" />;
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

const ARBOL: ProvinciaArbolDTO[] = [
  {
    id: "p1",
    nombre: "Provincia Uno",
    activo: true,
    cantones: [
      {
        id: "c1",
        nombre: "Cantón Uno",
        activo: true,
        distritos: [
          {
            id: "d1",
            nombre: "Distrito Uno",
            zonaId: null,
            zonaNombre: null,
            zonas: [],
            zonaEspecial: false,
            activo: true,
          },
        ],
      },
    ],
  },
];

const ZONAS: ZonaDTO[] = [
  { id: "z1", nombre: "Norte", cobroVehiculo: false, distritosCount: 1, esCentral: true },
];

async function importPage() {
  const mod = await import("@/app/(app)/configuracion/zonas/page");
  return mod.default;
}

// La primera importación del árbol de la página (AppPage, Sidebar, acciones) tarda más que el
// timeout de un caso en frío; se paga una vez aquí y no dentro del primer `it`.
beforeAll(async () => {
  await importPage();
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  listarArbolMock.mockResolvedValue({ status: "ok", provincias: ARBOL });
  listarZonasMock.mockResolvedValue({ status: "ok", items: ZONAS, total: 1 });
});

afterEach(() => {
  cleanup();
});

describe("SLT-51/R2 — solo el maestro ve Zonas", () => {
  const otros: RolValue[] = ["admin", "adminTienda", "adminSatelite", "mensajero"];

  for (const rol of otros) {
    it(`${rol}: solo el aviso, sin listado, sin formulario y sin «Cobertura»`, async () => {
      resolveActorMock.mockResolvedValue({ usuarioId: "x", rol });
      const ZonasPage = await importPage();
      render(await ZonasPage());

      expect(screen.getByRole("alert")).toHaveTextContent(
        "No tienes permiso para acceder a esta sección.",
      );
      expect(screen.queryByTestId("zonas-module-stub")).toBeNull();
      expect(screen.queryByText("Cobertura")).toBeNull();
      expect(screen.queryByRole("button", { name: /Descargar cobertura/ })).toBeNull();
      // Ni siquiera pre-carga: a quien no es maestro no se le leen zonas ni catálogo.
      expect(listarZonasMock).not.toHaveBeenCalled();
      expect(listarArbolMock).not.toHaveBeenCalled();
    });
  }

  it("sin sesión: solo el aviso", async () => {
    resolveActorMock.mockResolvedValue(null);
    const ZonasPage = await importPage();
    render(await ZonasPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tienes permiso para acceder a esta sección.",
    );
    expect(screen.queryByTestId("zonas-module-stub")).toBeNull();
    expect(screen.queryByText("Cobertura")).toBeNull();
  });
});

describe("SLT-51 — el maestro ve Cobertura y el listado", () => {
  it("R12: «Cobertura» con «Descargar cobertura» va ANTES del listado", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m1", rol: "maestro" });
    const ZonasPage = await importPage();
    render(await ZonasPage());

    expect(screen.getByRole("heading", { level: 1, name: "Zonas" })).toBeInTheDocument();
    const bloque = screen.getByRole("region", { name: "Cobertura" });
    expect(
      within(bloque).getByRole("button", { name: "Descargar cobertura Cobertura por distrito" }),
    ).toHaveTextContent("Descargar cobertura");

    const listado = screen.getByTestId("zonas-module-stub");
    expect(
      bloque.compareDocumentPosition(listado) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Montar la página no lee la cobertura: se lee al pulsar (465/R4).
    expect(listarCoberturaMock).not.toHaveBeenCalled();
  });

  it("R16: pasa al módulo el árbol de listarArbolGeografico y las zonas pre-cargadas", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m1", rol: "maestro" });
    const ZonasPage = await importPage();
    render(await ZonasPage());

    expect(listarArbolMock).toHaveBeenCalledTimes(1);
    expect(listarZonasMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
    expect(zonasModuleMock).toHaveBeenCalledTimes(1);
    const props = zonasModuleMock.mock.calls[0][0] as {
      initialZonas: ZonaDTO[];
      provincias: ProvinciaArbolDTO[];
    };
    expect(props.provincias).toBe(ARBOL);
    expect(props.initialZonas).toBe(ZONAS);
    // Sin costos: el módulo ya no recibe vehículos.
    expect(props).not.toHaveProperty("vehiculos");
  });

  it("si el catálogo no carga, lo dice y monta el listado con el árbol vacío", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m1", rol: "maestro" });
    listarArbolMock.mockResolvedValue({ status: "forbidden" });
    const ZonasPage = await importPage();
    render(await ZonasPage());

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo geográfico.");
    const props = zonasModuleMock.mock.calls[0][0] as { provincias: ProvinciaArbolDTO[] };
    expect(props.provincias).toEqual([]);
  });
});
