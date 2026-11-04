// @vitest-environment jsdom
// SLT-66 (design §6.3; R18–R21, R10, R5) — EL BLOQUE «COSTO DEL CICLO» DE `ConsumoDelPlan`.
//
// El plan se arma con `planConConsumo` real, así que las cifras que se leen son las que calcula el
// servidor (`costeoDelCiclo`) y no unas escritas a mano en el doble. Los literales esperados sí van a
// mano: son los del spec.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { FuenteDelCosto } from "@/lib/types/consumo-plan";
import type { PrecioPlan, VersionPlan } from "@/lib/types/planes";

const AHORA = new Date("2026-03-01T06:00:00.000Z");

function version(precio: PrecioPlan, costoPorOrden: string | null): VersionPlan {
  return {
    nombre: "Plan Costeo",
    topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
    modulos: [],
    precio,
    costoPorOrden,
  };
}

function leido(
  vigente: VersionPlan,
  costoVigente: { monto: string; fuente: FuenteDelCosto },
  ordenes = 3,
): PlanConUsoLeido {
  return {
    vigente,
    ancla: new Date("2026-01-15T06:00:00.000Z"),
    uso: { ordenes, apiKeys: 0, porRol: { admin: 1, mensajero: 2, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente,
  };
}

const MONTO_50000: PrecioPlan = { tipo: "monto", mensual: "50000.00", anual: null };

function pintar(l: PlanConUsoLeido, textoExcepcion?: string) {
  return render(
    <ConsumoDelPlan plan={planConConsumo(l, AHORA)} textoSinPlan="sin plan" textoExcepcion={textoExcepcion} />,
  );
}

function bloque(): HTMLElement {
  return screen.getByRole("list", { name: "Costo del ciclo" });
}

afterEach(() => cleanup());

describe("SLT-66 R18/R19 — base con monto: base + órdenes × costo = total", () => {
  it("pinta las cuatro líneas con los importes del servidor, y el total resaltado", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: "100.00", fuente: "plan" }));

    expect(screen.getByText("Costo del ciclo")).toBeInTheDocument();
    const b = bloque();
    expect(within(b).getByText("Costo base: 50000.00 al mes")).toBeInTheDocument();
    expect(within(b).getByText("Costo por orden: 100.00")).toBeInTheDocument();
    expect(within(b).getByText("Órdenes del ciclo: 3 × 100.00 = 300.00")).toBeInTheDocument();
    const total = within(b).getByText("Total estimado del ciclo: 50300.00");
    expect(total.tagName).toBe("STRONG");
  });

  it("ya no pinta «Precio informativo» (R9)", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: "100.00", fuente: "plan" }));
    expect(screen.queryByText(/Precio informativo/)).toBeNull();
  });
});

describe("SLT-66 R20 — las situaciones de la base", () => {
  it("base 0.00 es un monto: «Costo base: 0.00 al mes» y el total es solo el de las órdenes", () => {
    pintar(leido(version({ tipo: "monto", mensual: "0.00", anual: null }, "100.00"), { monto: "100.00", fuente: "plan" }));
    const b = bloque();
    expect(within(b).getByText("Costo base: 0.00 al mes")).toBeInTheDocument();
    expect(within(b).getByText("Total estimado del ciclo: 300.00")).toBeInTheDocument();
  });

  it("plan sin costo por orden y empresa sin excepción: el global, sin nota, y hay total", () => {
    pintar(leido(version(MONTO_50000, null), { monto: "500.00", fuente: "global" }));
    const b = bloque();
    expect(within(b).getByText("Costo por orden: 500.00")).toBeInTheDocument();
    expect(within(b).getByText("Órdenes del ciclo: 3 × 500.00 = 1500.00")).toBeInTheDocument();
    expect(within(b).getByText("Total estimado del ciclo: 51500.00")).toBeInTheDocument();
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
  });

  it.each([
    ["negociable", { tipo: "negociable" } as PrecioPlan],
    ["sin precio", { tipo: "sin_precio" } as PrecioPlan],
  ])("base %s: «Costo base: por definir», costo y subtotal, y ningún total", (_caso, precio) => {
    pintar(leido(version(precio, "100.00"), { monto: "100.00", fuente: "plan" }));
    const b = bloque();
    expect(within(b).getByText("Costo base: por definir")).toBeInTheDocument();
    expect(within(b).getByText("Costo por orden: 100.00")).toBeInTheDocument();
    expect(within(b).getByText("Órdenes del ciclo: 3 × 100.00 = 300.00")).toBeInTheDocument();
    expect(screen.queryByText(/Total estimado del ciclo/)).toBeNull();
  });
});

