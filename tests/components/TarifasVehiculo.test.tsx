// @vitest-environment jsdom
// SLT-54 (R47-R51, R54) — pago por vehículo. Ningún vehículo está escrito en la pantalla: las columnas salen
// de lo que llega, y estos tests lo prueban con nombres que no existen en ningún catálogo.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasValores, type TarifasValoresProps } from "@/app/(app)/configuracion/tarifas/_components/TarifasValores";
import type { VehiculoDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";

import { referenciaUniforme, valor } from "../fixtures/tarifas-pantalla";

const { guardarMock, toast } = vi.hoisted(() => ({
  guardarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({ guardarValoresTarifa: (i: unknown) => guardarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

function vehiculos(n: number): VehiculoDePantalla[] {
  return Array.from({ length: n }, (_, i) => ({ id: `v${i}`, nombre: `Tipo${i}`, activo: true }));
}

function props(extra: Partial<TarifasValoresProps> = {}): TarifasValoresProps {
  return {
    zonaId: "z1",
    nivel: { tipo: "zona" },
    valores: [],
    referencia: null,
    vehiculos: vehiculos(2),
    activada: true,
    puedeEscribir: true,
    actor: "mensajero",
    onActor: vi.fn(),
    onGuardado: vi.fn(),
    onSucioChange: vi.fn(),
    ...extra,
  };
}

const interruptor = () => screen.getByRole("checkbox", { name: "Pagar distinto por vehículo" });
const cabeceras = () => screen.getAllByRole("columnheader").map((c) => c.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-54 — columnas por vehículo", () => {
  it.each([1, 2, 8])("R47: con %i vehículos, «Todos» más una columna por cada uno, en el orden que llegan", async (n) => {
    const u = userEvent.setup();
    render(<TarifasValores {...props({ vehiculos: vehiculos(n) })} />);
    await u.click(interruptor());

    expect(cabeceras()).toEqual(["Concepto", "Todos los vehículos", ...vehiculos(n).map((v) => v.nombre)]);
    expect(screen.getByTestId("tarifas-vehiculo").querySelector("table")).toHaveStyle({ minWidth: `${200 + 136 * (n + 1)}px` });
  });

  it("R47: también en la pestaña de satélite y en el nivel de grupo", async () => {
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "satelite", nivel: { tipo: "grupo", grupoId: "g1" } })} />);
    await u.click(interruptor());
    expect(cabeceras()).toContain("Tipo1");
  });

  it("R47: el cobro a la tienda no tiene interruptor", () => {
    render(<TarifasValores {...props({ actor: "tienda" })} />);
    expect(screen.queryByRole("checkbox", { name: "Pagar distinto por vehículo" })).toBeNull();
  });

  it("R48: un alta en el catálogo aparece en la siguiente carga, sin escribir nada", async () => {
    const u = userEvent.setup();
    const { rerender } = render(<TarifasValores {...props()} />);
    await u.click(interruptor());
    expect(cabeceras()).not.toContain("Nuevo");

    rerender(<TarifasValores {...props({ vehiculos: [...vehiculos(2), { id: "n", nombre: "Nuevo", activo: true }] })} />);

    expect(cabeceras()).toContain("Nuevo");
    expect(guardarMock).not.toHaveBeenCalled();
  });
});

describe("SLT-54 — el interruptor", () => {
  it("R49: apagado sin valores por vehículo; encendido solo con ellos, y en esa pestaña", () => {
    const { rerender } = render(<TarifasValores {...props()} />);
    expect(interruptor()).not.toBeChecked();
    expect(screen.getByTestId("tarifas-rejilla")).toBeInTheDocument();

    const conValor = [valor("mensajero_entregado", { vehiculoId: "v1", nivel: "zona_vehiculo" })];
    rerender(<TarifasValores {...props({ valores: conValor })} />);
    expect(interruptor()).toBeChecked();
    expect(screen.getByTestId("tarifas-vehiculo")).toBeInTheDocument();

    rerender(<TarifasValores {...props({ valores: conValor, actor: "satelite" })} />);
    expect(interruptor()).not.toBeChecked();
  });

  it("R49: encenderlo no escribe; apagarlo sin valores tampoco, y descarta lo digitado por vehículo", async () => {
    const u = userEvent.setup();
    render(<TarifasValores {...props()} />);
    await u.click(interruptor());
    await u.type(screen.getByRole("textbox", { name: "Por entregado, Tipo0" }), "1800");
    await u.click(interruptor());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(guardarMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("R50: apagar con valores pide confirmación con cuántos; cancelar no cambia nada", async () => {
    const u = userEvent.setup();
    const valores = [
      valor("mensajero_entregado", { id: "a", vehiculoId: "v0", nivel: "zona_vehiculo" }),
      valor("mensajero_novedad", { id: "b", vehiculoId: "v1", nivel: "zona_vehiculo" }),
    ];
    render(<TarifasValores {...props({ valores })} />);

    await u.click(interruptor());
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Se quitarán 2 valores por vehículo guardados.")).toBeInTheDocument();

    await u.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(guardarMock).not.toHaveBeenCalled();
    expect(interruptor()).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Por entregado, Tipo0" })).toHaveValue("1500");
  });

  it("R50: confirmar quita exactamente los de esa pestaña", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "x", status: "ok" }] });
    const u = userEvent.setup();
    const onGuardado = vi.fn();
    const valores = [
      valor("mensajero_entregado", { id: "a", vehiculoId: "v0", nivel: "zona_vehiculo" }),
      valor("mensajero_entregado", { id: "todos" }),
      valor("satelite_entregado", { id: "otra-pestana", vehiculoId: "v0", nivel: "zona_vehiculo" }),
    ];
    render(<TarifasValores {...props({ valores, onGuardado })} />);

    await u.click(interruptor());
    const dialogo = await screen.findByRole("dialog");
    await u.click(within(dialogo).getByRole("button", { name: "Quitar y apagar" }));

    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    expect(guardarMock.mock.calls[0][0].cambios).toEqual([{ accion: "quitar", clave: "mensajero_entregado:v0", id: "a" }]);
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
  });

  it("R50: sin vehículos en el catálogo, deshabilitado y dice por qué", () => {
    render(<TarifasValores {...props({ vehiculos: [] })} />);
    expect(interruptor()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("No hay vehículos en el catálogo: se dan de alta en la plataforma.")).toBeInTheDocument();
    expect(screen.getByTestId("tarifas-rejilla")).toBeInTheDocument();
  });

  it("R55: `admin` no tiene interruptor; si hay valores, los ve como texto", () => {
    const valores = [valor("mensajero_entregado", { vehiculoId: "v1", nivel: "zona_vehiculo", valor: "1800.00" })];
    render(<TarifasValores {...props({ valores, puedeEscribir: false })} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("₡1.800")).toBeInTheDocument();
  });
});

