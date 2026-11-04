// @vitest-environment jsdom
// SL-42 (T4.1, T4.2; design §5) — LA PANTALLA `/plataforma/vehiculos` DEL SUPERADMIN.
//
// Cubre R1 (404 a cada rol de empresa ANTES de leer), R2 (activos e inactivos por nombre, con su
// estado; un fallo de carga no se pinta como vacío), R8 (no hay botón de borrar), R13 (un mensaje por
// desenlace; «ya existe» solo con `conflict`) y R16 (`/configuracion/vehiculos` ya no existe en `app/`).
//
// Se monta la página REAL y su módulo real; lo único doblado es el borde: las Server Actions, la
// sesión, el router de Next y el toast. Los textos van LITERALES: son el contrato de pantalla.
import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { VehiculoDTO } from "@/lib/types/vehiculos";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/plataforma/vehiculos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

const acciones = {
  listarVehiculosPlataformaAction: vi.fn(),
  crearVehiculoAction: vi.fn(),
  renombrarVehiculoAction: vi.fn(),
  cambiarActivacionVehiculoAction: vi.fn(),
};
vi.mock("@/lib/actions/vehiculos-plataforma", () => ({
  listarVehiculosPlataformaAction: (...a: unknown[]) => acciones.listarVehiculosPlataformaAction(...a),
  crearVehiculoAction: (...a: unknown[]) => acciones.crearVehiculoAction(...a),
  renombrarVehiculoAction: (...a: unknown[]) => acciones.renombrarVehiculoAction(...a),
  cambiarActivacionVehiculoAction: (...a: unknown[]) => acciones.cambiarActivacionVehiculoAction(...a),
}));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import VehiculosPlataformaPage from "@/app/(app)/plataforma/vehiculos/page";

const MOTO: VehiculoDTO = { id: "v-moto", name: "Moto", activo: true };
const CAMION: VehiculoDTO = { id: "v-camion", name: "Camión", activo: false };
const CARRO: VehiculoDTO = { id: "v-carro", name: "Carro", activo: true };

const ROLES_DE_EMPRESA = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero", "apiKey"];

function actorDe(rol: string) {
  return { usuarioId: "u-1", rol };
}

async function montar() {
  const ui = await VehiculosPlataformaPage();
  return render(ui);
}

/** Las filas del cuerpo de la tabla, como «nombre · estado». */
function filas(): string[] {
  const [, ...cuerpo] = screen.getAllByRole("row");
  return cuerpo.map((fila) => {
    const celdas = within(fila).getAllByRole("cell");
    return `${celdas[0].textContent} · ${celdas[1].textContent}`;
  });
}

beforeEach(() => {
  vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe("superadmin") as never);
  acciones.listarVehiculosPlataformaAction.mockResolvedValue({ status: "ok", items: [MOTO, CAMION, CARRO] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R1 — la puerta, antes de leer", () => {
  it.each(ROLES_DE_EMPRESA)("responde 404 a %s sin llamar a la action", async (rol) => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe(rol) as never);
    await expect(montar()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(acciones.listarVehiculosPlataformaAction).not.toHaveBeenCalled();
  });

  it("responde 404 sin sesión", async () => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(null);
    await expect(montar()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(acciones.listarVehiculosPlataformaAction).not.toHaveBeenCalled();
  });
});

