// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";
import {
  SINPE_DE_PRUEBA,
  tecleaSinpeDeLaZona,
} from "../fixtures/sinpe-en-formulario-zona";

/**
 * SLT-51 — el formulario de zona ya no pide ni guarda costos.
 *
 * R4: al crear y al editar solo hay nombre, distritos y la casilla de bodega principal (+ SINPE al
 * crear). Ni pago al mensajero (tampoco por vehículo), ni tarifa de cobro de la zona, ni el botón
 * de distrito especial.
 * R5: el payload que llega a la acción no lleva `cobroVehiculo` ni `tarifas`, y el formulario no
 * llama a `crearTarifa`/`actualizarTarifa` ni a `actualizarDistritosEspeciales`. Se espían las
 * acciones de verdad que importaría el formulario: si alguien vuelve a cablearlas, se ve aquí.
 */
const crearZonaMock = vi.fn();
const actualizarZonaMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  crearZona: (...a: unknown[]) => crearZonaMock(...a),
  actualizarZona: (...a: unknown[]) => actualizarZonaMock(...a),
  impactoZonaCentral: vi.fn(),
}));

const crearTarifaMock = vi.fn();
const actualizarTarifaMock = vi.fn();
vi.mock("@/lib/actions/tarifas", () => ({
  crearTarifa: (...a: unknown[]) => crearTarifaMock(...a),
  actualizarTarifa: (...a: unknown[]) => actualizarTarifaMock(...a),
}));

const actualizarDistritosEspecialesMock = vi.fn();
vi.mock("@/lib/actions/geografia", () => ({
  actualizarDistritosEspeciales: (...a: unknown[]) =>
    actualizarDistritosEspecialesMock(...a),
  listarArbolGeografico: vi.fn(),
}));

const { CrearZonaForm } = await import(
  "@/app/(app)/configuracion/zonas/_components/CrearZonaForm"
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
            {
              id: "d1",
              nombre: "Carmen",
              zonaId: "z1",
              zonaNombre: "Norte",
              // Ya especial para la empresa: el formulario no debe ofrecer ni tocar la marca.
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

function renderForm(mode: "crear" | "editar") {
  return render(
    <ToastProvider>
      <CrearZonaForm
        mode={mode}
        provincias={arbol()}
        zonas={[]}
        initial={
          mode === "editar"
            ? { zonaId: "z1", nombre: "Norte", distritoIds: ["d1"], esCentral: false }
            : undefined
        }
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    </ToastProvider>,
  );
}

async function abrirArbol(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Buscar en el catálogo geográfico"),
    "Central",
  );
  await screen.findByText("Test");
}

/** Lo que el formulario NO debe ofrecer en ningún modo (R4). */
function expectSinCostos() {
  // Todo campo de monto (pago, tarifa, porcentaje) es un spinbutton: no queda ninguno.
  expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  expect(screen.queryByText(/Pagos por zona/i)).toBeNull();
  expect(screen.queryByText(/Tarifas de zona/i)).toBeNull();
  expect(screen.queryByText(/Cobro por vehículo/i)).toBeNull();
  expect(screen.queryByLabelText(/Cobro por vehículo/i)).toBeNull();
  expect(screen.queryByRole("button", { name: /zona especial/i })).toBeNull();
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

describe("SLT-51/R4 — el formulario de zona pide solo nombre, distritos y bodega principal", () => {
  it("al crear: nombre, distritos, casilla y SINPE; ningún costo ni «Especial»", async () => {
    const user = userEvent.setup();
    renderForm("crear");
    await abrirArbol(user);

    expect(screen.getByRole("textbox", { name: "Nombre de la zona" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar en el catálogo geográfico")).toBeInTheDocument();
    // La casilla de bodega principal: la única cuyo nombre empieza por «Zona».
    expect(screen.getByRole("checkbox", { name: /^Zona / })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Número SINPE" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "A nombre de" })).toBeInTheDocument();
    expectSinCostos();
  });

  it("al editar: sin SINPE y sin costos", async () => {
    const user = userEvent.setup();
    renderForm("editar");
    await abrirArbol(user);

    expect(screen.getByRole("textbox", { name: "Nombre de la zona" })).toHaveValue("Norte");
    expect(screen.queryByRole("textbox", { name: "Número SINPE" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "A nombre de" })).toBeNull();
    expectSinCostos();
  });

  it("SL-15 R3: el ejemplo de SINPE sigue siendo ficticio", () => {
    renderForm("crear");
    expect(screen.getByPlaceholderText("Ej: Mensajería Ejemplo CR S.A.")).toBeInTheDocument();
  });
});

describe("SLT-51/R5 — guardar no manda ni escribe costos", () => {
  it("crear: el payload es nombre + bodega principal + distritos + SINPE, sin cobroVehiculo ni tarifas", async () => {
    const user = userEvent.setup();
    renderForm("crear");
    await abrirArbol(user);

    await user.type(screen.getByRole("textbox", { name: "Nombre de la zona" }), "Sur");
    await user.click(screen.getByRole("checkbox", { name: /^Seleccionar distrito Test\b/ }));
    await tecleaSinpeDeLaZona(user);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(crearZonaMock).toHaveBeenCalledTimes(1));
    const payload = crearZonaMock.mock.calls[0][0] as Record<string, unknown>;
    // Literal a propósito: es el contrato de design §4, no una copia de lo que arma el formulario.
    expect(payload).toEqual({
      nombre: "Sur",
      esCentral: false,
      distritoIds: ["d2"],
      sinpeNumero: SINPE_DE_PRUEBA.numero,
      sinpeNombre: SINPE_DE_PRUEBA.nombre,
    });
    expect(payload).not.toHaveProperty("cobroVehiculo");
    expect(payload).not.toHaveProperty("tarifas");

    expect(crearTarifaMock).not.toHaveBeenCalled();
    expect(actualizarTarifaMock).not.toHaveBeenCalled();
    expect(actualizarDistritosEspecialesMock).not.toHaveBeenCalled();
  });

  it("editar: el payload no lleva cobroVehiculo ni tarifas, y no toca tarifas ni especiales", async () => {
    const user = userEvent.setup();
    renderForm("editar");
    await abrirArbol(user);

    await user.click(screen.getByRole("checkbox", { name: /^Seleccionar distrito Test\b/ }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actualizarZonaMock).toHaveBeenCalledTimes(1));
    const [id, payload] = actualizarZonaMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("z1");
    expect(payload).not.toHaveProperty("cobroVehiculo");
    expect(payload).not.toHaveProperty("tarifas");
    expect(payload).not.toHaveProperty("sinpeNumero");
    expect(payload).toMatchObject({ nombre: "Norte", esCentral: false });
    expect([...(payload.distritoIds as string[])].sort()).toEqual(["d1", "d2"]);

    expect(crearTarifaMock).not.toHaveBeenCalled();
    expect(actualizarTarifaMock).not.toHaveBeenCalled();
    expect(actualizarDistritosEspecialesMock).not.toHaveBeenCalled();
  });
});
