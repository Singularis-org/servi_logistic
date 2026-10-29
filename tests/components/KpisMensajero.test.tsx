// @vitest-environment jsdom
// SL-9 (T3; design D3, D4; R11, R12, R14, R15, R16) — los indicadores del mensajero con la marca
// nueva: iconos de línea en un círculo de tokens que giran con el tema, y el brillo al pasar el
// cursor en el tono pálido de la paleta, sin tocar el del tema oscuro.
//
// Las cifras de contraste se MIDEN con el fixture compartido sobre los tokens reales de
// `app/globals.css`; no se copian de un comentario.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { KpisMensajero } from "@/app/(app)/mis-asignaciones/_components/KpisMensajero";
import { formatMonto } from "@/lib/config/moneda";

import { contraste, paleta, token } from "../fixtures/contraste";

const KPIS = { pendientes: 3, entregadas: 7, porCobrar: 12500, totalACobrar: 48000 };

/** `Intl` usa espacio duro (U+00A0); testing-library normaliza el DOM, no el esperado. */
const norm = (texto: string) => texto.replace(/\s/g, " ");

function montar() {
  return render(<KpisMensajero kpis={KPIS} />);
}

/** Las tarjetas: los hijos directos de la sección de indicadores. */
function tarjetas(container: HTMLElement): HTMLElement[] {
  const seccion = container.querySelector("section");
  if (!seccion) throw new Error("KpisMensajero ya no pinta su <section>");
  return Array.from(seccion.children) as HTMLElement[];
}

afterEach(() => {
  cleanup();
});

describe("KpisMensajero — iconos (D3)", () => {
  it("R11: cuatro iconos de línea distintos, decorativos, y ningún <img>", () => {
    const { container } = montar();

    expect(container.querySelector("img")).toBeNull();

    const iconos = Array.from(container.querySelectorAll("svg"));
    expect(iconos).toHaveLength(4);

    const esperados = ["lucide-truck", "lucide-package-check", "lucide-hand-coins", "lucide-wallet"];
    for (const [i, clase] of esperados.entries()) {
      expect(iconos[i]!.classList.contains(clase)).toBe(true);
    }
    // Distintos: ningún svg lleva la clase de otro indicador.
    for (const [i, svg] of iconos.entries()) {
      const ajenas = esperados.filter((_, j) => j !== i);
      expect(ajenas.some((c) => svg.classList.contains(c))).toBe(false);
    }
    // Decorativos: dentro de un contenedor que el lector de pantalla ignora.
    for (const svg of iconos) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("R12: el círculo es `bg-accent text-accent-foreground` y el trazo contrasta en los dos temas", () => {
    const { container } = montar();

    for (const svg of Array.from(container.querySelectorAll("svg"))) {
      const circulo = svg.parentElement!;
      expect(circulo.getAttribute("aria-hidden")).toBe("true");
      expect(circulo.classList.contains("bg-accent")).toBe(true);
      expect(circulo.classList.contains("text-accent-foreground")).toBe(true);
    }

    for (const tema of ["claro", "oscuro"] as const) {
      expect(contraste(token(tema, "accent-foreground"), token(tema, "accent"))).toBeGreaterThanOrEqual(3);
    }
    // No hay amarillo sobre claro: el amarillo de la marca solo traza en oscuro.
    expect(token("claro", "accent-foreground").toUpperCase()).not.toBe("#FFD000");
  });

  it("R16: conserva los cuatro rótulos y las cuatro cifras", () => {
    montar();

    for (const rotulo of ["Pendientes", "Entregado", "Por cobrar", "Total a cobrar"]) {
      expect(screen.getByText(rotulo)).toBeInTheDocument();
    }
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(norm(formatMonto(12500)))).toBeInTheDocument();
    expect(screen.getByText(norm(formatMonto(48000)))).toBeInTheDocument();
  });
});

describe("KpisMensajero — brillo al pasar el cursor (D4)", () => {
  it("R14: en claro el brillo nace en `brand-soft`, sin el tono anterior, y el texto se lee encima", () => {
    const { container } = montar();
    const lista = tarjetas(container);
    expect(lista).toHaveLength(4);

    for (const tarjeta of lista) {
      const clases = tarjeta.className;
      expect(clases).not.toContain("purple-");
      expect(clases.split(/\s+/)).toContain("before:from-brand-soft");
    }

    const fondo = paleta("brand-soft");
    expect(contraste(token("claro", "muted-foreground"), fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("claro", "foreground"), fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it("R15: en oscuro el brillo sigue siendo blanco al 10% desvaneciéndose", () => {
    const { container } = montar();

    for (const tarjeta of tarjetas(container)) {
      const clases = tarjeta.className.split(/\s+/);
      expect(clases).toContain("dark:before:from-white/10");
      expect(clases).toContain("dark:before:to-transparent");
    }
  });
});
