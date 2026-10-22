// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmarEntregaTiendaModal } from "@/app/(app)/ordenes/_components/ConfirmarEntregaTiendaModal";
import { confirmarEntregaTienda } from "@/lib/actions/devolucion-tienda";
import type { OrdenListItemDTO } from "@/lib/types/orden";

// FICHA 419 (F2) — el modal «Confirmar entrega a la tienda» de `/ordenes`, AISLADO (la Server
// Action y el toast se mockean). Protege lo que ningún test de backend ve:
//   - R18: con órdenes de más de una tienda, el diálogo las NOMBRA y no deja confirmar;
//   - R19: sin comprobante el botón está deshabilitado y el diálogo dice que es obligatorio;
//   - R20: tras la respuesta, cuántas pasaron y, por cada una que no, su guía y el motivo en
//     lenguaje claro; y el padre revalida (`onSuccess`);
//   - que un fallo (resultado de error o promesa rechazada) se DICE, nunca queda mudo.
// Los textos se afirman como LITERALES, no contra la función que los genera.
vi.mock("@/lib/actions/devolucion-tienda", () => ({
  confirmarEntregaTienda: vi.fn(),
}));

const { successMock, errorMock, warningMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
  warningMock: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: warningMock,
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const confirmarMock = vi.mocked(confirmarEntregaTienda);

const TIENDA_A = "a0000000-0000-4000-8000-00000000000a";
const TIENDA_B = "b0000000-0000-4000-8000-00000000000b";
const uuidOrden = (n: number) => `0f1e2d3c-4b5a-4c7d-8e9f-${String(n).padStart(12, "0")}`;

function orden(
  n: number,
  opts: { tiendaId?: string; tiendaNombre?: string; numGuia?: number | null } = {},
): OrdenListItemDTO {
  return {
    id: uuidOrden(n),
    numGuia: opts.numGuia === undefined ? 1000 + n : opts.numGuia,
    numRemision: `REM-${n}`,
    estatusId: "id-estatus",
    estatusValue: "devolviendo_a_tienda",
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: opts.tiendaId ?? TIENDA_A,
    tiendaNombre: opts.tiendaNombre ?? "Tienda Alfa",
    zonaId: "zona-1",
    zonaEsGam: true,
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function montar(ordenes: OrdenListItemDTO[], onSuccess = vi.fn()) {
  render(
    <ConfirmarEntregaTiendaModal
      open
      ordenes={ordenes}
      onOpenChange={vi.fn()}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

function botonConfirmar() {
  return screen.getByRole("button", { name: "Confirmar entrega a la tienda" });
}

async function adjuntarFoto(user: ReturnType<typeof userEvent.setup>, n = 1) {
  await user.upload(
    screen.getByLabelText("Comprobante de entrega"),
    Array.from({ length: n }, (_, i) => new File(["x"], `acta${i}.jpg`, { type: "image/jpeg" })),
  );
  await vi.waitFor(() =>
    expect(
      within(
        screen.getByRole("list", { name: "Fotos de evidencia seleccionadas" }),
      ).getAllByRole("img"),
    ).toHaveLength(n),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("419/R19 — el comprobante es obligatorio", () => {
  it("sin foto el botón está deshabilitado y el diálogo dice que es obligatorio", async () => {
    const user = userEvent.setup();
    montar([orden(1), orden(2)]);

    expect(botonConfirmar()).toBeDisabled();
    expect(
      screen.getByText(
        "Foto del acta o del paquete recibido por la tienda. Es obligatorio: sin comprobante no se puede confirmar.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Adjunta al menos una foto del comprobante para poder confirmar."),
    ).toBeInTheDocument();

    await user.click(botonConfirmar());
    expect(confirmarMock).not.toHaveBeenCalled();

    await adjuntarFoto(user);
    expect(botonConfirmar()).toBeEnabled();
    expect(
      screen.queryByText("Adjunta al menos una foto del comprobante para poder confirmar."),
    ).toBeNull();
  });

  it("quitar la única foto vuelve a deshabilitar el botón", async () => {
    const user = userEvent.setup();
    montar([orden(1)]);
    await adjuntarFoto(user);
    expect(botonConfirmar()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Quitar evidencia 1" }));
    expect(botonConfirmar()).toBeDisabled();
  });
});

describe("419/R18 — un lote es UNA tienda", () => {
  it("con órdenes de dos tiendas las nombra y no deja confirmar, aunque haya foto", async () => {
    const user = userEvent.setup();
    montar([
      orden(1),
      orden(2, { tiendaId: TIENDA_B, tiendaNombre: "Tienda Beta" }),
      orden(3),
    ]);

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(
      "Las órdenes seleccionadas son de varias tiendas. Un comprobante prueba la entrega a una sola tienda: deja en la selección solo las órdenes de una tienda.",
    );
    const nombres = within(alerta).getAllByRole("listitem").map((li) => li.textContent);
    expect(nombres).toEqual(["Tienda Alfa", "Tienda Beta"]);

    await adjuntarFoto(user);
    expect(botonConfirmar()).toBeDisabled();
    await user.click(botonConfirmar());
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  it("con una sola tienda la nombra en la descripción y no muestra el bloqueo", () => {
    montar([orden(1), orden(2)]);
    expect(
      screen.getByText(
        "2 orden(es) de Tienda Alfa. Adjunta el comprobante de que la tienda las recibió.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("por encima del tope de 300 órdenes lo dice y no deja confirmar", async () => {
    const user = userEvent.setup();
    montar(Array.from({ length: 301 }, (_, i) => orden(i + 1)));
    expect(
      screen.getByText(
        "Seleccionaste 301 órdenes y el máximo por confirmación es 300. Divide la selección en varias confirmaciones.",
      ),
    ).toBeInTheDocument();
    await adjuntarFoto(user);
    expect(botonConfirmar()).toBeDisabled();
  });
});

describe("419/R20 — resumen por orden y refresco", () => {
  it("envía UN FormData con la tienda, cada orden y cada foto; pinta cuántas pasaron y el motivo de las demás", async () => {
    const user = userEvent.setup();
    confirmarMock.mockResolvedValue({
      status: "ok",
      devueltas: 2,
      desenlaces: [
        { ordenId: uuidOrden(1), numGuia: 1001, desenlace: "devuelta_a_tienda" },
        { ordenId: uuidOrden(2), numGuia: 1002, desenlace: "devuelta_a_tienda" },
        { ordenId: uuidOrden(3), numGuia: 1003, desenlace: "ya_devuelta" },
        { ordenId: uuidOrden(4), numGuia: 1004, desenlace: "estado_invalido", estado: "en_bodega_central" },
        { ordenId: uuidOrden(5), numGuia: 1005, desenlace: "tienda_distinta" },
        { ordenId: uuidOrden(6), numGuia: null, desenlace: "no_encontrada" },
      ],
    });
    const onSuccess = montar([1, 2, 3, 4, 5, 6].map((n) => orden(n)));

    await adjuntarFoto(user, 2);
    await user.click(botonConfirmar());

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    const fd = confirmarMock.mock.calls[0][0];
    expect(fd.get("tiendaId")).toBe(TIENDA_A);
    expect(fd.getAll("ordenId")).toEqual([1, 2, 3, 4, 5, 6].map(uuidOrden));
    expect(fd.getAll("evidencia")).toHaveLength(2);

    expect(await screen.findByText("2 órdenes pasaron a «Devuelta a tienda».")).toBeInTheDocument();
    expect(screen.getByText("4 órdenes no cambiaron de estado:")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Órdenes que no cambiaron de estado" });
    expect(within(lista).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Guía 1003: Ya estaba marcada como entregada a la tienda.",
      "Guía 1004: Ya no está en devolución a la tienda: su estado actual es «En bodega central».",
      "Guía 1005: Pertenece a otra tienda, no a la de este comprobante.",
      "Remisión REM-6: No existe o fue eliminada.",
    ]);
    // Las que SÍ pasaron no aparecen en la lista de las que no.
    expect(within(lista).queryByText(/Guía 1001/)).toBeNull();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(successMock).toHaveBeenCalledWith("2 orden(es) pasaron a «Devuelta a tienda».");
    // Fase resultado: ya no se ofrece volver a confirmar; el botón de salida dice «Cerrar».
    expect(screen.queryByRole("button", { name: "Confirmar entrega a la tienda" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });

  it("una sola orden: el texto va en singular", async () => {
    const user = userEvent.setup();
    confirmarMock.mockResolvedValue({
      status: "ok",
      devueltas: 1,
      desenlaces: [{ ordenId: uuidOrden(1), numGuia: 1001, desenlace: "devuelta_a_tienda" }],
    });
    montar([orden(1)]);
    await adjuntarFoto(user);
    await user.click(botonConfirmar());
    expect(await screen.findByText("1 orden pasó a «Devuelta a tienda».")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Órdenes que no cambiaron de estado" })).toBeNull();
  });

  it("ninguna pasó: lo dice, dice que no se guardó el comprobante y aun así refresca", async () => {
    const user = userEvent.setup();
    confirmarMock.mockResolvedValue({
      status: "ninguna_devuelta",
      desenlaces: [{ ordenId: uuidOrden(1), numGuia: 1001, desenlace: "ya_devuelta" }],
    });
    const onSuccess = montar([orden(1)]);
    await adjuntarFoto(user);
    await user.click(botonConfirmar());
    expect(
      await screen.findByText(
        "Ninguna orden pasó a «Devuelta a tienda». No se guardó el comprobante.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 orden no cambió de estado:")).toBeInTheDocument();
    expect(
      screen.getByText("Guía 1001: Ya estaba marcada como entregada a la tienda."),
    ).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("419 — los fallos se dicen, nunca mudos", () => {
  it("comprobante_no_guardado: lo dice dentro del diálogo y no refresca", async () => {
    const user = userEvent.setup();
    confirmarMock.mockResolvedValue({ status: "comprobante_no_guardado" });
    const onSuccess = montar([orden(1)]);
    await adjuntarFoto(user);
    await user.click(botonConfirmar());
    expect(
      await screen.findByText(
        "No se pudo guardar el comprobante. Ninguna orden cambió de estado; inténtalo de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    // Sigue en el formulario: se puede reintentar.
    expect(botonConfirmar()).toBeEnabled();
  });

  it("forbidden: lo dice dentro del diálogo", async () => {
    const user = userEvent.setup();
    confirmarMock.mockResolvedValue({ status: "forbidden" });
    montar([orden(1)]);
    await adjuntarFoto(user);
    await user.click(botonConfirmar());
    expect(
      await screen.findByText("No tienes permiso para confirmar entregas a la tienda."),
    ).toBeInTheDocument();
  });

  it("la promesa rechazada se muestra como error genérico en el diálogo y por toast", async () => {
    const user = userEvent.setup();
    confirmarMock.mockRejectedValue(new Error("boom"));
    const onSuccess = montar([orden(1)]);
    await adjuntarFoto(user);
    await user.click(botonConfirmar());
    const texto =
      "No se pudo confirmar la entrega. Ninguna orden cambió de estado; inténtalo de nuevo y, si el problema sigue, avisa a soporte.";
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith(texto);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("validation_error de un campo que no es la foto se nombra", async () => {
    const user = userEvent.setup();
    confirmarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { tiendaId: ["la tienda del lote no existe"] },
    });
    montar([orden(1)]);
    await adjuntarFoto(user);
    await user.click(botonConfirmar());
    expect(
      await screen.findByText("No se pudo confirmar: la tienda del lote no existe."),
    ).toBeInTheDocument();
  });
});
