// @vitest-environment jsdom
// SLT-143 (design §6.2; R16–R20) — la sección «Pagos confirmados» del detalle de una empresa para el superadmin.
// Se monta el componente real con dobles de las tres actions y se lee lo que pinta. Los textos van escritos a
// mano; los importes, con el `money` de la pantalla (es el formato de la moneda, no el texto que se mide).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { money } from "@/lib/config/moneda";
import type {
  AnularPagoConfirmadoResult,
  FacturaConSaldoDTO,
  PagoConfirmadoDTO,
  PagosDeEmpresa,
  RegistrarPagoPorFueraResult,
  VerComprobantePagoResult,
} from "@/lib/types/pago-plataforma";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { PagosConfirmados } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PagosConfirmados";

const PAGO_EMPRESA = "11111111-1111-4111-8111-111111111111";
const PAGO_FUERA = "22222222-2222-4222-8222-222222222222";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Del confirmado más reciente al más viejo (R16): primero el por fuera.
const POR_FUERA: PagoConfirmadoDTO = {
  id: PAGO_FUERA,
  monto: "100000.00",
  fecha: new Date("2026-11-18T15:00:00Z"),
  referencia: "Transferencia del día",
  registradoPor: null,
  porFuera: true,
  confirmadoPor: "Sofía Plataforma",
  confirmadoEl: new Date("2026-11-18T16:00:00Z"),
  aplicaciones: [{ facturaId: F1, numero: 1, monto: "100000.00" }],
  tieneComprobante: false,
};
const DE_LA_EMPRESA: PagoConfirmadoDTO = {
  id: PAGO_EMPRESA,
  monto: "300000.00",
  fecha: new Date("2026-11-10T15:00:00Z"),
  referencia: "SINPE 8899",
  registradoPor: "Ana Pérez",
  porFuera: false,
  confirmadoPor: "Sofía Plataforma",
  confirmadoEl: new Date("2026-11-12T16:00:00Z"),
  aplicaciones: [
    { facturaId: F1, numero: 1, monto: "200000.00" },
    { facturaId: F2, numero: 2, monto: "100000.00" },
  ],
  tieneComprobante: true,
};
const FACTURA_2: FacturaConSaldoDTO = {
  id: F2,
  numero: 2,
  desde: new Date("2026-11-16T06:00:00Z"),
  hasta: new Date("2026-12-01T06:00:00Z"),
  total: "190000.00",
  saldo: "80000.00",
};
const DATOS: PagosDeEmpresa = { pagos: [], facturas: [FACTURA_2], confirmados: [POR_FUERA, DE_LA_EMPRESA] };

type Anular = (i: { pagoId: string; motivo: string }) => Promise<AnularPagoConfirmadoResult>;

function montar(
  datos: PagosDeEmpresa | null = DATOS,
  {
    anular = vi.fn<Anular>().mockResolvedValue({ estado: "ok" }),
    registrarPorFuera = vi.fn<(fd: FormData) => Promise<RegistrarPagoPorFueraResult>>().mockResolvedValue({ estado: "ok" }),
    verComprobante = vi
      .fn<(id: string) => Promise<VerComprobantePagoResult>>()
      .mockResolvedValue({ estado: "ok", url: "https://firmado.test/c?token=1", contentType: "image/png" }),
  } = {},
) {
  render(
    <PagosConfirmados
      datos={datos}
      registrarPorFuera={registrarPorFuera}
      anular={anular}
      verComprobante={verComprobante}
      zona="America/Costa_Rica"
    />,
  );
  return { anular, registrarPorFuera, verComprobante };
}

function seccion() {
  return within(screen.getByRole("region", { name: "Pagos confirmados" }));
}

function filas() {
  return seccion().getAllByRole("row").slice(1);
}

