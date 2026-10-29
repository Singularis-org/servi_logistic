// @vitest-environment jsdom
// SL-24 (R28): aprobar una postulación con el tope del rol lleno muestra el mensaje del servidor
// tal cual en el aviso de error, y el modal y la fila siguen ahí.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { PostulacionesPendientesPanel } from "@/app/(app)/_components/PostulacionesPendientesPanel";
import {
  listarPostulacionesPendientes,
  aprobarPostulacion,
} from "@/lib/actions/aprobacion-postulaciones";
import type { PostulacionPendienteDTO } from "@/lib/types/aprobacion-postulacion";

vi.mock("@/lib/actions/aprobacion-postulaciones", () => ({
  listarPostulacionesPendientes: vi.fn(),
  aprobarPostulacion: vi.fn(),
  rechazarPostulacion: vi.fn(),
}));

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const listarMock = vi.mocked(listarPostulacionesPendientes);
const aprobarMock = vi.mocked(aprobarPostulacion);

const MENSAJE =
  "Tu plan permite 3 usuarios activos con el rol mensajero. Ya tienes 3. Inactiva alguno o pide un cambio de plan.";

const POSTULACION: PostulacionPendienteDTO = {
  usuarioId: "u1",
  nombre: "Nombre-u1",
  primerApellido: "Ap",
  segundoApellido: null,
  email: "u1@example.com",
  telefono: "0999999999",
  tipoIdentificacion: "cedula",
  cedula: "0102030405",
  vehiculo: "moto",
  placa: "ABC-1234",
  documentos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  listarMock.mockResolvedValue({
    status: "ok",
    items: [POSTULACION],
    page: 1,
    pageSize: 20,
    total: 1,
  });
});

afterEach(() => {
  cleanup();
});

describe("PostulacionesPendientesPanel — tope del plan (SL-24)", () => {
  it("R28: aprobar con tope_plan muestra el mensaje del servidor en el aviso y la fila permanece", async () => {
    const user = userEvent.setup();
    aprobarMock.mockResolvedValue({ status: "tope_plan", mensaje: MENSAJE });

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PostulacionesPendientesPanel />
      </SWRConfig>,
    );
    const card = await screen.findByTestId("postulacion-u1");
    await user.click(within(card).getByRole("button", { name: "Aprobar" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Aprobar" }));

    await waitFor(() => expect(errorMock).toHaveBeenCalledWith(MENSAJE));
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(successMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("postulacion-u1")).toBeInTheDocument();
  });
});
