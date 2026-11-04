// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";
import type { ZonaDTO } from "@/lib/types/zona";

/**
 * SLT-51 — el listado de «Zonas» y sus rótulos.
 *
 * R3: cada zona con su nombre y su número de distritos; la que tiene la marca lleva la etiqueta
 * «Zona de bodega principal»; ningún costo (antes se colaba «· cobro por vehículo»).
 * R10: ningún texto visible de la pantalla dice «central», en ninguna de sus vistas (listado,
 * vacío, formulario, confirmación de la marca y borrado). Los datos de prueba evitan la palabra
 * a propósito para que la búsqueda solo pueda encontrarla en los rótulos.
 */
const impactoZonaCentralMock = vi.fn();
const listarArbolMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  listarZonas: vi.fn(),
  obtenerZona: vi.fn(),
  borrarZona: vi.fn(),
  crearZona: vi.fn(),
  actualizarZona: vi.fn(),
  impactoZonaCentral: (...a: unknown[]) => impactoZonaCentralMock(...a),
}));
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: (...a: unknown[]) => listarArbolMock(...a),
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

const { ZonasModule } = await import(
  "@/app/(app)/configuracion/zonas/_components/ZonasModule"
);

const ZONAS: ZonaDTO[] = [
  { id: "z1", nombre: "Norte", cobroVehiculo: true, distritosCount: 3, esCentral: true },
  { id: "z2", nombre: "Sur", cobroVehiculo: false, distritosCount: 1, esCentral: false },
];

function arbol(): ProvinciaArbolDTO[] {
  return [
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
              zonaId: "z1",
              zonaNombre: "Norte",
              zonas: [{ id: "z1", nombre: "Norte" }],
              zonaEspecial: false,
              activo: true,
            },
            {
              // SLT-75 (R15): libre. «Distrito Uno» es de «Norte» y al crear sale bloqueado.
              id: "d2",
              nombre: "Distrito Dos",
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

function renderModulo(zonas: ZonaDTO[] = ZONAS) {
  return render(<ZonasModule initialZonas={zonas} provincias={arbol()} />);
}

/** Lo que se ve: el texto de todo el documento (los modales van en un portal bajo `body`). */
function textoVisible(): string {
  return document.body.textContent ?? "";
}

function fila(nombre: string): HTMLElement {
  return screen.getByText(nombre).closest("li") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  impactoZonaCentralMock.mockResolvedValue({ status: "ok", impacto: [] });
  // SLT-75 (R20): Crear/Editar leen el árbol al abrir; sin él, el formulario no se abre.
  listarArbolMock.mockResolvedValue({ status: "ok", provincias: arbol() });
});

afterEach(cleanup);

describe("SLT-51/R3 — listado de zonas", () => {
  it("cada zona con su nombre y su número de distritos", () => {
    renderModulo();

    expect(within(fila("Norte")).getByText("3 distritos")).toBeInTheDocument();
    expect(within(fila("Sur")).getByText("1 distrito")).toBeInTheDocument();
  });

  it("solo la zona con la marca lleva «Zona de bodega principal»", () => {
    renderModulo();

    expect(within(fila("Norte")).getByText("Zona de bodega principal")).toBeInTheDocument();
    expect(within(fila("Sur")).queryByText("Zona de bodega principal")).toBeNull();
    expect(screen.getAllByText("Zona de bodega principal")).toHaveLength(1);
  });

  it("no muestra ningún costo: ni «cobro por vehículo» aunque la zona lo tenga", () => {
    renderModulo();

    expect(textoVisible()).not.toMatch(/cobro por veh[ií]culo/i);
    expect(textoVisible()).not.toMatch(/Costos por zona/i);
    expect(textoVisible()).not.toMatch(/₡/);
  });

  it("vacío: invita a crear la primera zona sin hablar de costos", () => {
    renderModulo([]);

    expect(screen.getByText("No hay zonas")).toBeInTheDocument();
    expect(screen.getByText("Crea la primera zona.")).toBeInTheDocument();
    expect(textoVisible()).not.toMatch(/costo/i);
  });
});

describe("SLT-51/R10 — ningún texto visible de «Zonas» dice «central»", () => {
  it("listado", () => {
    renderModulo();
    expect(textoVisible()).not.toMatch(/central/i);
  });

  it("vacío", () => {
    renderModulo([]);
    expect(textoVisible()).not.toMatch(/central/i);
  });

  it("formulario de crear, con la confirmación de la marca abierta", async () => {
    const user = userEvent.setup();
    renderModulo();

    await user.click(screen.getByRole("button", { name: "Crear zona" }));
    expect(screen.getByRole("checkbox", { name: "Zona de bodega principal" })).toBeInTheDocument();
    expect(textoVisible()).not.toMatch(/central/i);

    // Marcar la casilla con «Norte» ya marcada abre la confirmación al guardar.
    await user.type(screen.getByRole("textbox", { name: "Nombre de la zona" }), "Oeste");
    await user.type(screen.getByRole("textbox", { name: "Número SINPE" }), "80000000");
    await user.type(screen.getByRole("textbox", { name: "A nombre de" }), "Titular de Prueba");
    await user.type(screen.getByLabelText("Buscar en el catálogo geográfico"), "Dos");
    await user.click(
      await screen.findByRole("checkbox", { name: /^Seleccionar distrito Distrito Dos\b/ }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Zona de bodega principal" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("Zona de bodega principal ya asignada");
    expect(textoVisible()).not.toMatch(/central/i);
  });

  it("confirmación de borrado", async () => {
    const user = userEvent.setup();
    renderModulo();

    await user.click(within(fila("Norte")).getByRole("button", { name: "Eliminar" }));
    await screen.findByText("Eliminar zona");
    expect(textoVisible()).not.toMatch(/central/i);
  });
});