async function abrirAnular(user: ReturnType<typeof userEvent.setup>, fila = 0) {
  await user.click(within(filas()[fila]).getByRole("button", { name: "Anular…" }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SLT-143 R16 — la lista de pagos confirmados", () => {
  it("título, ayuda y una fila por pago con fecha, monto, referencia, quién lo registró, quién lo confirmó y cuándo", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Pagos confirmados" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pagos ya aplicados a las facturas cerradas de la empresa. Anularlos devuelve el dinero a su caja y sube su deuda.",
      ),
    ).toBeInTheDocument();
    for (const h of ["Fecha", "Monto", "Referencia", "Registrado por", "Confirmado", "Facturas", "Comprobante"]) {
      expect(seccion().getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
    const [fuera, empresa] = filas();
    expect(filas()).toHaveLength(2);
    expect(within(fuera).getByText("18 nov 2026")).toBeInTheDocument();
    expect(within(fuera).getByText(money("100000.00"), { selector: "td" })).toBeInTheDocument();
    expect(within(fuera).getByText("Transferencia del día")).toBeInTheDocument();
    expect(within(fuera).getByText("Registrado por la plataforma")).toBeInTheDocument();
    expect(within(fuera).getByText("Sofía Plataforma · 18 nov 2026")).toBeInTheDocument();
    expect(within(empresa).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(empresa).queryByText("Registrado por la plataforma")).not.toBeInTheDocument();
    expect(within(empresa).getByText("Sofía Plataforma · 12 nov 2026")).toBeInTheDocument();
  });

  it("las facturas a las que se aplicó, una por línea con su número y el monto aplicado", () => {
    montar();
    const [fuera, empresa] = filas();
    expect(within(fuera).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      `N.º 1: ${money("100000.00")}`,
    ]);
    expect(within(empresa).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      `N.º 1: ${money("200000.00")}`,
      `N.º 2: ${money("100000.00")}`,
    ]);
  });

  it("«Ver comprobante» con comprobante, «Sin comprobante» sin él y «Anular…» en cada fila", () => {
    montar();
    const [fuera, empresa] = filas();
    expect(within(fuera).getByText("Sin comprobante")).toBeInTheDocument();
    expect(within(empresa).getByRole("button", { name: "Ver comprobante" })).toBeInTheDocument();
    for (const f of filas()) expect(within(f).getByRole("button", { name: "Anular…" })).toBeInTheDocument();
  });

  it("sin pagos confirmados dice «No hay pagos confirmados» y no pinta la tabla", () => {
    montar({ pagos: [], facturas: [], confirmados: [] });
    expect(seccion().getByText("No hay pagos confirmados")).toBeInTheDocument();
    expect(seccion().queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("SLT-143 R17 — «Registrar pago hecho por fuera…»", () => {
  it("el botón de la cabecera abre el formulario con las facturas de la lectura", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(seccion().getByRole("button", { name: "Registrar pago hecho por fuera…" }));
    const dialogo = within(await screen.findByRole("dialog", { name: "Registrar pago hecho por fuera" }));
    expect(dialogo.getByRole("textbox", { name: /^Monto/ })).toBeInTheDocument();
    await user.type(dialogo.getByRole("textbox", { name: /^Monto/ }), "50000");
    expect(dialogo.getByRole("textbox", { name: "Aplicar · N.º 2" })).toHaveValue("50000.00");
  });

  it("sin facturas cerradas con saldo, el formulario lo dice y no ofrece registrar", async () => {
    const user = userEvent.setup();
    montar({ ...DATOS, facturas: [] });
    await user.click(seccion().getByRole("button", { name: "Registrar pago hecho por fuera…" }));
    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText("La empresa no tiene facturas cerradas con saldo")).toBeInTheDocument();
    expect(dialogo.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
  });
});

describe("SLT-143 R18 — la lectura falló", () => {
  it("con `null` dice «No se pudieron cargar los pagos confirmados», sin tabla, sin vacío y sin registrar", () => {
    montar(null);
    expect(seccion().getByRole("alert")).toHaveTextContent("No se pudieron cargar los pagos confirmados");
    expect(seccion().queryByRole("table")).not.toBeInTheDocument();
    expect(seccion().queryByText("No hay pagos confirmados")).not.toBeInTheDocument();
    expect(seccion().queryByRole("button", { name: "Registrar pago hecho por fuera…" })).not.toBeInTheDocument();
  });
});

describe("SLT-143 R20 — el comprobante", () => {
  it("al pulsarlo pide SOLO el pago y abre la url firmada en una pestaña nueva, sin opener", async () => {
    const pestana = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);
    const user = userEvent.setup();
    const { verComprobante } = montar();

    await user.click(within(filas()[1]).getByRole("button", { name: "Ver comprobante" }));

    await waitFor(() => expect(pestana.location.href).toBe("https://firmado.test/c?token=1"));
    expect(verComprobante).toHaveBeenCalledWith(PAGO_EMPRESA);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(pestana.opener).toBeNull();
  });

  it("si no se puede abrir, lo dice en la fila y cierra la pestaña", async () => {
    const pestana = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);
    const user = userEvent.setup();
    montar(DATOS, { verComprobante: vi.fn().mockResolvedValue({ estado: "sin_comprobante" }) });

    await user.click(within(filas()[1]).getByRole("button", { name: "Ver comprobante" }));

    expect(await within(filas()[1]).findByText("No se pudo abrir el comprobante")).toBeInTheDocument();
    expect(pestana.close).toHaveBeenCalled();
  });
});

