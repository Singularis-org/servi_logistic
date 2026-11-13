// @vitest-environment jsdom
// SLT-130 — componente de pasos compartido (R1–R5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import {
  FormularioPorPasos,
  type FormularioPorPasosProps,
  type PasoDelFormulario,
} from "@/components/shared/FormularioPorPasos";

const PASOS: PasoDelFormulario[] = [
  { id: "general", titulo: "General" },
  { id: "precio", titulo: "Precio y descuentos" },
  { id: "revisar", titulo: "Revisar" },
];

function montar(props: Partial<FormularioPorPasosProps> = {}) {
  return render(
    <FormularioPorPasos
      pasos={PASOS}
      actual="precio"
      visitados={new Set(["general", "precio"])}
      onIr={() => {}}
      pie={<button type="button">Siguiente</button>}
      {...props}
    >
      <p>contenido del paso</p>
    </FormularioPorPasos>,
  );
}

function contenedor(container: HTMLElement) {
  return container.querySelector("[data-orientacion]");
}

/** Simula `matchMedia` con la pantalla angosta (o no). */
function pantallaAngosta(angosta: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: angosta,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe("FormularioPorPasos", () => {
  let matchMediaOriginal: typeof window.matchMedia;

  beforeEach(() => {
    matchMediaOriginal = window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMediaOriginal,
    });
  });

  it('R1: numera los pasos, marca el actual y pinta "Paso n de m"', () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Pasos" });
    const botones = within(nav).getAllByRole("button");
    expect(botones.map((b) => b.textContent)).toEqual([
      "1General",
      "2Precio y descuentos",
      "3Revisar",
    ]);
    expect(botones[1]).toHaveAttribute("aria-current", "step");
    expect(botones[0]).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    const titulo = screen.getByRole("heading", { level: 3, name: "Precio y descuentos" });
    expect(titulo).toHaveAttribute("tabindex", "-1");
  });

  it("R2: la orientación de la prop llega al contenedor", () => {
    pantallaAngosta(false);
    const { container, rerender } = montar({ orientacion: "vertical" });
    expect(contenedor(container)).toHaveAttribute("data-orientacion", "vertical");
    rerender(
      <FormularioPorPasos
        pasos={PASOS}
        actual="precio"
        visitados={new Set(["general", "precio"])}
        onIr={() => {}}
        orientacion="horizontal"
        pie={null}
      >
        <p>contenido</p>
      </FormularioPorPasos>,
    );
    expect(contenedor(container)).toHaveAttribute("data-orientacion", "horizontal");
  });

  it("R3: en pantalla angosta pasa a horizontal", () => {
    pantallaAngosta(true);
    const { container } = montar({ orientacion: "vertical" });
    expect(contenedor(container)).toHaveAttribute("data-orientacion", "horizontal");
  });

  it("R4: sin matchMedia usa la prop", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { container } = montar({ orientacion: "vertical" });
    expect(contenedor(container)).toHaveAttribute("data-orientacion", "vertical");
  });

  it("R5: no visitado deshabilitado; visitado llama a onIr", () => {
    const onIr = vi.fn();
    montar({ onIr });
    const nav = screen.getByRole("navigation", { name: "Pasos" });
    const [general, , revisar] = within(nav).getAllByRole("button");
    expect(revisar).toBeDisabled();
    fireEvent.click(revisar);
    expect(onIr).not.toHaveBeenCalled();
    expect(general).toBeEnabled();
    fireEvent.click(general);
    expect(onIr).toHaveBeenCalledWith("general");
  });
});
