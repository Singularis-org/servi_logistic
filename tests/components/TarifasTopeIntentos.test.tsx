// @vitest-environment jsdom
// SLT-77 (R12, R13, R15, R16, R17; design §4.2) — la sección de los intentos de entrega. Textos escritos a mano,
// no leídos de `TEXTOS`: comparar contra la constante que los genera siempre da verde.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasTopeIntentos } from "@/app/(app)/configuracion/tarifas/_components/TarifasTopeIntentos";

const { guardarMock, refreshMock, toast } = vi.hoisted(() => ({
  guardarMock: vi.fn(),
  refreshMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/lib/actions/tarifas", () => ({ guardarTopeIntentos: (i: unknown) => guardarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const AYUDA =
  "Cuántos intentos se hacen antes de pasar una orden a rechazo. Rige al guardar, para todas las órdenes sin terminar.";
const AVISO =
  "Guardar no rechaza ni cobra nada. Pero las novedades que ya alcancen este número se rechazan solas, sin más clics, unas en la siguiente corrida automática y otras al vencer su plazo, y ese rechazo genera cobro. Las órdenes en bodega que ya lo alcancen no se podrán asignar.";
const ERROR = "No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo.";

const seccion = () => screen.getByRole("region", { name: "Intentos de entrega" });
const control = () => within(seccion()).getByRole("combobox", { name: "Intentos de entrega" });
const guardar = () => within(seccion()).getByRole("button", { name: "Guardar" });

async function elegir(u: ReturnType<typeof userEvent.setup>, valor: string) {
  await u.click(control());
  await screen.findAllByRole("option");
  await u.click(screen.getByRole("option", { name: valor }));
  await waitFor(() => expect(control()).toHaveTextContent(valor));
}

beforeEach(() => {
  vi.clearAllMocks();
  guardarMock.mockResolvedValue({ status: "ok", tope: 2 });
});
afterEach(() => cleanup());

describe("R12 — el maestro", () => {
  it("ve el título, la ayuda, el vigente, y un botón de guardar", () => {
    render(<TarifasTopeIntentos tope={4} puedeEscribir />);
    expect(within(seccion()).getByRole("heading", { level: 2, name: "Intentos de entrega" })).toBeInTheDocument();
    expect(within(seccion()).getByText(AYUDA)).toBeInTheDocument();
    expect(control()).toHaveTextContent("4");
    expect(guardar()).toBeInTheDocument();
  });

  it("elige de 1 a 10, ni uno más ni uno menos", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await u.click(control());
    const opciones = await screen.findAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });

  it("guarda el número elegido, sin nombrar empresa, avisa y recarga", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());

    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    expect(guardarMock).toHaveBeenCalledWith({ tope: 2 });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Intentos de entrega guardados."));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("no ofrece guardar lo que ya rige", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    expect(guardar()).toBeDisabled();
    await elegir(u, "5");
    expect(guardar()).toBeEnabled();
    await elegir(u, "3");
    expect(guardar()).toBeDisabled();
  });

  it("mientras guarda no se puede cambiar el valor ni volver a pulsar", async () => {
    let responder: (r: unknown) => void = () => undefined;
    guardarMock.mockReturnValue(new Promise((res) => (responder = res)));
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());

    await waitFor(() => expect(control()).toBeDisabled());
    expect(guardar()).toBeDisabled();
    responder({ status: "ok", tope: 2 });
    await waitFor(() => expect(control()).toBeEnabled());
  });
});

describe("R13 — el admin", () => {
  it("ve el vigente y quién lo cambia, sin control ni botón", () => {
    render(<TarifasTopeIntentos tope={6} puedeEscribir={false} />);
    expect(within(seccion()).getByRole("heading", { name: "Intentos de entrega" })).toBeInTheDocument();
    expect(within(seccion()).getByText("6")).toBeInTheDocument();
    expect(within(seccion()).getByText("Lo cambia el maestro.")).toBeInTheDocument();
    expect(within(seccion()).queryByRole("combobox")).toBeNull();
    expect(within(seccion()).queryByRole("button")).toBeNull();
  });

  it("el maestro no ve «Lo cambia el maestro.»", () => {
    render(<TarifasTopeIntentos tope={6} puedeEscribir />);
    expect(screen.queryByText("Lo cambia el maestro.")).toBeNull();
  });
});

