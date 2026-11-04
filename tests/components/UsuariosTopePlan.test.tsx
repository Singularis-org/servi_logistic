// @vitest-environment jsdom
// SL-24 (R28): la pantalla de usuarios muestra el mensaje del tope del plan tal cual: bajo el
// campo de rol al editar (llega como `fieldErrors.rolId`) y en el aviso al activar (`tope_plan`).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

import type { UsuarioListItemDTO } from "@/lib/types/usuario";
import type { UsuarioPublico } from "@/lib/interfaces/repositories/IUserRepository";

const listarUsuariosMock = vi.fn();
const cambiarEstadoUsuarioMock = vi.fn();
const consultarImpactoCambioUsuarioMock = vi.fn();
const obtenerUsuarioMock = vi.fn();
const crearUsuarioMock = vi.fn();
const actualizarUsuarioMock = vi.fn();
const listarTiposIdentificacionMock = vi.fn();
const listarRolesMock = vi.fn();
vi.mock("@/lib/actions/usuarios", () => ({
  listarUsuarios: (...a: unknown[]) => listarUsuariosMock(...a),
  listarUsuariosCompleto: vi.fn(),
  cambiarEstadoUsuario: (...a: unknown[]) => cambiarEstadoUsuarioMock(...a),
  consultarImpactoCambioUsuario: (...a: unknown[]) =>
    consultarImpactoCambioUsuarioMock(...a),
  obtenerUsuario: (...a: unknown[]) => obtenerUsuarioMock(...a),
  crearUsuario: (...a: unknown[]) => crearUsuarioMock(...a),
  actualizarUsuario: (...a: unknown[]) => actualizarUsuarioMock(...a),
  listarTiposIdentificacion: (...a: unknown[]) => listarTiposIdentificacionMock(...a),
  listarRoles: (...a: unknown[]) => listarRolesMock(...a),
  restablecerContrasenaUsuario: vi.fn(),
}));
const listarZonasMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  listarZonas: (...a: unknown[]) => listarZonasMock(...a),
}));
const listarVehiculosMock = vi.fn();
vi.mock("@/lib/actions/vehiculos", () => ({
  listarVehiculos: (...a: unknown[]) => listarVehiculosMock(...a),
}));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: vi.fn() }));

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

import { UsuariosModule } from "@/app/(app)/configuracion/_components/UsuariosModule";

const MENSAJE =
  "Tu plan permite 2 usuarios activos con el rol adminTienda. Ya tienes 2. Inactiva alguno o pide un cambio de plan.";

const FILA: UsuarioListItemDTO = {
  id: "u-tienda",
  nombre: "Tienda Feliz",
  email: "tienda@example.com",
  rolValue: "adminTienda",
  estado: "activo",
  zonaNombre: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const USUARIO: UsuarioPublico = {
  id: "u-tienda",
  nombre: "Tienda Feliz",
  email: "tienda@example.com",
  telefono: "0999999999",
  estado: "activo",
  cedula: "1712345678",
  tipoIdentificacionId: "t1",
  rolId: "rol-tienda",
  fulfillment: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function renderModule(ui: ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>,
  );
}

function listado(fila: UsuarioListItemDTO) {
  listarUsuariosMock.mockResolvedValue({
    status: "ok",
    items: [fila],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  return { items: [fila], total: 1, pageSize: 25 };
}

beforeEach(() => {
  vi.clearAllMocks();
  listarTiposIdentificacionMock.mockResolvedValue({
    status: "ok",
    tipos: [{ id: "t1", value: "cedula" }],
  });
  listarRolesMock.mockResolvedValue({
    status: "ok",
    roles: [{ id: "rol-tienda", value: "adminTienda" }],
  });
  listarZonasMock.mockResolvedValue({
    status: "ok",
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  });
  listarVehiculosMock.mockResolvedValue({ status: "ok", items: [] });
  obtenerUsuarioMock.mockResolvedValue({ status: "ok", usuario: USUARIO });
  consultarImpactoCambioUsuarioMock.mockResolvedValue({ status: "ok", impacto: null });
});

afterEach(() => {
  cleanup();
});

describe("UsuariosModule — tope del plan (SL-24)", () => {
  it("R28: activar con tope_plan muestra el mensaje del servidor en el aviso", async () => {
    const initial = listado({ ...FILA, estado: "inactivo" });
    cambiarEstadoUsuarioMock.mockResolvedValue({ status: "tope_plan", mensaje: MENSAJE });
    const user = userEvent.setup();

    renderModule(<UsuariosModule initialData={initial} />);
    await user.click(await screen.findByRole("button", { name: "Activar" }));

    await waitFor(() =>
      expect(cambiarEstadoUsuarioMock).toHaveBeenCalledWith("u-tienda", {
        estado: "activo",
      }),
    );
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith(MENSAJE));
    expect(errorMock).not.toHaveBeenCalledWith("Revisa los datos e inténtalo de nuevo.");
    expect(successMock).not.toHaveBeenCalled();
  });

  it("R28: editar con el tope del rol lleno pinta el mensaje bajo el campo de rol", async () => {
    const initial = listado(FILA);
    actualizarUsuarioMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { rolId: [MENSAJE] },
    });
    const user = userEvent.setup();

    renderModule(<UsuariosModule initialData={initial} />);
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    await waitFor(() => expect(obtenerUsuarioMock).toHaveBeenCalledWith("u-tienda"));
    await screen.findByLabelText("Nombre");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actualizarUsuarioMock).toHaveBeenCalledTimes(1));
    // El texto sale entero junto al control de rol, enlazado por `aria-describedby`.
    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rol" })).toHaveAccessibleDescription(
      expect.stringContaining(MENSAJE),
    );
    expect(successMock).not.toHaveBeenCalled();
  }, 25000);

  it("R28: crear con el tope del rol lleno pinta el mensaje bajo el campo de rol", async () => {
    const initial = listado(FILA);
    crearUsuarioMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { rolId: [MENSAJE] },
    });

    const user = userEvent.setup();

    renderModule(<UsuariosModule initialData={initial} />);
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    await screen.findByLabelText("Nombre");
    await waitFor(() => expect(listarTiposIdentificacionMock).toHaveBeenCalled());
    await user.click(screen.getByRole("combobox", { name: "Tipo de documento" }));
    await user.click(
      within(await screen.findByRole("listbox")).getByRole("option", { name: "cedula" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Rol" }));
    await user.click(
      within(await screen.findByRole("listbox")).getByRole("option", {
        name: "adminTienda",
      }),
    );
    await user.type(screen.getByLabelText("Nombre"), "Otra Tienda");
    await user.type(screen.getByLabelText("Email"), "otra@example.com");
    await user.type(screen.getByLabelText("Teléfono"), "0988888888");
    await user.type(screen.getByLabelText("Número de documento"), "1712345678");
    await user.type(screen.getByLabelText("Contraseña"), "Abcd1234$xy");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(crearUsuarioMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rol" })).toHaveAccessibleDescription(
      expect.stringContaining(MENSAJE),
    );
    expect(successMock).not.toHaveBeenCalled();
  }, 25000);
});
