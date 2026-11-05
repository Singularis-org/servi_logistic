// @vitest-environment jsdom
// SLT-54 (R41, R55, R57) — los precios propios de las tiendas.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  filasDePrecios,
  TarifasTiendas,
  type TarifasTiendasProps,
} from "@/app/(app)/configuracion/tarifas/_components/TarifasTiendas";

import { valor } from "../fixtures/tarifas-pantalla";

const { guardarMock, toast } = vi.hoisted(() => ({
  guardarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({ guardarValoresTarifa: (i: unknown) => guardarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const TIENDAS = [
  { id: "t1", nombre: "Tienda Uno" },
  { id: "t2", nombre: "Tienda Dos" },
];
const ZONAS = [{ id: "z1", nombre: "Norte" }];

const PRECIOS = [
  valor("tienda_flete_entregado", { id: "a", tiendaId: "t1", zonaId: null, nivel: "tienda_general", valor: "2600.00" }),
  valor("tienda_flete_rechazo", { id: "b", tiendaId: "t1", zonaId: null, nivel: "tienda_general", valor: "2500.00" }),
  valor("tienda_flete_entregado", { id: "c", tiendaId: "t1", zonaId: "z1", nivel: "tienda_zona", valor: "2200.00" }),
  valor("tienda_flete_rechazo", { id: "d", tiendaId: "t2", zonaId: "z1", grupoId: "g1", nivel: "tienda_grupo", modo: "porcentaje", valor: "3.50" }),
];

function montar(extra: Partial<TarifasTiendasProps> = {}) {
  const p: TarifasTiendasProps = {
    filas: filasDePrecios(PRECIOS, TIENDAS, ZONAS, { g1: "Costa" }),
    puedeEscribir: true,
    onAnadir: vi.fn(),
    onEditar: vi.fn(),
    onCambio: vi.fn(),
    ...extra,
  };
  render(<TarifasTiendas {...p} />);
  return p;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-54 — precios de tienda", () => {
  it("R41: una fila por tienda y alcance, con 5 columnas como la maqueta", () => {
    montar();
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Tienda",
      "Aplica en",
      "Flete por entregado",
      "Flete por devolución",
      "Acciones",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(4);

    const general = screen.getByRole("row", { name: /Todas sus zonas/ });
    expect(within(general).getByText("Tienda Uno")).toBeInTheDocument();
    expect(within(general).getByText("₡2.600")).toBeInTheDocument();
    expect(within(general).getByText("₡2.500")).toBeInTheDocument();

    const enZona = screen.getByRole("row", { name: /Tienda Uno Norte/ });
    expect(within(enZona).getByText("₡2.200")).toBeInTheDocument();
    expect(within(enZona).getByText("Usa el valor general")).toBeInTheDocument();

    const enGrupo = screen.getByRole("row", { name: /Norte · Costa/ });
    expect(within(enGrupo).getByText("Tienda Dos")).toBeInTheDocument();
    expect(within(enGrupo).getByText("3,5 %")).toBeInTheDocument();
  });

  it("R41: añadir y editar van al panel de valores, sin un segundo formulario", async () => {
    const u = userEvent.setup();
    const p = montar();
    await u.click(screen.getByRole("button", { name: "Añadir precio de tienda" }));
    expect(p.onAnadir).toHaveBeenCalledTimes(1);

    await u.click(within(screen.getByRole("row", { name: /Norte · Costa/ })).getByRole("button", { name: "Editar precio de Tienda Dos" }));
    expect(p.onEditar).toHaveBeenCalledWith(expect.objectContaining({ tiendaId: "t2", zonaId: "z1", grupoId: "g1" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("R41: quitar pregunta y quita solo los valores de esa fila", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "x", status: "ok" }] });
    const u = userEvent.setup();
    const p = montar();

    await u.click(within(screen.getByRole("row", { name: /Todas sus zonas/ })).getByRole("button", { name: "Quitar precio de Tienda Uno" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/Se quitan 2 valores/)).toBeInTheDocument();
    expect(guardarMock).not.toHaveBeenCalled();

    await u.click(within(d).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    expect(guardarMock.mock.calls[0][0].cambios.map((c: { accion: string; id: string }) => [c.accion, c.id])).toEqual([
      ["quitar", "a"],
      ["quitar", "b"],
    ]);
    await waitFor(() => expect(p.onCambio).toHaveBeenCalled());
  });

  it("R41: si algo falla al quitar lo dice y no lo da por hecho", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "x", status: "error" }] });
    const u = userEvent.setup();
    montar();
    await u.click(within(screen.getByRole("row", { name: /Todas sus zonas/ })).getByRole("button", { name: "Quitar precio de Tienda Uno" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("R57: sin precios enseña el siguiente paso, con el botón de añadir", () => {
    montar({ filas: [] });
    expect(screen.getByText("Ninguna tienda tiene precio propio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir precio de tienda" })).toBeInTheDocument();
  });

  it("R55: `admin` lee la lista sin añadir, editar ni quitar", () => {
    montar({ puedeEscribir: false });
    expect(screen.getByText("₡2.600")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Añadir|Editar|Quitar/ })).toBeNull();
  });

  it("R41: una cuenta que ya no es tienda no rompe la lista", () => {
    const filas = filasDePrecios(
      [valor("tienda_flete_entregado", { tiendaId: "ya-no", zonaId: null, nivel: "tienda_general" })],
      TIENDAS,
      ZONAS,
      {},
    );
    expect(filas[0].tiendaNombre).toBe("Cuenta retirada");
  });
});
