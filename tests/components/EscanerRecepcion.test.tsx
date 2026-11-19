// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerRecepcion } from "@/app/(app)/recepcion-satelite/_components/EscanerRecepcion";
import { recibirPorQr } from "@/lib/actions/recepcion-satelite";

// Feature 33 (T13) — recepción por escaneo con la CÁMARA (única entrada: el input
// keyboard-wedge se retiró por pedido humano). Se mockean la Server Action, el
// toast y la lib de cámara (sin hardware en CI): el doble captura el callback de
// decodificación que `start` recibe, para poder simular un escaneo.
vi.mock("@/lib/actions/recepcion-satelite", () => ({
  recibirPorQr: vi.fn(),
  listarRecepcionSatelite: vi.fn(),
}));

const { successMock, errorMock, infoMock, startMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
  infoMock: vi.fn(),
  startMock: vi.fn(),
}));

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

// Mock de la lib de cámara: no hay hardware/media en CI. La instancia expone el
// ciclo de vida (start/stop/clear) para que abrir/cerrar la cámara no falle.
vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

const recibirMock = vi.mocked(recibirPorQr);

beforeEach(() => {
  vi.clearAllMocks();
  startMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

const matchMediaOriginal = window.matchMedia;

/** `true` simula escritorio (ratón, pistola); `false`, un teléfono (táctil). */
function conPuntero(fino: boolean) {
  window.matchMedia = ((consulta: string) => ({
    matches: fino && consulta === "(pointer: fine)",
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (Carlos,
// 2026-11-18): «Por recibir» y «En bodega» tienen UN solo disparador de recibir, «Recibir paquete»,
// que abre la recepción continua de SLT-159. La guía suelta (su tarjeta, su toast por lectura y sus
// pruebas) se quitó: la continua la cubre (misma `recibirPorQr`, mismos motivos, campo y cámara).
// Enmienda R594 y R611 de SLT-159, que pedían las dos entradas juntas.
describe("EscanerRecepcion — un solo disparador de recibir (SLT-202)", () => {
  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
    window.history.replaceState(null, "", "/");
  });

  it("escritorio en «En bodega»: un solo «Recibir paquete», enlace a la continua con desde=en-bodega", () => {
    conPuntero(true);
    window.history.replaceState(null, "", "/recepcion-satelite/en-bodega");
    render(<EscanerRecepcion onRecibida={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Recibir paquete" })).toHaveAttribute(
      "href",
      "/recepcion-satelite/recibir?desde=en-bodega",
    );
    // Ni la guía suelta ni un segundo «Recibir paquetes».
    expect(screen.queryByRole("button", { name: /Recibir paquete/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Recibir paquete/ })).toHaveLength(1);
  });

  it("escritorio en «Por recibir»: el enlace lleva desde=por-recibir", () => {
    conPuntero(true);
    window.history.replaceState(null, "", "/recepcion-satelite/por-recibir");
    render(<EscanerRecepcion onRecibida={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Recibir paquete" })).toHaveAttribute(
      "href",
      "/recepcion-satelite/recibir?desde=por-recibir",
    );
  });

  it("táctil: un solo botón «Recibir paquete» que abre el diálogo continuo, con lista y sin toast", async () => {
    conPuntero(false);
    const user = userEvent.setup();
    const onRecibida = vi.fn();
    recibirMock.mockResolvedValue({ status: "ok", ordenId: "o1" } as never);
    render(<EscanerRecepcion onRecibida={onRecibida} />);

    expect(screen.getAllByRole("button", { name: /Recibir paquete/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
    const dialogo = await screen.findByRole("dialog", { name: "Recibir paquetes" });
    expect(
      within(dialogo).getByRole("region", { name: "Recepción continua en bodega satélite" }),
    ).toBeInTheDocument();

    await user.type(within(dialogo).getByLabelText("Número de guía"), "1024{Enter}");
    await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledWith({ numGuia: 1024 }));
    await vi.waitFor(() =>
      expect(within(dialogo).getByRole("log", { name: "Lecturas" })).toHaveTextContent("Recibida"),
    );
    expect(successMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
    // R592: refresca una vez, al cerrar.
    expect(onRecibida).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Cerrar" }));
    await vi.waitFor(() => expect(onRecibida).toHaveBeenCalledTimes(1));
  });
});

describe("EscanerRecepcion — tarjeta continua (SLT-159, SLT-193)", () => {
  it("R927: la tarjeta continua no pinta encabezado propio; la región conserva el nombre", () => {
    render(<EscanerRecepcion modo="continua" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("region", { name: "Recepción continua en bodega satélite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recibir" })).toBeInTheDocument();
  });

  it("R580: en modo continuo, una lectura llega a recibirPorQr con su numGuia y queda en la lista", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({ status: "ok", ordenId: "o1" } as never);
    render(<EscanerRecepcion modo="continua" />);

    await user.type(screen.getByLabelText("Número de guía"), "1024{Enter}");

    await vi.waitFor(() => expect(recibirMock).toHaveBeenCalledWith({ numGuia: 1024 }));
    await vi.waitFor(() =>
      expect(screen.getByRole("log", { name: "Lecturas" })).toHaveTextContent("Recibida"),
    );
    expect(successMock).not.toHaveBeenCalled();
  });
});

// SLT-159, review B1: con el puntero del servidor (desconocido hasta hidratar) la entrada NO se
// pinta, así no cambia de botón a enlace al hidratar. SLT-202: como ya es el único disparador, el
// HTML del servidor no trae ninguno; aparece al hidratar, ya como enlace o como botón.
describe("EscanerRecepcion — HTML del servidor (SLT-159, B1)", () => {
  it("ningún disparador de recibir en el HTML del servidor, ni botón ni enlace", async () => {
    const { renderToString } = await import("react-dom/server");
    const contenedor = document.createElement("div");
    contenedor.innerHTML = renderToString(<EscanerRecepcion onRecibida={vi.fn()} />);
    document.body.appendChild(contenedor);
    try {
      expect(within(contenedor).queryByRole("button", { name: /Recibir paquete/ })).toBeNull();
      expect(within(contenedor).queryByRole("link", { name: /Recibir paquete/ })).toBeNull();
    } finally {
      contenedor.remove();
    }
  });
});
