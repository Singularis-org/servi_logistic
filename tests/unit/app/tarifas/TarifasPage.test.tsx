// @vitest-environment jsdom
// SLT-54 (R25, R55, R57) — la página de Tarifas es un Server Component: se ejercita de verdad y se doblan
// las actions y el módulo. Quién puede qué lo decide el servidor; aquí se mira qué monta con cada respuesta.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { valor, zonaOk, zonaResumen } from "../../../fixtures/tarifas-pantalla";

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));
vi.mock("@/components/shared/NotificationsBell", () => ({ NotificationsBell: () => null }));

const { cargarPantallaMock, cargarZonaMock, moduloMock } = vi.hoisted(() => ({
  cargarPantallaMock: vi.fn(),
  cargarZonaMock: vi.fn(),
  moduloMock: vi.fn(),
}));

vi.mock("@/lib/actions/tarifas", () => ({
  cargarPantallaTarifas: () => cargarPantallaMock(),
  cargarZonaTarifas: (i: unknown) => cargarZonaMock(i),
}));
vi.mock("@/app/(app)/configuracion/tarifas/_components/TarifasModule", () => ({
  TarifasModule: (props: unknown) => {
    moduloMock(props);
    return <div data-testid="modulo-stub" />;
  },
  TarifasErrorCarga: () => <div role="alert">error-con-reintento</div>,
}));

const PANTALLA = {
  status: "ok" as const,
  activacion: null,
  zonas: [zonaResumen({ id: "z1", nombre: "Norte" }), zonaResumen({ id: "z2", nombre: "Sur" })],
  vehiculos: [],
  tiendas: [],
  preciosTienda: [],
  mensajeros: [],
  valoresMensajero: [],
  puedeEscribir: true,
};

async function pagina(zona?: string) {
  const { default: TarifasPage } = await import("@/app/(app)/configuracion/tarifas/page");
  return TarifasPage({ searchParams: Promise.resolve(zona === undefined ? {} : { zona }) });
}

beforeAll(async () => {
  await import("@/app/(app)/configuracion/tarifas/page");
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  cargarPantallaMock.mockResolvedValue(PANTALLA);
  cargarZonaMock.mockResolvedValue(zonaOk());
});

afterEach(() => cleanup());

describe("SLT-54 — /configuracion/tarifas", () => {
  it("R25: monta la pantalla nueva con la primera zona ya leída", async () => {
    render(await pagina());

    expect(screen.getByRole("heading", { level: 1, name: "Tarifas" })).toBeInTheDocument();
    expect(screen.getByTestId("modulo-stub")).toBeInTheDocument();
    expect(cargarZonaMock).toHaveBeenCalledTimes(1);
    expect(cargarZonaMock).toHaveBeenCalledWith({ zonaId: "z1" });
    expect(moduloMock.mock.calls[0][0]).toMatchObject({ pantalla: PANTALLA, zonaInicialId: "z1" });
  });

  it("R18: ?zona= abre esa zona; una ajena cae en la primera", async () => {
    render(await pagina("z2"));
    expect(moduloMock.mock.lastCall?.[0]).toMatchObject({ zonaInicialId: "z2" });
    cleanup();
    render(await pagina("de-otra-empresa"));
    expect(moduloMock.mock.lastCall?.[0]).toMatchObject({ zonaInicialId: "z1" });
  });

  it("R40: antes de activar dice quién edita; después, desde cuándo rige", async () => {
    render(await pagina());
    expect(screen.getByText("Solo el maestro puede editar")).toBeInTheDocument();
    cleanup();

    cargarPantallaMock.mockResolvedValue({ ...PANTALLA, activacion: { activadaAt: new Date("2026-11-12T18:00:00Z") } });
    render(await pagina());
    expect(screen.getByText("En vigor desde el 12-11-2026")).toBeInTheDocument();
    expect(screen.queryByText("Solo el maestro puede editar")).toBeNull();
  });

  it("R55: otro rol o sin sesión ve solo el aviso, sin módulo ni lectura de zona", async () => {
    for (const status of ["forbidden", "unauthenticated"]) {
      cargarPantallaMock.mockResolvedValue({ status });
      render(await pagina());
      expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para acceder a esta sección.");
      expect(screen.queryByTestId("modulo-stub")).toBeNull();
      cleanup();
    }
    expect(cargarZonaMock).not.toHaveBeenCalled();
  });

  it("R57: si la lectura falla hay error con reintento y no un estado vacío", async () => {
    cargarPantallaMock.mockResolvedValue({ status: "error" });
    render(await pagina());
    expect(screen.getByRole("alert")).toHaveTextContent("error-con-reintento");
    expect(screen.queryByTestId("modulo-stub")).toBeNull();
    expect(screen.queryByText("No tienes permiso para acceder a esta sección.")).toBeNull();
  });

  it("R41: pide los nombres de grupo solo de las zonas con precio de tienda en un grupo", async () => {
    cargarPantallaMock.mockResolvedValue({
      ...PANTALLA,
      preciosTienda: [
        valor("tienda_flete_entregado", { id: "a", tiendaId: "t1", zonaId: "z2", grupoId: "g9", nivel: "tienda_grupo" }),
        valor("tienda_flete_entregado", { id: "b", tiendaId: "t1", zonaId: null, nivel: "tienda_general" }),
      ],
    });
    cargarZonaMock.mockResolvedValue(zonaOk({ grupos: [{ id: "g9", zonaId: "z2", nombre: "Costa", distritos: [] }] }));
    render(await pagina());

    expect(cargarZonaMock.mock.calls.map((c) => c[0])).toEqual([{ zonaId: "z1" }, { zonaId: "z2" }]);
    expect(moduloMock.mock.lastCall?.[0]).toMatchObject({ nombresDeGrupo: { g9: "Costa" } });
  });
});