describe("SLT-54 — vehículo inactivo", () => {
  const INACTIVO: VehiculoDePantalla = { id: "i", nombre: "Retirado", activo: false };

  it("R51: sin valor guardado, no aparece", async () => {
    const u = userEvent.setup();
    render(<TarifasValores {...props({ vehiculos: [...vehiculos(1), INACTIVO] })} />);
    await u.click(interruptor());
    expect(cabeceras()).toEqual(["Concepto", "Todos los vehículos", "Tipo0"]);
  });

  it("R51: con valor, marcado; su celda con valor se edita y las vacías van deshabilitadas", () => {
    const valores = [valor("mensajero_entregado", { id: "ina", vehiculoId: "i", nivel: "zona_vehiculo" })];
    render(<TarifasValores {...props({ vehiculos: [...vehiculos(1), INACTIVO], valores })} />);

    const cabecera = screen.getByRole("columnheader", { name: /Retirado/ });
    expect(within(cabecera).getByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Por entregado, Retirado" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Por entregado, Retirado" })).toHaveValue("1500");
    expect(screen.getByRole("textbox", { name: "Por novedad, Retirado" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Por novedad, Tipo0" })).toBeEnabled();
  });

  it("R51: un valor en un inactivo se puede quitar", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_entregado:i", status: "ok" }] });
    const u = userEvent.setup();
    const valores = [valor("mensajero_entregado", { id: "ina", vehiculoId: "i", nivel: "zona_vehiculo" })];
    render(<TarifasValores {...props({ vehiculos: [INACTIVO], valores })} />);

    await u.clear(screen.getByRole("textbox", { name: "Por entregado, Retirado" }));
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(guardarMock.mock.calls[0][0].cambios).toEqual([{ accion: "quitar", clave: "mensajero_entregado:i", id: "ina" }]);
  });
});