describe("R15, R16 — el aviso al bajar", () => {
  it("R15: al elegir menos que lo guardado se ve, ANTES de guardar", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");

    expect(within(seccion()).getByText(AVISO)).toBeVisible();
    expect(guardarMock).not.toHaveBeenCalled();
    // Quien tabula hasta el botón también lo oye.
    const aviso = within(seccion()).getByRole("alert");
    expect(aviso).toHaveTextContent(AVISO);
    expect(guardar()).toHaveAccessibleDescription(AVISO);
  });

  it("R15: compara contra lo guardado: de 5 a 4 también avisa, aunque 4 sea mayor que 3", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={5} puedeEscribir />);
    await elegir(u, "4");
    expect(within(seccion()).getByText(AVISO)).toBeVisible();
  });

  it("R16: sin elegir nada, no se ve", () => {
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("R16: al elegir más que lo guardado, no se ve", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "4");
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("R16: al volver al guardado, desaparece", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    expect(screen.getByText(AVISO)).toBeVisible();
    await elegir(u, "3");
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("R16: guardado el valor menor, ya no es una bajada y desaparece, aunque la recarga no haya llegado", async () => {
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());

    await waitFor(() => expect(screen.queryByText(AVISO)).toBeNull());
    expect(control()).toHaveTextContent("2");
    expect(guardar()).toBeDisabled();
  });

  it("R13: el admin no lo ve nunca", () => {
    render(<TarifasTopeIntentos tope={1} puedeEscribir={false} />);
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});

describe("Una recarga trae otro valor", () => {
  it("sin nada elegido, la sección lo sigue", () => {
    const { rerender } = render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    rerender(<TarifasTopeIntentos tope={5} puedeEscribir />);
    expect(control()).toHaveTextContent("5");
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("R15, R17: lo elegido sin guardar se conserva, y el aviso se decide contra el valor nuevo", async () => {
    const u = userEvent.setup();
    const { rerender } = render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "4");
    expect(screen.queryByText(AVISO)).toBeNull();

    rerender(<TarifasTopeIntentos tope={5} puedeEscribir />);
    expect(control()).toHaveTextContent("4");
    expect(screen.getByText(AVISO)).toBeVisible();
  });
});

describe("R17 — si guardar falla", () => {
  it.each([
    ["el servidor responde error", () => guardarMock.mockResolvedValue({ status: "error" }), ERROR],
    ["la sesión expiró", () => guardarMock.mockResolvedValue({ status: "unauthenticated" }), ERROR],
    ["el servidor rechaza el valor", () => guardarMock.mockResolvedValue({ status: "validation_error", fieldErrors: {} }), ERROR],
    ["la llamada revienta", () => guardarMock.mockRejectedValue(new Error("red")), ERROR],
    ["ya no es maestro", () => guardarMock.mockResolvedValue({ status: "forbidden" }), "No tienes permiso para cambiar este valor."],
  ])("%s: lo dice y conserva el valor elegido, con su aviso", async (_caso, preparar, mensaje) => {
    preparar();
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());

    expect(await within(seccion()).findByText(mensaje)).toBeVisible();
    expect(control()).toHaveTextContent("2");
    expect(control()).toBeEnabled();
    expect(screen.getByText(AVISO)).toBeVisible();
    expect(guardar()).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("reintentar manda lo elegido y limpia el error", async () => {
    guardarMock.mockResolvedValueOnce({ status: "error" });
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());
    await within(seccion()).findByText(ERROR);

    await u.click(guardar());
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(2));
    expect(guardarMock).toHaveBeenLastCalledWith({ tope: 2 });
    await waitFor(() => expect(screen.queryByText(ERROR)).toBeNull());
  });

  it("elegir otro valor limpia el error", async () => {
    guardarMock.mockResolvedValueOnce({ status: "error" });
    const u = userEvent.setup();
    render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());
    await within(seccion()).findByText(ERROR);
    await elegir(u, "4");
    expect(screen.queryByText(ERROR)).toBeNull();
  });
});

describe("R17 — lo que no pueden decir sus textos", () => {
  async function todosLosTextos(): Promise<string> {
    guardarMock.mockResolvedValue({ status: "error" });
    const u = userEvent.setup();
    const { container } = render(<TarifasTopeIntentos tope={3} puedeEscribir />);
    await elegir(u, "2");
    await u.click(guardar());
    await within(seccion()).findByText(ERROR);
    const maestro = container.textContent ?? "";
    cleanup();
    const solo = render(<TarifasTopeIntentos tope={3} puedeEscribir={false} />);
    return `${maestro} ${solo.container.textContent ?? ""}`;
  }

  it("sin siglas, sin nombres de columna y sin afirmar que viene de una ley", async () => {
    const texto = await todosLosTextos();
    expect(texto).toContain("Cuántos intentos"); // el barrido leyó algo
    expect(texto).toContain("Lo cambia el maestro.");
    expect(texto).not.toMatch(/\b[A-ZÁÉÍÓÚÑ]{2,}\b/);
    expect(texto).not.toMatch(/[a-z]_[a-z]|tope_|organizacion/i);
    expect(texto).not.toMatch(/\bley\b|legal/i);
  });
});
