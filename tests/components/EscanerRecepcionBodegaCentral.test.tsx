// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerRecepcionBodegaCentral } from "@/app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral";
import { ORDER_STATUS_LABELS } from "@/app/(app)/ordenes/_components/EstatusBadge";
import { recibirEnBodegaCentralPorQr } from "@/lib/actions/recepcion-bodega-central";
import { EscanerModal } from "@/components/shared/EscanerModal";

// Feature 138 — Receptor de la BODEGA CENTRAL en `/ordenes` (maestro/admin): dos
// entradas equivalentes (escaneo por cámara + entrada manual de guía) que funelan a
// la MISMA Server Action. Se mockean la acción, el toast y la lib de cámara (sin
// hardware en CI): el doble captura el callback de decodificación que `start` recibe
// para simular un escaneo. Espejo del test de `EscanerRecepcionOrigen`.
vi.mock("@/lib/actions/recepcion-bodega-central", () => ({
  recibirEnBodegaCentralPorQr: vi.fn(),
}));

const { successMock, errorMock, infoMock, startMock, stopMock, decodeCallback } = vi.hoisted(
  () => ({
    successMock: vi.fn(),
    errorMock: vi.fn(),
    infoMock: vi.fn(),
    startMock: vi.fn(),
    stopMock: vi.fn().mockResolvedValue(undefined),
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
    stop = stopMock;
    clear = vi.fn();
  },
}));

const recibirMock = vi.mocked(recibirEnBodegaCentralPorQr);

/** Abre la cámara y simula que decodifica un QR con el texto dado. */
async function escanear(user: ReturnType<typeof userEvent.setup>, texto: string) {
  await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
  await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
  await act(async () => {
    decodeCallback.current?.(texto);
  });
}

/** Entrada manual: teclea el número de guía y pulsa "Recibir". */
async function recibirManual(
  user: ReturnType<typeof userEvent.setup>,
  texto: string,
) {
  const input = screen.getByLabelText("Número de guía");
  await user.clear(input);
  if (texto) await user.type(input, texto);
  await user.click(screen.getByRole("button", { name: "Recibir" }));
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

describe("EscanerRecepcionBodegaCentral — dos entradas equivalentes (R12/R13)", () => {
  it("R13: al decodificar el QR llama a la acción con el num_guia de la URL", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "o1",
      estado: "en_bodega_central",
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() =>
      expect(recibirMock).toHaveBeenCalledWith({ numGuia: 14 }),
    );
  });

  it("R12b: la entrada manual dispara la MISMA acción con el num_guia tecleado", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "o1",
      estado: "en_bodega_central",
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await recibirManual(user, "27");

    await vi.waitFor(() =>
      expect(recibirMock).toHaveBeenCalledWith({ numGuia: 27 }),
    );
  });
});

describe("EscanerRecepcionBodegaCentral — toast por resultado (R15) + refresco (R14)", () => {
  it("ok -> toast con la guía (no el UUID) y dispara onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "54f84b2a-391b-4726-b8a4-358a02f2e8a6",
      estado: "en_bodega_central",
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() => expect(successMock).toHaveBeenCalled());
    expect(successMock.mock.calls[0][0]).toMatch(/14/);
    expect(successMock.mock.calls[0][0]).toMatch(/bodega central/i);
    expect(successMock.mock.calls[0][0]).not.toMatch(/54f84b2a/);
    expect(onRecibida).toHaveBeenCalledTimes(1);
  });

  it("R17 (139): ok con estado por_devolver_a_tienda -> toast nombra ese destino, no 'bodega central'", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    // Recepción STATE-AWARE: una orden en devolviendo_a_bodega_central queda en
    // por_devolver_a_tienda; el toast debe reflejar ese destino (no "bodega central").
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "o1",
      estado: "por_devolver_a_tienda",
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await escanear(user, qrDeGuia(21));

    await vi.waitFor(() => expect(successMock).toHaveBeenCalled());
    expect(successMock.mock.calls[0][0]).toMatch(/21/);
    expect(successMock.mock.calls[0][0]).toMatch(/por devolver a la tienda/i);
    expect(successMock.mock.calls[0][0]).not.toMatch(/bodega central/i);
    expect(onRecibida).toHaveBeenCalledTimes(1);
  });

  it("ya_recibida -> toast info y dispara onRecibida (idempotente, R14)", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "ya_recibida" });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await recibirManual(user, "14");

    await vi.waitFor(() => expect(infoMock).toHaveBeenCalled());
    expect(infoMock.mock.calls[0][0]).toMatch(/ya .*recibida/i);
    expect(onRecibida).toHaveBeenCalledTimes(1);
  });

  it("estado_invalido -> error con el estado actual en legible, sin onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({
      status: "estado_invalido",
      estado: "en_reparto",
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await escanear(user, qrDeGuia(14));

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    // Legible, no el value crudo: la etiqueta sale del mapa de presentación.
    expect(errorMock.mock.calls[0][0]).toMatch(ORDER_STATUS_LABELS.en_reparto);
    expect(errorMock.mock.calls[0][0]).not.toMatch("en_reparto");
    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("no_encontrada -> error 'Orden no encontrada', sin onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "no_encontrada" });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await recibirManual(user, "14");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/no encontrada/i);
    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("forbidden -> error de permiso, sin onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "forbidden" });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await recibirManual(user, "14");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/permiso/i);
    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("unauthenticated -> error de sesión, sin onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "unauthenticated" });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await recibirManual(user, "14");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/sesión/i);
    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("conflict -> error de cambio de estado, sin onRecibida", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "conflict" });
    render(<EscanerRecepcionBodegaCentral onRecibida={onRecibida} />);

    await recibirManual(user, "14");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/cambió de estado/i);
    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("validation_error del borde -> error 'Código inválido'", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { numGuia: ["inválido"] },
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await recibirManual(user, "14");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/inválido/i);
  });
});

