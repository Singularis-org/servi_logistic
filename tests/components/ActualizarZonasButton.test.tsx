// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RolValue } from "@prisma/client";

import { ActualizarZonasButton } from "@/app/(app)/ordenes/_components/ActualizarZonasButton";
import { actualizarZonas, vistaPreviaActualizacionZonas } from "@/lib/actions/actualizacion-zonas";
import { esAccesoTotal } from "@/lib/auth/acceso-total";

// SLT-224 (T9, design §3b.4/§3b.5) — el botón «Actualizar zonas» de la cabecera de /ordenes.
// Literales escritos a mano: el texto que ve el usuario ES el contrato.
vi.mock("@/lib/actions/actualizacion-zonas", () => ({
  vistaPreviaActualizacionZonas: vi.fn(),
  actualizarZonas: vi.fn(),
}));

const vistaMock = vi.mocked(vistaPreviaActualizacionZonas);
const actualizarMock = vi.mocked(actualizarZonas);

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

function renderBoton(puedeActualizarZonas = true) {
  const onSuccess = vi.fn();
  render(<ActualizarZonasButton puedeActualizarZonas={puedeActualizarZonas} onSuccess={onSuccess} />);
  return { onSuccess };
}

async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Actualizar zonas" }));
  return screen.findByRole("dialog");
}

