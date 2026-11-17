// @vitest-environment jsdom
// SLT-60 (design §6.1; R12–R14, R17, R23, R32, R33) — la sección «Pagos por confirmar» del detalle de una
// empresa para el superadmin. Se monta el componente real con dobles de las dos actions y se lee lo que pinta:
// los textos van escritos a mano; los importes, con el `money` de la pantalla (es el formato de la moneda, no
// el texto que se mide).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { money } from "@/lib/config/moneda";
import type {
  ConfirmarPagoResult,
  FacturaConSaldoDTO,
  PagoPorConfirmarDTO,
  PagosDeEmpresa,
  VerComprobantePagoResult,
} from "@/lib/types/pago-plataforma";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { PagosPorConfirmar } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PagosPorConfirmar";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PAGO_VIEJO = "11111111-1111-4111-8111-111111111111";
const PAGO_NUEVO = "22222222-2222-4222-8222-222222222222";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// El ejemplo de la decisión del 2026-11-11 (design §5): un pago de 300 000 contra 1–15 nov (200 000) y
// 16–30 nov (180 000) propone 200 000 y 100 000.
const VIEJO: PagoPorConfirmarDTO = {
  id: PAGO_VIEJO,
  monto: "300000.00",
  fecha: new Date("2026-11-10T15:00:00Z"),
  referencia: "SINPE 8899",
  registradoPor: "Ana Pérez",
  tieneComprobante: true,
};
const NUEVO: PagoPorConfirmarDTO = {
  id: PAGO_NUEVO,
  monto: "50000.00",
  fecha: new Date("2026-11-12T15:00:00Z"),
  referencia: null,
  registradoPor: "Luis Gómez",
  tieneComprobante: false,
};
// Medianoche de Costa Rica (UTC−6); `hasta` es exclusivo.
const FACTURA_1: FacturaConSaldoDTO = {
  id: F1,
  numero: 1,
  desde: new Date("2026-11-01T06:00:00Z"),
  hasta: new Date("2026-11-16T06:00:00Z"),
  total: "200000.00",
  saldo: "200000.00",
};
const FACTURA_2: FacturaConSaldoDTO = {
  id: F2,
  numero: 2,
  desde: new Date("2026-11-16T06:00:00Z"),
  hasta: new Date("2026-12-01T06:00:00Z"),
  total: "190000.00",
  saldo: "180000.00",
};
const DATOS: PagosDeEmpresa = { pagos: [VIEJO, NUEVO], facturas: [FACTURA_1, FACTURA_2] };

function montar(
  datos: PagosDeEmpresa | null = DATOS,
  {
    confirmar = vi.fn<(i: unknown) => Promise<ConfirmarPagoResult>>().mockResolvedValue({ estado: "ok" }),
    verComprobante = vi
      .fn<(id: string) => Promise<VerComprobantePagoResult>>()
      .mockResolvedValue({ estado: "ok", url: "https://firmado.test/c?token=1", contentType: "image/png" }),
  } = {},
) {
  render(
    <PagosPorConfirmar datos={datos} organizacionId={ORG} confirmar={confirmar} verComprobante={verComprobante} />,
  );
  return { confirmar, verComprobante };
}

function seccion() {
  return within(screen.getByRole("region", { name: "Pagos por confirmar" }));
}

function filas() {
  return seccion().getAllByRole("row").slice(1);
}