describe("EscanerRecepcionBodegaCentral — corte en cliente del código inválido (R10)", () => {
  it("un QR que no resuelve a num_guia no llama a la acción", async () => {
    const user = userEvent.setup();
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await escanear(user, "https://ejemplo.app/paquete/54f84b2a-391b-4726-b8a4");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/inválido/i);
    expect(recibirMock).not.toHaveBeenCalled();
  });

  it("una guía manual no numérica/no positiva se corta en cliente (sin llamar a la acción)", async () => {
    const user = userEvent.setup();
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    // No entero positivo: se rechaza en el borde de cliente con "Código inválido".
    await recibirManual(user, "0");

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(errorMock.mock.calls[0][0]).toMatch(/inválido/i);
    expect(recibirMock).not.toHaveBeenCalled();
  });

  it("con el campo vacío no hay nada que enviar: el botón está inerte", async () => {
    const user = userEvent.setup();
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    // El vacío ya no llega al guard de "Código inválido": la tarjeta deshabilita el
    // botón, que es la forma honesta de decir que aún no hay nada que recibir.
    expect(screen.getByRole("button", { name: "Recibir" })).toBeDisabled();

    await recibirManual(user, "");

    expect(recibirMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });
});

// SLT-157 «Guía única leída por cámara o pistola»: los dos caminos leen con `leerGuia`.
describe("EscanerRecepcionBodegaCentral — guía única por cámara o pistola (SLT-157)", () => {
  it("R565: el CODE128 por cámara y la URL del QR tecleada llegan con el mismo numGuia", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({
      status: "ok",
      ordenId: "o1",
      estado: "en_bodega_central",
    });
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await escanear(user, "1024");
    await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledTimes(1));
    expect(recibirMock).toHaveBeenNthCalledWith(1, { numGuia: 1024 });

    await recibirManual(user, "https://app.ejemplo.test/paquete/1024");
    await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledTimes(2));
    expect(recibirMock).toHaveBeenNthCalledWith(2, { numGuia: 1024 });
  });

  it("R566: lo que no es guía avisa «Código inválido.» por los dos caminos y no llama a la acción", async () => {
    const user = userEvent.setup();
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await escanear(user, "1024abc");
    await vi.waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));
    expect(errorMock).toHaveBeenLastCalledWith("Código inválido.");

    await recibirManual(user, "1024abc");
    await vi.waitFor(() => expect(errorMock).toHaveBeenCalledTimes(2));
    expect(errorMock).toHaveBeenLastCalledWith("Código inválido.");
    expect(recibirMock).not.toHaveBeenCalled();
  });
});

