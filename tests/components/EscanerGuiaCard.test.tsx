// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EscanerGuiaCard, type ResultadoLectura } from "@/components/shared/EscanerGuiaCard";
import { useEntradaEscaneo, type ProcesarLectura } from "@/hooks/useEntradaEscaneo";
import { CLAVE_SONIDO } from "@/lib/audio/preferencia-sonido";
import { reiniciarAudioParaTests } from "@/lib/audio/tono-notificacion";

// SLT-158 «Entrada de escaneo para pistola» — R570, R572-R579 sobre la tarjeta compartida.
// La pistola 2D es un teclado rápido que pulsa Enter: aquí se simula tecleando y pulsando
// Enter en el campo. El puntero se dobla por test con `matchMedia` (D1) y la cámara con un
// doble de html5-qrcode que captura el callback de decodificación.

const { startMock, decodeCallback } = vi.hoisted(() => ({
  startMock: vi.fn(),
  decodeCallback: { current: null as ((texto: string) => void) | null },
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
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

const ACIERTO: ResultadoLectura = { tipo: "acierto" };

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

/** Promesa que el test resuelve a mano: la lectura que la superficie aún procesa. */
function diferida() {
  let resolver: (r: ResultadoLectura) => void = () => {};
  const promesa = new Promise<ResultadoLectura>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function tarjeta(
  onSubmit: (v: string) => ResultadoLectura | Promise<ResultadoLectura>,
  onDecoded: (t: string) => ResultadoLectura | Promise<ResultadoLectura> = () => ACIERTO,
) {
  return (
    <EscanerGuiaCard
      titulo="Recibir paquete"
      descripcion="Escanea o ingresa el número de guía"
      onDecoded={onDecoded}
      manual={{ onSubmit, submitLabel: "Recibir" }}
    />
  );
}

function campo(): HTMLInputElement {
  return screen.getByLabelText("Número de guía") as HTMLInputElement;
}

function botonCamara(): HTMLElement {
  return screen.getByRole("button", { name: "Escanear con cámara" });
}

/** `true` si `a` va antes que `b` en el documento. */
function precede(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  decodeCallback.current = null;
  startMock.mockImplementation(
    async (_c: unknown, _o: unknown, onDecode: (texto: string) => void) => {
      decodeCallback.current = onDecode;
    },
  );
  conPuntero(true);
});

afterEach(() => {
  cleanup();
  window.matchMedia = matchMediaOriginal;
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  reiniciarAudioParaTests();
});

describe("R570 — orden según el puntero", () => {
  it("puntero fino: el campo va ARRIBA de la cámara, con el separador «o» en medio", () => {
    render(tarjeta(() => ACIERTO));

    expect(precede(campo(), screen.getByText("o"))).toBe(true);
    expect(precede(screen.getByText("o"), botonCamara())).toBe(true);
    expect(campo()).toHaveAttribute("placeholder", "Ej. 1024");
    // La nota de la etiqueta es del teléfono (táctil), no del escritorio.
    expect(screen.queryByText("Lee el QR o el código de barras de la etiqueta.")).toBeNull();
  });

  it("puntero táctil: la cámara va ARRIBA y el campo debajo, con la nota bajo el botón", () => {
    conPuntero(false);
    render(tarjeta(() => ACIERTO));

    expect(precede(botonCamara(), screen.getByText("o"))).toBe(true);
    expect(precede(screen.getByText("o"), campo())).toBe(true);
    const nota = screen.getByText("Lee el QR o el código de barras de la etiqueta.");
    expect(precede(screen.getByRole("button", { name: "Recibir" }), nota)).toBe(true);
  });
});

describe("R572 — «Lista para la pistola» solo con el foco en el campo", () => {
  it("con foco aparece; sin foco, no está", async () => {
    const user = userEvent.setup();
    render(tarjeta(() => ACIERTO));

    expect(screen.queryByText("Lista para la pistola")).toBeNull();
    await user.click(campo());
    expect(screen.getByText("Lista para la pistola")).toBeInTheDocument();

    act(() => campo().blur());
    expect(screen.queryByText("Lista para la pistola")).toBeNull();
  });
});

describe("R573 — el campo no se deshabilita mientras se procesa", () => {
  it("con la lectura pendiente, el campo no tiene `disabled` y conserva el foco", async () => {
    const user = userEvent.setup();
    const { promesa } = diferida();
    const onSubmit = vi.fn(() => promesa);
    render(tarjeta(onSubmit));

    await user.type(campo(), "1024{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("1024");
    expect(campo()).not.toBeDisabled();
    expect(document.activeElement).toBe(campo());
  });
});

describe("R574 — las lecturas que llegan mientras otra se procesa esperan en cola", () => {
  it("tres Enter seguidos salen en orden, de a una, sin perder ni juntar ninguna", async () => {
    const user = userEvent.setup();
    const pendientes: Array<(r: ResultadoLectura) => void> = [];
    const onSubmit = vi.fn<(v: string) => Promise<ResultadoLectura>>(() => {
      const { promesa, resolver } = diferida();
      pendientes.push(resolver);
      return promesa;
    });
    render(tarjeta(onSubmit));

    await user.type(campo(), "1024{Enter}");
    await user.type(campo(), "2048{Enter}");
    await user.type(campo(), "4096{Enter}");

    // La primera está en curso; las otras dos esperan.
    expect(onSubmit.mock.calls.map((c) => c[0])).toEqual(["1024"]);

    await act(async () => pendientes[0](ACIERTO));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls.map((c) => c[0])).toEqual(["1024", "2048"]);

    await act(async () => pendientes[1](ACIERTO));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    await act(async () => pendientes[2](ACIERTO));

    expect(onSubmit.mock.calls.map((c) => c[0])).toEqual(["1024", "2048", "4096"]);
    expect(onSubmit.mock.calls.map((c) => c[0])).not.toContain("10242048");
  });

  it("una lectura de la cámara también espera a la del campo en curso", async () => {
    const user = userEvent.setup();
    const { promesa, resolver } = diferida();
    const onSubmit = vi.fn(() => promesa);
    const onDecoded = vi.fn(() => ACIERTO);
    render(tarjeta(onSubmit, onDecoded));

    await user.type(campo(), "1024{Enter}");
    await user.click(botonCamara());
    await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
    await act(async () => decodeCallback.current?.("2048"));

    expect(onDecoded).not.toHaveBeenCalled();
    await act(async () => resolver(ACIERTO));
    await vi.waitFor(() => expect(onDecoded).toHaveBeenCalledWith("2048"));
  });
});

describe("R575 — el campo se vacía al enviar, acierte o falle", () => {
  it("tras un acierto y tras un error, el valor del campo es \"\"", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(v: string) => ResultadoLectura>()
      .mockReturnValueOnce(ACIERTO)
      .mockReturnValueOnce({ tipo: "error", motivo: "Orden no encontrada." });
    render(tarjeta(onSubmit));

    await user.type(campo(), "1024{Enter}");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(campo()).toHaveValue("");

    await user.type(campo(), "7777777{Enter}");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(campo()).toHaveValue("");
  });
});

describe("R576 — el último error queda escrito hasta que otra lectura acierte", () => {
  it("rechazo: alert con lo leído y el motivo; tras un acierto, no hay alert", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(
      (v: string): ResultadoLectura =>
        v === "7777777" ? { tipo: "error", motivo: "Orden no encontrada." } : ACIERTO,
    );
    render(tarjeta(onSubmit));

    await user.type(campo(), "7777777{Enter}");
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("7777777");
    expect(alerta).toHaveTextContent("Orden no encontrada.");

    await user.type(campo(), "1024{Enter}");
    await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("si la superficie lanza en vez de responder, la lectura cuenta como error y la cola sigue", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(v: string) => Promise<ResultadoLectura>>()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce(ACIERTO);
    render(tarjeta(onSubmit));

    await user.type(campo(), "1024{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("1024");

    await user.type(campo(), "2048{Enter}");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith("2048"));
  });
});

describe("R577 — tono de la lectura según la preferencia de sonido", () => {
  let osciladores = 0;

  beforeEach(() => {
    osciladores = 0;
    reiniciarAudioParaTests();
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        currentTime = 0;
        destination = {};
        resume = () => Promise.resolve();
        createOscillator = () => {
          osciladores += 1;
          return {
            type: "",
            frequency: { value: 0 },
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
        };
        createGain = () => ({
          gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
          connect: () => {},
        });
      },
    );
  });

  it("con la preferencia desactivada no se crea ningún oscilador", async () => {
    window.localStorage.setItem(CLAVE_SONIDO, "off");
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => ACIERTO);
    render(tarjeta(onSubmit));

    await user.type(campo(), "1024{Enter}");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await act(async () => {});

    expect(osciladores).toBe(0);
  });

  it("control: con la preferencia activada, la lectura SÍ suena", async () => {
    const user = userEvent.setup();
    render(tarjeta(() => ACIERTO));

    await user.type(campo(), "1024{Enter}");

    await vi.waitFor(() => expect(osciladores).toBeGreaterThan(0));
  });
});

