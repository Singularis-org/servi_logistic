// @vitest-environment jsdom
// SLT-143 (design §6.3; R4, R5, R7, R17, R19) — el diálogo «Registrar pago hecho por fuera» del superadmin. Se
// monta el componente real con un doble de la action y se lee lo que pinta y lo que manda en el `FormData`. Los
// textos van escritos a mano; los importes, con el `money` de la pantalla (es el formato de la moneda).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { money } from "@/lib/config/moneda";
import type { FacturaConSaldoDTO, RegistrarPagoPorFueraResult } from "@/lib/types/pago-plataforma";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { RegistrarPagoPorFuera } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/RegistrarPagoPorFuera";

const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Las facturas de SLT-60: 1–15 nov (saldo 200 000) y 16–30 nov (saldo 180 000).
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

// 20:00 UTC del 19 nov: en Costa Rica aún es el 19; en Tokio ya es el 20 (P5: la zona es la de la empresa).
const AHORA = new Date("2026-11-19T20:00:00Z");

type Registrar = (fd: FormData) => Promise<RegistrarPagoPorFueraResult>;

function montar({
  facturas = [FACTURA_1, FACTURA_2],
  registrar = vi.fn<Registrar>().mockResolvedValue({ estado: "ok" }),
  zona = "America/Costa_Rica" as string | null,
} = {}) {
  const onCerrar = vi.fn();
  render(<RegistrarPagoPorFuera facturas={facturas} registrar={registrar} zona={zona} onCerrar={onCerrar} />);
  return { registrar, onCerrar, dialogo: within(screen.getByRole("dialog")) };
}

function aplicar(dialogo: ReturnType<typeof within>, numero: number): HTMLInputElement {
  return dialogo.getByRole("textbox", { name: `Aplicar · N.º ${numero}` }) as HTMLInputElement;
}

async function llenar(
  user: ReturnType<typeof userEvent.setup>,
  dialogo: ReturnType<typeof within>,
  { monto = "300000", referencia = "Transferencia del día" } = {},
) {
  await user.type(dialogo.getByRole("textbox", { name: /^Monto/ }), monto);
  if (referencia !== "") await user.type(dialogo.getByRole("textbox", { name: /^Referencia del pago/ }), referencia);
}