describe("SLT-143 R19, R21, R23–R25 — anular", () => {
  it("el diálogo muestra el monto, el aviso y el motivo obligatorio: vacío no envía", async () => {
    const user = userEvent.setup();
    const { anular } = montar();
    const dialogo = await abrirAnular(user);
    expect(screen.getByRole("dialog", { name: `Anular pago de ${money("100000.00")}` })).toBeInTheDocument();
    expect(
      dialogo.getByText("El dinero vuelve a la caja de la empresa, la deuda sube y las facturas recuperan su saldo."),
    ).toBeInTheDocument();
    await user.type(dialogo.getByRole("textbox", { name: /^Motivo/ }), "   ");
    await user.click(dialogo.getByRole("button", { name: "Anular pago" }));
    expect(await dialogo.findByText("El motivo de la anulación es obligatorio.")).toBeInTheDocument();
    expect(anular).not.toHaveBeenCalled();
  });

  it("con motivo manda el pago y el motivo, cierra y refresca tras `ok` (R19)", async () => {
    const user = userEvent.setup();
    const { anular } = montar();
    const dialogo = await abrirAnular(user);
    await user.type(dialogo.getByRole("textbox", { name: /^Motivo/ }), " Pago duplicado ");
    await user.click(dialogo.getByRole("button", { name: "Anular pago" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(anular).toHaveBeenCalledWith({ pagoId: PAGO_FUERA, motivo: "Pago duplicado" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each<[string, AnularPagoConfirmadoResult, string]>([
    ["ya_anulado", { estado: "ya_anulado" }, "Este pago ya estaba anulado"],
    ["not_found", { estado: "not_found" }, "El pago ya no está confirmado"],
    ["no_confirmado", { estado: "no_confirmado" }, "El pago ya no está confirmado"],
  ])("con %s cierra, avisa en la sección y refresca", async (_caso, respuesta, aviso) => {
    const user = userEvent.setup();
    montar(DATOS, { anular: vi.fn<Anular>().mockResolvedValue(respuesta) });
    const dialogo = await abrirAnular(user);
    await user.type(dialogo.getByRole("textbox", { name: /^Motivo/ }), "Pago duplicado");
    await user.click(dialogo.getByRole("button", { name: "Anular pago" }));

    expect(await seccion().findByRole("status")).toHaveTextContent(aviso);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("`validation_error` pone el error bajo «Motivo» y no cierra", async () => {
    const user = userEvent.setup();
    montar(DATOS, {
      anular: vi.fn<Anular>().mockResolvedValue({ estado: "validation_error", errores: { motivo: "Motivo rechazado." } }),
    });
    const dialogo = await abrirAnular(user);
    await user.type(dialogo.getByRole("textbox", { name: /^Motivo/ }), "x");
    await user.click(dialogo.getByRole("button", { name: "Anular pago" }));

    expect(await dialogo.findByText("Motivo rechazado.")).toBeInTheDocument();
    expect(dialogo.getByRole("textbox", { name: /^Motivo/ })).toHaveAttribute("aria-invalid", "true");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it.each<[string, Anular]>([
    ["forbidden", async () => ({ estado: "forbidden" })],
    [
      "un throw",
      async () => {
        throw new Error("red");
      },
    ],
  ])("con %s dice «No se pudo anular ahora» y no cierra", async (_caso, respuesta) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    montar(DATOS, { anular: vi.fn(respuesta) });
    const dialogo = await abrirAnular(user);
    await user.type(dialogo.getByRole("textbox", { name: /^Motivo/ }), "Pago duplicado");
    await user.click(dialogo.getByRole("button", { name: "Anular pago" }));

    expect(await dialogo.findByRole("alert")).toHaveTextContent("No se pudo anular ahora");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
