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

// SLT-156 rebanada B (SLT-163, B1; R502) — en el teléfono los cuatro KPI van en 2 × 2: en una
// columna empujaban la lista fuera de la primera pantalla. jsdom no aplica Tailwind: se afirman
// las clases; la medida a 360 px es del E2E de la rebanada (B8).
describe("KpisMensajero — 2 × 2 en el móvil (SLT-156 R502)", () => {
  it("la rejilla tiene 2 columnas desde el ancho más chico, sin la columna única de antes", () => {
    const { container } = montar();
    const seccion = container.querySelector("section")!;
    const clases = seccion.className.split(/\s+/);
    expect(clases).toContain("grid-cols-2");
    expect(clases).not.toContain("grid-cols-1");
  });

  it("cada cifra va en una sola línea (R492): columna fija, 20 px en el móvil y 24 desde md", () => {
    montar();
    for (const cifra of ["3", "7", norm(formatMonto(12500)), norm(formatMonto(48000))]) {
      const clases = celdaCifra(cifra).className.split(/\s+/);
      // SLT-163 (R492): un importe no se parte. SLT-200: la cifra vuelve a los 20 px del canvas (D8).
      expect(clases).toEqual(
        expect.arrayContaining(["shrink-0", "whitespace-nowrap", "tabular-nums", "text-xl", "md:text-2xl"]),
      );
      for (const parte of ["wrap-anywhere", "whitespace-normal", "text-sm", "truncate"]) {
        expect(clases).not.toContain(parte);
      }
    }
    // Los importes: el contador animado tampoco envuelve.
    for (const importe of [norm(formatMonto(12500)), norm(formatMonto(48000))]) {
      const propias = screen.getByText(importe).className.split(/\s+/);
      expect(propias).toContain("whitespace-nowrap");
      expect(propias).not.toContain("whitespace-normal");
    }
  });
});

/** La celda de la rejilla que lleva la cifra (el `span` con la columna fija que envuelve al contador). */
function celdaCifra(texto: string): HTMLElement {
  const celda = screen.getByText(texto).closest<HTMLElement>("[data-kpi-cifra]");
  if (!celda) throw new Error(`«${texto}» no está en una celda de cifra`);
  return celda;
}

/** El contenido de la tarjeta (la rejilla icono · rótulo · cifra) de la cifra dada. */
function rejillaDe(texto: string): HTMLElement {
  return celdaCifra(texto).parentElement as HTMLElement;
}

// SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview» (punto 2). En Preview
// la cifra medía 14 px y caía en una fila propia bajo el icono. El canvas (D8) la pone a 20 px a la
// DERECHA del icono, bajo el rótulo. A 360 px una tarjeta deja ~126 px de contenido y ~82 al lado del
// icono: cabe un importe de 5 dígitos con separador y símbolo (7 caracteres) a 20 px, no uno de ocho
// cifras (119 px a 20 px, medido con Archivo 600). Por eso la cifra va al lado del icono cuando cabe, y si no, baja a la fila de
// abajo a todo el ancho, SIN achicarse hasta los 12 caracteres. Las dos tarjetas de una fila deciden
// juntas, para que sus cifras queden a la misma altura. La medida real a 360 px es del E2E.
describe("KpisMensajero — cifra de 20 px a la derecha del icono (SLT-200, canvas D8)", () => {
  it("con cifras cortas, el icono abarca las dos filas y la cifra va bajo el rótulo, a su derecha", () => {
    montar();
    for (const cifra of ["3", "7", norm(formatMonto(12500)), norm(formatMonto(48000))]) {
      const rejilla = rejillaDe(cifra);
      expect(rejilla.dataset.disposicion).toBe("al-lado");
      const [icono, rotulo, celda] = Array.from(rejilla.children) as HTMLElement[];
      expect(icono!.className.split(/\s+/)).toContain("row-span-2");
      expect(rotulo!.className.split(/\s+/)).toContain("self-end");
      const clases = celda!.className.split(/\s+/);
      expect(clases).toContain("col-start-2");
      expect(clases).not.toContain("col-span-2");
      expect(clases).toContain("text-xl");
    }
  });

  it("un importe de ocho cifras (11 caracteres) baja bajo el icono, a todo el ancho y a 20 px; su vecina baja con él", () => {
    render(<KpisMensajero kpis={{ pendientes: 2, entregadas: 0, porCobrar: 12_345_678, totalACobrar: 5000 }} />);
    const largo = norm(formatMonto(12_345_678));
    const corto = norm(formatMonto(5000));
    for (const cifra of [largo, corto]) {
      expect(rejillaDe(cifra).dataset.disposicion).toBe("apilada");
      const clases = celdaCifra(cifra).className.split(/\s+/);
      expect(clases).toEqual(expect.arrayContaining(["col-span-2", "text-xl", "md:col-start-2", "md:text-2xl"]));
    }
    // La otra fila (conteos) no se entera: sigue al lado del icono.
    expect(rejillaDe("2").dataset.disposicion).toBe("al-lado");
  });

  it("solo por encima de 11 caracteres la cifra se achica, y nunca por debajo de 14 px", () => {
    render(
      <KpisMensajero kpis={{ pendientes: 2, entregadas: 0, porCobrar: 100_003_999, totalACobrar: 100_003_999.5 }} />,
    );
    expect(celdaCifra(norm(formatMonto(100_003_999))).className.split(/\s+/)).toContain("text-lg");
    expect(celdaCifra(norm(formatMonto(100_003_999.5))).className.split(/\s+/)).toContain("text-sm");
    for (const cifra of [norm(formatMonto(100_003_999)), norm(formatMonto(100_003_999.5))]) {
      for (const menor of ["text-xs", "text-[10px]", "text-[11px]"]) {
        expect(celdaCifra(cifra).className.split(/\s+/)).not.toContain(menor);
      }
    }
  });
});
