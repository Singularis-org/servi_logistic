// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerRecepcionOrigen } from "@/app/(app)/ordenes/_components/EscanerRecepcionOrigen";
import { EscanerModal } from "@/components/shared/EscanerModal";
import { ORDER_STATUS_LABELS } from "@/app/(app)/ordenes/_components/EstatusBadge";
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

/** Abre la cámara y simula que decodifica un QR con el texto dado. */
async function escanear(user: ReturnType<typeof userEvent.setup>, texto: string) {
  await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
  await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
  await act(async () => {
    decodeCallback.current?.(texto);
  });
}

/** URL del paquete tal como la codifica el QR de la etiqueta. */
function qrDeGuia(numGuia: number): string {
  return `https://ejemplo.app/paquete/${numGuia}`;
}

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

describe("EscanerRecepcionOrigen", () => {
  it("al decodificar llama a la acción con el num_guia del QR", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "o1",
      estado: "devuelta_a_tienda",
    });
    render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() =>
      expect(recibirMock).toHaveBeenCalledWith({ numGuia: 14 }),
    );
  });

  it("ok -> toast con la guía (no el UUID) y dispara onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "54f84b2a-391b-4726-b8a4-358a02f2e8a6",
      estado: "devuelta_a_tienda",
    });
    render(<EscanerRecepcionOrigen onRecibida={onRecibida} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() => expect(successMock).toHaveBeenCalled());
    expect(successMock.mock.calls[0][0]).toMatch(/14/);
    expect(successMock.mock.calls[0][0]).not.toMatch(/54f84b2a/);
    expect(onRecibida).toHaveBeenCalledTimes(1);
  });

  it("ya_recibida -> toast info y dispara onRecibida (idempotente)", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "ya_recibida" });
    render(<EscanerRecepcionOrigen onRecibida={onRecibida} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() => expect(infoMock).toHaveBeenCalled());
    expect(infoMock.mock.calls[0][0]).toMatch(/ya .*recibida/i);
    expect(onRecibida).toHaveBeenCalledTimes(1);
  });

  it("tienda_ajena -> error 'otra tienda', sin onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "tienda_ajena" });
    render(<EscanerRecepcionOrigen onRecibida={onRecibida} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/otra tienda/i);
    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("estado_invalido -> error con el estado actual en legible", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({ status: "estado_invalido", estado: "en_reparto" });
    render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    // Legible, no el value crudo: la etiqueta sale del mapa de presentación
    // (fuente de verdad), blindado aparte en `EstatusLabel.test.ts`.
    expect(errorMock.mock.calls[0][0]).toMatch(ORDER_STATUS_LABELS.en_reparto);
    expect(errorMock.mock.calls[0][0]).not.toMatch("en_reparto");
  });

  // Un QR ajeno (o el UUID de una etiqueta vieja) se rechaza en cliente.
  it("un QR que no resuelve a num_guia no llama a la acción", async () => {
    const user = userEvent.setup();
    render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

    await escanear(user, "https://ejemplo.app/paquete/54f84b2a-391b-4726-b8a4");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/inválido/i);
    expect(recibirMock).not.toHaveBeenCalled();
  });

  // Pedido humano del 2026-08-10 — LA SEGUNDA VÍA. `EscanerGuiaCard` ya ofrecía cámara y
  // número tecleado, pero esta pantalla no activaba `manual`, así que degradaba a solo
  // cámara: sin cámara disponible o con la etiqueta ilegible, no había forma de recibir.
  describe("entrada manual del número de guía", () => {
    function campoManual(): HTMLInputElement {
      return screen.getByLabelText(/número de guía/i) as HTMLInputElement;
    }

    it("el campo manual EXISTE en esta superficie", () => {
      render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

      expect(campoManual()).toBeInTheDocument();
    });

    it("el número tecleado a secas se acepta", async () => {
      // SLT-157: la lectura única acepta el número a secas y la URL del QR, por las dos vías.
      const user = userEvent.setup();
      const onRecibida = vi.fn();
      recibirMock.mockResolvedValue({
        status: "ok",
        ordenId: "o1",
        estado: "devuelta_a_tienda",
      });
      render(<EscanerRecepcionOrigen onRecibida={onRecibida} />);

      await user.type(campoManual(), "77");
      await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

      await vi.waitFor(() =>
        expect(recibirMock).toHaveBeenCalledWith({ numGuia: 77 }),
      );
      await vi.waitFor(() => expect(onRecibida).toHaveBeenCalled());
    });

    it("texto no numérico no llama a la acción y avisa", async () => {
      const user = userEvent.setup();
      render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

      await user.type(campoManual(), "abc");
      await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

      await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
      expect(recibirMock).not.toHaveBeenCalled();
    });

    // SLT-158 (R575/R576, D2): antes un fallo conservaba lo tecleado, y con la pistola la
    // lectura siguiente se pegaba a la anterior ("10241025"). Ahora el campo se vacía siempre
    // y lo leído queda escrito, con el motivo, en la línea de error de la tarjeta.
    it("un fallo vacía el campo y deja lo leído y el motivo en la línea de error", async () => {
      const user = userEvent.setup();
      recibirMock.mockResolvedValue({ status: "tienda_ajena" });
      render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

      await user.type(campoManual(), "77");
      await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

      await vi.waitFor(() => expect(recibirMock).toHaveBeenCalled());
      expect(campoManual().value).toBe("");
      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent("77");
      expect(alerta).toHaveTextContent("Esta orden es de otra tienda.");
    });
  });

  // SLT-158 (R579, D5, decisión de Carlos del 2026-11-14): en la tienda, la tarjeta y su botón
  // dicen lo mismo que el disparador de `/ordenes`.
  //
  // SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R927; P7 de Carlos): el título
  // vive ahora en la barra de `EscanerModal` (en `/ordenes`, «Recibir paquete») y la tarjeta va sin
  // encabezado propio; el botón de envío y el nombre de la región no cambian.
  it("R579/R927: en el diálogo, un solo título «Recibir paquete» (el de la barra); la tarjeta sin encabezado", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal titulo="Recibir paquete">
        <EscanerRecepcionOrigen onRecibida={vi.fn()} />
      </EscanerModal>,
    );
    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
    const dialogo = await screen.findByRole("dialog", { name: "Recibir paquete" });

    expect(within(dialogo).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Recibir paquete"]);
    expect(
      within(dialogo).queryByText("Escanea el código de la guía devuelta o ingresa su número"),
    ).toBeNull();
    expect(within(dialogo).getByRole("region", { name: "Recepción en tienda por escaneo" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Recibir paquete" })).toBeInTheDocument();
    expect(within(dialogo).getAllByRole("button", { name: "Cerrar" })).toHaveLength(1);
  });

  it("R927: la tarjeta suelta no pinta encabezado propio", () => {
    render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("button", { name: "Recibir paquete" })).toBeInTheDocument();
  });

  // SLT-157 «Guía única leída por cámara o pistola»: los dos caminos leen con `leerGuia`.
  describe("guía única por cámara o pistola (SLT-157)", () => {
    it("R565: el CODE128 por cámara y la URL del QR tecleada llegan con el mismo numGuia", async () => {
      const user = userEvent.setup();
      recibirMock.mockResolvedValue({
        status: "ok",
        ordenId: "o1",
        estado: "devuelta_a_tienda",
      });
      render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

      await escanear(user, "1024");
      await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledTimes(1));
      expect(recibirMock).toHaveBeenNthCalledWith(1, { numGuia: 1024 });

      await user.type(
        screen.getByLabelText(/número de guía/i),
        "https://app.ejemplo.test/paquete/1024",
      );
      await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
      await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledTimes(2));
      expect(recibirMock).toHaveBeenNthCalledWith(2, { numGuia: 1024 });
    });

    it("R566: lo que no es guía avisa «Código inválido.» por los dos caminos y no llama a la acción", async () => {
      const user = userEvent.setup();
      render(<EscanerRecepcionOrigen onRecibida={vi.fn()} />);

      await escanear(user, "1024abc");
      await vi.waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));
      expect(errorMock).toHaveBeenLastCalledWith("Código inválido.");

      await user.type(screen.getByLabelText(/número de guía/i), "1024abc");
      await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
      await vi.waitFor(() => expect(errorMock).toHaveBeenCalledTimes(2));
      expect(errorMock).toHaveBeenLastCalledWith("Código inválido.");
      expect(recibirMock).not.toHaveBeenCalled();
    });
  });
});

// SLT-159 «Escaneo continuo en recepciones y recogidas» — la tienda en modo continuo.
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
