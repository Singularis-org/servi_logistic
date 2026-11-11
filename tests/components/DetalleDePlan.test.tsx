// @vitest-environment jsdom
// SLT-99 (design §5; R8, R9, R13) — el detalle de un plan: tabla de períodos, comparación con el activo, aviso previo
// de los topes que sobran y «Cambiar a {plan}».
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetalleDePlan, type ActivoDelDetalle } from "@/components/shared/planes/DetalleDePlan";
import type { PlanVista } from "@/lib/types/planes";

const EMPRENDE: PlanVista = {
  id: "emprende",
  nombre: "Emprende",
  precio: { tipo: "monto", mensual: "25000.00", descuentos: { bimestral: { tipo: "porcentaje", porcentaje: "5" } } },
  costoPorOrden: "150.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 2, mensajero: 10, adminTienda: 2, adminSatelite: 1 }, apiKeys: 2 },
  modulos: ["ranking"],
};
const BASICO: PlanVista = {
  id: "basico",
  nombre: "Básico",
  precio: { tipo: "monto", mensual: "12000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  costoPorOrden: "200.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 1, mensajero: 4, adminTienda: 1, adminSatelite: 1 }, apiKeys: 1 },
  modulos: [],
};
const SIN_CUOTA: PlanVista = { ...BASICO, id: "paquete", nombre: "Por paquete", precio: { tipo: "monto", mensual: "0.00", descuentos: {} } };

const ACTIVO: ActivoDelDetalle = {
  plan: EMPRENDE,
  // 1 admin, 3 mensajeros, 1 admin de tienda y 2 API keys: caben en Emprende y en Básico salvo las API keys.
  uso: { ordenes: 412, apiKeys: 2, porRol: { admin: 1, mensajero: 3, adminTienda: 1, adminSatelite: 0 } },
  tipoCobro: "mensual",
  periodo: { desde: "2026-11-01", hasta: "2026-11-30", esTramo: false },
  siguienteCobro: "2026-12-01",
};

const filasDe = (nombre: string) =>
  within(screen.getByRole("table", { name: nombre }))
    .getAllByRole("row")
    .slice(1)
    .map((tr) => within(tr).getAllByRole("cell").map((td) => td.textContent));

afterEach(() => cleanup());

