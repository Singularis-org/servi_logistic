// @vitest-environment jsdom
// SLT-119 (design §6.1; R1, R2, R5, R16, R17, R18) — LA LISTA DE FACTURAS DE LA EMPRESA.
//
// Las facturas van por empresa, no por plan (decisión del humano, 2026-11-12): una sin plan, una con un plan
// anterior y la en curso con el actual salen todas, y el plan es una columna más. Los importes son los de la base,
// formateados con `money()` y sin recalcular.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FacturasDeLaEmpresa } from "@/components/shared/facturas/FacturasDeLaEmpresa";
import type { DetalleFacturaResult } from "@/lib/types/factura-plataforma";

import { cuota, detalle, enPlataforma, factura } from "./_facturas-plataforma";

afterEach(() => cleanup());

// La más reciente primero, como las devuelve el servicio.
const EN_CURSO = factura({
  id: "aaaaaaaa-0000-4000-8000-000000000003",
  estado: "en_curso",
  numero: null,
  desde: enPlataforma("2026-12-01"),
  hasta: enPlataforma("2026-12-16"),
  hastaPrevisto: true,
  plan: { planId: "p-actual", planNombre: "Pro", tipoCobro: "mensual" },
  totalOrdenes: "1234.56",
  cuota: cuota({ planNombre: "Pro", cuota: "500.25" }),
  total: "1734.81",
  cerradaAt: null,
});
const CON_PLAN_ANTERIOR = factura({
  id: "aaaaaaaa-0000-4000-8000-000000000002",
  numero: 2,
  desde: enPlataforma("2026-11-16"),
  hasta: enPlataforma("2026-12-01"),
  plan: { planId: "p-anterior", planNombre: "Básico", tipoCobro: "quincenal" },
  totalOrdenes: "0.10",
  cuota: cuota({ planNombre: "Pro", cuota: "999.99" }),
  primeraCuota: cuota({ planNombre: "Pro", cuota: "0.01" }),
  total: "1000.10",
});
const SIN_PLAN = factura({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  numero: 1,
  desde: enPlataforma("2026-11-01"),
  hasta: enPlataforma("2026-11-16"),
  plan: null,
  totalOrdenes: "0.00",
  total: "0.00",
});

const cargarNoUsada = vi.fn<(i: { facturaId: string; pagina: number }) => Promise<DetalleFacturaResult>>();

function filas() {
  const [, ...cuerpo] = screen.getAllByRole("row");
  return cuerpo.map((fila) => within(fila).getAllByRole("cell").map((c) => c.textContent));
}