describe("R2 — el listado", () => {
  it("lista activos e inactivos por nombre, con el estado de cada uno", async () => {
    await montar();
    expect(acciones.listarVehiculosPlataformaAction).toHaveBeenCalledTimes(1);
    expect(filas()).toEqual(["Camión · Inactivo", "Carro · Activo", "Moto · Activo"]);
  });

  it("si la lectura falla, dice que no se pudo cargar y no lo pinta como vacío", async () => {
    acciones.listarVehiculosPlataformaAction.mockResolvedValue({ status: "forbidden" });
    await montar();
    expect(screen.getByText("No se pudo cargar el catálogo de vehículos.")).toBeInTheDocument();
    expect(screen.queryByText(/Aún no hay tipos de vehículo/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("con el catálogo vacío y la lectura correcta, sí dice que aún no hay", async () => {
    acciones.listarVehiculosPlataformaAction.mockResolvedValue({ status: "ok", items: [] });
    await montar();
    expect(screen.getByText(/Aún no hay tipos de vehículo/)).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar el catálogo de vehículos.")).toBeNull();
  });
});

describe("R4–R6, R8 — las operaciones de la pantalla", () => {
  it("R8: no ofrece borrar; por fila, «Renombrar» y «Desactivar» o «Activar»", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: /eliminar|borrar/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Renombrar Moto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar Moto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar Camión" })).toBeInTheDocument();
  });

  it("R4: crea con el nombre normalizado y refresca el listado", async () => {
    const user = userEvent.setup();
    acciones.crearVehiculoAction.mockResolvedValue({ status: "ok", vehiculo: { id: "v-bici", name: "Bici eléctrica", activo: true } });
    await montar();
    await user.click(screen.getByRole("button", { name: "Crear vehículo" }));
    await user.type(screen.getByLabelText(/^Nombre/), "  Bici   eléctrica ");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(acciones.crearVehiculoAction).toHaveBeenCalledWith({ name: "Bici eléctrica" });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Vehículo creado."));
    expect(acciones.listarVehiculosPlataformaAction).toHaveBeenCalledTimes(2);
  });

  it("R5: renombra con el id y el nombre nuevo", async () => {
    const user = userEvent.setup();
    acciones.renombrarVehiculoAction.mockResolvedValue({ status: "ok", vehiculo: { ...MOTO, name: "Motocicleta" } });
    await montar();
    await user.click(screen.getByRole("button", { name: "Renombrar Moto" }));
    const campo = screen.getByLabelText(/^Nombre/);
    expect(campo).toHaveValue("Moto");
    await user.clear(campo);
    await user.type(campo, "Motocicleta");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(acciones.renombrarVehiculoAction).toHaveBeenCalledWith({ id: "v-moto", name: "Motocicleta" });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Vehículo renombrado."));
  });

  it("R6: desactiva un activo y activa un inactivo", async () => {
    const user = userEvent.setup();
    acciones.cambiarActivacionVehiculoAction.mockResolvedValue({ status: "ok", vehiculo: MOTO });
    await montar();
    await user.click(screen.getByRole("button", { name: "Desactivar Moto" }));
    expect(acciones.cambiarActivacionVehiculoAction).toHaveBeenCalledWith({ id: "v-moto", activo: false });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Vehículo desactivado."));

    await user.click(screen.getByRole("button", { name: "Activar Camión" }));
    expect(acciones.cambiarActivacionVehiculoAction).toHaveBeenCalledWith({ id: "v-camion", activo: true });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Vehículo activado."));
  });
});

describe("R13 — un mensaje por desenlace; «ya existe» solo con conflict", () => {
  async function crearCon(respuesta: unknown) {
    const user = userEvent.setup();
    acciones.crearVehiculoAction.mockResolvedValue(respuesta);
    await montar();
    await user.click(screen.getByRole("button", { name: "Crear vehículo" }));
    await user.type(screen.getByLabelText(/^Nombre/), "Bici");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    return toastMock.error.mock.calls[0][0] as string;
  }

  it("conflict: «ya existe», en el toast y junto al campo", async () => {
    const mensaje = await crearCon({ status: "conflict" });
    expect(mensaje).toBe("Ya existe un vehículo con ese nombre.");
    expect(screen.getByLabelText(/^Nombre/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Ya existe un vehículo con ese nombre.")).toBeInTheDocument();
  });

  it("validation_error: el error del servidor junto al campo, sin «ya existe»", async () => {
    const mensaje = await crearCon({
      status: "validation_error",
      fieldErrors: { name: ["El nombre debe tener al menos 2 caracteres."] },
    });
    expect(mensaje).toBe("El nombre no es válido. Revisa el campo.");
    expect(screen.getByText("El nombre debe tener al menos 2 caracteres.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/ya existe/i)).toBeNull();
  });

  it("un nombre de solo espacios no llega al servidor", async () => {
    const user = userEvent.setup();
    await montar();
    await user.click(screen.getByRole("button", { name: "Crear vehículo" }));
    await user.type(screen.getByLabelText(/^Nombre/), "   ");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(acciones.crearVehiculoAction).not.toHaveBeenCalled();
    expect(screen.getByText("Este campo es obligatorio.")).toBeInTheDocument();
  });

  it.each([
    ["not_found", "Ese vehículo ya no existe. Recarga la página."],
    ["forbidden", "No tienes permiso para gestionar el catálogo de vehículos."],
    ["unauthenticated", "Tu sesión expiró. Vuelve a entrar."],
    ["error", "No se pudo completar la acción. Inténtalo de nuevo."],
  ])("%s: su propio mensaje, nunca «ya existe»", async (status, esperado) => {
    const mensaje = await crearCon({ status });
    expect(mensaje).toBe(esperado);
    expect(mensaje).not.toMatch(/ya existe/i);
    expect(screen.getByLabelText(/^Nombre/)).not.toHaveAttribute("aria-invalid");
  });

  it("los seis desenlaces tienen mensajes distintos entre sí", async () => {
    const { MENSAJE_ERROR, MENSAJE_EXITO } = await import(
      "@/app/(app)/plataforma/vehiculos/_components/vehiculos-plataforma-textos"
    );
    const todos = [MENSAJE_EXITO.alta, ...Object.values(MENSAJE_ERROR)];
    expect(new Set(todos).size).toBe(todos.length);
    expect(Object.entries(MENSAJE_ERROR).filter(([, m]) => /ya existe/i.test(m)).map(([k]) => k)).toEqual(["conflict"]);
  });

  it("un fallo al cambiar el estado dice su motivo, no «ya existe»", async () => {
    const user = userEvent.setup();
    acciones.cambiarActivacionVehiculoAction.mockResolvedValue({ status: "error" });
    await montar();
    await user.click(screen.getByRole("button", { name: "Desactivar Moto" }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("No se pudo completar la acción. Inténtalo de nuevo."),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});

describe("R16 — /configuracion/vehiculos ya no existe", () => {
  it("no queda ninguna página en esa ruta", () => {
    const raiz = path.resolve(__dirname, "../../..");
    expect(existsSync(path.join(raiz, "app/(app)/configuracion/vehiculos"))).toBe(false);
    expect(existsSync(path.join(raiz, "app/(app)/plataforma/vehiculos/page.tsx"))).toBe(true);
  });
});