describe("R578 — el campo marca el resultado un momento y vuelve a su estado normal", () => {
  it("acierto y error se marcan con `data-resultado` y la marca se va al pasar su duración", async () => {
    vi.useFakeTimers();
    const onSubmit = vi
      .fn<(v: string) => ResultadoLectura>()
      .mockReturnValueOnce(ACIERTO)
      .mockReturnValueOnce({ tipo: "error", motivo: "Orden no encontrada." });
    render(tarjeta(onSubmit));

    fireEvent.change(campo(), { target: { value: "1024" } });
    fireEvent.submit(campo().form as HTMLFormElement);
    await act(async () => {});
    expect(campo()).toHaveAttribute("data-resultado", "acierto");

    fireEvent.change(campo(), { target: { value: "7777777" } });
    fireEvent.submit(campo().form as HTMLFormElement);
    await act(async () => {});
    expect(campo()).toHaveAttribute("data-resultado", "error");

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(campo()).not.toHaveAttribute("data-resultado");
  });
});

describe("R579 — tras la cámara, el foco vuelve al campo (puntero fino)", () => {
  it("la cámara entrega la lectura, se cierra y el campo es el elemento activo", async () => {
    const user = userEvent.setup();
    const onDecoded = vi.fn(() => ACIERTO);
    render(tarjeta(() => ACIERTO, onDecoded));

    await user.click(botonCamara());
    await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
    await act(async () => decodeCallback.current?.("1024"));

    await vi.waitFor(() => expect(onDecoded).toHaveBeenCalledWith("1024"));
    // La cámara se cerró: vuelve el botón de abrirla.
    expect(botonCamara()).toBeInTheDocument();
    await vi.waitFor(() => expect(document.activeElement).toBe(campo()));
  });
});

