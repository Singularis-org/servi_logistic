// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerModal } from "@/components/shared/EscanerModal";
import { LecturasEscaneo, TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import {
  TEXTOS_RECOGIDA,
  type DesenlaceRecepcion,
  type FilaLectura,
} from "@/lib/utils/sesion-escaneo";

// SLT-159 «Escaneo continuo en recepciones y recogidas» — el diálogo continuo: la tarjeta de
// SLT-158 en modo continuo + la sesión + una acción doble. Textos a mano.

const { startMock, stopMock, decodeCallback, successMock, infoMock, errorMock } = vi.hoisted(
  () => ({
    startMock: vi.fn(),
    stopMock: vi.fn(),
    decodeCallback: { current: null as ((texto: string) => void) | null },
    successMock: vi.fn(),
    infoMock: vi.fn(),
    errorMock: vi.fn(),
  }),
);

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = stopMock;
    clear = vi.fn();
  },
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

const matchMediaOriginal = window.matchMedia;

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

const RESUMEN = { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" };

function dialogo(recibir: (n: number) => Promise<DesenlaceRecepcion>) {
  return (
    <EscanerModal label="Recibir paquetes" titulo="Recibir paquetes">
      <TarjetaEscaneoContinuo
        recibir={recibir}
        titulo="Recibir paquetes"
        descripcion="Escanea las guías una tras otra"
        ariaLabel="Recepción continua"
        submitLabel="Recibir"
      />
    </EscanerModal>
  );
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrir(user: Usuario) {
  await user.click(screen.getByRole("button", { name: "Recibir paquetes" }));
}

async function teclear(user: Usuario, ...guias: string[]) {
  for (const g of guias) await user.type(screen.getByLabelText("Número de guía"), `${g}{Enter}`);
}

function filas(): HTMLElement[] {
  return within(screen.getByRole("log", { name: "Lecturas" })).queryAllByRole("listitem");
}

function contador(rotulo: string): string {
  return screen.getByText(rotulo).parentElement?.textContent ?? "";
}

function precede(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  vi.clearAllMocks();
  decodeCallback.current = null;
  startMock.mockImplementation(
    async (_c: unknown, _o: unknown, onDecode: (texto: string) => void) => {
      decodeCallback.current = onDecode;
    },
  );
  stopMock.mockResolvedValue(undefined);
  conPuntero(true);
});

afterEach(() => {
  cleanup();
  window.matchMedia = matchMediaOriginal;
  vi.useRealTimers();
});

describe("EscaneoContinuo — lecturas seguidas (R580-R582, R584)", () => {
  it("R580: cinco Enter seguidos sin clics: la acción se llama cinco veces y el diálogo sigue abierto", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));
    render(dialogo(recibir));
    await abrir(user);

    await user.keyboard("1024{Enter}2048{Enter}4096{Enter}8192{Enter}16384{Enter}");

    await vi.waitFor(() => expect(recibir).toHaveBeenCalledTimes(5));
    expect(recibir.mock.calls).toEqual([[1024], [2048], [4096], [8192], [16384]]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(filas()).toHaveLength(5);
  });

  it("R581: la más reciente arriba, con destinatario y tienda del resumen y la hora del dispositivo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 16, 17, 42, 8));
    const user = userEvent.setup();
    const recibir = vi
      .fn<(n: number) => Promise<DesenlaceRecepcion>>()
      .mockResolvedValueOnce({ tipo: "recibida" })
      .mockResolvedValueOnce({ tipo: "recibida", resumen: RESUMEN });
    render(dialogo(recibir));
    await abrir(user);

    await teclear(user, "1024", "2048");

    await vi.waitFor(() => expect(filas()[0]).toHaveTextContent("Recibida"));
    expect(filas()[0]).toHaveTextContent("2048");
    expect(filas()[0]).toHaveTextContent("Ana Quesada Mora · Tienda Prueba Norte · 17:42:08");
    await vi.waitFor(() => expect(filas()[1]).toHaveTextContent("Recibida"));
    expect(filas()[1]).toHaveTextContent("1024");
    expect(filas()[1]).toHaveTextContent("— · — · 17:42:08");
  });

  it("R582: con la acción de 1024 pendiente, 2048 también aparece y las dos dicen «Recibiendo…»", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(() => new Promise<DesenlaceRecepcion>(() => {}));
    render(dialogo(recibir));
    await abrir(user);

    await teclear(user, "1024", "2048");

    expect(filas()).toHaveLength(2);
    expect(filas()[0]).toHaveTextContent("2048");
    expect(filas()[0]).toHaveTextContent("Recibiendo…");
    expect(filas()[1]).toHaveTextContent("Recibiendo…");
    expect(recibir).toHaveBeenCalledTimes(1);
  });

  it("R584: «1024abc» queda como «Código inválido» y la acción no se llama", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));
    render(dialogo(recibir));
    await abrir(user);

    await teclear(user, "1024abc");

    await vi.waitFor(() => expect(filas()[0]).toHaveTextContent("Código inválido"));
    expect(filas()[0]).toHaveTextContent("1024abc");
    expect(recibir).not.toHaveBeenCalled();
    expect(contador("Recibidas")).toBe("Recibidas0");
    expect(contador("Repetidas")).toBe("Repetidas0");
    expect(contador("No encontradas")).toBe("No encontradas0");
  });

  it("R580/R588: por cámara, dos guías seguidas sin cerrar la cámara", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));
    render(dialogo(recibir));
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
    await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());

    await act(async () => decodeCallback.current?.("https://ejemplo.app/paquete/1024"));
    await act(async () => decodeCallback.current?.("2048"));

    await vi.waitFor(() => expect(recibir.mock.calls).toEqual([[1024], [2048]]));
    expect(stopMock).not.toHaveBeenCalled();
  });
});

