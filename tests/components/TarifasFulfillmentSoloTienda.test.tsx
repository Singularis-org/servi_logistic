// @vitest-environment jsdom
// SLT-94 (R13; respaldo de R10/R11) — la pantalla de Tarifas ofrece el fulfillment SOLO en el precio propio de
// la tienda en todas sus zonas, solo en monto (sin selector de modo) y con su % de IVA. Se afirma también el
// payload espiado: es lo que llega a dinero, y una pantalla correcta a la vista puede mandar otra cosa.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasValores, type TarifasValoresProps } from "@/app/(app)/configuracion/tarifas/_components/TarifasValores";
import type { Nivel } from "@/app/(app)/configuracion/tarifas/_components/tarifas-borrador";
import { monedaConfig } from "@/lib/config/moneda";

import { referenciaUniforme, valor } from "../fixtures/tarifas-pantalla";

const { guardarMock, toast } = vi.hoisted(() => ({
  guardarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({ guardarValoresTarifa: (i: unknown) => guardarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const TIENDA_TODAS: Nivel = { tipo: "tienda", tiendaId: "t1", alcance: { tipo: "todas" } };

/** Los cuatro niveles donde el fulfillment NO se configura (R10). */
const NIVELES_SIN_FULFILLMENT: readonly { nombre: string; nivel: Nivel }[] = [
  { nombre: "zona", nivel: { tipo: "zona" } },
  { nombre: "grupo", nivel: { tipo: "grupo", grupoId: "g1" } },
  { nombre: "tienda en una zona", nivel: { tipo: "tienda", tiendaId: "t1", alcance: { tipo: "zona" } } },
  { nombre: "tienda en un grupo", nivel: { tipo: "tienda", tiendaId: "t1", alcance: { tipo: "grupo", grupoId: "g1" } } },
];

const NOTA = "El fulfillment se cobra una vez por paquete y se configura solo en el precio propio de cada tienda, en todas sus zonas.";

function props(extra: Partial<TarifasValoresProps> = {}): TarifasValoresProps {
  return {
    zonaId: "z1",
    nivel: TIENDA_TODAS,
    valores: [],
    referencia: referenciaUniforme({ tipo: "monto", valor: "2800.00", ivaPct: "13.00" }),
    vehiculos: [],
    activada: true,
    puedeEscribir: true,
    actor: "tienda",
    onActor: vi.fn(),
    onGuardado: vi.fn(),
    onSucioChange: vi.fn(),
    ...extra,
  };
}

function filaDe(nombre: string): HTMLElement | undefined {
  return screen
    .getAllByRole("row")
    .slice(1)
    .find((f) => within(f).getAllByRole("cell")[0].textContent === nombre);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-94 R13 — el fulfillment fuera de zona y grupo", () => {
  for (const { nombre, nivel } of NIVELES_SIN_FULFILLMENT) {
    it(`SLT-94 R13: en el nivel «${nombre}» no se ofrece el fulfillment y una nota dice dónde va`, () => {
      render(<TarifasValores {...props({ nivel })} />);
      expect(filaDe("Fulfillment")).toBeUndefined();
      expect(screen.queryByRole("textbox", { name: "Valor de Fulfillment" })).toBeNull();
      expect(screen.queryByRole("textbox", { name: "IVA de Fulfillment" })).toBeNull();
      // Los demás cobros a la tienda siguen ahí: lo que se quita es solo el fulfillment.
      expect(filaDe("Flete por entregado")).toBeDefined();
      expect(filaDe("Comisión COD")).toBeDefined();
      expect(screen.getByText(NOTA)).toBeInTheDocument();
    });
  }
});

describe("SLT-94 R13 — el fulfillment en el precio propio de la tienda", () => {
  it("SLT-94 R13: se ofrece, sin selector de modo, en monto y con su % de IVA", () => {
    render(<TarifasValores {...props()} />);
    const fila = filaDe("Fulfillment");
    expect(fila).toBeDefined();
    expect(within(fila!).queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Modo de Fulfillment" })).toBeNull();
    expect(within(fila!).getByText(`Monto ${monedaConfig.simbolo}`)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Valor de Fulfillment" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "IVA de Fulfillment" })).toBeInTheDocument();
    // Los demás conceptos conservan su selector: el modo fijo es solo del fulfillment.
    expect(screen.getByRole("combobox", { name: "Modo de Comisión COD" })).toBeInTheDocument();
    expect(screen.queryByText(NOTA)).toBeNull();
  });

  it("SLT-94 R13: guarda 1 000 + 13 % en monto, sin zona ni grupo y con la tienda", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "tienda_fulfillment:todos", status: "ok" }] });
    const u = userEvent.setup();
    render(<TarifasValores {...props()} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Fulfillment" }), "1000");
    await u.type(screen.getByRole("textbox", { name: "IVA de Fulfillment" }), "13");
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    const cambios = guardarMock.mock.calls[0][0].cambios;
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({
      accion: "fijar",
      clave: "tienda_fulfillment:todos",
      datos: {
        concepto: "tienda_fulfillment",
        modo: "monto",
        valor: "1000",
        ivaPct: "13",
        zonaId: null,
        grupoId: null,
        tiendaId: "t1",
        vehiculoId: null,
      },
    });
  });

  it("SLT-94 R11/R14: un % viejo guardado no se arrastra; al editarlo se envía en monto", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "tienda_fulfillment:todos", status: "ok" }] });
    const u = userEvent.setup();
    const viejo = valor("tienda_fulfillment", {
      id: "viejo-pct",
      modo: "porcentaje",
      valor: "5.00",
      nivel: "tienda_general",
      zonaId: null,
      tiendaId: "t1",
    });
    render(<TarifasValores {...props({ valores: [viejo] })} />);

    const campo = screen.getByRole("textbox", { name: "Valor de Fulfillment" });
    await u.clear(campo);
    await u.type(campo, "1000");
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    expect(guardarMock.mock.calls[0][0].cambios[0].datos).toMatchObject({ modo: "monto", valor: "1000" });
  });
});
