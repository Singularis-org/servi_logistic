// @vitest-environment jsdom
// SLT-58 (design §6.2; R3, R4, R5, R6) — ARREGLOS DE DISEÑO DE `ConsumoDelPlan`.
//
// El estado de cada barra se lee sin depender del color: la marca lleva texto E icono, y cada estado
// tiene su clase de token (normal = neutro, nunca el amarillo de marca; cerca = `warning-strong`;
// lleno = `danger-strong`). El reinicio cuelga de las órdenes del período (SLT-86 R8: sin tope ni barra), sin plan se pinta un
// `EmptyState`. (`/mi-plan` ya no tiene `loading.tsx`: lo quitó R8 para que `notFound()` dé 404 real.)
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import type { FilaConsumo, PlanConConsumo } from "@/lib/types/consumo-plan";

function fila(clave: FilaConsumo["clave"], etiqueta: string, usados: number, maximo: number | null, estado: FilaConsumo["estado"]): FilaConsumo {
  return { clave, etiqueta, usados, maximo, estado, texto: `${usados} de ${maximo ?? "sin límite"} ${etiqueta}` };
}

const PLAN: PlanConConsumo = {
  nombre: "Plan Crecer",
  activoDesde: "2026-01-15",
  precioTexto: "45000 al mes",
  modulos: [],
  // SLT-86 (R8): las órdenes ya no son una fila con tope; van en `ordenesDelPeriodo`.
  filas: [
    fila("adminTienda", "admins de tienda", 1, 5, "normal"),
    fila("mensajero", "mensajeros", 8, 10, "cerca"),
    fila("api_keys", "API keys", 2, 2, "lleno"),
    // SLT-66 R5: el maestro ya no tiene fila; la fila sin límite de prueba pasa a ser la de admin.
    fila("admin", "administradores", 1, null, "sin_limite"),
  ],
  ordenesDelPeriodo: 100,
  reinicio: { dias: 12, fecha: "2026-03-15" },
  cambioPendiente: null,
  // SLT-66 R18: campo nuevo del tipo; estos casos no lo comprueban.
  costeo: {
    modo: "fijo", // SLT-83: el costeo pasó a unión por modo
    base: { tipo: "monto", periodo: "45000.00" },
    costoPorOrden: "100.00",
    fuente: "plan",
    ordenes: 100,
    subtotalOrdenes: "10000.00",
    total: "55000.00",
    sinCostoConcreto: false,
  },
  // Ajuste planes-custom (D9) y SLT-86 (R27): estos casos no lo comprueban.
  cobro: {
    tipo: "mensual",
    periodo: { desde: "2026-03-01", hasta: "2026-03-31", esTramo: false },
    costo: "45000.00",
    siguienteCobro: "2026-04-01",
    pendiente: null,
  },
};

function relleno(nombre: string): HTMLElement {
  const barra = screen.getByRole("meter", { name: nombre });
  return barra.firstElementChild as HTMLElement;
}

afterEach(() => cleanup());

describe("SLT-58 R3/R4 — el estado de cada barra se distingue sin depender del color", () => {
  it("normal usa un tono neutro, nunca el amarillo de marca (`primary`)", () => {
    render(<ConsumoDelPlan plan={PLAN} textoSinPlan="x" />);
    const r = relleno("admins de tienda");
    expect(r).toHaveClass("bg-muted-foreground");
    expect(r.className).not.toMatch(/\bbg-primary(?![\w-])/);
  });

  it("cerca usa `warning-strong` y lleno `danger-strong` (>= 3:1 sobre la pista)", () => {
    render(<ConsumoDelPlan plan={PLAN} textoSinPlan="x" />);
    expect(relleno("mensajeros")).toHaveClass("bg-warning-strong");
    expect(relleno("API keys")).toHaveClass("bg-danger-strong");
    // Ninguna barra pinta el amarillo de marca ni el `warning` claro de bajo contraste.
    for (const m of screen.getAllByRole("meter")) {
      expect((m.firstElementChild as HTMLElement).className).not.toMatch(/\bbg-(primary|warning)(?![\w-])/);
    }
  });

  it("las marcas «Cerca del tope» y «Lleno» llevan un icono decorativo distinto (aria-hidden)", () => {
    render(<ConsumoDelPlan plan={PLAN} textoSinPlan="x" />);
    const cerca = screen.getByText("Cerca del tope");
    const lleno = screen.getByText("Lleno");
    const iconoCerca = cerca.querySelector("svg");
    const iconoLleno = lleno.querySelector("svg");
    expect(iconoCerca).not.toBeNull();
    expect(iconoLleno).not.toBeNull();
    expect(iconoCerca).toHaveAttribute("aria-hidden", "true");
    expect(iconoLleno).toHaveAttribute("aria-hidden", "true");
    expect(iconoCerca?.getAttribute("class")).toMatch(/lucide-triangle-alert/);
    expect(iconoLleno?.getAttribute("class")).toMatch(/lucide-ban/);
    // El nombre accesible del badge sigue siendo solo el texto.
    expect(cerca.textContent).toBe("Cerca del tope");
    expect(lleno.textContent).toBe("Lleno");
  });

  it("las filas normal y sin límite no llevan marca ni icono", () => {
    render(<ConsumoDelPlan plan={PLAN} textoSinPlan="x" />);
    const filas = within(screen.getByRole("list", { name: "Consumo" })).getAllByRole("listitem");
    // La primera es la de las órdenes del período; luego la normal y, al final, la sin límite.
    expect(filas[1].querySelector("svg")).toBeNull();
    expect(filas[4].querySelector("svg")).toBeNull();
  });
});

describe("SLT-58 R5, SLT-86 R7 — el reinicio va bajo las órdenes del período", () => {
  it("el texto «Se reinicia en N días (fecha)» está con las órdenes del período y en ninguna otra fila", () => {
    render(<ConsumoDelPlan plan={PLAN} textoSinPlan="x" />);
    const reinicio = screen.getByText("Se reinicia en 12 días (2026-03-15)");
    const filas = within(screen.getByRole("list", { name: "Consumo" })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Órdenes en el período: 100");
    expect(filas[0]).toContainElement(reinicio);
    for (const f of filas.slice(1)) expect(f).not.toContainElement(reinicio);
  });
});

describe("SLT-58 — rejilla de dos columnas desde `lg`", () => {
  it("no parte en dos columnas a 768 px (`md`)", () => {
    const { container } = render(<ConsumoDelPlan plan={PLAN} textoSinPlan="x" />);
    const rejilla = container.firstElementChild as HTMLElement;
    expect(rejilla).toHaveClass("lg:grid-cols-2");
    expect(rejilla.className).not.toMatch(/md:grid-cols-2/);
  });
});

describe("SLT-58 R6 — sin plan, un EmptyState con icono", () => {
  it("pinta el texto como título del estado vacío, con su icono decorativo", () => {
    const { container } = render(<ConsumoDelPlan plan={null} textoSinPlan="Sin plan: sin límites" />);
    const titulo = screen.getByText("Sin plan: sin límites");
    expect(titulo).toHaveClass("text-foreground");
    const icono = container.querySelector("span[aria-hidden='true'] svg");
    expect(icono).not.toBeNull();
    expect(icono?.getAttribute("class")).toMatch(/lucide-infinity/);
    expect(screen.queryByRole("meter")).toBeNull();
  });
});
