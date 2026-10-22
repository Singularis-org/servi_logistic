// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ANCHO_MINIMO_HORIZONTAL,
  Logo,
  archivoDeLogo,
} from "@/components/shared/Logo";

// Literales a propósito: son el contrato de R2-R4 y el nombre de R1, no se derivan del componente.
const HORIZONTAL_CLARO = "/brand/logo-horizontal-fondo-claro.svg";
const HORIZONTAL_OSCURO = "/brand/logo-horizontal-fondo-oscuro.svg";
const ISOTIPO_CLARO = "/brand/isotipo.svg";
const ISOTIPO_OSCURO = "/brand/isotipo-mono-blanco.svg";
const NOMBRE = "Servi Logistic";

// Partido a propósito: R26 exige que `grep -il` no lo encuentre en ningún archivo que SL-8
// toca, tests incluidos.
const NOMBRE_ANTERIOR = ["orden", "ex"].join("");

function imagenDelLogo(fondo: "claro" | "oscuro", ancho: number) {
  render(<Logo fondo={fondo} ancho={ancho} />);
  return screen.getByRole("img", { name: NOMBRE });
}

describe("components/shared/Logo — SVG de public/brand por fondo y ancho", () => {
  it("el umbral del horizontal es 140 px (docs/marca.md)", () => {
    expect(ANCHO_MINIMO_HORIZONTAL).toBe(140);
  });

  it.each([
    ["claro", 200, HORIZONTAL_CLARO],
    ["oscuro", 200, HORIZONTAL_OSCURO],
    ["claro", 32, ISOTIPO_CLARO],
    ["oscuro", 32, ISOTIPO_OSCURO],
  ] as const)("fondo %s a %i px usa %s (R2-R4)", (fondo, ancho, archivo) => {
    expect(archivoDeLogo(fondo, ancho)).toBe(archivo);
    expect(imagenDelLogo(fondo, ancho)).toHaveAttribute("src", archivo);
  });

  it.each([
    ["claro", HORIZONTAL_CLARO],
    ["oscuro", HORIZONTAL_OSCURO],
  ] as const)("a 140 px exactos sobre fondo %s ya usa el horizontal (R2, R3)", (fondo, archivo) => {
    expect(archivoDeLogo(fondo, 140)).toBe(archivo);
    expect(imagenDelLogo(fondo, 140)).toHaveAttribute("src", archivo);
  });

  it.each([
    ["claro", ISOTIPO_CLARO],
    ["oscuro", ISOTIPO_OSCURO],
  ] as const)("a 139 px sobre fondo %s usa el isotipo (R4)", (fondo, archivo) => {
    expect(archivoDeLogo(fondo, 139)).toBe(archivo);
  });

  it("el nombre accesible es el de la marca y no pinta texto (R1)", () => {
    const { container } = render(<Logo fondo="claro" ancho={200} />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", NOMBRE);
    expect(container.textContent).toBe("");
    expect(container.innerHTML.toLowerCase()).not.toContain(NOMBRE_ANTERIOR);
  });

  it.each([140, 160, 200, 733])(
    "el horizontal a %i px respeta la proporción 733 x 214 con 1 px de margen (R5)",
    (ancho) => {
      const img = imagenDelLogo("oscuro", ancho);
      expect(Number(img.getAttribute("width"))).toBe(ancho);
      const alto = Number(img.getAttribute("height"));
      expect(Math.abs(alto - (ancho * 214) / 733)).toBeLessThanOrEqual(1);
    },
  );

  it.each([32, 139])("el isotipo a %i px es cuadrado (R5)", (ancho) => {
    const img = imagenDelLogo("claro", ancho);
    expect(img).toHaveAttribute("width", String(ancho));
    expect(img).toHaveAttribute("height", String(ancho));
  });

  it("con `oculto` sale del árbol de accesibilidad y sin él sigue con su nombre (R1)", () => {
    const { container } = render(<Logo fondo="oscuro" ancho={32} oculto />);
    expect(screen.queryByRole("img", { name: NOMBRE })).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toHaveAttribute("alt", NOMBRE);
  });

  it("sin `oculto` no lleva aria-hidden (R1)", () => {
    render(<Logo fondo="oscuro" ancho={32} />);
    expect(screen.getByRole("img", { name: NOMBRE })).not.toHaveAttribute("aria-hidden");
  });

  it("pasa className a la imagen", () => {
    render(<Logo fondo="claro" ancho={160} className="h-8 w-auto" />);
    expect(screen.getByRole("img")).toHaveClass("h-8", "w-auto");
  });
});
