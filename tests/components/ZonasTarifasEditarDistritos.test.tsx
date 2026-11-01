// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";

/**
 * SLT-75 (R19, R20) — CREAR Y EDITAR ABREN CON EL ÁRBOL LEÍDO AL ABRIR.
 *
 * Antes, «Editar» derivaba los distritos de la zona del árbol guardado en el estado del módulo,
 * que `onSaved` refresca sin esperar. Justo después de guardar otra zona ese árbol podía seguir
 * viejo: la edición salía con distritos desmarcados y el siguiente guardado los borraba. Aquí el
 * árbol que recibe el módulo por props dice una cosa y el que devuelve `listarArbolGeografico` al
 * abrir dice otra: manda el segundo.
 *
 * Datos sintéticos.
 */

const obtenerZonaMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  listarZonas: vi.fn().mockResolvedValue({
    status: "ok",
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  }),
  obtenerZona: (...a: unknown[]) => obtenerZonaMock(...a),
  borrarZona: vi.fn(),
  crearZona: vi.fn(),
  actualizarZona: vi.fn(),
  impactoZonaCentral: vi.fn().mockResolvedValue({ status: "ok", impacto: [] }),
}));

vi.mock("@/lib/actions/tarifas", () => ({
  listarTarifas: vi.fn().mockResolvedValue({
    status: "ok",
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  }),
  borrarTarifa: vi.fn(),
  crearTarifa: vi.fn(),
  actualizarTarifa: vi.fn(),
}));

vi.mock("@/lib/actions/usuarios-por-rol", () => ({
  listarAdminTiendas: vi.fn().mockResolvedValue({ status: "ok", usuarios: [] }),
  listarUsuariosPorRol: vi.fn().mockResolvedValue({ status: "ok", usuarios: [] }),
}));

const listarArbolMock = vi.fn();
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: (...a: unknown[]) => listarArbolMock(...a),
  actualizarDistritosEspeciales: vi.fn().mockResolvedValue({ status: "ok" }),
}));

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const { ZonasTarifasModule } = await import(
  "@/app/(app)/configuracion/tarifas/_components/ZonasTarifasModule"
);

const ZONA_Z = { id: "z-z", nombre: "Zona Zeta" };

/** Un distrito, con las zonas que se le pasen. */
function arbolCon(zonas: { id: string; nombre: string }[]): ProvinciaArbolDTO[] {
  const unica = zonas.length === 1 ? zonas[0] : null;
  return [
    {
      id: "p1",
      nombre: "Provincia Prueba",
      activo: true,
      cantones: [
        {
          id: "c1",
          nombre: "Canton Prueba",
          activo: true,
          distritos: [
            {
              id: "d-mov",
              nombre: "Distrito Movido",
              zonaId: unica?.id ?? null,
              zonaNombre: unica?.nombre ?? null,
              zonas,
              zonaEspecial: false,
              activo: true,
            },
          ],
        },
      ],
    },
  ];
}

/** El árbol de las props dice que el distrito está LIBRE: es el viejo. */
function renderModulo() {
  return render(
    <ZonasTarifasModule
      initialZonas={[
        { id: ZONA_Z.id, nombre: ZONA_Z.nombre, cobroVehiculo: false, distritosCount: 1, esCentral: false },
      ]}
      provincias={arbolCon([])}
      vehiculos={[]}
    />,
  );
}

async function abrirEditar(user: ReturnType<typeof userEvent.setup>) {
  const fila = screen.getByText(ZONA_Z.nombre).closest("li");
  expect(fila).not.toBeNull();
  await user.click(within(fila as HTMLElement).getByRole("button", { name: "Editar" }));
}

/** Despliega el árbol del selector escribiendo en su buscador. */
async function desplegar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByRole("searchbox", { name: "Buscar en el catálogo geográfico" }),
    "Movido",
  );
  return screen.findByRole("checkbox", { name: /^Seleccionar distrito Distrito Movido\b/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerZonaMock.mockResolvedValue({
    status: "ok",
    zona: {
      id: ZONA_Z.id,
      nombre: ZONA_Z.nombre,
      cobroVehiculo: false,
      distritosCount: 1,
      esCentral: false,
      tarifas: [],
    },
  });
});

afterEach(cleanup);

describe("R19 — Editar preselecciona los distritos del árbol leído al abrir", () => {
  it("el árbol inicial dice libre y el leído al abrir dice zona Z → Editar Z preselecciona el distrito", async () => {
    listarArbolMock.mockResolvedValue({ status: "ok", provincias: arbolCon([ZONA_Z]) });
    const user = userEvent.setup();
    renderModulo();

    await abrirEditar(user);
    const casilla = await desplegar(user);

    expect(listarArbolMock).toHaveBeenCalledTimes(1);
    expect(casilla).toBeChecked();
    // Es de la zona que se edita: sigue operable (R18).
    expect(casilla).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("R20 — el formulario pinta el árbol leído al abrir, y no abre si la lectura falla", () => {
  it("Crear zona: el distrito que el árbol leído pone en otra zona sale bloqueado", async () => {
    listarArbolMock.mockResolvedValue({ status: "ok", provincias: arbolCon([ZONA_Z]) });
    const user = userEvent.setup();
    renderModulo();

    await user.click(screen.getAllByRole("button", { name: "Crear zona" })[0]);
    const casilla = await desplegar(user);

    expect(listarArbolMock).toHaveBeenCalledTimes(1);
    expect(casilla).toHaveAttribute("aria-disabled", "true");
    expect(casilla).not.toBeChecked();
  });

  it("Editar: si `listarArbolGeografico` falla, no abre y avisa", async () => {
    listarArbolMock.mockResolvedValue({ status: "forbidden" });
    const user = userEvent.setup();
    renderModulo();

    await abrirEditar(user);

    await waitFor(() => expect(errorMock).toHaveBeenCalledWith("No se pudo cargar la zona."));
    expect(screen.queryByRole("searchbox", { name: "Buscar en el catálogo geográfico" })).toBeNull();
  });

  it("Editar: si `listarArbolGeografico` lanza, tampoco abre y avisa", async () => {
    listarArbolMock.mockRejectedValue(new Error("red caída"));
    const user = userEvent.setup();
    renderModulo();

    await abrirEditar(user);

    await waitFor(() => expect(errorMock).toHaveBeenCalledWith("No se pudo cargar la zona."));
    expect(screen.queryByRole("searchbox", { name: "Buscar en el catálogo geográfico" })).toBeNull();
  });

  it("Crear zona: si `listarArbolGeografico` falla, no abre y avisa", async () => {
    listarArbolMock.mockResolvedValue({ status: "forbidden" });
    const user = userEvent.setup();
    renderModulo();

    await user.click(screen.getAllByRole("button", { name: "Crear zona" })[0]);

    await waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No se pudo cargar el catálogo geográfico."),
    );
    expect(screen.queryByRole("searchbox", { name: "Buscar en el catálogo geográfico" })).toBeNull();
  });
});
