// @vitest-environment jsdom
// SLT-99 (design §5; R5, R6, R7, R9) — el carrusel de planes, compartido y sin empresa.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { CarruselDePlanes, type CarruselDePlanesProps } from "@/components/shared/planes/CarruselDePlanes";
import type { VistaDePrecio } from "@/components/shared/planes/planes-vista";
import type { PlanVista } from "@/lib/types/planes";

const BASICO: PlanVista = {
  id: "basico",
  nombre: "Básico",
  precio: { tipo: "monto", mensual: "12000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  costoPorOrden: "200.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 1, mensajero: 4, adminTienda: 1, adminSatelite: 0 }, apiKeys: 1 },
  modulos: [],
};
const CRECE: PlanVista = {
  id: "crece",
  nombre: "Crece",
  // Descuento anual en monto fijo: 12 × 45000 = 540000; 540000 − 45000 = 495000 → 8,33 % → «8 %».
  precio: { tipo: "monto", mensual: "45000.00", descuentos: { anual: { tipo: "monto", monto: "45000.00" } } },
  costoPorOrden: null,
  costoPorOrdenPorcentual: { porcentaje: "3.00", minimo: null },
  topes: { porRol: { admin: 5, mensajero: 25 }, apiKeys: null },
  modulos: ["analitica", "ranking"],
};
const SIN_CUOTA: PlanVista = {
  id: "paquete",
  nombre: "Por paquete",
  precio: { tipo: "monto", mensual: "0.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  costoPorOrden: "300.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 1, mensajero: 2, adminTienda: 1, adminSatelite: 1 }, apiKeys: 1 },
  modulos: ["monitoreo"],
};
const CUSTOM: PlanVista = { ...BASICO, id: "custom-1", nombre: "A la medida · Logística Norte" };

type Props = Omit<CarruselDePlanesProps, "vista" | "onCambiarVista" | "onSeleccionar"> &
  Partial<Pick<CarruselDePlanesProps, "onSeleccionar">>;

/** El carrusel controlado como lo monta «Mi plan». */
function Montaje({ onSeleccionar = vi.fn(), ...props }: Props) {
  const [vista, setVista] = useState<VistaDePrecio>("mensual");
  return <CarruselDePlanes {...props} vista={vista} onCambiarVista={setVista} onSeleccionar={onSeleccionar} />;
}

const tarjeta = (nombre: string) => {
  const card = screen.getByRole("button", { name: nombre }).closest("article");
  if (card === null) throw new Error(`sin tarjeta para ${nombre}`);
  return card;
};

afterEach(() => cleanup());

