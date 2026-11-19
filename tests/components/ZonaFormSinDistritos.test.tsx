// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";
import { tecleaSinpeDeLaZona } from "../fixtures/sinpe-en-formulario-zona";

/**
 * SLT-198 (R1231) — el formulario de zona y la lista de distritos vacia.
 *
 * Al EDITAR se puede desmarcar todo y guardar (cerrar una bodega satelite); al CREAR, sin ningun
 * distrito, el formulario pinta el error del campo y no llama a la accion. El formulario valida con
 * el esquema de la accion (`crearZonaSchema` / `actualizarZonaSchema`), asi que esto mide que la
 * separacion del zod llega a la pantalla.
 */
const crearZonaMock = vi.fn();
const actualizarZonaMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  crearZona: (...a: unknown[]) => crearZonaMock(...a),
  actualizarZona: (...a: unknown[]) => actualizarZonaMock(...a),
  impactoZonaCentral: vi.fn(),
}));

vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: vi.fn(),
}));

const { CrearZonaForm } = await import(
  "@/app/(app)/configuracion/zonas/_components/CrearZonaForm"
);

function arbol(): ProvinciaArbolDTO[] {
  return [
    {
      id: "p1",
      nombre: "Cartago",
      activo: true,
      cantones: [
        {
          id: "c1",
          nombre: "Cartago",
          activo: true,
          distritos: [
            {
              id: "d1",
              nombre: "Quebradilla",
              zonaId: "z1",
              zonaNombre: "Kevin",
              zonas: [{ id: "z1", nombre: "Kevin" }],
              zonaEspecial: false,
              activo: true,
            },
          ],
        },
      ],
    },
  ];
}

function renderForm(mode: "crear" | "editar") {
  return render(
    <ToastProvider>
      <CrearZonaForm
        mode={mode}
        provincias={arbol()}
        zonas={[]}
        initial={
          mode === "editar"
            ? { zonaId: "z1", nombre: "Kevin", distritoIds: ["d1"], esCentral: false }
            : undefined
        }
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    </ToastProvider>,
  );
}

async function abrirArbol(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Buscar en el catálogo geográfico"), "Quebradilla");
  await screen.findByRole("checkbox", { name: /^Seleccionar distrito Quebradilla\b/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  crearZonaMock.mockResolvedValue({ status: "ok", zona: { id: "z-nueva" } });
  actualizarZonaMock.mockResolvedValue({
    status: "ok",
    zona: { id: "z1" },
    ordenesReconciliadas: 0,
    ordenesRetenidasEnBodegaSatelite: 0,
  });
});

afterEach(cleanup);

describe("SLT-198/R1231 — guardar una zona sin distritos", () => {
  it("editar: desmarcar el unico distrito y guardar llama a `actualizarZona` con `distritoIds: []`", async () => {
    const user = userEvent.setup();
    renderForm("editar");
    await abrirArbol(user);

    const casilla = screen.getByRole("checkbox", { name: /^Seleccionar distrito Quebradilla\b/ });
    expect(casilla).toBeChecked();
    await user.click(casilla);
    expect(casilla).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actualizarZonaMock).toHaveBeenCalledTimes(1));
    const [id, payload] = actualizarZonaMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("z1");
    expect(payload).toEqual({ nombre: "Kevin", esCentral: false, distritoIds: [] });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("crear: sin marcar ningun distrito, error en el campo y la accion no se llama", async () => {
    const user = userEvent.setup();
    renderForm("crear");

    await user.type(screen.getByRole("textbox", { name: "Nombre de la zona" }), "Nueva");
    await tecleaSinpeDeLaZona(user);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(crearZonaMock).not.toHaveBeenCalled();
    expect(actualizarZonaMock).not.toHaveBeenCalled();
  });
});
