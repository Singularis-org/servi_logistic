// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  ConfirmarCambio,
  type FilaDeCambio,
  type ResultadoDeCambio,
} from "@/app/(app)/plataforma/geografia/_components/ConfirmarCambio";

// SLT-46 T6.5 (design §4.7, §6; R58, R59, R61): modal de confirmación antes → después que ejecuta
// la escritura una sola vez y reparte el desenlace.

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

const FILAS: FilaDeCambio[] = [
  { etiqueta: "Nombre", antes: "San José", despues: "San José Centro" },
  { etiqueta: "Código", antes: null, despues: "SJ-01" },
];

type Resultado = ResultadoDeCambio & { fieldErrors?: Record<string, string[]> };

function Harness({
  accion,
  onExito,
  onRechazo,
  onOpenChange,
}: {
  accion: () => Promise<Resultado>;
  onExito?: (r: Resultado) => void;
  onRechazo?: (r: Resultado | { status: "error" }) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmarCambio<Resultado>
      open={open}
      onOpenChange={(siguiente) => {
        onOpenChange?.(siguiente);
        setOpen(siguiente);
      }}
      titulo="¿Renombrar San José?"
      filas={FILAS}
      confirmLabel="Sí, renombrar"
      accion={accion}
      onExito={onExito}
      onRechazo={onRechazo}
    >
      <p>Contenido extra</p>
    </ConfirmarCambio>
  );
}

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ConfirmarCambio", () => {
  it("pinta cada fila con su antes y su después bajo encabezados Antes/Después (R58)", () => {
    render(<Harness accion={vi.fn()} />);
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("columnheader", { name: "Antes" })).toBeTruthy();
    expect(within(dialogo).getByRole("columnheader", { name: "Después" })).toBeTruthy();

    const filaNombre = within(dialogo).getByRole("row", { name: /Nombre/ });
    const celdas = within(filaNombre).getAllByRole("cell");
    expect(celdas[0].textContent).toBe("San José");
    expect(celdas[1].textContent).toBe("San José Centro");

    // Alta: sin «antes», se ve «—» y el lector de pantalla oye «Sin valor».
    const filaCodigo = within(dialogo).getByRole("row", { name: /Código/ });
    const [antesCodigo, despuesCodigo] = within(filaCodigo).getAllByRole("cell");
    expect(antesCodigo.textContent).toContain("—");
    expect(within(antesCodigo).getByText("Sin valor")).toBeTruthy();
    expect(despuesCodigo.textContent).toBe("SJ-01");

    expect(within(dialogo).getByText("Contenido extra")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Sí, renombrar" })).toBeTruthy();
  });

  it("cancelar cierra sin llamar a la acción (R59)", async () => {
    const accion = vi.fn();
    const onOpenChange = vi.fn();
    render(<Harness accion={accion} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(accion).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("confirmar llama a la acción una sola vez aunque se haga doble clic (R58)", async () => {
    let resolver: (r: Resultado) => void = () => {};
    const accion = vi.fn(
      () => new Promise<Resultado>((resolve) => (resolver = resolve)),
    );
    render(<Harness accion={accion} />);
    const confirmar = screen.getByRole("button", { name: "Sí, renombrar" });
    await userEvent.dblClick(confirmar);
    await userEvent.click(confirmar);
    expect(accion).toHaveBeenCalledTimes(1);
    resolver({ status: "ok" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("con ok cierra, llama a onExito y refresca la página (R58)", async () => {
    const accion = vi.fn().mockResolvedValue({ status: "ok" });
    const onExito = vi.fn();
    const onRechazo = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Harness
        accion={accion}
        onExito={onExito}
        onRechazo={onRechazo}
        onOpenChange={onOpenChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sí, renombrar" }));
    await waitFor(() => expect(onExito).toHaveBeenCalledWith({ status: "ok" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(onRechazo).not.toHaveBeenCalled();
  });

  it("con cambio concurrente avisa, refresca, no llama a onExito y deja solo Cerrar (R61)", async () => {
    const accion = vi
      .fn()
      .mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    const onExito = vi.fn();
    const onRechazo = vi.fn();
    render(<Harness accion={accion} onExito={onExito} onRechazo={onRechazo} />);
    await userEvent.click(screen.getByRole("button", { name: "Sí, renombrar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain(
      "Otra persona cambió este dato mientras tanto; revisa el valor actual.",
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(onExito).not.toHaveBeenCalled();
    expect(onRechazo).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sí, renombrar" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(accion).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("con otro desenlace cierra y pasa el resultado a onRechazo sin refrescar (R59)", async () => {
    const rechazo: Resultado = {
      status: "validation_error",
      fieldErrors: { nombre: ["Ya existe"] },
    };
    const accion = vi.fn().mockResolvedValue(rechazo);
    const onExito = vi.fn();
    const onRechazo = vi.fn();
    render(<Harness accion={accion} onExito={onExito} onRechazo={onRechazo} />);
    await userEvent.click(screen.getByRole("button", { name: "Sí, renombrar" }));
    await waitFor(() => expect(onRechazo).toHaveBeenCalledWith(rechazo));
    expect(onExito).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("un conflict sin motivo concurrente va a onRechazo (conflicto por nombre)", async () => {
    const accion = vi.fn().mockResolvedValue({ status: "conflict" });
    const onRechazo = vi.fn();
    render(<Harness accion={accion} onRechazo={onRechazo} />);
    await userEvent.click(screen.getByRole("button", { name: "Sí, renombrar" }));
    await waitFor(() => expect(onRechazo).toHaveBeenCalledWith({ status: "conflict" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si la acción lanza, se trata como error genérico sin romper", async () => {
    const accion = vi.fn().mockRejectedValue(new Error("red caída"));
    const onRechazo = vi.fn();
    render(<Harness accion={accion} onRechazo={onRechazo} />);
    await userEvent.click(screen.getByRole("button", { name: "Sí, renombrar" }));
    await waitFor(() => expect(onRechazo).toHaveBeenCalledWith({ status: "error" }));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
