// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";
import { tecleaSinpeDeLaZona } from "../fixtures/sinpe-en-formulario-zona";
// SLT-89 (T7.2): la entrada nueva del formulario (árbol de N niveles) y el modal único de guardado.
import { arbolDeZonas, guardarYConfirmar } from "../fixtures/arbol-de-zonas-en-formulario";

// SLT-51 (R4) — la marca de distrito especial es un costo de la EMPRESA y se configura desde
// Tarifas (SL-38), no desde Zonas. El formulario de zona no pinta el botón «Especial» ni el
// conteo: SLT-54 (R28) retiró además la action que escribía la marca. SLT-89 (R8) retiró también
// la capacidad reservada `permitirEspecial` del selector.
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: vi.fn(),
}));

const crearZonaMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  // SLT-89 (R13): el aviso de impacto del modal único; aquí no se miden sus cifras.
  impactoAsignacionZona: vi.fn().mockResolvedValue({ status: "ok", impacto: { cambianDeZona: 0, cambianDeTarifa: 0, noSeMueven: { enBodegaSatelite: 0, conGestionFinal: 0, enCierre: 0 } } }),
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
              zonas: [{ id: "z9", nombre: "Zona 2" }],
              zonaEspecial: true,
              activo: true,
            },
            {
              id: "d2",
              nombre: "Test",
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
}

function renderForm() {
  return render(
    <ToastProvider>
      <CrearZonaForm
        mode="crear"
        arbol={arbolDeZonas(arbol())}
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

  it("guardar una zona solo llama a crearZona", async () => {
    const user = userEvent.setup();
    renderForm();
    await abrirArbol(user);

    await user.type(screen.getByPlaceholderText("Ej: San José centro"), "Zona 3");
    await user.click(screen.getByRole("checkbox", { name: /^Seleccionar distrito Test\b/ }));
    await tecleaSinpeDeLaZona(user);
    await guardarYConfirmar(user);

    await waitFor(() => expect(crearZonaMock).toHaveBeenCalledTimes(1));
  });
});

// SLT-89 (design §8.1, R8): el selector de N niveles ya no tiene `permitirEspecial` ni
// `onEspecialesChange` — nadie los usaba desde SLT-51 y R8 prohíbe ofrecer marcar la zona especial.
// Los dos casos que probaban esa capacidad reservada se sustituyen por el que afirma que no existe.
describe("GeografiaSelector sin marca de zona especial (SLT-89, R8)", () => {
  it("el selector no ofrece marcar ni desmarcar la zona especial, aunque el distrito ya lo sea", async () => {
    const user = userEvent.setup();
    render(<GeografiaSelector arbol={arbolDeZonas(arbol())} />);
    await abrirArbol(user);

    expect(screen.getByText("Carmen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /zona especial/i })).toBeNull();
    expect(screen.queryByText(/Zonas especiales/)).toBeNull();
  });
});
