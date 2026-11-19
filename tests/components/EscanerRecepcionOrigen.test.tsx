// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerRecepcionOrigen } from "@/app/(app)/ordenes/_components/EscanerRecepcionOrigen";
import { recibirEnOrigenPorQr } from "@/lib/actions/recepcion-origen";

// Escáner de la tienda en `/ordenes`: cierra el flujo de devolución. Se mockean la
// Server Action, el toast y la lib de cámara (sin hardware en CI): el doble captura
// el callback de decodificación que `start` recibe, para simular un escaneo.
vi.mock("@/lib/actions/recepcion-origen", () => ({
  recibirEnOrigenPorQr: vi.fn(),
}));

const { successMock, errorMock, infoMock, startMock, decodeCallback } = vi.hoisted(
  () => ({
    successMock: vi.fn(),
    errorMock: vi.fn(),
    infoMock: vi.fn(),
    startMock: vi.fn(),
    decodeCallback: { current: null as ((texto: string) => void) | null },
  }),
);

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    info: infoMock,
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

const recibirMock = vi.mocked(recibirEnOrigenPorQr);

beforeEach(() => {
  vi.clearAllMocks();
  decodeCallback.current = null;
  startMock.mockImplementation(
    async (
      _config: unknown,
      _opciones: unknown,
      onDecode: (texto: string) => void,
    ) => {
      decodeCallback.current = onDecode;
    },
  );
});

afterEach(() => {
  cleanup();
});

// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (Carlos,
// 2026-11-18): la guía suelta se quitó de `/ordenes` y de la recepción satélite. Sus pruebas (toast
// por resultado, corte del código inválido, guía única, línea de error) se fueron con ella; la
// continua las cubre en `EscaneoContinuo.test.tsx` (R580-R593) y aquí (desenlace por resultado).

describe("EscanerRecepcionOrigen — modo continuo (R580, R583)", () => {
  it("SLT-193 R927: la tarjeta continua no pinta encabezado propio; la región conserva el nombre", () => {
    render(<EscanerRecepcionOrigen modo="continua" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("region", { name: "Recepción continua en tienda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recibir" })).toBeInTheDocument();
  });

  function filasDeLaSesion(): HTMLElement[] {
    return Array.from(screen.getByRole("log", { name: "Lecturas" }).querySelectorAll("li"));
  }

  it("R580: una lectura llega a recibirEnOrigenPorQr con su numGuia, sin toast", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({ status: "ok", ordenId: "o1" } as never);
    render(<EscanerRecepcionOrigen modo="continua" />);

    await user.type(screen.getByLabelText("Número de guía"), "1024{Enter}");

    await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledWith({ numGuia: 1024 }));
    await vi.waitFor(() => expect(filasDeLaSesion()[0]).toHaveTextContent("Recibida"));
    expect(successMock).not.toHaveBeenCalled();
  });

  it("R583: tienda_ajena → «No se pudo recibir» con el motivo de hoy", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({ status: "tienda_ajena" });
    render(<EscanerRecepcionOrigen modo="continua" />);

    await user.type(screen.getByLabelText("Número de guía"), "1024{Enter}");

    await vi.waitFor(() =>
      expect(filasDeLaSesion()[0]).toHaveTextContent(
        "No se pudo recibirEsta orden es de otra tienda.",
      ),
    );
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("R583: con estado_invalido, «Reintentar» vuelve a llamar con la misma guía sin añadir fila", async () => {
    const user = userEvent.setup();
    recibirMock
      .mockResolvedValueOnce({ status: "estado_invalido", estado: "en_reparto" })
      .mockResolvedValueOnce({ status: "ok", ordenId: "o1" } as never);
    render(<EscanerRecepcionOrigen modo="continua" />);

    await user.type(screen.getByLabelText("Número de guía"), "1024{Enter}");
    await vi.waitFor(() =>
      expect(filasDeLaSesion()[0]).toHaveTextContent(
        'No se pudo recibirNo se puede recibir: la orden está en "En reparto".',
      ),
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    await vi.waitFor(() => expect(filasDeLaSesion()[0]).toHaveTextContent("Recibida"));
    expect(recibirMock.mock.calls).toEqual([[{ numGuia: 1024 }], [{ numGuia: 1024 }]]);
    expect(filasDeLaSesion()).toHaveLength(1);
  });
});
