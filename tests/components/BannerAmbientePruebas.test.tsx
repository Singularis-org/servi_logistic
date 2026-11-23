// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { BannerAmbientePruebas } from "@/components/shared/BannerAmbientePruebas";
import { contraste } from "../fixtures/contraste";

// SLT-257 — la franja «Sandbox» del ambiente de pruebas.

const VARIABLES = ["AMBIENTE_PRUEBAS", "VERCEL_ENV"] as const;
const ORIGINAL = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));

function poner(nombre: (typeof VARIABLES)[number], valor: string | undefined): void {
  if (valor === undefined) delete process.env[nombre];
  else process.env[nombre] = valor;
}

afterEach(() => {
  cleanup();
  for (const v of VARIABLES) poner(v, ORIGINAL[v]);
});

/** Pinta la franja encendida y devuelve su elemento raiz. */
function franjaEncendida(): HTMLElement {
  poner("AMBIENTE_PRUEBAS", "true");
  const { container } = render(<BannerAmbientePruebas />);
  const raiz = container.firstElementChild;
  if (!(raiz instanceof HTMLElement)) throw new Error("la franja no se pinto");
  return raiz;
}

function clases(el: HTMLElement): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

describe("SLT-257 — BannerAmbientePruebas", () => {
  it("R1: con AMBIENTE_PRUEBAS=true pinta una franja con el texto «Sandbox»", () => {
    poner("VERCEL_ENV", undefined);
    expect(franjaEncendida().textContent).toBe("Sandbox");
  });

  it.each([undefined, "", "TRUE", "True", "1", "yes", "false", " true", "true "])(
    "R2: con AMBIENTE_PRUEBAS=%j no pinta nada (container vacio)",
    (valor) => {
      poner("VERCEL_ENV", undefined);
      poner("AMBIENTE_PRUEBAS", valor);
      const { container } = render(<BannerAmbientePruebas />);
      expect(container.innerHTML).toBe("");
    },
  );

  it("R3: con VERCEL_ENV=production y AMBIENTE_PRUEBAS=true se pinta", () => {
    poner("VERCEL_ENV", "production");
    expect(franjaEncendida().textContent).toBe("Sandbox");
  });

  it.each(["preview", "development"])(
    "R3: con VERCEL_ENV=%s y sin AMBIENTE_PRUEBAS no se pinta",
    (entorno) => {
      poner("VERCEL_ENV", entorno);
      poner("AMBIENTE_PRUEBAS", undefined);
      const { container } = render(<BannerAmbientePruebas />);
      expect(container.innerHTML).toBe("");
    },
  );

  it("R4: el unico texto es «Sandbox» y no hay botones, enlaces ni elementos enfocables", () => {
    const franja = franjaEncendida();
    expect(franja.textContent).toBe("Sandbox");
    expect(franja.children).toHaveLength(0);
    const enfocables = franja.parentElement!.querySelectorAll(
      "button, a, input, select, textarea, [tabindex], [contenteditable], [role='button'], [role='link']",
    );
    expect(enfocables).toHaveLength(0);
    expect(franja.hasAttribute("tabindex")).toBe(false);
  });

  it("R6: el texto llega a la tecnologia de asistencia sin anunciarse como alerta", () => {
    const franja = franjaEncendida();
    const conAtributos = [franja, ...franja.querySelectorAll("*")];
    for (const el of conAtributos) {
      expect(el.getAttribute("aria-hidden")).not.toBe("true");
      expect(el.getAttribute("role")).not.toBe("alert");
      expect(el.getAttribute("aria-live")).not.toBe("assertive");
    }
  });

  it("R7: colores fijos de marca (negro sobre amarillo), nunca texto amarillo, contraste >= 4.5", () => {
    const c = clases(franjaEncendida());
    expect(c).toContain("bg-brand-light");
    expect(c).toContain("text-brand-dark");
    expect(c).not.toContain("text-brand-light");
    expect(c).not.toContain("text-brand");
    // Sin variantes de tema: los colores no giran en oscuro ni en «sistema».
    expect(c.filter((k) => k.startsWith("dark:"))).toEqual([]);
    expect(contraste("#111111", "#FFD000")).toBeGreaterThanOrEqual(4.5);
  });

  it("R8: el padding de arriba reserva el area segura de iOS (env(safe-area-inset-top))", () => {
    const franja = franjaEncendida();
    const paddingTop = clases(franja).filter((k) => k.startsWith("pt-"));
    expect(paddingTop).toHaveLength(1);
    expect(paddingTop[0]).toContain("env(safe-area-inset-top)");
  });

  it("R9: queda a su alto natural en el body flex (shrink-0, sin crecer)", () => {
    const c = clases(franjaEncendida());
    expect(c).toContain("shrink-0");
    expect(c.some((k) => /^(grow|flex-1|flex-auto|h-full|min-h-)/.test(k))).toBe(false);
  });

  it("R11: va en el flujo normal: sin sticky, fixed ni z-index propio", () => {
    const c = clases(franjaEncendida());
    expect(c).not.toContain("sticky");
    expect(c).not.toContain("fixed");
    expect(c).not.toContain("absolute");
    expect(c.some((k) => /^-?z-/.test(k))).toBe(false);
  });
});