describe("EscaneoContinuo — estados de la tabla (R583)", () => {
  const hora = new Date(2026, 10, 16, 9, 0, 0);
  const fila = (id: number, estado: FilaLectura["estado"]): FilaLectura => ({
    id,
    hora,
    leido: String(1000 + id),
    numGuia: 1000 + id,
    estado,
  });

  it("Recibida, Ya recibida, No encontrada y No se pudo recibir con su motivo y «Reintentar»", async () => {
    const user = userEvent.setup();
    const onReintentar = vi.fn();
    render(
      <LecturasEscaneo
        variante="tabla"
        onReintentar={onReintentar}
        filas={[
          fila(1, { tipo: "recibida", resumen: RESUMEN }),
          fila(2, { tipo: "ya_recibida" }),
          fila(3, { tipo: "no_encontrada" }),
          fila(4, { tipo: "no_se_pudo", motivo: 'No se puede recibir: la orden está en "Entregada".' }),
        ]}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((c) => c.textContent),
    ).toEqual(["Hora", "Guía", "Destinatario", "Tienda", "Estado"]);
    const [, r1, r2, r3, r4] = screen.getAllByRole("row");
    expect(r1).toHaveTextContent("09:00:001001Ana Quesada MoraTienda Prueba NorteRecibida");
    expect(r2).toHaveTextContent("1002——Ya recibida");
    expect(r3).toHaveTextContent("1003——No encontrada");
    expect(r4).toHaveTextContent('No se pudo recibirNo se puede recibir: la orden está en "Entregada".');

    const reintentar = within(r4).getByRole("button", { name: "Reintentar" });
    expect(reintentar.className).toContain("h-11");
    await user.click(reintentar);
    expect(onReintentar).toHaveBeenCalledWith(4);
    expect(screen.getAllByRole("button", { name: "Reintentar" })).toHaveLength(1);
  });
});