describe("R579 — en táctil el foco NO vuelve al campo (D1)", () => {
  it("tras una lectura de la cámara, el campo no es el elemento activo", async () => {
    conPuntero(false);
    const user = userEvent.setup();
    const onDecoded = vi.fn(() => ACIERTO);
    render(tarjeta(() => ACIERTO, onDecoded));

    await user.click(botonCamara());
    await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
    await act(async () => decodeCallback.current?.("1024"));

    await vi.waitFor(() => expect(onDecoded).toHaveBeenCalledWith("1024"));
    // La marca del resultado ya se pintó: la lectura terminó entera antes de mirar el foco.
    await vi.waitFor(() => expect(campo()).toHaveAttribute("data-resultado", "acierto"));
    // En el teléfono, enfocar el campo abriría el teclado sobre el visor.
    expect(document.activeElement).not.toBe(campo());
  });
});

// Review de SLT-158, M1: lo que pasa DESPUÉS de procesar tampoco detiene la cola.
describe("la cola no se detiene por una lectura mal resuelta", () => {
  it("si la superficie devuelve algo que no es un resultado, cuenta como error y la siguiente sale", async () => {
    const user = userEvent.setup();
    let soltar: () => void = () => {};
    const onSubmit = vi
      .fn<(v: string) => Promise<ResultadoLectura>>()
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            soltar = () => res(undefined as unknown as ResultadoLectura);
          }),
      )
      // La segunda queda pendiente: así la línea de error de la primera sigue a la vista.
      .mockImplementationOnce(() => new Promise<ResultadoLectura>(() => {}));
    render(tarjeta(onSubmit));

    await user.type(campo(), "1024{Enter}");
    await user.type(campo(), "2048{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => soltar());

    // La primera queda como error, con lo leído en la línea; la segunda sale igual.
    expect(await screen.findByRole("alert")).toHaveTextContent("1024");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenNthCalledWith(2, "2048"));
  });

  it("si `alTerminar` lanza, la lectura en cola se procesa igual", async () => {
    const procesar = vi.fn<ProcesarLectura>(() => ACIERTO);
    const { result } = renderHook(() =>
      useEntradaEscaneo({
        procesar,
        campoRef: { current: null },
        enfocarTrasLectura: false,
        alTerminar: () => {
          throw new Error("el tono falló");
        },
        motivoFalloInesperado: "No se pudo.",
      }),
    );

    act(() => {
      result.current.recibirLectura("1024", "camara");
      result.current.recibirLectura("2048", "camara");
    });

    await vi.waitFor(() => expect(procesar).toHaveBeenCalledTimes(2));
    expect(procesar.mock.calls.map((c) => c[0])).toEqual(["1024", "2048"]);
  });
});
