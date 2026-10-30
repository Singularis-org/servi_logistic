// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";
import { tecleaSinpeDeLaZona } from "../fixtures/sinpe-en-formulario-zona";

// SLT-51 (R4) — la marca de distrito especial es un costo de la EMPRESA y se configura desde
// Tarifas (SL-38), no desde Zonas. El formulario de zona no pinta el botón «Especial» ni el
// conteo, y guardar nunca llama a `actualizarDistritosEspeciales`: si lo hiciera, un guardado de
// geografía podría desmarcar en silencio lo que Tarifas configuró. El selector conserva la
// capacidad detrás de `permitirEspecial` para que SLT-54 la reutilice; eso también se prueba.
const actualizarDistritosEspecialesMock = vi.fn();
vi.mock("@/lib/actions/geografia", () => ({
  actualizarDistritosEspeciales: (...a: unknown[]) =>
    actualizarDistritosEspecialesMock(...a),
  listarArbolGeografico: vi.fn(),
}));

const crearZonaMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  crearZona: (...a: unknown[]) => crearZonaMock(...a),
  actualizarZona: vi.fn(),
  impactoZonaCentral: vi.fn(),
}));

const { CrearZonaForm } = await import(
  "@/app/(app)/configuracion/zonas/_components/CrearZonaForm"
);
const { GeografiaSelector } = await import(
  "@/app/(app)/configuracion/zonas/_components/GeografiaSelector"
);

function arbol(): ProvinciaArbolDTO[] {
  return [
    {
      id: "p1",
      nombre: "San José",
      activo: true,
      cantones: [
        {
          id: "c1",
          nombre: "Central",
          activo: true,
          distritos: [
            // Ya es especial para la empresa: lo marcó Tarifas.
            {
              id: "d1",
              nombre: "Carmen",
              zonaId: "z9",
              zonaNombre: "Zona 2",
              zonaEspecial: true,
              activo: true,
            },
            {
              id: "d2",
              nombre: "Test",
              zonaId: null,
              zonaNombre: null,
              zonaEspecial: false,
              activo: true,
            },
          ],
        },
      ],
    },
  ];
}

function renderForm() {
  return render(
    <ToastProvider>
      <CrearZonaForm
        mode="crear"
        provincias={arbol()}
        zonas={[]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    </ToastProvider>,
  );
}

/** Despliega el árbol por la búsqueda: «Central» hace match de cantón y abre sus distritos. */
async function abrirArbol(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Buscar en el catálogo geográfico"),
    "Central",
  );
  await screen.findByText("Test");
}

beforeEach(() => {
  vi.clearAllMocks();
  crearZonaMock.mockResolvedValue({ status: "ok", zona: { id: "z1" } });
  actualizarDistritosEspecialesMock.mockResolvedValue({
    status: "ok",
    actualizados: 1,
  });
});

afterEach(cleanup);

describe("SLT-51/R4 — Zonas no marca distritos especiales", () => {
  it("ningún distrito tiene botón «Especial», ni siquiera el que ya lo es", async () => {
    const user = userEvent.setup();
    renderForm();
    await abrirArbol(user);

    expect(screen.getByText("Carmen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /zona especial/i })).toBeNull();
    expect(screen.queryByText("Especial")).toBeNull();
  });

  it("el cantón no muestra el conteo de especiales aunque haya uno", async () => {
    const user = userEvent.setup();
    renderForm();
    await abrirArbol(user);

    expect(screen.getByText(/2 distritos/)).toBeInTheDocument();
    expect(screen.queryByText(/Zonas especiales/)).toBeNull();
  });

  it("guardar una zona nunca llama a actualizarDistritosEspeciales", async () => {
    const user = userEvent.setup();
    renderForm();
    await abrirArbol(user);

    await user.type(screen.getByPlaceholderText("Ej: San José centro"), "Zona 3");
    await user.click(screen.getByRole("checkbox", { name: /^Seleccionar distrito Test\b/ }));
    await tecleaSinpeDeLaZona(user);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(crearZonaMock).toHaveBeenCalled());
    expect(actualizarDistritosEspecialesMock).not.toHaveBeenCalled();
  });
});

describe("GeografiaSelector con permitirEspecial (reservado para Tarifas)", () => {
  it("por defecto no reporta especiales al padre", async () => {
    const onEspecialesChange = vi.fn();
    render(
      <GeografiaSelector provincias={arbol()} onEspecialesChange={onEspecialesChange} />,
    );
    await waitFor(() => expect(screen.getByText("San José")).toBeInTheDocument());
    expect(onEspecialesChange).not.toHaveBeenCalled();
  });

  it("con permitirEspecial pinta el botón, lo alterna y reporta la marca", async () => {
    const user = userEvent.setup();
    const onEspecialesChange = vi.fn();
    render(
      <GeografiaSelector
        provincias={arbol()}
        permitirEspecial
        onEspecialesChange={onEspecialesChange}
      />,
    );
    await abrirArbol(user);

    expect(
      screen.getByRole("button", { name: "Quitar la marca de zona especial a Carmen" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/2 distritos, Zonas especiales: 1/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Marcar Test como zona especial" }),
    );
    await waitFor(() =>
      expect(onEspecialesChange).toHaveBeenLastCalledWith(
        expect.arrayContaining(["d1", "d2"]),
      ),
    );
  });
});