function botonRegistrar(dialogo: ReturnType<typeof within>) {
  return dialogo.getByRole("button", { name: "Registrar pago" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  refreshMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SLT-143 R4 — el reparto propuesto", () => {
  it("al escribir el monto propone las facturas más viejas primero, el menor entre saldo y lo que falta", async () => {
    const user = userEvent.setup();
    const { dialogo } = montar();
    expect(dialogo.queryByRole("textbox", { name: /^Aplicar/ })).not.toBeInTheDocument();

    await llenar(user, dialogo, { monto: "300000" });

    expect(aplicar(dialogo, 1).value).toBe("200000.00");
    expect(aplicar(dialogo, 2).value).toBe("100000.00");
    expect(dialogo.getByText(`Repartido ${money("300000.00")} de ${money("300000")}`)).toBeInTheDocument();
    for (const h of ["Factura", "Período", "Total", "Saldo", "Aplicar"]) {
      expect(dialogo.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
    expect(dialogo.getByText(money("190000.00"))).toBeInTheDocument();
  });

  it("al cambiar el monto la propuesta se recalcula, aunque se hubiera ajustado a mano", async () => {
    const user = userEvent.setup();
    const { dialogo } = montar();
    await llenar(user, dialogo, { monto: "300000" });
    await user.clear(aplicar(dialogo, 1));
    await user.type(aplicar(dialogo, 1), "1");

    const monto = dialogo.getByRole("textbox", { name: /^Monto/ });
    await user.clear(monto);
    await user.type(monto, "50000");

    expect(aplicar(dialogo, 1).value).toBe("50000.00");
    expect(aplicar(dialogo, 2).value).toBe("0.00");
  });
});

describe("SLT-143 R5 — el reparto tiene que cuadrar", () => {
  it("«Registrar pago» se deshabilita sin monto y mientras el reparto no suma el monto", async () => {
    const user = userEvent.setup();
    const { dialogo, registrar } = montar();
    expect(botonRegistrar(dialogo)).toBeDisabled();

    await llenar(user, dialogo, { monto: "300000" });
    expect(botonRegistrar(dialogo)).toBeEnabled();

    await user.clear(aplicar(dialogo, 2));
    await user.type(aplicar(dialogo, 2), "99999");
    expect(botonRegistrar(dialogo)).toBeDisabled();
    expect(dialogo.getByText("El reparto debe sumar exactamente el monto del pago.")).toBeInTheDocument();
    await user.click(botonRegistrar(dialogo));
    expect(registrar).not.toHaveBeenCalled();
  });

  it("el error del servidor de una factura sale bajo su fila y el del reparto en el pie", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn<Registrar>().mockResolvedValue({
      estado: "validation_error",
      errores: { [`aplicaciones.${F1}`]: "Esta factura no admite el pago.", aplicaciones: "Reparto rechazado." },
    });
    const { dialogo } = montar({ registrar });
    await llenar(user, dialogo);
    await user.click(botonRegistrar(dialogo));

    expect(await dialogo.findByText("Esta factura no admite el pago.")).toBeInTheDocument();
    expect(aplicar(dialogo, 1)).toHaveAttribute("aria-invalid", "true");
    expect(dialogo.getByText("Reparto rechazado.")).toBeInTheDocument();
  });
});

describe("SLT-143 R7 — los errores de cada campo", () => {
  it("un monto con tres decimales dice su error bajo «Monto» y no ofrece el reparto", async () => {
    const user = userEvent.setup();
    const { dialogo } = montar();
    await llenar(user, dialogo, { monto: "10.555" });
    expect(dialogo.getByText("El monto debe ser un número sin signo, con dos decimales como máximo.")).toBeInTheDocument();
    expect(dialogo.queryByRole("textbox", { name: /^Aplicar/ })).not.toBeInTheDocument();
    expect(botonRegistrar(dialogo)).toBeDisabled();
  });

  it("sin referencia no envía y dice que es obligatoria", async () => {
    const user = userEvent.setup();
    const { dialogo, registrar } = montar();
    await llenar(user, dialogo, { referencia: "" });
    await user.click(botonRegistrar(dialogo));
    expect(await dialogo.findByText("La referencia del pago es obligatoria.")).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("los errores del servidor salen bajo «Monto», «Fecha», «Referencia del pago» y el comprobante", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn<Registrar>().mockResolvedValue({
      estado: "validation_error",
      errores: {
        monto: "Supera lo disponible para registrar.",
        fecha: "No se admiten movimientos anteriores al 2026-10-20.",
        referencia: "Referencia rechazada.",
        comprobante: "Comprobante no válido.",
      },
    });
    const { dialogo } = montar({ registrar });
    await llenar(user, dialogo);
    await user.click(botonRegistrar(dialogo));

    expect(await dialogo.findByText("Supera lo disponible para registrar.")).toBeInTheDocument();
    expect(dialogo.getByRole("textbox", { name: /^Monto/ })).toHaveAttribute("aria-invalid", "true");
    expect(dialogo.getByText("No se admiten movimientos anteriores al 2026-10-20.")).toBeInTheDocument();
    expect(dialogo.getByText("Referencia rechazada.")).toBeInTheDocument();
    expect(dialogo.getByText("Comprobante no válido.")).toBeInTheDocument();
  });

  it("la ventana de la fecha es la de la zona de la empresa, no la de Costa Rica (P5)", () => {
    const { dialogo } = montar({ zona: "Asia/Tokyo" });
    const fecha = dialogo.getByLabelText(/^Fecha/) as HTMLInputElement;
    expect(fecha.type).toBe("date");
    expect(fecha.value).toBe("2026-11-20");
    expect(fecha.max).toBe("2026-11-20");
    expect(fecha.min).toBe("2026-10-21");
  });

  it("una fecha futura en la zona de la empresa no se envía", async () => {
    const user = userEvent.setup();
    const { dialogo, registrar } = montar();
    await llenar(user, dialogo);
    const fecha = dialogo.getByLabelText(/^Fecha/) as HTMLInputElement;
    await user.clear(fecha);
    await user.type(fecha, "2026-11-20");
    await user.click(botonRegistrar(dialogo));
    expect(await dialogo.findByText("La fecha no puede ser posterior a hoy.")).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("sin zona, la fecha va vacía y sin ventana: la decide el servidor", () => {
    const { dialogo } = montar({ zona: null });
    const fecha = dialogo.getByLabelText(/^Fecha/) as HTMLInputElement;
    expect(fecha.value).toBe("");
    expect(fecha.min).toBe("");
    expect(fecha.max).toBe("");
  });
});

describe("SLT-143 R17 — sin facturas cerradas con saldo", () => {
  it("dice «La empresa no tiene facturas cerradas con saldo» y no ofrece registrar", () => {
    const { dialogo } = montar({ facturas: [] });
    expect(dialogo.getByText("La empresa no tiene facturas cerradas con saldo")).toBeInTheDocument();
    expect(dialogo.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    expect(dialogo.queryByRole("textbox", { name: /^Monto/ })).not.toBeInTheDocument();
  });
});

describe("SLT-143 R1, R8, R10, R19 — el envío", () => {
  it("manda el FormData del contrato, cierra y refresca tras `ok`", async () => {
    const user = userEvent.setup();
    const { dialogo, registrar, onCerrar } = montar();
    await llenar(user, dialogo, { monto: "300000", referencia: "  Transferencia del día " });
    const archivo = new File(["x"], "comprobante.png", { type: "image/png" });
    await user.upload(dialogo.getByLabelText(/Comprobante/), archivo);
    await user.click(botonRegistrar(dialogo));

    expect(registrar).toHaveBeenCalledTimes(1);
    const fd = registrar.mock.calls[0][0];
    expect(fd.get("claveIdempotencia")).toMatch(UUID);
    expect(fd.get("monto")).toBe("300000");
    expect(fd.get("fecha")).toBe("2026-11-19");
    expect(fd.get("referencia")).toBe("Transferencia del día");
    expect(JSON.parse(fd.get("aplicaciones") as string)).toEqual([
      { facturaId: F1, monto: "200000.00" },
      { facturaId: F2, monto: "100000.00" },
    ]);
    expect((fd.get("comprobante") as File).name).toBe("comprobante.png");
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("sin comprobante no manda el campo (R8)", async () => {
    const user = userEvent.setup();
    const { dialogo, registrar } = montar();
    await llenar(user, dialogo);
    await user.click(botonRegistrar(dialogo));
    expect(registrar.mock.calls[0][0].has("comprobante")).toBe(false);
  });

  it("dos envíos del mismo diálogo llevan la misma clave (R10)", async () => {
    const user = userEvent.setup();
    const registrar = vi
      .fn<Registrar>()
      .mockResolvedValueOnce({ estado: "validation_error", errores: { referencia: "Referencia rechazada." } })
      .mockResolvedValueOnce({ estado: "ya_registrado" });
    const { dialogo, onCerrar } = montar({ registrar });
    await llenar(user, dialogo);
    await user.click(botonRegistrar(dialogo));
    await dialogo.findByText("Referencia rechazada.");
    await user.type(dialogo.getByRole("textbox", { name: /^Referencia del pago/ }), " 2");
    await user.click(botonRegistrar(dialogo));

    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar.mock.calls[1][0].get("claveIdempotencia")).toBe(registrar.mock.calls[0][0].get("claveIdempotencia"));
    // `ya_registrado` también cierra y refresca (R19).
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("`comprobante_no_guardado` lo dice y no cierra", async () => {
    const user = userEvent.setup();
    const { dialogo, onCerrar } = montar({
      registrar: vi.fn<Registrar>().mockResolvedValue({ estado: "comprobante_no_guardado" }),
    });
    await llenar(user, dialogo);
    await user.click(botonRegistrar(dialogo));
    expect(await dialogo.findByRole("alert")).toHaveTextContent("No se pudo guardar el comprobante. El pago no se registró.");
    expect(onCerrar).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it.each<[string, Registrar]>([
    ["forbidden", async () => ({ estado: "forbidden" })],
    [
      "un throw",
      async () => {
        throw new Error("red");
      },
    ],
  ])("con %s dice «No se pudo registrar ahora» y no cierra", async (_caso, respuesta) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { dialogo, onCerrar } = montar({ registrar: vi.fn(respuesta) });
    await llenar(user, dialogo);
    await user.click(botonRegistrar(dialogo));
    expect(await dialogo.findByRole("alert")).toHaveTextContent("No se pudo registrar ahora");
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
