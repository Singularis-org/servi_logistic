// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";

/**
 * SLT-75 (R21, R22) — EL RECHAZO POR UN DISTRITO QUE YA ESTÁ EN OTRA ZONA SE LEE ENTERO.
 *
 * El servidor rechaza el guardado con `validation_error` y un mensaje por distrito en
 * `fieldErrors.distritoIds`. El formulario los pinta todos bajo el selector; el toast dice el
 * primero y cuántos más hay. Y el `conflict` (que ya solo viene del nombre o de la zona central)
 * deja de hablar de distritos.
 *
 * Los textos son LITERALES escritos a mano, con la forma que redacta el servidor, y no importados:
 * compararlos contra la función que los genera estaría siempre verde. Datos sintéticos.
 */

const crearZonaMock = vi.fn();
const actualizarZonaMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  crearZona: (...a: unknown[]) => crearZonaMock(...a),
  actualizarZona: (...a: unknown[]) => actualizarZonaMock(...a),
  impactoZonaCentral: vi.fn().mockResolvedValue({ status: "ok", impacto: [] }),
}));

vi.mock("@/lib/actions/geografia", () => ({
  actualizarDistritosEspeciales: vi.fn().mockResolvedValue({ status: "ok" }),
  listarArbolGeografico: vi.fn(),
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

const { CrearZonaForm } = await import(
  "@/app/(app)/configuracion/zonas/_components/CrearZonaForm"
);

const MSG_UNO = "Distrito Alfa ya está en la zona Zona Norte.";
const MSG_DOS = "Distrito Beta ya está en la zona Zona Norte.";
const GENERICO = "Revisa los campos: el formulario está incompleto.";
const TEXTO_CONFLICT = "Ya existe una zona con ese nombre.";

function arbol(): ProvinciaArbolDTO[] {
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
              id: "d1",
              nombre: "Distrito Libre",
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

/** Edición: no exige el SINPE de alta, así que Guardar llama directo a `actualizarZona`. */
function renderEditar() {
  return render(
    <CrearZonaForm
      mode="editar"
      provincias={arbol()}
      zonas={[]}
      initial={{
        zonaId: "z-1",
        nombre: "Zona Prueba",
        distritoIds: ["d1"],
      }}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

const botonGuardar = () => screen.getByRole("button", { name: "Guardar" });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("R21 — validation_error en distritoIds", () => {
  it("con dos mensajes: los dos bajo el selector; toast = primero + « y 1 más.»", async () => {
    actualizarZonaMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { distritoIds: [MSG_UNO, MSG_DOS] },
    });
    const user = userEvent.setup();
    renderEditar();

    await user.click(botonGuardar());

    await waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith(
        "Distrito Alfa ya está en la zona Zona Norte. y 1 más.",
      ),
    );
    expect(errorMock).not.toHaveBeenCalledWith(GENERICO);
    expect(await screen.findByText(MSG_UNO)).toBeInTheDocument();
    expect(screen.getByText(MSG_DOS)).toBeInTheDocument();
    expect(successMock).not.toHaveBeenCalled();
  });

  it("con un solo mensaje, el toast lo repite tal cual, sin « y N más.»", async () => {
    actualizarZonaMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { distritoIds: [MSG_UNO] },
    });
    const user = userEvent.setup();
    renderEditar();

    await user.click(botonGuardar());

    await waitFor(() => expect(errorMock).toHaveBeenCalledWith(MSG_UNO));
    expect(await screen.findByText(MSG_UNO)).toBeInTheDocument();
  });
});

describe("R22 — el texto del conflict no menciona distritos", () => {
  it("`conflict` → «Ya existe una zona con ese nombre.»", async () => {
    actualizarZonaMock.mockResolvedValue({ status: "conflict" });
    const user = userEvent.setup();
    renderEditar();

    await user.click(botonGuardar());

    await waitFor(() => expect(errorMock).toHaveBeenCalledWith(TEXTO_CONFLICT));
    const texto = errorMock.mock.calls.at(-1)?.[0] as string;
    expect(texto.toLowerCase()).not.toContain("distrito");
  });
});