async function abrirDialogo(user: ReturnType<typeof userEvent.setup>, fila = 0) {
  await user.click(within(filas()[fila]).getByRole("button", { name: "Confirmar…" }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SLT-60 R12 — la lista de pagos por confirmar", () => {
  it("título, ayuda y una fila por pago, del más viejo al más nuevo, con fecha, monto, referencia y quién lo registró", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Pagos por confirmar" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pagos que la empresa registró en su wallet. Al confirmarlos se aplican a sus facturas cerradas y baja su deuda.",
      ),
    ).toBeInTheDocument();
    const [viejo, nuevo] = filas();
    expect(filas()).toHaveLength(2);
    expect(within(viejo).getByText("10 nov 2026")).toBeInTheDocument();
    expect(within(viejo).getByText(money("300000.00"))).toBeInTheDocument();
    expect(within(viejo).getByText("SINPE 8899")).toBeInTheDocument();
    expect(within(viejo).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(nuevo).getByText("12 nov 2026")).toBeInTheDocument();
    expect(within(nuevo).getByText(money("50000.00"))).toBeInTheDocument();
    expect(within(nuevo).getByText("Luis Gómez")).toBeInTheDocument();
    for (const h of ["Fecha", "Monto", "Referencia", "Registrado por", "Comprobante"]) {
      expect(seccion().getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
  });

  it("sin pagos dice «No hay pagos por confirmar» y no pinta la tabla", () => {
    montar({ pagos: [], facturas: [FACTURA_1] });
    expect(seccion().getByText("No hay pagos por confirmar")).toBeInTheDocument();
    expect(seccion().queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("SLT-60 R13 — la lectura falló", () => {
  it("con `null` dice «No se pudieron cargar los pagos por confirmar», sin tabla ni el texto de vacío", () => {
    montar(null);
    expect(seccion().getByRole("alert")).toHaveTextContent("No se pudieron cargar los pagos por confirmar");
    expect(seccion().queryByRole("table")).not.toBeInTheDocument();
    expect(seccion().queryByText("No hay pagos por confirmar")).not.toBeInTheDocument();
  });
});

describe("SLT-60 R32, R33 — el comprobante", () => {
  it("«Ver comprobante» con comprobante y «Sin comprobante» sin él (R32)", () => {
    montar();
    const [viejo, nuevo] = filas();
    expect(within(viejo).getByRole("button", { name: "Ver comprobante" })).toBeInTheDocument();
    expect(within(viejo).queryByText("Sin comprobante")).not.toBeInTheDocument();
    expect(within(nuevo).getByText("Sin comprobante")).toBeInTheDocument();
    expect(within(nuevo).queryByRole("button", { name: "Ver comprobante" })).not.toBeInTheDocument();
  });

  it("al pulsarlo pide SOLO el pago y abre la url firmada en una pestaña nueva, sin opener (R33)", async () => {
    const pestana = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);
    const user = userEvent.setup();
    const { verComprobante } = montar();

    await user.click(within(filas()[0]).getByRole("button", { name: "Ver comprobante" }));

    await waitFor(() => expect(pestana.location.href).toBe("https://firmado.test/c?token=1"));
    expect(verComprobante).toHaveBeenCalledTimes(1);
    expect(verComprobante).toHaveBeenCalledWith(PAGO_VIEJO);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(pestana.opener).toBeNull();
    expect(pestana.close).not.toHaveBeenCalled();
    expect(screen.queryByText("No se pudo abrir el comprobante")).not.toBeInTheDocument();
  });

  it.each<[string, () => Promise<VerComprobantePagoResult>]>([
    ["sin_comprobante", async () => ({ estado: "sin_comprobante" })],
    ["not_found", async () => ({ estado: "not_found" })],
    ["forbidden", async () => ({ estado: "forbidden" })],
    [
      "un throw",
      async () => {
        throw new Error("red");
      },
    ],
  ])("con %s dice «No se pudo abrir el comprobante» en la fila y cierra la pestaña", async (_caso, respuesta) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pestana = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);
    const user = userEvent.setup();
    montar(DATOS, { verComprobante: vi.fn(respuesta) });

    await user.click(within(filas()[0]).getByRole("button", { name: "Ver comprobante" }));

    expect(await within(filas()[0]).findByText("No se pudo abrir el comprobante")).toBeInTheDocument();
    expect(pestana.close).toHaveBeenCalled();
    expect(pestana.location.href).toBe("");
    expect(within(filas()[1]).queryByText("No se pudo abrir el comprobante")).not.toBeInTheDocument();
  });

  it("el diálogo de confirmar repite el enlace junto al monto", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrirDialogo(user);
    expect(dialogo.getByRole("button", { name: "Ver comprobante" })).toBeInTheDocument();
  });
});

describe("SLT-60 R14 — la propuesta del reparto", () => {
  it("«Confirmar pago de {monto}» con una fila por factura (número, período, total y saldo) y la propuesta precargada", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrirDialogo(user);

    expect(screen.getByRole("dialog", { name: `Confirmar pago de ${money("300000.00")}` })).toBeInTheDocument();
    const [f1, f2] = dialogo.getAllByRole("row").slice(1);
    expect(within(f1).getByText("N.º 1")).toBeInTheDocument();
    expect(within(f1).getByText("1 nov 2026 – 15 nov 2026")).toBeInTheDocument();
    expect(within(f2).getByText("N.º 2")).toBeInTheDocument();
    expect(within(f2).getByText("16 nov 2026 – 30 nov 2026")).toBeInTheDocument();
    expect(within(f2).getByText(money("190000.00"))).toBeInTheDocument();
    expect(within(f2).getByText(money("180000.00"))).toBeInTheDocument();

    expect(dialogo.getByLabelText("Aplicar · N.º 1")).toHaveValue("200000.00");
    expect(dialogo.getByLabelText("Aplicar · N.º 2")).toHaveValue("100000.00");
    expect(dialogo.getByText(`Repartido ${money("300000.00")} de ${money("300000.00")}`)).toBeInTheDocument();
    expect(dialogo.getByText(`Falta ${money("0.00")}`)).toBeInTheDocument();
    expect(dialogo.getByRole("button", { name: "Confirmar pago" })).toBeEnabled();
  });

  it("sin facturas con saldo dice «La empresa no tiene facturas cerradas con saldo» y no ofrece confirmar", async () => {
    const user = userEvent.setup();
    montar({ pagos: [VIEJO], facturas: [] });
    const dialogo = await abrirDialogo(user);
    expect(dialogo.getByText("La empresa no tiene facturas cerradas con saldo")).toBeInTheDocument();
    expect(dialogo.queryByRole("button", { name: "Confirmar pago" })).not.toBeInTheDocument();
  });
});