describe("SLT-66 R18 (P1) — la nota de fuente del costo por orden", () => {
  it("excepción de la empresa: «Mi plan» dice «precio acordado para tu empresa», y el total usa lo que paga", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: "80.00", fuente: "empresa" }));
    const b = bloque();
    expect(within(b).getByText("Costo por orden: 80.00")).toBeInTheDocument();
    expect(within(b).getByText("precio acordado para tu empresa")).toBeInTheDocument();
    expect(within(b).getByText("Total estimado del ciclo: 50240.00")).toBeInTheDocument();
  });

  it("el detalle del superadmin pasa su propio texto («excepción de la empresa») y no sale el de la empresa", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: "80.00", fuente: "empresa" }), "excepción de la empresa");
    expect(within(bloque()).getByText("excepción de la empresa")).toBeInTheDocument();
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
  });

  it.each<FuenteDelCosto>(["plan", "global", "sin_configurar"])("fuente %s: el importe sin ninguna nota", (fuente) => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: fuente === "sin_configurar" ? "0.00" : "100.00", fuente }));
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
    // El costo por orden es una línea sola: ningún texto colgando de ella.
    const linea = within(bloque()).getByText(/^Costo por orden: /);
    expect(linea.parentElement?.children).toHaveLength(1);
  });
});

describe("SLT-66 R10 — el anual no toca el costo por orden", () => {
  it.each([
    ["anual fijo", { tipo: "fijo", monto: "500000.00" } as const],
    ["descuento anual", { tipo: "descuento", porcentaje: "10" } as const],
  ])("%s: pinta la nota y el total es el mismo que sin anual", (_caso, anual) => {
    pintar(leido(version({ ...MONTO_50000, anual }, "100.00"), { monto: "100.00", fuente: "plan" }));
    expect(screen.getByText("El pago anual no cambia el costo por orden.")).toBeInTheDocument();
    expect(within(bloque()).getByText("Costo por orden: 100.00")).toBeInTheDocument();
    expect(within(bloque()).getByText("Total estimado del ciclo: 50300.00")).toBeInTheDocument();
  });

  it("sin anual, la nota no aparece", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: "100.00", fuente: "plan" }));
    expect(screen.queryByText("El pago anual no cambia el costo por orden.")).toBeNull();
  });
});

describe("SLT-66 R21 — el costeo es solo una estimación", () => {
  it("debajo del bloque, en texto pequeño, la nota «Estimado: …»", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { monto: "100.00", fuente: "plan" }));
    const nota = screen.getByText(
      "Estimado: el costo base no se cobra todavía; cada orden se cobra al crearla y se descuenta si se anula.",
    );
    expect(nota).toHaveClass("text-xs", "text-muted-foreground");
  });

  it("sin plan no hay bloque de costo", () => {
    render(<ConsumoDelPlan plan={null} textoSinPlan="sin plan" />);
    expect(screen.queryByText("Costo del ciclo")).toBeNull();
    expect(screen.queryByText(/^Estimado:/)).toBeNull();
  });
});

describe("SLT-66 R5 — ninguna fila ni línea del maestro", () => {
  it("el consumo no tiene fila «Maestro» y nada en pantalla lo nombra", () => {
    const { container } = pintar(leido(version(MONTO_50000, "100.00"), { monto: "100.00", fuente: "plan" }));
    const consumo = screen.getByRole("list", { name: "Consumo" });
    // Órdenes, los cuatro roles con tope y API keys.
    expect(within(consumo).getAllByRole("listitem")).toHaveLength(6);
    expect(container.textContent).not.toMatch(/maestro/i);
  });
});