describe("SLT-54 — valores por vehículo", () => {
  it("R36: el valor de un vehículo lleva su id y ninguna clave ivaPct", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_entregado:v1", status: "ok" }] });
    const u = userEvent.setup();
    render(<TarifasValores {...props()} />);
    await u.click(interruptor());
    await u.type(screen.getByRole("textbox", { name: "Por entregado, Tipo1" }), "1800");
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    const { datos } = guardarMock.mock.calls[0][0].cambios[0];
    expect(datos).toEqual({
      concepto: "mensajero_entregado",
      modo: "monto",
      valor: "1800",
      zonaId: "z1",
      grupoId: null,
      tiendaId: null,
      vehiculoId: "v1",
    });
    expect(datos).not.toHaveProperty("ivaPct");
  });

  it("R34: el modo se elige por concepto y una celda con otro modo guardado lo conserva y lo dice", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_entregado:v1", status: "ok" }] });
    const u = userEvent.setup();
    const valores = [
      valor("mensajero_entregado", { id: "t" }),
      valor("mensajero_entregado", { id: "p", vehiculoId: "v0", nivel: "zona_vehiculo", modo: "porcentaje", valor: "50.00" }),
    ];
    render(<TarifasValores {...props({ valores })} />);

    expect(screen.getByRole("combobox", { name: "Modo de Por entregado" })).toHaveTextContent("Monto");
    const celda = screen.getByRole("textbox", { name: "Por entregado, Tipo0" }).closest("td") as HTMLElement;
    expect(within(celda).getByText("En %")).toBeInTheDocument();

    await u.type(screen.getByRole("textbox", { name: "Por entregado, Tipo1" }), "1800");
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    // Solo sale la celda digitada: la de % no se convierte en monto a escondidas.
    expect(guardarMock.mock.calls[0][0].cambios.map((c: { clave: string }) => c.clave)).toEqual(["mensajero_entregado:v1"]);
    expect(guardarMock.mock.calls[0][0].cambios[0].datos.modo).toBe("monto");
  });

  it("R20: la referencia va en una línea bajo cada campo, sin entrar en él", async () => {
    const u = userEvent.setup();
    const referencia = referenciaUniforme({ tipo: "monto", valor: "1500.00", ivaPct: null });
    referencia.vehiculos = { v0: { ...referencia.zona, mensajero_entregado: { tipo: "monto", valor: "1800.00", ivaPct: null } } as never };
    render(<TarifasValores {...props({ activada: false, referencia })} />);
    await u.click(interruptor());

    const campo = screen.getByRole("textbox", { name: "Por entregado, Tipo0" });
    expect(campo).toHaveValue("");
    expect(within(campo.closest("td") as HTMLElement).getByText("Hoy rige: ₡1.800")).toBeInTheDocument();
    expect(within(screen.getByRole("textbox", { name: "Por entregado, Todos los vehículos" }).closest("td") as HTMLElement).getByText("Hoy rige: ₡1.500")).toBeInTheDocument();
  });

  it("R54: columna de conceptos fija y contenedor con su propio desplazamiento", async () => {
    const u = userEvent.setup();
    render(<TarifasValores {...props({ vehiculos: vehiculos(8) })} />);
    await u.click(interruptor());

    const zona = screen.getByTestId("tarifas-vehiculo");
    expect(zona.querySelector('[data-slot="table-container"]')?.className).toContain("overflow-x-auto");
    expect(screen.getByRole("columnheader", { name: "Concepto" }).className).toMatch(/sticky.*left-0.*z-10.*bg-card/);
    const primera = screen.getByRole("textbox", { name: "Por entregado, Tipo0" });
    expect(primera.className).toContain("w-[120px]");
  });
});