describe("SLT-60 R17 — el reparto inválido no se manda", () => {
  it("si la suma no cuadra, «Falta» lo dice y «Confirmar pago» queda deshabilitado", async () => {
    const user = userEvent.setup();
    const { confirmar } = montar();
    const dialogo = await abrirDialogo(user);
    const aplicar2 = dialogo.getByLabelText("Aplicar · N.º 2");

    await user.clear(aplicar2);
    await user.type(aplicar2, "90000");

    expect(dialogo.getByText(`Repartido ${money("290000.00")} de ${money("300000.00")}`)).toBeInTheDocument();
    expect(dialogo.getByText(`Falta ${money("10000.00")}`)).toBeInTheDocument();
    expect(dialogo.getByText("El reparto debe sumar exactamente el monto del pago.")).toBeInTheDocument();
    const boton = dialogo.getByRole("button", { name: "Confirmar pago" });
    expect(boton).toBeDisabled();
    await user.click(boton);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("un monto sobre el saldo pone el error bajo SU fila, con aria-invalid", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrirDialogo(user);
    const aplicar1 = dialogo.getByLabelText("Aplicar · N.º 1");
    const aplicar2 = dialogo.getByLabelText("Aplicar · N.º 2");

    await user.clear(aplicar1);
    await user.type(aplicar1, "200000.01");
    await user.clear(aplicar2);
    await user.type(aplicar2, "99999.99");

    expect(aplicar1).toHaveAttribute("aria-invalid", "true");
    expect(aplicar1).toHaveAccessibleDescription("El monto supera el saldo de la factura.");
    expect(aplicar2).not.toHaveAttribute("aria-invalid");
    expect(dialogo.getByRole("button", { name: "Confirmar pago" })).toBeDisabled();
  });

  it("un `validation_error` del servidor pone sus errores bajo las filas y el diálogo sigue abierto", async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      errores: { [`aplicaciones.${F2}`]: "El monto supera el saldo de la factura." },
    } satisfies ConfirmarPagoResult);
    montar(DATOS, { confirmar });
    const dialogo = await abrirDialogo(user);

    await user.click(dialogo.getByRole("button", { name: "Confirmar pago" }));

    const aplicar2 = dialogo.getByLabelText("Aplicar · N.º 2");
    await waitFor(() => expect(aplicar2).toHaveAccessibleDescription("El monto supera el saldo de la factura."));
    expect(dialogo.getByLabelText("Aplicar · N.º 1")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("SLT-60 R23 — tras confirmar, la página se relee", () => {
  it("`ok`: manda el reparto de la empresa y el pago, cierra el diálogo y llama a `router.refresh()`", async () => {
    const user = userEvent.setup();
    const { confirmar } = montar();
    const dialogo = await abrirDialogo(user);

    await user.click(dialogo.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(confirmar).toHaveBeenCalledWith({
      organizacionId: ORG,
      pagoId: PAGO_VIEJO,
      aplicaciones: [
        { facturaId: F1, monto: "200000.00" },
        { facturaId: F2, monto: "100000.00" },
      ],
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it.each<[ConfirmarPagoResult["estado"], string]>([
    ["ya_confirmado", "Este pago ya estaba confirmado"],
    ["not_found", "El pago ya no está por confirmar"],
  ])("`%s`: dice «%s», cierra y relee", async (estado, texto) => {
    const user = userEvent.setup();
    montar(DATOS, { confirmar: vi.fn().mockResolvedValue({ estado }) });
    const dialogo = await abrirDialogo(user);

    await user.click(dialogo.getByRole("button", { name: "Confirmar pago" }));

    expect(await seccion().findByRole("status")).toHaveTextContent(texto);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => Promise<ConfirmarPagoResult>]>([
    ["forbidden", async () => ({ estado: "forbidden" })],
    [
      "un throw",
      async () => {
        throw new Error("red");
      },
    ],
  ])("con %s dice «No se pudo confirmar ahora», sin cerrar ni releer", async (_caso, respuesta) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    montar(DATOS, { confirmar: vi.fn(respuesta) });
    const dialogo = await abrirDialogo(user);

    await user.click(dialogo.getByRole("button", { name: "Confirmar pago" }));

    expect(await dialogo.findByRole("alert")).toHaveTextContent("No se pudo confirmar ahora");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
