// @vitest-environment jsdom
// SLT-66 (design §6.3; R18–R21, R10, R5) — EL BLOQUE «COSTO DEL CICLO» DE `ConsumoDelPlan`.
//
// El plan se arma con `planConConsumo` real, así que las cifras que se leen son las que calcula el
// servidor (`costeoDelCiclo`) y no unas escritas a mano en el doble. Los literales esperados sí van a
// mano: son los del spec. SLT-99 (decisión del humano del 2026-11-10): el bloque ya no pinta «Órdenes del
// período: n × c = s» ni «Total estimado del período»; donde el caso las esperaba, ahora se comprueba que no salen.
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
    topes: { porRol: { mensajero: 10 }, apiKeys: 2 },
    modulos: [],
    precio,
    costoPorOrden,
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
  };
}

function leido(
  vigente: VersionPlan,
  costoVigente: { modo: "fijo"; monto: string; fuente: FuenteDelCosto }, // SLT-83: el costo vigente lleva su modo
  ordenes = 3,
): PlanConUsoLeido {
  return {
    vigente,
    // SLT-86 (R5, R15): «ahora» es el 1 de marzo a las 00:00: el período de marzo completo, sin tramo.
    entrada: new Date("2026-01-15T06:00:00.000Z"),
    precioDelPeriodo: vigente.precio,
    pendiente: null,
    uso: { ordenes, apiKeys: 0, porRol: { admin: 1, mensajero: 2, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente,
    cobroCiclo: { cobrado: "0.00", pendientes: 0 }, // SLT-83: campo nuevo; el modo fijo no lo usa
    // Ajuste planes-custom (D6): campo nuevo; estos casos no lo comprueban.
    tipoCobro: "mensual",
  };
}

const MONTO_50000: PrecioPlan = { tipo: "monto", mensual: "50000.00", descuentos: {} };

function pintar(l: PlanConUsoLeido, textoExcepcion?: string) {
  return render(
    <ConsumoDelPlan plan={planConConsumo(l, AHORA)} textoSinPlan="sin plan" textoExcepcion={textoExcepcion} />,
  );
}

function bloque(): HTMLElement {
  return screen.getByRole("list", { name: "Costo del período" });
}

afterEach(() => cleanup());

describe("SLT-66 R18/R19, SLT-99 (2026-11-10) — base con monto: costo base y costo por orden, sin órdenes ni total", () => {
  it("pinta el costo base y el costo por orden con los importes del servidor; ni las órdenes del período ni el total", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));

    expect(screen.getByText("Costo del período")).toBeInTheDocument();
    const b = bloque();
    // SLT-86 (R28): el costo base del período en curso, con su tipo.
    expect(within(b).getByText("Costo base mensual: 50000.00")).toBeInTheDocument();
    expect(within(b).getByText("Costo por orden: 100.00")).toBeInTheDocument();
    expect(within(b).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/^Órdenes del período: /)).toBeNull();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
  });

  it("ya no pinta «Precio informativo» (R9)", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));
    expect(screen.queryByText(/Precio informativo/)).toBeNull();
  });
});

