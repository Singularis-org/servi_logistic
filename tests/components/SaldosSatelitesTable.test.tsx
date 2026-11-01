// @vitest-environment jsdom
//
// SLT-73 (R6) — una bodega satélite con cierres del día SIN CONSOLIDAR no sale «al día» en
// `/wallet/satelites`, y la tabla dice aparte cuánto de su deuda está sin consolidar y en cuántos
// cierres.
//
// El caso de producción que abrió la ficha: una satélite que cobra todo por SINPE y no consolida.
// No tiene ninguna consolidación en cola, así que hasta SLT-73 la antigüedad decía «al día» y la
// fila se escondía tras «Con pendiente». Esperados escritos a mano.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { ToastProvider } from "@/providers/ToastProvider";
import type { SaldoSateliteDTO } from "@/lib/types/conciliacion-satelites";

const listarSaldosMock = vi.fn();

vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  listarSaldosSatelitesAction: (...a: unknown[]) => listarSaldosMock(...a),
  listarSaldosSatelitesCompletoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { SaldosSatelitesTable } from "@/app/(app)/wallet/satelites/_components/SaldosSatelitesTable";

/** Todo SINPE, sin consolidar: debe ₡70.890,40 en 3 cierres y no tiene cola de consolidaciones. */
const TODO_SINPE_SIN_CONSOLIDAR: SaldoSateliteDTO = {
  zonaId: "z-sinpe",
  zonaNombre: "FGAM Pérez Zeledón",
  saldoSinConciliar: "70890.40",
  aporteSinConsolidar: "70890.40",
  cierresSinConsolidar: 3,
  totalEfectivo: "0.00",
  totalConsolidado: "0.00",
  totalRecibido: "0.00",
  consolidacionesSinConciliar: 0,
  diasDeLaMasAntigua: null,
  fechaDeLaMasAntigua: null,
  ultimaRecibida: null,
};

/** La que llegó de más: su saldo es NEGATIVO, pero tiene un cierre sin consolidar. */
const SALDO_NEGATIVO_CON_SIN_CONSOLIDAR: SaldoSateliteDTO = {
  ...TODO_SINPE_SIN_CONSOLIDAR,
  zonaId: "z-neg",
  zonaNombre: "FGAM Liberia",
  saldoSinConciliar: "-500.25",
  aporteSinConsolidar: "1200.75",
  cierresSinConsolidar: 1,
};

/** Al día de verdad: nada pendiente, nada sin consolidar. */
const AL_DIA: SaldoSateliteDTO = {
  ...TODO_SINPE_SIN_CONSOLIDAR,
  zonaId: "z-ok",
  zonaNombre: "FGAM Guanacaste",
  saldoSinConciliar: "0.00",
  aporteSinConsolidar: "0.00",
  cierresSinConsolidar: 0,
};

function montar(items: SaldoSateliteDTO[]) {
  listarSaldosMock.mockResolvedValue({ status: "ok", items, total: items.length, page: 1, pageSize: 25 });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        <SaldosSatelitesTable initialData={{ items, total: items.length, pageSize: 25 }} resumen={null} />
      </ToastProvider>
    </SWRConfig>,
  );
}

function filaDe(nombre: string): HTMLElement {
  const fila = screen.getByText(nombre).closest("tr");
  if (fila === null) throw new Error(`no hay fila de ${nombre}`);
  return fila;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SLT-73 R6 — lo sin consolidar en la tabla de saldos", () => {
  it("la satélite todo SINPE sin consolidar NO sale «al día» y dice cuánto y en cuántos cierres", () => {
    montar([TODO_SINPE_SIN_CONSOLIDAR]);
    // Se ve en la pestaña por defecto («Con pendiente»): no se esconde.
    const fila = filaDe("FGAM Pérez Zeledón");
    expect(within(fila).queryByText("al día")).toBeNull();
    expect(within(fila).getByText("sin consolidar")).toBeInTheDocument();
    expect(within(fila).getAllByText("₡70.890,40").length).toBe(2); // pendiente y sin consolidar
    expect(within(fila).getByText("3 cierres")).toBeInTheDocument();
    // Y no se confunde con una que llegó incompleta: no hay consolidación conciliada detrás.
    expect(within(fila).queryByText("Recibido incompleto")).toBeNull();
  });

  it("la columna «Sin consolidar» existe y dice «1 cierre» en singular", () => {
    montar([SALDO_NEGATIVO_CON_SIN_CONSOLIDAR]);
    expect(screen.getByRole("columnheader", { name: "Sin consolidar" })).toBeInTheDocument();
    const fila = filaDe("FGAM Liberia");
    expect(within(fila).getByText("₡1.200,75")).toBeInTheDocument();
    expect(within(fila).getByText("1 cierre")).toBeInTheDocument();
  });

  it("con saldo negativo pero aporte sin consolidar ≠ 0, tampoco está al día ni se esconde", () => {
    montar([SALDO_NEGATIVO_CON_SIN_CONSOLIDAR]);
    const fila = filaDe("FGAM Liberia");
    expect(within(fila).queryByText("al día")).toBeNull();
    expect(within(fila).getByText("sin consolidar")).toBeInTheDocument();
  });

  it("la que está al día de verdad sigue diciendo «al día» y «—» en sin consolidar", async () => {
    montar([TODO_SINPE_SIN_CONSOLIDAR, AL_DIA]);
    // «Con pendiente» cuenta sólo la que debe.
    expect(screen.getByRole("button", { name: /Con pendiente\(1\)/ })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Todas\(2\)/ }));
    const fila = filaDe("FGAM Guanacaste");
    expect(within(fila).getByText("al día")).toBeInTheDocument();
    expect(within(fila).queryByText(/cierre/)).toBeNull();
  });
});