describe("R5 — una tarjeta por plan disponible y al final «Plan a la medida»", () => {
  it("en el orden del catálogo, con sus datos y los módulos uno por uno", () => {
    render(<Montaje planes={[BASICO, CRECE]} activoId="basico" />);

    const slides = within(screen.getByRole("region", { name: "Planes disponibles" })).getAllByRole("group");
    expect(slides.map((s) => s.querySelector("h3")?.textContent)).toEqual(["Básico", "Crece", "Plan a la medida"]);

    const crece = within(tarjeta("Crece"));
    expect(crece.getByText("Uso de la plataforma").nextSibling).toHaveTextContent("45000.00 / mes");
    expect(crece.getByText("Costo por orden").nextSibling).toHaveTextContent("3.00 % del valor del paquete");
    expect(crece.getByText("Usuarios").nextSibling).toHaveTextContent("Sin tope");
    expect(crece.getByText("API keys").nextSibling).toHaveTextContent("Sin tope");
    const modulos = crece.getByRole("list", { name: "Módulos" });
    expect(within(modulos).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "AnalíticaIncluido",
      "MonitoreoNo incluido",
      "RankingIncluido",
    ]);
    expect(modulos.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(3);
    expect(within(tarjeta("Básico")).getByText("Usuarios").nextSibling).toHaveTextContent("6");
  });

  it("el chip «Activo» solo en la del plan de la empresa; sin «Público» ni «Ver detalles»", () => {
    render(<Montaje planes={[BASICO, CRECE]} activoId="basico" />);

    expect(within(tarjeta("Básico")).getByText("Activo")).toBeInTheDocument();
    expect(within(tarjeta("Crece")).queryByText("Activo")).toBeNull();
    expect(screen.queryByText(/Público/)).toBeNull();
    expect(screen.queryByText(/Ver detalles/)).toBeNull();
  });

  it("la tarjeta entera se toca: el botón del nombre elige el plan y marca `aria-pressed`", async () => {
    const onSeleccionar = vi.fn();
    const { rerender } = render(<Montaje planes={[BASICO, CRECE]} onSeleccionar={onSeleccionar} />);

    await userEvent.click(screen.getByRole("button", { name: "Crece" }));
    expect(onSeleccionar).toHaveBeenCalledWith("crece");

    rerender(<Montaje planes={[BASICO, CRECE]} seleccionado="crece" onSeleccionar={onSeleccionar} />);
    expect(screen.getByRole("button", { name: "Crece" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Básico" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28–R29) — un plan sin costos en el carrusel", () => {
  it("sin costo base ni costo por orden: «Sin cuota» y «Costo por orden: Tarifa global»", () => {
    const sinCostos: PlanVista = { ...BASICO, id: "sin-costos", nombre: "Sin costos", precio: { tipo: "sin_precio" }, costoPorOrden: null };
    render(<Montaje planes={[BASICO, sinCostos]} />);

    const card = within(tarjeta("Sin costos"));
    expect(card.getByText("Uso de la plataforma").nextSibling).toHaveTextContent("Sin cuota");
    expect(card.getByText("Costo por orden").nextSibling).toHaveTextContent("Tarifa global");
    expect(card.getByText("Sin cuota · solo pagas el costo por orden")).toBeInTheDocument();
  });

  it("con costo base y sin costo por orden: el monto y «Tarifa global»", () => {
    render(<Montaje planes={[{ ...BASICO, costoPorOrden: null }]} />);
    expect(within(tarjeta("Básico")).getByText("Costo por orden").nextSibling).toHaveTextContent("Tarifa global");
    expect(within(tarjeta("Básico")).getByText("Uso de la plataforma").nextSibling).toHaveTextContent("12000.00 / mes");
  });
});

describe("R6 — «Mensual» / «Anual» y la insignia", () => {
  it("entra en «Mensual»: el costo mensual y ninguna insignia", () => {
    render(<Montaje planes={[BASICO, CRECE]} />);

    expect(screen.getByRole("radio", { name: "Mensual" })).toHaveAttribute("aria-checked", "true");
    expect(within(tarjeta("Básico")).getByText("12000.00")).toBeInTheDocument();
    expect(within(tarjeta("Básico")).getByText("por mes")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-insignia]")).toHaveLength(0);
  });

  it("en «Anual»: el costo del año con descuento y la insignia con el % (en monto fijo, el equivalente)", async () => {
    render(<Montaje planes={[BASICO, CRECE]} />);

    await userEvent.click(screen.getByRole("radio", { name: "Anual" }));

    expect(screen.getByRole("radio", { name: "Anual" })).toHaveAttribute("aria-checked", "true");
    expect(within(tarjeta("Básico")).getByText("129600.00")).toBeInTheDocument();
    expect(within(tarjeta("Básico")).getByText("por año")).toBeInTheDocument();
    expect(within(tarjeta("Básico")).getByText("10 % de descuento pagando anual")).toBeInTheDocument();
    expect(within(tarjeta("Crece")).getByText("495000.00")).toBeInTheDocument();
    expect(within(tarjeta("Crece")).getByText("8 %")).toBeInTheDocument();
  });

  it("las flechas mueven la elección dentro del grupo de radio", async () => {
    render(<Montaje planes={[BASICO]} />);

    screen.getByRole("radio", { name: "Mensual" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Anual" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Anual" })).toHaveFocus();
  });

  it("P1: un plan sin cuota dice «Sin cuota · solo pagas el costo por orden» en las dos vistas y sin insignia", async () => {
    render(<Montaje planes={[SIN_CUOTA]} />);

    expect(within(tarjeta("Por paquete")).getByText("Sin cuota · solo pagas el costo por orden")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
    expect(within(tarjeta("Por paquete")).getByText("Sin cuota · solo pagas el costo por orden")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-insignia]")).toHaveLength(0);
  });
});

describe("R7 — «Plan a la medida»", () => {
  it("P7: sin la acción de contacto, «Contáctanos» deshabilitado con «Próximamente» debajo", () => {
    render(<Montaje planes={[BASICO]} activoId="basico" />);

    const contacto = screen.getByRole("button", { name: "Contáctanos" });
    expect(contacto).toBeDisabled();
    expect(contacto).toHaveAccessibleDescription("Próximamente");
  });

  it("con la acción (SLT-117), el botón se activa y la llama", async () => {
    const onContactar = vi.fn();
    render(<Montaje planes={[BASICO]} onContactar={onContactar} />);

    await userEvent.click(screen.getByRole("button", { name: "Contáctanos" }));
    expect(onContactar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Próximamente")).toBeNull();
  });

  it("con un custom activo, esa tarjeta es su plan activo: nombre, «Activo», datos y sin «Contáctanos»", () => {
    render(<Montaje planes={[BASICO]} activoId="custom-1" customActivo={CUSTOM} />);

    const custom = within(tarjeta("A la medida · Logística Norte"));
    expect(custom.getByText("Activo")).toBeInTheDocument();
    expect(custom.getByText("Costo por orden").nextSibling).toHaveTextContent("200.00 por orden");
    expect(screen.queryByText("Plan a la medida")).toBeNull();
    expect(screen.queryByRole("button", { name: "Contáctanos" })).toBeNull();
  });
});

// Decisión del humano del 2026-11-10: la tarjeta del plan activo va primera; «Plan a la medida» al final si no es la activa.
describe("Decisión del humano del 2026-11-10 — el plan activo, primera tarjeta", () => {
  const nombres = () =>
    within(screen.getByRole("region", { name: "Planes disponibles" }))
      .getAllByRole("group")
      .map((s) => s.querySelector("h3")?.textContent);

  it("activo público: primero el activo, después los demás en el orden del catálogo y «Plan a la medida» al final", () => {
    render(<Montaje planes={[BASICO, CRECE, SIN_CUOTA]} activoId="crece" />);
    expect(nombres()).toEqual(["Crece", "Básico", "Por paquete", "Plan a la medida"]);
  });

  it("activo custom: primero su tarjeta (la de «Plan a la medida»), después los públicos en el orden del catálogo", () => {
    render(<Montaje planes={[BASICO, CRECE]} activoId="custom-1" customActivo={CUSTOM} />);
    expect(nombres()).toEqual(["A la medida · Logística Norte", "Básico", "Crece"]);
  });

  it("sin activo: el orden del catálogo y «Plan a la medida» al final, como antes", () => {
    render(<Montaje planes={[BASICO, CRECE, SIN_CUOTA]} />);
    expect(nombres()).toEqual(["Básico", "Crece", "Por paquete", "Plan a la medida"]);
  });
});

describe("R9 — montado sin empresa (SLT-116)", () => {
  it("sin activo ni acciones: las tarjetas sin chip «Activo»", () => {
    render(<Montaje planes={[BASICO, CRECE]} />);

    expect(screen.getAllByRole("button", { name: /Básico|Crece/ })).toHaveLength(2);
    expect(screen.queryByText("Activo")).toBeNull();
  });
});
