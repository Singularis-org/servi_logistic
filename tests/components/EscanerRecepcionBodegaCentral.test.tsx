// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerRecepcionBodegaCentral } from "@/app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral";
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

describe("EscanerRecepcionBodegaCentral — diálogo continuo (R580, R590, R592)", () => {
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
});

// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R927; P7 de Carlos): en `/ordenes`
// el diálogo lleva «Recibir paquete» en la barra de `EscanerModal`; las tarjetas de la bodega
// central van sin encabezado y sus regiones conservan el nombre.
describe("EscanerRecepcionBodegaCentral — un solo título por diálogo (SLT-193)", () => {
  it("R927: la tarjeta continua no pinta encabezado propio; la región conserva el nombre", () => {
    render(<EscanerRecepcionBodegaCentral modo="continua" onRecibida={vi.fn()} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("region", { name: "Recepción continua en bodega central" })).toBeInTheDocument();
  });
});