describe("R8 — el detalle de otro plan, con el plan activo", () => {
  it("la tabla de períodos con su descuento, lo que se paga y lo que equivale por mes, y el tipo de la empresa resaltado", () => {
    render(<DetalleDePlan plan={EMPRENDE} vista="mensual" activo={{ ...ACTIVO, plan: BASICO }} />);

    expect(screen.getByRole("heading", { name: "Detalles de Emprende" })).toBeInTheDocument();
    expect(filasDe("Uso de la plataforma según el período de cobro")).toEqual([
      ["Quincenal", "—", "12500.00", "25000.00"],
      ["Mensual (tu período)", "—", "25000.00", "25000.00"],
      ["Bimestral", "5 %", "47500.00", "23750.00"],
      ["Anual", "—", "300000.00", "25000.00"],
    ]);
    expect(document.querySelectorAll("tr[data-resaltado]")).toHaveLength(1);
    expect(screen.getByText("Resaltado: tu período de cobro actual (Mensual).")).toBeInTheDocument();
  });

  it("la comparación concepto por concepto con el plan activo y el botón «Cambiar a {plan}»", async () => {
    const onCambiar = vi.fn();
    render(<DetalleDePlan plan={EMPRENDE} vista="mensual" activo={{ ...ACTIVO, plan: BASICO }} onCambiar={onCambiar} />);

    const tabla = screen.getByRole("table", { name: "Comparación con tu plan" });
    expect(within(tabla).getByRole("columnheader", { name: "Tu plan (Básico)" })).toBeInTheDocument();
    expect(filasDe("Comparación con tu plan")).toEqual([
      ["Uso de la plataforma", "25000.00", "12000.00"],
      ["Costo por orden", "150.00 por orden", "200.00 por orden"],
      ["Usuarios", "15", "7"],
      ["API keys", "2", "1"],
      ["Analítica", "No incluido", "No incluido"],
      ["Monitoreo", "No incluido", "No incluido"],
      ["Ranking", "Incluido", "No incluido"],
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar a Emprende" }));
    expect(onCambiar).toHaveBeenCalledTimes(1);
  });

  it("en la tarjeta del plan activo: «Activo», el período en curso y el próximo cobro, sin botón de cambio", () => {
    render(<DetalleDePlan plan={EMPRENDE} vista="mensual" activo={{ ...ACTIVO, activoDesde: "2026-09-01" }} onCambiar={vi.fn()} />);

    const detalle = screen.getByRole("region", { name: "Detalles de Emprende" });
    expect(within(detalle).getByText("Activo")).toBeInTheDocument();
    expect(within(detalle).getByText("Activo desde").nextSibling).toHaveTextContent("1 sep 2026");
    expect(within(detalle).getByText("Período en curso").nextSibling).toHaveTextContent("2026-11-01 – 2026-11-30");
    expect(within(detalle).getByText("Próximo cobro").nextSibling).toHaveTextContent("2026-12-01");
    expect(screen.queryByRole("button", { name: /Cambiar a/ })).toBeNull();
    expect(screen.queryByRole("table", { name: "Comparación con tu plan" })).toBeNull();
  });

  it("sin «Cambiar a» si quien monta no pasa la acción (empresa sin plan, R18)", () => {
    render(<DetalleDePlan plan={EMPRENDE} vista="mensual" activo={{ ...ACTIVO, plan: BASICO }} />);

    expect(screen.queryByRole("button", { name: /Cambiar a/ })).toBeNull();
  });

  it("P1: un plan sin cuota dice «Sin cuota» en las cuatro filas y en la comparación", () => {
    render(<DetalleDePlan plan={SIN_CUOTA} vista="mensual" activo={ACTIVO} />);

    expect(filasDe("Uso de la plataforma según el período de cobro").map((f) => f[2])).toEqual([
      "Sin cuota",
      "Sin cuota",
      "Sin cuota",
      "Sin cuota",
    ]);
    expect(filasDe("Comparación con tu plan")[0]).toEqual(["Uso de la plataforma", "Sin cuota", "25000.00"]);
  });

  it("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28–R29): sin costo base ni costo por orden → «Sin cuota» y «Tarifa global»", () => {
    const sinCostos: PlanVista = { ...BASICO, id: "sin-costos", nombre: "Sin costos", precio: { tipo: "sin_precio" }, costoPorOrden: null };
    render(<DetalleDePlan plan={sinCostos} vista="mensual" activo={ACTIVO} />);

    expect(filasDe("Uso de la plataforma según el período de cobro").map((f) => f[2])).toEqual([
      "Sin cuota",
      "Sin cuota",
      "Sin cuota",
      "Sin cuota",
    ]);
    const comparacion = filasDe("Comparación con tu plan");
    expect(comparacion[0]).toEqual(["Uso de la plataforma", "Sin cuota", "25000.00"]);
    expect(comparacion[1]?.[0]).toBe("Costo por orden");
    expect(comparacion[1]?.[1]).toBe("Tarifa global");
  });
});

describe("R13 — el aviso previo de los topes que sobran", () => {
  it("antes de confirmar, una línea por tope pasado con el texto del rechazo", () => {
    const uso = { ordenes: 0, apiKeys: 3, porRol: { admin: 1, mensajero: 6, adminTienda: 1, adminSatelite: 0 } };
    render(<DetalleDePlan plan={BASICO} vista="mensual" activo={{ ...ACTIVO, uso }} onCambiar={vi.fn()} />);

    expect(screen.getByText("Básico permite 4 y tienes 6: sobran 2 mensajeros.")).toBeInTheDocument();
    expect(screen.getByText("Básico permite 1 y tienes 3: sobran 2 API keys.")).toBeInTheDocument();
  });

  it("sin topes pasados no hay aviso", () => {
    render(<DetalleDePlan plan={EMPRENDE} vista="mensual" activo={{ ...ACTIVO, plan: BASICO }} onCambiar={vi.fn()} />);

    expect(screen.queryByText(/sobra/)).toBeNull();
  });
});

describe("R9 — montado sin empresa (SLT-116)", () => {
  it("sin activo ni acciones: la tabla y el plan, sin «Activo», sin columna de comparación y sin botones", () => {
    render(<DetalleDePlan plan={EMPRENDE} vista="anual" />);

    expect(screen.queryByText("Activo")).toBeNull();
    expect(document.querySelectorAll("tr[data-resaltado]")).toHaveLength(0);
    expect(screen.queryByText(/Resaltado/)).toBeNull();
    const tabla = screen.getByRole("table", { name: "Lo que incluye" });
    expect(within(tabla).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Concepto", "Emprende"]);
    // Sin empresa, «Uso de la plataforma» va con la vista elegida en el carrusel.
    expect(filasDe("Lo que incluye")[0]).toEqual(["Uso de la plataforma", "300000.00"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
