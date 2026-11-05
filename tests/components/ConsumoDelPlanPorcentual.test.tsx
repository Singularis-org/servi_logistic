// @vitest-environment jsdom
// SLT-83 (design §4.4, §6.4; R23, R26) — EL BLOQUE «COSTO DEL CICLO» DE `ConsumoDelPlan` CON UN PLAN
// PORCENTUAL, en «Mi plan» y en el detalle de empresa del superadmin.
//
// El plan se arma con `planConConsumo` real, así que las cifras que se leen son las que calcula el
// servidor (`costeoDelCiclo`) y no unas escritas a mano en el doble. Los literales esperados van a mano:
// son los del spec.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { CobroDelCiclo } from "@/lib/types/consumo-plan";
import type { CostoPorOrdenPorcentual, PrecioPlan, VersionPlan } from "@/lib/types/planes";

const AHORA = new Date("2026-03-01T06:00:00.000Z");
const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const AVISO_R20 = "Plan sin costo concreto: complétalo en «Planes» o asígnale otro con costo base y costo por orden.";

const MONTO_50000: PrecioPlan = { tipo: "monto", mensual: "50000.00", anual: null };
const CON_MINIMO: CostoPorOrdenPorcentual = { porcentaje: "2.00", minimo: "500.00" };

function version(precio: PrecioPlan, porcentual: CostoPorOrdenPorcentual): VersionPlan {
  return {
    nombre: "Plan Porcentual",
    topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
    modulos: [],
    precio,
    costoPorOrden: null,
    costoPorOrdenPorcentual: porcentual,
  };
}