describe("SLT-66 R20 — las situaciones de la base", () => {
  it("base 0.00 es un monto: «Costo base mensual: 0.00», sin total", () => {
    pintar(leido(version({ tipo: "monto", mensual: "0.00", descuentos: {} }, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));
    const b = bloque();
    expect(within(b).getByText("Costo base mensual: 0.00")).toBeInTheDocument();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
  });

  it("plan sin costo por orden y empresa sin excepción: el global, sin nota", () => {
    pintar(leido(version(MONTO_50000, null), { modo: "fijo", monto: "500.00", fuente: "global" }));
    const b = bloque();
    expect(within(b).getByText("Costo por orden: 500.00")).toBeInTheDocument();
    expect(screen.queryByText(/^Órdenes del período: /)).toBeNull();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
  });

  // Ajuste planes-custom (D1): «negociable» ya no es una forma del costo base.
  it.each([["sin precio", { tipo: "sin_precio" } as PrecioPlan]])("base %s: «Costo base mensual: por definir», costo, y ni subtotal ni total", (_caso, precio) => {
    pintar(leido(version(precio, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));
    const b = bloque();
    expect(within(b).getByText("Costo base mensual: por definir")).toBeInTheDocument();
    expect(within(b).getByText("Costo por orden: 100.00")).toBeInTheDocument();
    expect(screen.queryByText(/^Órdenes del período: /)).toBeNull();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
  });
});

describe("SLT-66 R18 (P1) — la nota de fuente del costo por orden", () => {
  it("excepción de la empresa: «Mi plan» dice «precio acordado para tu empresa» con lo que paga", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: "80.00", fuente: "empresa" }));
    const b = bloque();
    expect(within(b).getByText("Costo por orden: 80.00")).toBeInTheDocument();
    expect(within(b).getByText("precio acordado para tu empresa")).toBeInTheDocument();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
  });

  it("el detalle del superadmin pasa su propio texto («excepción de la empresa») y no sale el de la empresa", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: "80.00", fuente: "empresa" }), "excepción de la empresa");
    expect(within(bloque()).getByText("excepción de la empresa")).toBeInTheDocument();
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
  });

  it.each<FuenteDelCosto>(["plan", "global", "sin_configurar"])("fuente %s: el importe sin ninguna nota", (fuente) => {
    pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: fuente === "sin_configurar" ? "0.00" : "100.00", fuente }));
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
    // El costo por orden es una línea sola: ningún texto colgando de ella.
    const linea = within(bloque()).getByText(/^Costo por orden: /);
    expect(linea.parentElement?.children).toHaveLength(1);
  });
});

describe("SLT-86 R13, R28 — un descuento de período no toca el costo por orden y el aviso del anual se va", () => {
  it("con descuento mensual y anual: la base lleva el del período en curso; el costo por orden, ninguno", () => {
    const precio: PrecioPlan = {
      tipo: "monto",
      mensual: "50000.00",
      descuentos: { mensual: { tipo: "monto", monto: "1000.00" }, anual: { tipo: "porcentaje", porcentaje: "10.00" } },
    };
    pintar(leido(version(precio, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));
    const b = bloque();
    expect(within(b).getByText("Costo base mensual: 49000.00")).toBeInTheDocument();
    expect(within(b).getByText("Costo por orden: 100.00")).toBeInTheDocument();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
    expect(screen.queryByText("El pago anual no cambia el costo por orden.")).toBeNull();
  });
});

describe("SLT-66 R21 — el costeo es solo una estimación", () => {
  it("debajo del bloque, en texto pequeño, la nota «Estimado: …»", () => {
    pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));
    const nota = screen.getByText(
      "Estimado: el costo base no se cobra todavía; cada orden se cobra al crearla y se descuenta si se anula.",
    );
    expect(nota).toHaveClass("text-xs", "text-muted-foreground");
  });

  it("sin plan no hay bloque de costo", () => {
    render(<ConsumoDelPlan plan={null} textoSinPlan="sin plan" />);
    expect(screen.queryByText("Costo del período")).toBeNull();
    expect(screen.queryByText(/^Estimado:/)).toBeNull();
  });
});

describe("SLT-66 R5 — ninguna fila ni línea del maestro", () => {
  it("el consumo no tiene fila «Maestro» y nada en pantalla lo nombra", () => {
    const { container } = pintar(leido(version(MONTO_50000, "100.00"), { modo: "fijo", monto: "100.00", fuente: "plan" }));
    const consumo = screen.getByRole("list", { name: "Consumo" });
    // Las órdenes del período (sin tope, SLT-86 R8), los cuatro roles con tope y API keys.
    expect(within(consumo).getAllByRole("listitem")).toHaveLength(6);
    expect(container.textContent).not.toMatch(/maestro/i);
  });
});
