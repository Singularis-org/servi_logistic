// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RetirarACentralModal } from "@/app/(app)/ordenes/_components/RetirarACentralModal";
import { retirarABodegaCentral } from "@/lib/actions/ordenes-guia";
import type { OrdenListItemDTO } from "@/lib/types/orden";

// SLT-197 (T6.1, R981) — confirmación «Retirar a bodega central». Literales escritos a mano.
vi.mock("@/lib/actions/ordenes-guia", () => ({
  retirarABodegaCentral: vi.fn(),
}));

const retirarMock = vi.mocked(retirarABodegaCentral);

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

function makeOrden(
  overrides: Partial<OrdenListItemDTO> & { id: string },
): OrdenListItemDTO {
  return {
    numGuia: 100,
    numRemision: "REM-000",
    estatusId: "id-sat",
    estatusValue: "en_bodega_satelite",
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: "tienda-uuid",
    tiendaNombre: "Tienda X",
    zonaId: "zona-1",
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function renderModal(ordenes: OrdenListItemDTO[]) {
  const onSuccess = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <RetirarACentralModal
      open
      ordenes={ordenes}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />,
  );
  return { onSuccess, onOpenChange };
}

async function confirmar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Retirar a bodega central" }));
}

const DOS = [
  makeOrden({ id: "o1", numRemision: "REM-001", zonaNombre: "Limón" }),
  makeOrden({ id: "o2", numRemision: "REM-002", zonaNombre: "Guápiles" }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("RetirarACentralModal (SLT-197, R981)", () => {
  it("R981: pide confirmación diciendo cuántas órdenes se retiran, sin llamar a la action", () => {
    renderModal(DOS);
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("Se retirarán 2 orden(es)");
    expect(within(dialogo).getByText("REM-001 — Limón")).toBeInTheDocument();
    expect(within(dialogo).getByText("REM-002 — Guápiles")).toBeInTheDocument();
    expect(retirarMock).not.toHaveBeenCalled();
  });

  it("R981: ok → UNA llamada con todo el lote, toast, manifiesto, y onSuccess solo al cerrar", async () => {
    const user = userEvent.setup();
    retirarMock.mockResolvedValue({
      status: "ok",
      resultados: [
        { ordenId: "o1", estado: "en_ruta_bodega_central" },
        { ordenId: "o2", estado: "en_ruta_bodega_central" },
      ],
    });
    const { onSuccess } = renderModal(DOS);

    await confirmar(user);

    expect(retirarMock).toHaveBeenCalledTimes(1);
    expect(retirarMock).toHaveBeenCalledWith({ ordenIds: ["o1", "o2"] });
    await vi.waitFor(() =>
      expect(successMock).toHaveBeenCalledWith("2 orden(es) en ruta a bodega central."),
    );
    // Fase «resultado»: el manifiesto del lote está a la vista y el padre aún no se refrescó.
    expect(
      await screen.findByText("Órdenes retiradas. Descarga el manifiesto del lote antes de cerrar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar a bodega central" })).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("R981: conflict → el diálogo sigue abierto con el motivo de CADA orden rechazada, sin onSuccess", async () => {
    const user = userEvent.setup();
    retirarMock.mockResolvedValue({
      status: "conflict",
      detalle: [
        { ordenId: "o1", motivo: "estado de origen no permitido: mensajero_recogiendo_en_bodega" },
        { ordenId: "o2", motivo: "la orden cambió de estado; recarga" },
      ],
    });
    const { onSuccess, onOpenChange } = renderModal(DOS);

    await confirmar(user);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se retiró ninguna orden.");
    const filas = within(within(alerta).getByRole("list", { name: "Órdenes rechazadas" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(filas).toEqual([
      "REM-001: ya no está en bodega satélite",
      "REM-002: cambió de estado mientras se retiraba",
    ]);
    // El valor interno del estado no se filtra al usuario.
    expect(alerta).not.toHaveTextContent("mensajero_recogiendo_en_bodega");
    expect(errorMock).toHaveBeenCalledWith(
      "Alguna orden ya cambió de estado y esta acción no le aplica. Actualiza la lista y vuelve a intentarlo.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("R981: conflict de orden inexistente o borrada → «ya no existe»", async () => {
    const user = userEvent.setup();
    retirarMock.mockResolvedValue({
      status: "conflict",
      detalle: [
        { ordenId: "o1", motivo: "orden no existe" },
        { ordenId: "o2", motivo: "orden borrada" },
      ],
    });
    renderModal(DOS);

    await confirmar(user);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("REM-001: ya no existe");
    expect(alerta).toHaveTextContent("REM-002: ya no existe");
  });

  it("R981: forbidden → toast de permiso, diálogo abierto y sin lista de conflictos", async () => {
    const user = userEvent.setup();
    retirarMock.mockResolvedValue({ status: "forbidden" });
    const { onSuccess } = renderModal(DOS);

    await confirmar(user);

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No tienes permiso para esta acción."),
    );
    expect(retirarMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
