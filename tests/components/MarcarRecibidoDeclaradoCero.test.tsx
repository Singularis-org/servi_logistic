// @vitest-environment jsdom
//
// SLT-96 «Consolidación de ₡0 no se puede marcar recibida» (R10-R13) — el diálogo compartido de
// «Marcar recibido» con lo declarado en 0. El 0 se admite SOLO ahí; con lo declarado distinto de
// 0 el botón sigue apagado con el monto en 0. La regla la decide el servidor: aquí se prueba que
// la pantalla la refleja y que pinta su rechazo.
//
// Los textos esperados van LITERALES: son el contrato con el humano, no se leen de la fuente que
// los genera.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";


import {
  MarcarRecibidoDialog,
  type MarcarRecibidoCampos,
} from "@/components/shared/conciliacion/MarcarRecibidoDialog";
import type { MarcaConciliacionActionResult } from "@/lib/actions/conciliacion-satelites";

const AVISO_CON_CERO = "Escribe un monto válido, de cero o más y con dos decimales como máximo.";
const AVISO_MAYOR_QUE_CERO =
  "Escribe un monto válido, mayor que cero y con dos decimales como máximo.";
const MENSAJE_SERVIDOR = "Solo se puede registrar 0 cuando lo declarado es 0.";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type OnMarcar = (c: MarcarRecibidoCampos) => Promise<MarcaConciliacionActionResult>;

function montar({
  declarado,
  montoActual,
  onMarcar = vi.fn<OnMarcar>().mockResolvedValue({ status: "ok" } as MarcaConciliacionActionResult),
  onOpenChange = vi.fn<(open: boolean) => void>(),
}: {
  declarado: string;
  montoActual?: string;
  onMarcar?: ReturnType<typeof vi.fn<OnMarcar>>;
  onOpenChange?: ReturnType<typeof vi.fn<(open: boolean) => void>>;
}) {
  render(
    <MarcarRecibidoDialog
      open
      onOpenChange={onOpenChange}
      bodega="Bodega Turrialba"
      fecha="7 nov"
      declarado={declarado}
      montoActual={montoActual}
      onMarcar={onMarcar}
    />,
  );
  const dialogo = screen.getByRole("dialog");
  const campo = within(dialogo).getByLabelText(/Monto recibido/);
  const confirmar = within(dialogo).getByRole("button", {
    name: montoActual === undefined ? "Marcar recibido" : "Corregir",
  });
  return { dialogo, campo, confirmar, onMarcar, onOpenChange };
}

describe("MarcarRecibidoDialog con lo declarado en 0 (SLT-96)", () => {
  it("R10 — declarado 5000.00 con el monto en 0: el botón sigue deshabilitado", async () => {
    const user = userEvent.setup();
    const { campo, confirmar } = montar({ declarado: "5000.00" });
    expect(confirmar).toBeEnabled();
    await user.clear(campo);
    await user.type(campo, "0");
    expect(confirmar).toBeDisabled();
  });

  it("R11 — declarado 0.00: abre con 0.00 precargado, el botón habilitado, y envía montoRecibido 0.00", async () => {
    const user = userEvent.setup();
    const { campo, confirmar, onMarcar, onOpenChange } = montar({ declarado: "0.00" });
    expect(campo).toHaveValue("0.00");
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);
    expect(onMarcar).toHaveBeenCalledTimes(1);
    expect(onMarcar).toHaveBeenCalledWith({ montoRecibido: "0.00" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("R11 — declarado 0.00 con «0» tecleado: el botón habilitado y envía «0»", async () => {
    const user = userEvent.setup();
    const { campo, confirmar, onMarcar } = montar({ declarado: "0.00" });
    await user.clear(campo);
    await user.type(campo, "0");
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);
    expect(onMarcar).toHaveBeenCalledWith({ montoRecibido: "0" });
  });

  it("R11 — en modo corrección (montoActual 10.00) con declarado 0.00, cambiar a «0» habilita «Corregir»", async () => {
    const user = userEvent.setup();
    const { campo, confirmar, onMarcar } = montar({ declarado: "0.00", montoActual: "10.00" });
    expect(campo).toHaveValue("10.00");
    await user.clear(campo);
    await user.type(campo, "0");
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);
    expect(onMarcar).toHaveBeenCalledWith({ montoRecibido: "0" });
  });

  it("R12 — el validation_error del servidor se pinta bajo el campo, el diálogo sigue abierto y conserva el monto", async () => {
    const user = userEvent.setup();
    const onMarcar = vi.fn<OnMarcar>().mockResolvedValue({
      status: "validation_error",
      fieldErrors: { montoRecibido: [MENSAJE_SERVIDOR] },
    } as MarcaConciliacionActionResult);
    const { campo, confirmar, dialogo, onOpenChange } = montar({ declarado: "0.00", onMarcar });
    await user.click(confirmar);
    expect(await within(dialogo).findByText(MENSAJE_SERVIDOR)).toBeInTheDocument();
    expect(campo).toHaveAccessibleDescription(expect.stringContaining(MENSAJE_SERVIDOR));
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(campo).toHaveValue("0.00");
  });

  it("R13 — declarado 0.00 con «abc»: el aviso del campo dice «de cero o más»", async () => {
    const user = userEvent.setup();
    const { campo, confirmar } = montar({ declarado: "0.00" });
    await user.clear(campo);
    await user.type(campo, "abc");
    await user.tab();
    expect(confirmar).toBeDisabled();
    expect(campo).toHaveAccessibleDescription(expect.stringContaining(AVISO_CON_CERO));
    expect(screen.queryByText(AVISO_MAYOR_QUE_CERO)).toBeNull();
  });

  it("R13 — declarado 5000.00 con «abc»: sigue el aviso «mayor que cero»", async () => {
    const user = userEvent.setup();
    const { campo, confirmar } = montar({ declarado: "5000.00" });
    await user.clear(campo);
    await user.type(campo, "abc");
    await user.tab();
    expect(confirmar).toBeDisabled();
    expect(campo).toHaveAccessibleDescription(expect.stringContaining(AVISO_MAYOR_QUE_CERO));
    expect(screen.queryByText(AVISO_CON_CERO)).toBeNull();
  });
});