describe("EscaneoContinuo — sin toasts, sesión y orden (R590, R591, R593)", () => {
  it("R590: tras «Recibida» y «No encontrada» no sale ningún toast", async () => {
    const user = userEvent.setup();
    const recibir = vi
      .fn<(n: number) => Promise<DesenlaceRecepcion>>()
      .mockResolvedValueOnce({ tipo: "recibida" })
      .mockResolvedValueOnce({ tipo: "no_encontrada" });
    render(dialogo(recibir));
    await abrir(user);

    await teclear(user, "1024", "7777777");

    await vi.waitFor(() => expect(filas()[0]).toHaveTextContent("No encontrada"));
    expect(successMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("R591: leer 1024, cerrar y reabrir deja la lista vacía y los contadores en 0", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));
    render(dialogo(recibir));
    await abrir(user);
    await teclear(user, "1024");
    await vi.waitFor(() => expect(contador("Recibidas")).toBe("Recibidas1"));

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await abrir(user);

    expect(filas()).toHaveLength(0);
    expect(contador("Recibidas")).toBe("Recibidas0");
    expect(contador("Repetidas")).toBe("Repetidas0");
    expect(contador("No encontradas")).toBe("No encontradas0");
  });

  it("R593: táctil: cámara, campo y lista; fino: campo, cámara y lista", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));

    conPuntero(false);
    const { unmount } = render(dialogo(recibir));
    await abrir(user);
    let camara = screen.getByRole("button", { name: "Escanear con cámara" });
    let campo = screen.getByLabelText("Número de guía");
    let lista = screen.getByRole("log", { name: "Lecturas" });
    expect(precede(camara, campo)).toBe(true);
    expect(precede(campo, lista)).toBe(true);
    expect(precede(campo, screen.getByText("Recibidas"))).toBe(true);
    unmount();

    conPuntero(true);
    render(dialogo(recibir));
    await abrir(user);
    camara = screen.getByRole("button", { name: "Escanear con cámara" });
    campo = screen.getByLabelText("Número de guía");
    lista = screen.getByRole("log", { name: "Lecturas" });
    expect(precede(campo, camara)).toBe(true);
    expect(precede(camara, lista)).toBe(true);
  });
});

// SLT-168 «Escaneo continuo en las recogidas del mensajero» — los textos por superficie.
describe("EscaneoContinuo — textos por superficie (R597, R830, R834)", () => {
  it("R834: sin `textos` pinta «Recibidas» y «Recibida», no el verbo de las recogidas", async () => {
    const user = userEvent.setup();
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));
    render(dialogo(recibir));
    await abrir(user);
    await teclear(user, "1024");

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recibida")).toBeInTheDocument());
    expect(contador("Recibidas")).toBe("Recibidas1");
    expect(screen.queryByText("Recogidas")).toBeNull();
    expect(screen.queryByText("Recogida")).toBeNull();
  });

  it("R597/R830: con los textos de M1, «Recogiendo…», «Recogida» y el contador «Recogidas»", async () => {
    const user = userEvent.setup();
    let responder: (d: DesenlaceRecepcion) => void = () => {};
    const recibir = vi.fn(
      () => new Promise<DesenlaceRecepcion>((r) => { responder = r; }),
    );
    render(
      <EscanerModal label="Recoger" titulo="Recoger paquete">
        <TarjetaEscaneoContinuo
          recibir={recibir}
          titulo="Recoger paquete"
          descripcion="Escanea o ingresa el número de guía"
          ariaLabel="Recoger por número de guía o escaneo"
          submitLabel="Recoger"
          textos={TEXTOS_RECOGIDA}
        />
      </EscanerModal>,
    );
    await user.click(screen.getByRole("button", { name: "Recoger" }));
    await teclear(user, "1024");

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogiendo…")).toBeInTheDocument());
    await act(async () => responder({ tipo: "recibida" }));
    expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument();
    expect(contador("Recogidas")).toBe("Recogidas1");
    expect(screen.queryByText("Recibidas")).toBeNull();
  });
});