function leido(vigente: VersionPlan, cobroCiclo: CobroDelCiclo, ordenes = 7): PlanConUsoLeido {
  const p = vigente.costoPorOrdenPorcentual!;
  return {
    vigente,
    ancla: new Date("2026-01-15T06:00:00.000Z"),
    uso: { ordenes, apiKeys: 0, porRol: { admin: 1, mensajero: 2, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente: { modo: "porcentual", porcentaje: p.porcentaje, minimo: p.minimo, fuente: "plan" },
    cobroCiclo,
    tipoCobro: "mensual",
  };
}

function pintar(l: PlanConUsoLeido) {
  return render(<ConsumoDelPlan plan={planConConsumo(l, AHORA)} textoSinPlan="sin plan" />);
}

const bloque = () => screen.getByRole("list", { name: "Costo del ciclo" });
const lineas = () =>
  within(bloque())
    .getAllByRole("listitem")
    .map((li) => li.textContent);

afterEach(() => cleanup());

describe("SLT-83 R23 — «Mi plan» con un plan porcentual", () => {
  it("R23: base, porcentaje y mínimo con su nota, lo cobrado, las pendientes y el total base + cobrado", () => {
    pintar(leido(version(MONTO_50000, CON_MINIMO), { cobrado: "2500.00", pendientes: 4 }));

    expect(lineas()).toEqual([
      "Costo base: 50000.00 al mes",
      "Costo por orden: 2.00 % del valor del paquete, mínimo 500.00se cobra cuando la orden llega a un estado final",
      "Cobrado en el ciclo: 2500.00",
      "Órdenes del ciclo sin estado final: 4",
      "Total del ciclo hasta hoy: 50000.00 + 2500.00 = 52500.00",
    ]);
    const total = within(bloque()).getByText("Total del ciclo hasta hoy: 50000.00 + 2500.00 = 52500.00");
    expect(total.tagName).toBe("STRONG");
  });

  it("R23: las órdenes sin estado final son solo un conteo; no multiplican ni se estiman", () => {
    pintar(leido(version(MONTO_50000, CON_MINIMO), { cobrado: "0.00", pendientes: 3 }, 9));

    expect(within(bloque()).getByText("Órdenes del ciclo sin estado final: 3")).toBeInTheDocument();
    // Ninguna línea del modo fijo (órdenes × costo) ni el texto del total estimado.
    expect(within(bloque()).queryByText(/×/)).toBeNull();
    expect(screen.queryByText(/Total estimado del ciclo/)).toBeNull();
    expect(within(bloque()).getByText("Total del ciclo hasta hoy: 50000.00 + 0.00 = 50000.00")).toBeInTheDocument();
  });

  it("R23: sin mínimo dice solo el porcentaje", () => {
    pintar(leido(version(MONTO_50000, { porcentaje: "2.35", minimo: null }), { cobrado: "0.00", pendientes: 0 }));
    expect(within(bloque()).getByText("Costo por orden: 2.35 % del valor del paquete")).toBeInTheDocument();
    expect(within(bloque()).queryByText(/mínimo/)).toBeNull();
  });

  it("R23: lo cobrado negativo se pinta como resta («−», U+2212), nunca «+ -»", () => {
    pintar(leido(version(MONTO_50000, CON_MINIMO), { cobrado: "-500.00", pendientes: 0 }));

    expect(within(bloque()).getByText("Cobrado en el ciclo: -500.00")).toBeInTheDocument();
    const total = within(bloque()).getByText("Total del ciclo hasta hoy: 50000.00 − 500.00 = 49500.00");
    expect(total.tagName).toBe("STRONG");
    expect(bloque().textContent).toContain("50000.00 − 500.00 = 49500.00");
    expect(bloque().textContent).not.toContain("+ -");
  });

  it("R23: con la base por definir dice «Costo base: por definir» y no hay total", () => {
    pintar(leido(version({ tipo: "sin_precio" }, CON_MINIMO), { cobrado: "1000.00", pendientes: 2 }));

    expect(within(bloque()).getByText("Costo base: por definir")).toBeInTheDocument();
    expect(within(bloque()).getByText("Cobrado en el ciclo: 1000.00")).toBeInTheDocument();
    expect(screen.queryByText(/Total del ciclo hasta hoy/)).toBeNull();
  });

  it("R23: con anual, la nota de que no toca el costo por orden también sale", () => {
    pintar(
      leido(
        version({ tipo: "monto", mensual: "50000.00", anual: { tipo: "descuento", porcentaje: "10" } }, CON_MINIMO),
        { cobrado: "0.00", pendientes: 0 },
      ),
    );
    expect(within(bloque()).getByText("El pago anual no cambia el costo por orden.")).toBeInTheDocument();
  });
});

describe("SLT-83 R23 — detalle de empresa del superadmin", () => {
  function montarDetalle(l: PlanConUsoLeido) {
    const consumo = planConConsumo(l, AHORA);
    render(
      <ToastProvider>
        <PlanEmpresa
          organizacionId={ORG}
          empresaNombre="Envíos Norte"
          vista={{
            organizacionId: ORG,
            plan: { ...consumo, planId: "11111111-1111-4111-8111-111111111111", archivado: false },
            asignaciones: [],
          }}
          asignables={[]}
          asignarPlan={vi.fn()}
          rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
          inicioCicloPorDefecto="2026-10-30"
          previsualizarAsignacion={vi.fn()}
          cambiarTipoCobro={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  it("R23: muestra los mismos datos que «Mi plan» y, con base monto, sin el aviso «Plan sin costo concreto»", () => {
    montarDetalle(leido(version(MONTO_50000, CON_MINIMO), { cobrado: "2500.00", pendientes: 4 }));
    expect(lineas()).toEqual([
      "Costo base: 50000.00 al mes",
      "Costo por orden: 2.00 % del valor del paquete, mínimo 500.00se cobra cuando la orden llega a un estado final",
      "Cobrado en el ciclo: 2500.00",
      "Órdenes del ciclo sin estado final: 4",
      "Total del ciclo hasta hoy: 50000.00 + 2500.00 = 52500.00",
    ]);
    expect(screen.queryByText(AVISO_R20)).toBeNull();
  });

  it("R23: con la base por definir, el aviso «Plan sin costo concreto» igual que hoy", () => {
    montarDetalle(leido(version({ tipo: "sin_precio" }, CON_MINIMO), { cobrado: "0.00", pendientes: 1 }));
    expect(screen.getByText(AVISO_R20)).toBeInTheDocument();
    expect(within(bloque()).getByText("Costo base: por definir")).toBeInTheDocument();
    expect(screen.queryByText(/Total del ciclo hasta hoy/)).toBeNull();
  });
});