describe("SLT-119 R1 — todas las facturas de la empresa, por empresa y no por plan", () => {
  it("R1: una sin plan, una con el plan anterior y la en curso con el actual salen las tres, de la más reciente a la más antigua", () => {
    render(<FacturasDeLaEmpresa facturas={[EN_CURSO, CON_PLAN_ANTERIOR, SIN_PLAN]} cargarDetalle={cargarNoUsada} />);

    expect(screen.getByRole("heading", { level: 2, name: "Facturas de la empresa" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Número",
      "Período",
      "Plan de las órdenes",
      "Órdenes",
      "Cuotas",
      "Total",
      "Estado",
      "Detalle",
    ]);
    expect(filas()).toEqual([
      ["—", "1 dic 2026 – 15 dic 2026", "Pro", "₡1.234,56", "₡500,25(prevista)", "₡1.734,81", "En curso", "Ver detalle"],
      ["N.º 2", "16 nov 2026 – 30 nov 2026", "Básico", "₡0,10", "₡1.000", "₡1.000,10", "Emitida", "Ver detalle"],
      ["N.º 1", "1 nov 2026 – 15 nov 2026", "Sin plan", "₡0", "—", "₡0", "Emitida", "Ver detalle"],
    ]);
  });

  it("R1: ningún texto presenta las facturas como de un plan", () => {
    render(<FacturasDeLaEmpresa facturas={[EN_CURSO, SIN_PLAN]} cargarDetalle={cargarNoUsada} />);

    const seccion = screen.getByRole("region", { name: "Facturas de la empresa" });
    expect(within(seccion).getByText("Todas las facturas de la empresa, de cualquier plan o sin plan.")).toBeInTheDocument();
    expect(seccion.textContent).not.toMatch(/facturas del plan/i);
  });
});

describe("SLT-119 R2 — la no cerrada: «En curso», sin número, total parcial y cuotas «prevista»", () => {
  it.each(["en_curso", "por_cerrar"] as const)("R2: una %s se muestra igual", (estado) => {
    render(<FacturasDeLaEmpresa facturas={[{ ...EN_CURSO, estado }]} cargarDetalle={cargarNoUsada} />);

    const [fila] = filas();
    expect(fila[0]).toBe("—");
    expect(fila[4]).toBe("₡500,25(prevista)");
    expect(fila[5]).toBe("₡1.734,81");
    expect(fila[6]).toBe("En curso");
    expect(screen.queryByText(/N\.º/)).toBeNull();
  });
});

describe("SLT-119 R5 — los importes de la base, sin recalcular", () => {
  it("R5: importes con céntimos que un redondeo cambiaría se pintan tal cual (total que no es la suma de lo visible)", () => {
    // El total de la base no se recompone en pantalla: aunque no cuadre con las columnas, se pinta el suyo.
    const f = factura({ totalOrdenes: "1234.56", cuota: cuota({ cuota: "0.45" }), total: "1235.01" });
    render(<FacturasDeLaEmpresa facturas={[f]} cargarDetalle={cargarNoUsada} />);

    const [fila] = filas();
    expect(fila[3]).toBe("₡1.234,56");
    expect(fila[4]).toBe("₡0,45");
    expect(fila[5]).toBe("₡1.235,01");
  });
});

describe("SLT-119 R16 — solo lectura", () => {
  it("R16: los únicos botones abren el detalle; nada de editar, pagar, anular, enviar ni descargar", () => {
    render(<FacturasDeLaEmpresa facturas={[EN_CURSO, CON_PLAN_ANTERIOR, SIN_PLAN]} cargarDetalle={cargarNoUsada} />);

    const botones = screen.getAllByRole("button");
    expect(botones.map((b) => b.textContent)).toEqual(["Ver detalle", "Ver detalle", "Ver detalle"]);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /editar|pagar|anular|enviar|descargar|excel|pdf/i })).toBeNull();
  });

  it("R16, R6: «Ver detalle» abre el panel de esa factura y pide su detalle", async () => {
    const cargar = vi
      .fn<(i: { facturaId: string; pagina: number }) => Promise<DetalleFacturaResult>>()
      .mockResolvedValue({ estado: "ok", detalle: detalle(CON_PLAN_ANTERIOR, []) });
    const user = userEvent.setup();
    render(<FacturasDeLaEmpresa facturas={[EN_CURSO, CON_PLAN_ANTERIOR]} cargarDetalle={cargar} />);

    await user.click(screen.getByRole("button", { name: "Ver detalle de la factura 16 nov 2026 – 30 nov 2026" }));

    expect(await screen.findByRole("dialog", { name: "Factura N.º 2" })).toBeInTheDocument();
    expect(cargar).toHaveBeenCalledWith({ facturaId: CON_PLAN_ANTERIOR.id, pagina: 1 });
  });
});

describe("SLT-119 R17, R18 — fallo y vacío", () => {
  it("R17: si la lectura falló (`null`), la sección dice «No se pudieron cargar las facturas»", () => {
    render(<FacturasDeLaEmpresa facturas={null} cargarDetalle={cargarNoUsada} />);

    expect(screen.getByRole("heading", { name: "Facturas de la empresa" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las facturas");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("R18: sin facturas, «Aún no hay facturas de la empresa»", () => {
    render(<FacturasDeLaEmpresa facturas={[]} cargarDetalle={cargarNoUsada} />);

    expect(screen.getByText("Aún no hay facturas de la empresa")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
