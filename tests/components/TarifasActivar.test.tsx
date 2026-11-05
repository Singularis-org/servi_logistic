// @vitest-environment jsdom
// SLT-54 (R6, R7, R16, R18, R19) — el diálogo de activar. Lo decisivo: sin la casilla no se puede activar
// con faltantes, y lo que viaja al servidor es la decisión expresa del maestro.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasActivarDialog } from "@/app/(app)/configuracion/tarifas/_components/TarifasActivarDialog";
import type { FaltantesPorZona } from "@/lib/interfaces/services/ITarifaActivacionService";

const { activarMock, toast } = vi.hoisted(() => ({
  activarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({ activarTarifasNuevas: (i: unknown) => activarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const CON_FALTANTES: FaltantesPorZona[] = [
  {
    zonaId: "z1",
    zonaNombre: "Norte",
    faltantes: [{ concepto: "tienda_flete_rechazo" }],
    usaZona: [{ grupoId: "g1", grupoNombre: "Costa", concepto: "tienda_flete_entregado" }],
  },
  {
    zonaId: "z2",
    zonaNombre: "Sur",
    faltantes: [
      { concepto: "tienda_flete_entregado" },
      { concepto: "tienda_flete_rechazo" },
      { concepto: "mensajero_entregado" },
    ],
    usaZona: [],
  },
];
const SIN_FALTANTES: FaltantesPorZona[] = [{ zonaId: "z1", zonaNombre: "Norte", faltantes: [], usaZona: [] }];
const SOLO_USA_ZONA: FaltantesPorZona[] = [
  {
    zonaId: "z1",
    zonaNombre: "Norte",
    faltantes: [],
    usaZona: [{ grupoId: "g1", grupoNombre: "Costa", concepto: "mensajero_entregado" }],
  },
];

function montar(faltantes: readonly FaltantesPorZona[]) {
  const props = { onCerrar: vi.fn(), onCompletar: vi.fn(), onActivada: vi.fn() };
  render(<TarifasActivarDialog faltantes={faltantes} {...props} />);
  return props;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-54 — activar tarifas nuevas", () => {
  it("R18: con faltantes, activar sigue deshabilitado hasta marcar la casilla, y entonces confirma", async () => {
    activarMock.mockResolvedValue({ status: "ok", activadaAt: new Date() });
    const u = userEvent.setup();
    const props = montar(CON_FALTANTES);

    const activar = screen.getByRole("button", { name: "Activar con lo que falta" });
    expect(activar).toBeDisabled();
    await u.click(activar);
    expect(activarMock).not.toHaveBeenCalled();

    await u.click(screen.getByRole("checkbox", { name: /Entiendo que lo que falta quedará en 0/ }));
    expect(activar).toBeEnabled();
    await u.click(activar);

    await waitFor(() => expect(activarMock).toHaveBeenCalledWith({ confirmaFaltantes: true }));
    await waitFor(() => expect(props.onActivada).toHaveBeenCalledTimes(1));
    expect(props.onCerrar).toHaveBeenCalled();
  });

  it("R18: desmarcar la casilla vuelve a bloquear", async () => {
    const u = userEvent.setup();
    montar(CON_FALTANTES);
    const casilla = screen.getByRole("checkbox");
    await u.click(casilla);
    await u.click(casilla);
    expect(screen.getByRole("button", { name: "Activar con lo que falta" })).toBeDisabled();
  });

  it("R18: sin faltantes no hay casilla, y activar no dice que confirma nada", async () => {
    activarMock.mockResolvedValue({ status: "ok", activadaAt: new Date() });
    const u = userEvent.setup();
    montar(SIN_FALTANTES);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Falta por definir/)).toBeNull();
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));
    await waitFor(() => expect(activarMock).toHaveBeenCalledWith({ confirmaFaltantes: false }));
  });

  it("R18, R19: lista por zona, con el efecto y el aviso literales", () => {
    montar(CON_FALTANTES);

    expect(screen.getByText(/Desde el siguiente cierre, los cobros y pagos usan lo que digitaste/)).toBeInTheDocument();
    expect(screen.getByText("Falta por definir en 2 zonas")).toBeInTheDocument();
    expect(
      screen.getByText("Lo que falta se cobra y se paga en 0. Sin flete por entregado, la API responde «sin tarifa» para esa zona."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin flete por devolución a origen")).toBeInTheDocument();
    expect(
      screen.getByText("Sin flete por entregado, sin flete por devolución a origen y sin pago al mensajero por entregado"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seguir digitando" })).toBeInTheDocument();
  });

  it("R16, R19: lo que solo usa el valor de la zona se informa, sin casilla ni aviso de 0", () => {
    montar(SOLO_USA_ZONA);

    expect(screen.getByText("Grupo Costa: usa el valor de la zona en pago al mensajero por entregado")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/se cobra y se paga en 0/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Completar" })).toBeNull();
  });

  it("R18: «Completar» es un enlace que lleva a esa zona y cierra el diálogo", async () => {
    const u = userEvent.setup();
    const props = montar(CON_FALTANTES);
    const enlaces = screen.getAllByRole("link", { name: "Completar" });

    expect(enlaces).toHaveLength(2);
    expect(enlaces[1]).toHaveAttribute("href", "?zona=z2");
    await u.click(enlaces[1]);

    expect(props.onCompletar).toHaveBeenCalledWith("z2");
    expect(props.onCerrar).toHaveBeenCalled();
    expect(activarMock).not.toHaveBeenCalled();
  });

  it("R7: `ya_activada` no es un error: avisa, cierra y recarga", async () => {
    activarMock.mockResolvedValue({ status: "ya_activada", activadaAt: new Date() });
    const u = userEvent.setup();
    const props = montar(SIN_FALTANTES);
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Las tarifas nuevas ya estaban activadas."));
    expect(toast.error).not.toHaveBeenCalled();
    expect(props.onActivada).toHaveBeenCalledTimes(1);
    expect(props.onCerrar).toHaveBeenCalled();
  });

  it("R6: si el servidor responde otra lista, la pinta y vuelve a pedir la casilla", async () => {
    activarMock.mockResolvedValue({ status: "confirmacion_requerida", faltantes: CON_FALTANTES });
    const u = userEvent.setup();
    const props = montar(SIN_FALTANTES);
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));

    const activar = await screen.findByRole("button", { name: "Activar con lo que falta" });
    expect(activar).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("Falta por definir en 2 zonas")).toBeInTheDocument();
    expect(props.onActivada).not.toHaveBeenCalled();
    expect(props.onCerrar).not.toHaveBeenCalled();
  });

  it("R6: una casilla marcada para otra lista no vale: se desmarca y vuelve a bloquear", async () => {
    activarMock.mockResolvedValue({ status: "confirmacion_requerida", faltantes: CON_FALTANTES.slice(1) });
    const u = userEvent.setup();
    montar(CON_FALTANTES);
    await u.click(screen.getByRole("checkbox"));
    await u.click(screen.getByRole("button", { name: "Activar con lo que falta" }));

    expect(await screen.findByText("Falta por definir en 1 zona")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Activar con lo que falta" })).toBeDisabled();
  });

  it("R5: un rechazo o un fallo deja el diálogo abierto y no da por activado", async () => {
    const u = userEvent.setup();
    const props = montar(SIN_FALTANTES);

    activarMock.mockResolvedValue({ status: "forbidden" });
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Solo el maestro puede activar las tarifas nuevas."));

    activarMock.mockRejectedValue(new Error("red"));
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo activar. Nada cambió: vuelve a intentarlo."));

    expect(props.onActivada).not.toHaveBeenCalled();
    expect(props.onCerrar).not.toHaveBeenCalled();
  });

  it("R58: mientras activa, el botón no admite un segundo envío", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    activarMock.mockImplementation(() => new Promise((r) => (soltar = r)));
    const u = userEvent.setup();
    montar(SIN_FALTANTES);

    const activar = screen.getByRole("button", { name: /Activar tarifas nuevas/ });
    await u.click(activar);
    expect(activar).toBeDisabled();
    await u.click(activar);
    expect(activarMock).toHaveBeenCalledTimes(1);
    soltar({ status: "ok", activadaAt: new Date() });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
