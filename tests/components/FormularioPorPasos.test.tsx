// @vitest-environment jsdom
// SLT-130 — componente de pasos compartido (R1–R5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import {
  FormularioPorPasos,
  pasosElegibles,
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
      elegibles={new Set(["general", "precio"])}
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
        elegibles={new Set(["general", "precio"])}
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

  it("R5: no elegible deshabilitado; elegible llama a onIr", () => {
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

// SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» (R5, R6).
const PASOS_BORRADOR: PasoDelFormulario[] = [
  { id: "general", titulo: "General" },
  { id: "precio", titulo: "Precio y descuentos" },
  { id: "orden", titulo: "Cobro por orden" },
  { id: "topes", titulo: "Topes" },
  { id: "revisar", titulo: "Revisar" },
];

function montarConBorrador(props: Partial<FormularioPorPasosProps> & { guardados: ReadonlySet<string> }) {
  return render(
    <FormularioPorPasos
      pasos={PASOS_BORRADOR}
      actual="general"
      elegibles={pasosElegibles(PASOS_BORRADOR, props.guardados)}
      onIr={() => {}}
      pie={null}
      {...props}
    >
      <p>contenido</p>
    </FormularioPorPasos>,
  );
}

const botonesDelPaso = () => within(screen.getByRole("navigation", { name: "Pasos" })).getAllByRole("button");

describe("FormularioPorPasos con borrador (SLT-144)", () => {
  afterEach(cleanup);

  it("R5: solo se elige un paso guardado o el que sigue a uno guardado", () => {
    expect(pasosElegibles(PASOS_BORRADOR, new Set())).toEqual(new Set(["general"]));

    const onIr = vi.fn();
    montarConBorrador({ guardados: new Set(["general", "orden"]), onIr });
    const [general, precio, orden, topes, revisar] = botonesDelPaso();
    expect(general).toBeEnabled();
    expect(precio).toBeEnabled();
    expect(orden).toBeEnabled();
    expect(topes).toBeEnabled();
    expect(revisar).toBeDisabled();
    fireEvent.click(revisar);
    expect(onIr).not.toHaveBeenCalled();
    fireEvent.click(topes);
    expect(onIr).toHaveBeenCalledWith("topes");
  });

  it("R5: el paso actual se puede elegir aunque no sea elegible", () => {
    montarConBorrador({ guardados: new Set(), actual: "topes" });
    const [general, precio, , topes] = botonesDelPaso();
    expect(general).toBeEnabled();
    expect(precio).toBeDisabled();
    expect(topes).toBeEnabled();
  });

  it("R6: ✓ con su nombre accesible", () => {
    const { container } = montarConBorrador({ guardados: new Set(["general", "precio"]) });
    expect(screen.getByRole("button", { name: "General (guardado)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Precio y descuentos (guardado)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cobro por orden" })).toBeInTheDocument();
    // El ✓ ocupa el sitio del número: la marca visual no se lee dos veces.
    expect(container.querySelectorAll("nav svg")).toHaveLength(2);
    expect(screen.queryByText("Sin guardar")).not.toBeInTheDocument();
  });

  it("R6: un paso guardado que cambió pierde el ✓ y dice Sin guardar", () => {
    montarConBorrador({ guardados: new Set(["general", "precio"]), sinGuardar: new Set(["precio"]) });
    const precio = screen.getByRole("button", { name: /Precio y descuentos/ });
    expect(precio).not.toHaveAccessibleName("Precio y descuentos (guardado)");
    expect(within(precio).getByText("Sin guardar")).toBeInTheDocument();
    expect(within(precio).queryByText("2")).toBeInTheDocument();
    expect(precio.querySelector("svg")).toBeNull();
    // Sigue siendo elegible: está en los guardados del servidor.
    expect(precio).toBeEnabled();
    expect(screen.getByRole("button", { name: "General (guardado)" })).toBeInTheDocument();
  });

  it("sin las props del borrador no pinta ✓ ni Sin guardar (como SLT-130)", () => {
    const { container } = montar();
    expect(container.querySelectorAll("nav svg")).toHaveLength(0);
    expect(screen.queryByText("Sin guardar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "General" })).toBeEnabled();
  });

  it("R4: deshabilitado apaga toda la lista, también el paso actual", () => {
    const onIr = vi.fn();
    montarConBorrador({ guardados: new Set(["general", "precio"]), actual: "precio", deshabilitado: true, onIr });
    for (const boton of botonesDelPaso()) expect(boton).toBeDisabled();
    fireEvent.click(botonesDelPaso()[0]!);
    expect(onIr).not.toHaveBeenCalled();
  });
});
