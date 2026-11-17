// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerRecepcionBodegaCentral } from "@/app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral";
import { RecepcionContinuaPagina } from "@/components/shared/RecepcionContinuaPagina";
import { recibirEnBodegaCentralPorQr } from "@/lib/actions/recepcion-bodega-central";

// SLT-159 «Escaneo continuo en recepciones y recogidas» (DC5) — la página «Recibir paquetes» de
// escritorio (R610, R613, R615). La de C1 con su acción doblada; textos a mano.

const { pushMock, refreshMock, startMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  startMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => "/ordenes/recibir",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button type="button">Salir</button>,
}));
vi.mock("@/lib/actions/recepcion-bodega-central", () => ({
  recibirEnBodegaCentralPorQr: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
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

const recibirMock = vi.mocked(recibirEnBodegaCentralPorQr);
const OK = { status: "ok", ordenId: "o1", estado: "en_bodega_central" } as const;

async function leer(user: ReturnType<typeof userEvent.setup>, guia: string) {
  await user.type(screen.getByLabelText("Escanea la guía con la pistola"), `${guia}{Enter}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  startMock.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("RecepcionContinuaPagina — la página de C1 (R610)", () => {
  it("título, nombre de la recepción, campo, ayuda, cámara y «Terminar recepción (n)»", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue(OK);
    render(<EscanerRecepcionBodegaCentral modo="pagina" />);

    expect(screen.getByRole("heading", { name: "Recibir paquetes" })).toBeInTheDocument();
    expect(screen.getByText("Bodega central")).toBeInTheDocument();
    expect(screen.getByLabelText("Escanea la guía con la pistola")).toHaveAttribute(
      "placeholder",
      "Listo para leer…",
    );
    expect(
      screen.getByText(
        "El campo vuelve a estar listo después de cada lectura. También acepta el QR de la etiqueta.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminar recepción (0)" })).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Lecturas" })).toBeInTheDocument();
    expect(screen.getByText("Recibidas")).toBeInTheDocument();
    expect(screen.getByText("Repetidas")).toBeInTheDocument();
    expect(screen.getByText("No encontradas")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
    expect(screen.getByRole("region", { name: "Visor de cámara QR" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar cámara" }));
    expect(screen.queryByRole("region", { name: "Visor de cámara QR" })).toBeNull();
    expect(screen.getByRole("button", { name: "Escanear con cámara" })).toBeInTheDocument();

    await leer(user, "1024");
    expect(
      await screen.findByRole("button", { name: "Terminar recepción (1)" }),
    ).toBeInTheDocument();
    expect(recibirMock).toHaveBeenCalledWith({ numGuia: 1024 });
  });
});

describe("RecepcionContinuaPagina — línea de estado (R615)", () => {
  it("«Recibida» con resumen nombra al destinatario", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({
      ...OK,
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
    render(<EscanerRecepcionBodegaCentral modo="pagina" />);

    await leer(user, "1024");

    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Guía 1024 recibida · Ana Quesada Mora"),
    );
  });

  it("«Recibida» sin resumen, solo la guía", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue(OK);
    render(<EscanerRecepcionBodegaCentral modo="pagina" />);

    await leer(user, "1024");

    await vi.waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Guía 1024 recibida"),
    );
  });

  it("«No encontrada» de 7777777", async () => {
    const user = userEvent.setup();
    recibirMock.mockResolvedValue({ status: "no_encontrada" });
    render(<EscanerRecepcionBodegaCentral modo="pagina" />);

    await leer(user, "7777777");

    await vi.waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Guía 7777777 · No encontrada"),
    );
  });
});

describe("RecepcionContinuaPagina — Terminar recepción (R613)", () => {
  it("«Terminar recepción (2)» vuelve a la pantalla de origen y refresca una vez", async () => {
    const user = userEvent.setup();
    render(
      <RecepcionContinuaPagina
        recibir={async () => ({ tipo: "recibida" })}
        volverA="/recepcion-satelite/en-bodega"
        nombreRecepcion="Bodega satélite"
      />,
    );

    await leer(user, "1024");
    await leer(user, "2048");
    await user.click(await screen.findByRole("button", { name: "Terminar recepción (2)" }));

    expect(pushMock).toHaveBeenCalledWith("/recepcion-satelite/en-bodega");
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