// SLT-158 «Entrada de escaneo para pistola» (R576): de punta a punta, la acción rechaza y la
// tarjeta deja escrito QUÉ se leyó y POR QUÉ falló, hasta que otra lectura acierte.
describe("EscanerRecepcionBodegaCentral — línea de error persistente (SLT-158)", () => {
  it("R576: no_encontrada deja «7777777» y «Orden no encontrada.» en un alert; un acierto lo quita", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValueOnce({ status: "no_encontrada" });
    render(<EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />);

    await recibirManual(user, "7777777");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("7777777");
    expect(alerta).toHaveTextContent("Orden no encontrada.");

    recibirMock.mockResolvedValueOnce({
      status: "ok",
      ordenId: "o1",
      estado: "en_bodega_central",
    });
    await recibirManual(user, "1024");

    await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

// SLT-159 «Escaneo continuo en recepciones y recogidas» — bodega central en el diálogo continuo.
describe("EscanerRecepcionBodegaCentral — diálogo continuo (R580, R590, R592, R594)", () => {
  const OK = { status: "ok", ordenId: "o1", estado: "en_bodega_central" } as const;

  function dialogoContinuo(onRecibida: () => void) {
    return (
      <EscanerModal label="Recibir paquetes" titulo="Recibir paquetes">
        <EscanerRecepcionBodegaCentral modo="continua" onRecibida={onRecibida} />
      </EscanerModal>
    );
  }

  function filasDeLaSesion(): HTMLElement[] {
    return Array.from(screen.getByRole("log", { name: "Lecturas" }).querySelectorAll("li"));
  }

  async function abrirYLeer(user: ReturnType<typeof userEvent.setup>, ...guias: string[]) {
    await user.click(screen.getByRole("button", { name: "Recibir paquetes" }));
    for (const g of guias) await user.type(screen.getByLabelText("Número de guía"), `${g}{Enter}`);
  }

  async function cerrar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }

  it("R580/R592: tres ok llegan a la acción; onRecibida una vez al cerrar y ninguna antes", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue(OK);
    render(dialogoContinuo(onRecibida));

    await abrirYLeer(user, "1024", "2048", "4096");
    await vi.waitFor(() => expect(filasDeLaSesion()[0]).toHaveTextContent("Recibida"));
    expect(recibirMock.mock.calls).toEqual([
      [{ numGuia: 1024 }],
      [{ numGuia: 2048 }],
      [{ numGuia: 4096 }],
    ]);
    expect(onRecibida).not.toHaveBeenCalled();

    await cerrar(user);
    expect(onRecibida).toHaveBeenCalledTimes(1);
  });

  it("R590: ni «Recibida» ni «No encontrada» sacan toast", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValueOnce(OK).mockResolvedValueOnce({ status: "no_encontrada" });
    render(dialogoContinuo(vi.fn()));

    await abrirYLeer(user, "1024", "7777777");
    await vi.waitFor(() => expect(filasDeLaSesion()[0]).toHaveTextContent("No encontrada"));

    expect(successMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("R592: solo no_encontrada y cerrar: onRecibida cero veces", async () => {
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "no_encontrada" });
    render(dialogoContinuo(onRecibida));

    await abrirYLeer(user, "7777777");
    await vi.waitFor(() => expect(filasDeLaSesion()[0]).toHaveTextContent("No encontrada"));
    await cerrar(user);

    expect(onRecibida).not.toHaveBeenCalled();
  });

  it("R594: en el diálogo «Recibir paquete», tras leer por cámara la cámara se apaga y no hay lista", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue(OK);
    render(
      <EscanerModal titulo="Recibir paquete">
        <EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />
      </EscanerModal>,
    );
    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

    await escanear(user, qrDeGuia(1024));

    await vi.waitFor(() => expect(stopMock).toHaveBeenCalled());
    expect(screen.queryByRole("log", { name: "Lecturas" })).toBeNull();
  });
});

// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R927; P7 de Carlos): en `/ordenes`
// el diálogo lleva «Recibir paquete» en la barra de `EscanerModal`; las tarjetas de la bodega
// central (suelta y continua) van sin encabezado y sus regiones conservan el nombre.
describe("EscanerRecepcionBodegaCentral — un solo título por diálogo (SLT-193)", () => {
  it("R927: la guía suelta en el diálogo: un solo título, el de la barra; un solo «Cerrar»", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal titulo="Recibir paquete">
        <EscanerRecepcionBodegaCentral onRecibida={vi.fn()} />
      </EscanerModal>,
    );
    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
    const dialogo = await screen.findByRole("dialog", { name: "Recibir paquete" });

    expect(within(dialogo).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Recibir paquete"]);
    expect(within(dialogo).queryByText("Escanea o ingresa el número de guía")).toBeNull();
    expect(within(dialogo).getByRole("region", { name: "Recepción en bodega central" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Recibir" })).toBeInTheDocument();
    expect(within(dialogo).getAllByRole("button", { name: "Cerrar" })).toHaveLength(1);
  });

  it("R927: la tarjeta continua no pinta encabezado propio; la región conserva el nombre", () => {
    render(<EscanerRecepcionBodegaCentral modo="continua" onRecibida={vi.fn()} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("region", { name: "Recepción continua en bodega central" })).toBeInTheDocument();
  });
});