const VISTA_CON_CANDIDATAS = {
  status: "ok" as const,
  vistaPrevia: {
    grupos: [
      { zonaActual: "GAM Kevin (Alajuela)", zonaNueva: "GAM", cantidad: 12 },
      { zonaActual: "Limón", zonaNueva: "Guápiles", cantidad: 1 },
    ],
    total: 13,
    saltadas: [
      { guia: "G-100", motivo: "estante_satelite" as const },
      { guia: "G-200", motivo: "cobro_en_curso" as const },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ActualizarZonasButton (SLT-224)", () => {
  it.each(Object.values(RolValue))(
    "R1713: con el rol %s el botón se ve solo si es maestro o admin",
    (rol) => {
      renderBoton(esAccesoTotal(rol));
      const visible = rol === "maestro" || rol === "admin";
      expect(screen.queryByRole("button", { name: "Actualizar zonas" }) !== null).toBe(visible);
    },
  );

  it("R1713: sin permiso no pinta nada ni pide la vista previa", () => {
    const { container } = render(
      <ActualizarZonasButton puedeActualizarZonas={false} onSuccess={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
    expect(vistaMock).not.toHaveBeenCalled();
  });

  it("R1715: al pulsar pide la vista previa y pinta grupos, total y saltadas con motivo, sin confirmar", async () => {
    vistaMock.mockResolvedValue(VISTA_CON_CANDIDATAS);
    const user = userEvent.setup();
    renderBoton();

    const dialog = await abrir(user);
    const grupos = await within(dialog).findByRole("list", { name: "Órdenes que se actualizan" });
    expect(within(grupos).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "12 órdenes: GAM Kevin (Alajuela) → GAM",
      "1 orden: Limón → Guápiles",
    ]);
    expect(within(dialog).getByText("Total: 13 órdenes")).toBeTruthy();
    expect(within(dialog).getByText("Se saltan 2")).toBeTruthy();
    const saltadas = within(dialog).getByRole("list", { name: "Órdenes que se saltan" });
    expect(within(saltadas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "G-100: en el estante de una satélite",
      "G-200: cobro en curso (cierre sin aprobar)",
    ]);
    expect(within(dialog).getByRole("button", { name: "Confirmar" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(vistaMock).toHaveBeenCalledTimes(1);
    expect(actualizarMock).not.toHaveBeenCalled();
  });

  it("R1726: cada motivo sale con su texto en español llano", async () => {
    vistaMock.mockResolvedValue({
      status: "ok",
      vistaPrevia: {
        grupos: [],
        total: 0,
        saltadas: [
          { guia: "G-1", motivo: "estante_satelite" },
          { guia: "G-2", motivo: "finalizada" },
          { guia: "G-3", motivo: "devolucion" },
          { guia: "G-4", motivo: "por_liberar" },
          { guia: "G-5", motivo: "cobro_en_curso" },
        ],
      },
    });
    const user = userEvent.setup();
    renderBoton();

    const dialog = await abrir(user);
    const saltadas = await within(dialog).findByRole("list", { name: "Órdenes que se saltan" });
    expect(within(saltadas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "G-1: en el estante de una satélite",
      "G-2: finalizada",
      "G-3: en devolución",
      "G-4: esperando liberación en bodega",
      "G-5: cobro en curso (cierre sin aprobar)",
    ]);
  });

  it("R1716: sin desalineadas dice que todas las zonas están al día y no ofrece confirmar", async () => {
    vistaMock.mockResolvedValue({
      status: "ok",
      vistaPrevia: { grupos: [], total: 0, saltadas: [] },
    });
    const user = userEvent.setup();
    renderBoton();

    const dialog = await abrir(user);
    expect(await within(dialog).findByText("Todas las zonas están al día.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });

  it("R1716: sin candidatas pero con saltadas lo dice, lista las saltadas y no ofrece confirmar", async () => {
    vistaMock.mockResolvedValue({
      status: "ok",
      vistaPrevia: { grupos: [], total: 0, saltadas: [{ guia: "G-9", motivo: "devolucion" }] },
    });
    const user = userEvent.setup();
    renderBoton();

    const dialog = await abrir(user);
    expect(
      await within(dialog).findByText("No hay órdenes con la zona errada que se puedan actualizar."),
    ).toBeTruthy();
    expect(within(dialog).getByText("G-9: en devolución")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("R1718: confirmar muestra cuántas se actualizaron y las saltadas, y refresca solo al cerrar", async () => {
    vistaMock.mockResolvedValue(VISTA_CON_CANDIDATAS);
    actualizarMock.mockResolvedValue({
      status: "ok",
      resultado: { actualizadas: 12, saltadas: [{ guia: "G-100", motivo: "estante_satelite" }] },
    });
    const user = userEvent.setup();
    const { onSuccess } = renderBoton();

    const dialog = await abrir(user);
    await user.click(await within(dialog).findByRole("button", { name: "Confirmar" }));

    expect(await within(dialog).findByText("Se actualizaron 12 órdenes.")).toBeTruthy();
    expect(within(dialog).getByText("G-100: en el estante de una satélite")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(actualizarMock).toHaveBeenCalledTimes(1);
    expect(successMock).toHaveBeenCalledWith("Se actualizaron 12 órdenes.");
    expect(onSuccess).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("R1716/R1718: cancelar la vista previa no confirma ni refresca", async () => {
    vistaMock.mockResolvedValue(VISTA_CON_CANDIDATAS);
    const user = userEvent.setup();
    const { onSuccess } = renderBoton();

    const dialog = await abrir(user);
    await user.click(await within(dialog).findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(actualizarMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("R1714: una vista previa sin sesión enseña el aviso y no ofrece confirmar", async () => {
    vistaMock.mockResolvedValue({ status: "unauthenticated" });
    const user = userEvent.setup();
    renderBoton();

    const dialog = await abrir(user);
    expect(
      (await within(dialog).findByRole("alert")).textContent,
    ).toBe("Tu sesión expiró. Inicia sesión de nuevo.");
    expect(within(dialog).queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("R1714: una vista previa sin permiso enseña el aviso y no ofrece confirmar", async () => {
    vistaMock.mockResolvedValue({ status: "forbidden" });
    const user = userEvent.setup();
    renderBoton();

    const dialog = await abrir(user);
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "No tienes permiso para esta acción.",
    );
    expect(within(dialog).queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("R1714: confirmar rechazado por permiso avisa por toast, no muestra resultado ni refresca", async () => {
    vistaMock.mockResolvedValue(VISTA_CON_CANDIDATAS);
    actualizarMock.mockResolvedValue({ status: "forbidden" });
    const user = userEvent.setup();
    const { onSuccess } = renderBoton();

    const dialog = await abrir(user);
    await user.click(await within(dialog).findByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No tienes permiso para esta acción."),
    );
    expect(within(dialog).queryByText(/Se actualizaron/)).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
